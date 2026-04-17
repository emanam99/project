<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiTrainingRagHelper;

/**
 * Balasan WA lewat AI untuk mode instansi: hanya jika master aktif + "terima semua pengirim" + akun kuota valid.
 */
final class AiWhatsappBridgeService
{
    private const AI_WA_SESSION_ID = 'ebeddien-main';

    /** Sama dengan DeepseekController::RECENT_CHAT_CONTEXT_TURNS — utas singkat agar konsisten dengan chat web. */
    private const RECENT_CHAT_CONTEXT_TURNS = 3;

    /**
     * @return array{0: string, 1: string}
     */
    private static function fetchAiChatUserDisplay(\PDO $db, int $usersId): array
    {
        $stmt = $db->prepare(
            'SELECT u.email AS email, u.username AS username, '
            . 'COALESCE(NULLIF(TRIM(p.nama), \'\'), NULLIF(TRIM(s.nama), \'\')) AS nama '
            . 'FROM users u '
            . 'LEFT JOIN pengurus p ON p.id_user = u.id '
            . 'LEFT JOIN santri s ON s.id_user = u.id '
            . 'WHERE u.id = ? LIMIT 1'
        );
        $stmt->execute([$usersId]);
        $ur = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        $userEmail = trim((string) ($ur['email'] ?? ''));
        $n = trim((string) ($ur['nama'] ?? ''));
        $u = trim((string) ($ur['username'] ?? ''));
        $userName = $n !== '' ? ($u !== '' ? $n . ' @' . $u : $n) : ($u !== '' ? $u : '');

        return [$userName, $userEmail];
    }

    private static function aiChatTableReady(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'ai___chat'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function stripStoredAiResponseForContext(string $s): string
    {
        $s = trim($s);
        if ($s === '') {
            return '';
        }
        $sep = "\n\n---\n[thinking]\n";
        $pos = strpos($s, $sep);

        return $pos !== false ? trim(substr($s, 0, $pos)) : $s;
    }

    /**
     * @return array<int, array{role: string, content: string}>
     */
    private static function fetchLastNChatExchangesAsOpenAiMessages(\PDO $db, int $usersId, string $sessionId, int $n): array
    {
        if ($usersId < 1 || $sessionId === '' || !self::aiChatTableReady($db)) {
            return [];
        }
        $lim = max(1, min(20, $n));
        try {
            $sql = 'SELECT user_message, ai_response FROM ai___chat WHERE users_id = ? AND session_id = ? ORDER BY id DESC LIMIT ' . (int) $lim;
            $stmt = $db->prepare($sql);
            $stmt->execute([$usersId, $sessionId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            if ($rows === []) {
                return [];
            }
            $rows = array_reverse($rows);
            $out = [];
            foreach ($rows as $row) {
                $u = trim((string) ($row['user_message'] ?? ''));
                $a = self::stripStoredAiResponseForContext((string) ($row['ai_response'] ?? ''));
                if ($u === '' || $a === '') {
                    continue;
                }
                $out[] = ['role' => 'user', 'content' => $u];
                $out[] = ['role' => 'assistant', 'content' => $a];
            }

            return $out;
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::fetchLastNChatExchangesAsOpenAiMessages ' . $e->getMessage());

            return [];
        }
    }

    private static function buildRecentHistoryTextBlock(\PDO $db, int $usersId, string $sessionId, int $n): string
    {
        $msgs = self::fetchLastNChatExchangesAsOpenAiMessages($db, $usersId, $sessionId, $n);
        if ($msgs === []) {
            return '';
        }
        $lines = ['[Ringkasan percakapan sebelumnya di sesi ini]'];
        foreach ($msgs as $m) {
            if ($m['role'] === 'user') {
                $lines[] = 'Pengguna: ' . $m['content'];
            } else {
                $lines[] = 'Asisten: ' . $m['content'];
            }
        }

        return implode("\n\n", $lines);
    }

    /**
     * Hilangkan label kategori akhir (dari instruksi model) agar pesan WA tidak berakhir [Umum].
     */
    private static function stripTrailingCategoryLabel(string $reply): string
    {
        $reply = trim($reply);
        if ($reply === '') {
            return '';
        }

        return preg_replace('/\n+\[[^\]]{1,80}\]\s*$/u', '', $reply) ?? $reply;
    }

    /**
     * @return array{ok: bool, reply?: string, thinking?: string, message?: string}
     */
    private static function callDeepseekApi(\PDO $db, int $usersId, string $userPrompt, string $sessionId): array
    {
        $apiKey = trim((string) (getenv('DEEPSEEK_API_KEY') ?: ''));
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'Kunci API AI belum di-set'];
        }
        $ragged = trim($userPrompt);
        try {
            $ragged = AiTrainingRagHelper::mergeIntoPrompt($db, $ragged);
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::callDeepseekApi RAG ' . $e->getMessage());
        }
        $historyBlock = self::buildRecentHistoryTextBlock($db, $usersId, $sessionId, self::RECENT_CHAT_CONTEXT_TURNS);
        if ($historyBlock !== '') {
            $promptForModel = $historyBlock . "\n\n---\nPertanyaan saat ini:\n" . $ragged;
        } else {
            $promptForModel = $ragged;
        }
        $payload = [
            'model' => 'deepseek-chat',
            'messages' => [
                ['role' => 'system', 'content' => AiTrainingRagHelper::getEbeddienAssistantSystemPrompt()],
                ['role' => 'user', 'content' => $promptForModel],
            ],
            'stream' => false,
        ];
        $ch = curl_init('https://api.deepseek.com/chat/completions');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $apiKey,
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 180);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 30);
        curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        if ($raw === false || $curlErr !== '') {
            return ['ok' => false, 'message' => 'Gagal menghubungi AI'];
        }
        $decoded = json_decode((string) $raw, true);
        if (!is_array($decoded) || $httpCode >= 400) {
            $err = isset($decoded['error']['message']) ? (string) $decoded['error']['message'] : 'Respons AI tidak valid';

            return ['ok' => false, 'message' => $err];
        }
        $msg = $decoded['choices'][0]['message'] ?? null;
        $content = is_array($msg) && isset($msg['content']) && is_string($msg['content']) ? trim($msg['content']) : '';
        $reasoning = is_array($msg) && isset($msg['reasoning_content']) && is_string($msg['reasoning_content']) ? trim($msg['reasoning_content']) : '';
        if ($content === '') {
            $content = 'Maaf, saya belum bisa menjawab saat ini.';
        }

        return ['ok' => true, 'reply' => $content, 'thinking' => $reasoning];
    }

    private static function persistAiWaExchange(
        \PDO $db,
        int $usersId,
        string $prompt,
        string $reply,
        string $thinking,
        string $sessionId,
        ?string $overrideUserName = null,
        ?string $overrideUserEmail = null
    ): void {
        $fullAi = $reply;
        if ($thinking !== '') {
            $fullAi .= "\n\n---\n[thinking]\n" . $thinking;
        }
        if ($overrideUserName !== null || $overrideUserEmail !== null) {
            $userName = trim((string) $overrideUserName);
            $userEmail = trim((string) $overrideUserEmail);
        } else {
            [$userName, $userEmail] = self::fetchAiChatUserDisplay($db, $usersId);
        }
        $ins = $db->prepare(
            'INSERT INTO ai___chat (users_id, user_message, ai_response, category, user_name, user_email, answer_type, session_id, model_used) '
            . 'VALUES (?, ?, ?, ?, ?, ?, \'AI\', ?, \'ebeddien_assistant\')'
        );
        $ins->execute([
            $usersId,
            $prompt,
            $fullAi,
            'WA',
            $userName !== '' ? $userName : null,
            $userEmail !== '' ? $userEmail : null,
            $sessionId !== '' ? $sessionId : self::AI_WA_SESSION_ID,
        ]);
    }

    /**
     * Satu ember limit & riwayat konteks per pengunjung: prioritas nomor MSISDN kanonik (dari @s.whatsapp.net),
     * selain itu per JID penuh (mis. @lid). Bukan satu ember untuk semua pengunjung.
     */
    private static function guestWaSessionId(?string $fromJid): string
    {
        $phone = AiWaInstansiSettingsService::canonicalPhoneDigitsFromJid($fromJid);
        if ($phone !== null && $phone !== '' && strlen($phone) >= 10) {
            return 'wa-guest-p-' . hash('sha256', 'msisdn:' . $phone);
        }
        $j = $fromJid !== null ? trim($fromJid) : '';

        return 'wa-guest-j-' . hash('sha256', $j !== '' ? 'jid:' . $j : 'unknown');
    }

    private static function guestWaDisplayLabel(?string $fromJid): string
    {
        $phone = AiWaInstansiSettingsService::canonicalPhoneDigitsFromJid($fromJid);
        if ($phone !== null && $phone !== '') {
            return 'Pengunjung WA · ' . $phone;
        }
        $j = $fromJid !== null ? trim($fromJid) : '';
        if ($j === '') {
            return 'Pengunjung WA';
        }

        return 'Pengunjung WA · ' . (strlen($j) > 48 ? substr($j, 0, 45) . '…' : $j);
    }

    /**
     * AI WA hanya untuk chat privat 1:1. Grup, status, newsletter, broadcast → tidak dibalas.
     *
     * @param bool|null $incomingIsGroupMeta true jika webhook menyatakan grup; false jika privat; null = hanya cek JID
     */
    public static function isPrivateIncomingChat(?string $fromJid, ?bool $incomingIsGroupMeta = null): bool
    {
        if ($incomingIsGroupMeta === true) {
            return false;
        }
        if ($fromJid === null || trim($fromJid) === '') {
            return false;
        }
        $j = strtolower(trim($fromJid));
        if (str_ends_with($j, '@g.us')) {
            return false;
        }
        if (str_contains($j, '@newsletter')) {
            return false;
        }
        if (str_contains($j, 'broadcast')) {
            return false;
        }

        return (bool) preg_match('/@\s*(s\.whatsapp\.net|c\.us|lid)$/i', $j);
    }

    /**
     * Balasan teks AI instansi atau null jika master nonaktif, "terima semua" mati/kuota invalid, atau pesan kosong.
     *
     * @param bool|null $incomingIsGroupMeta dari webhook (is_group / chat_type), jika ada
     */
    public static function tryHandle(\PDO $db, string $nomorTujuan, string $message, ?string $fromJid = null, ?bool $incomingIsGroupMeta = null): ?string
    {
        $prompt = trim($message);
        if ($prompt === '' || $prompt === '(tanpa teks)') {
            return null;
        }
        if (!self::isPrivateIncomingChat($fromJid, $incomingIsGroupMeta)) {
            return null;
        }

        $instansiPeek = AiWaInstansiSettingsService::getSettings($db);
        if (!empty($instansiPeek['ai_wa_aktif']) && WhatsAppService::getNotificationProvider() === 'wa_sendiri') {
            WhatsAppService::wakeWaServerThrottled(90);
        }

        AiWaInstansiSettingsService::upsertInboundContact($db, $fromJid);

        $instansi = $instansiPeek;
        if (empty($instansi['ai_wa_aktif'])) {
            return null;
        }

        $usersId = null;
        $sessionId = self::AI_WA_SESSION_ID;
        $guestLabel = null;
        $guestEmail = null;

        if (!empty($instansi['terima_semua_pengirim'])) {
            $bucket = (int) ($instansi['kuota_users_id'] ?? 0);
            if ($bucket > 0 && AiWaInstansiSettingsService::isValidQuotaUser($db, $bucket)) {
                $usersId = $bucket;
                $sessionId = self::guestWaSessionId($fromJid);
                $guestLabel = self::guestWaDisplayLabel($fromJid);
                $guestEmail = null;
            }
        }

        if ($usersId === null) {
            self::logNoUserMatch($db, $nomorTujuan, $fromJid, $instansi);

            return null;
        }

        $effLim = max(0, (int) ($instansi['wa_global_harian_per_pengirim'] ?? 10));
        if ($effLim === 0) {
            return 'anda sudah mencapai limit akses ai eBeddien.';
        }
        $todayCount = AiChatDailyLimitService::countTodayForUserAndSession($db, $usersId, $sessionId);
        if ($todayCount >= $effLim) {
            return 'anda sudah mencapai limit akses ai eBeddien.';
        }

        $ai = self::callDeepseekApi($db, $usersId, $prompt, $sessionId);
        if (empty($ai['ok'])) {
            error_log('AiWhatsappBridgeService::tryHandle error=' . ($ai['message'] ?? 'unknown'));

            return 'Maaf, AI sedang tidak tersedia. Coba lagi sebentar.';
        }
        $reply = self::stripTrailingCategoryLabel((string) ($ai['reply'] ?? ''));
        $thinking = (string) ($ai['thinking'] ?? '');
        try {
            self::persistAiWaExchange($db, $usersId, $prompt, $reply, $thinking, $sessionId, $guestLabel, $guestEmail);
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::persistAiWaExchange ' . $e->getMessage());
        }

        return $reply;
    }

    /**
     * Diagnosa singkat di error.log jika tidak ada balasan AI (bukan error teknis).
     *
     * @param array<string, mixed> $instansi
     */
    private static function logNoUserMatch(\PDO $db, string $nomorTujuan, ?string $fromJid, array $instansi): void
    {
        $jidHint = $fromJid !== null && $fromJid !== '' ? ' jid=' . $fromJid : '';
        $ts = !empty($instansi['terima_semua_pengirim']) ? '1' : '0';
        $bid = (int) ($instansi['kuota_users_id'] ?? 0);
        $bucketOk = $bid > 0 && AiWaInstansiSettingsService::isValidQuotaUser($db, $bid);
        error_log(
            'AiWhatsappBridgeService: AI WA skip — master aktif tapi tidak membalas. terima_semua=' . $ts
            . ' kuota_users_id=' . $bid . ' kuota_valid=' . ($bucketOk ? '1' : '0')
            . ' nomor_masuk=' . $nomorTujuan . $jidHint
            . '. Nyalakan "balas semua pengirim" dan set akun kuota yang valid di pengaturan Chat AI (instansi).'
        );
    }
}
