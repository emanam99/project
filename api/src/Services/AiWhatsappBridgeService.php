<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiAssistantReplyStyleHelper;
use App\Helpers\AiChatPromptContextHelper;
use App\Helpers\AiTrainingRagHelper;
use App\Helpers\AiWhatsappReplyFormatHelper;
use App\Helpers\AiWhatsappThreadContextHelper;

/**
 * Balasan WA lewat AI instansi: master aktif, chat privat.
 * Prioritas: akun users dengan no_wa terverifikasi (no_wa_verified_at) → sesi & limit sama web;
 * lalu (jika diaktifkan) pengunjung lewat kuota instansi + limit global per pengirim.
 */
final class AiWhatsappBridgeService
{
    private const AI_WA_SESSION_ID = 'ebeddien-main';

    /** Utas WA: gabung riwayat whatsapp (notifikasi + balasan), maks. 10 pesan. */
    private const WA_THREAD_MESSAGE_LIMIT = 10;

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

    private static function buildWaPromptWithThreadHistory(
        \PDO $db,
        string $nomorTujuan,
        string $userPrompt,
        string $raggedPrompt
    ): string {
        $waBlock = AiWhatsappThreadContextHelper::buildThreadHistoryTextBlock(
            $db,
            $nomorTujuan,
            $userPrompt,
            self::WA_THREAD_MESSAGE_LIMIT
        );
        if ($waBlock === '') {
            return $raggedPrompt;
        }

        return $waBlock . "\n\n---\nPertanyaan saat ini:\n" . $raggedPrompt;
    }

    /**
     * Markdown AI → format WhatsApp (*tebal*, tanpa # judul, dll.).
     */
    private static function formatReplyForWhatsApp(string $reply): string
    {
        return AiWhatsappReplyFormatHelper::format($reply);
    }

    /**
     * Siapkan satu atau lebih pesan WA (format + pisah marker).
     */
    private static function finalizeReplyForWhatsAppDelivery(string $rawReply): string
    {
        $parts = AiAssistantReplyStyleHelper::splitForDelivery($rawReply, true);
        if ($parts === []) {
            return '';
        }
        $formatted = [];
        foreach ($parts as $part) {
            $f = self::formatReplyForWhatsApp($part);
            if ($f !== '') {
                $formatted[] = $f;
            }
        }
        if ($formatted === []) {
            return '';
        }

        return implode("\n" . AiAssistantReplyStyleHelper::SPLIT_MARKER . "\n", $formatted);
    }

    /**
     * @return array{ok: bool, reply?: string, thinking?: string, message?: string}
     */
    private static function callDeepseekApi(
        \PDO $db,
        int $usersId,
        string $userPrompt,
        string $sessionId,
        string $nomorTujuan,
        string $extraSystemBlock = ''
    ): array {
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
        $promptForModel = self::buildWaPromptWithThreadHistory($db, $nomorTujuan, $userPrompt, $ragged);
        $system = AiTrainingRagHelper::getEbeddienAssistantSystemPrompt();
        try {
            $system = AiChatPromptContextHelper::appendPublicKnowledgeBlocks($system, $db, $userPrompt);
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::callDeepseekApi public context ' . $e->getMessage());
        }
        $system .= "\n\n" . AiWhatsappReplyFormatHelper::systemPromptBlock();
        if ($extraSystemBlock !== '') {
            $system .= "\n\n" . $extraSystemBlock;
        }
        $payload = [
            'model' => 'deepseek-chat',
            'messages' => [
                ['role' => 'system', 'content' => $system],
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
     * Balasan teks AI instansi atau null jika master nonaktif, tidak ada penerima yang dikenali, atau pesan kosong.
     *
     * @param bool|null $incomingIsGroupMeta dari webhook (is_group / chat_type), jika ada
     */
    /**
     * @param list<array{mime_type: string, data: string}> $attachments
     */
    public static function tryHandle(
        \PDO $db,
        string $nomorTujuan,
        string $message,
        ?string $fromJid = null,
        ?bool $incomingIsGroupMeta = null,
        array $attachments = []
    ): ?string {
        $prompt = trim($message);
        if ($prompt === '(tanpa teks)' || $prompt === '[media]') {
            $prompt = '';
        }
        $attachments = self::normalizeWaAttachments($attachments);
        if ($prompt === '' && $attachments === []) {
            return null;
        }
        if (!self::isPrivateIncomingChat($fromJid, $incomingIsGroupMeta)) {
            return null;
        }

        $instansiPeek = AiWaInstansiSettingsService::getSettings($db);
        if (!empty($instansiPeek['ai_wa_aktif']) && WhatsAppService::getNotificationProvider() === 'wa_sendiri') {
            WhatsAppService::wakeWaServerThrottled(90);
        }

        $instansi = $instansiPeek;
        if (empty($instansi['ai_wa_aktif'])) {
            return null;
        }

        $nomorCanon = WhatsAppService::formatPhoneNumber($nomorTujuan);
        $usersId = null;
        $sessionId = self::AI_WA_SESSION_ID;
        $guestLabel = null;
        $guestEmail = null;
        $replyMode = 'none';

        $verifiedUsersId = AiChatDailyLimitService::resolveVerifiedUserIdByWaDigits($db, $nomorTujuan);
        if ($verifiedUsersId !== null) {
            $usersId = $verifiedUsersId;
            $sessionId = self::AI_WA_SESSION_ID;
            $replyMode = 'verified';
            error_log(
                'AiWhatsappBridgeService: pengirim = user terverifikasi users_id='
                . $verifiedUsersId
                . ' nomor=' . $nomorCanon
                . ($fromJid ? ' jid=' . $fromJid : '')
            );
        } elseif (!empty($instansi['terima_semua_pengirim'])) {
            $bucket = (int) ($instansi['kuota_users_id'] ?? 0);
            if ($bucket > 0 && AiWaInstansiSettingsService::isValidQuotaUser($db, $bucket)) {
                $usersId = $bucket;
                $sessionId = self::guestWaSessionId($fromJid);
                $guestLabel = self::guestWaDisplayLabel($fromJid);
                $guestEmail = null;
                $replyMode = 'guest';
            }
        }

        if ($usersId === null) {
            self::logNoUserMatch($db, $nomorTujuan, $fromJid, $instansi, $verifiedUsersId === null && strlen($nomorCanon) >= 10);

            return null;
        }

        $limitMsg = 'Anda sudah mencapai limit akses ai eBeddien.';
        if ($replyMode === 'verified') {
            $effLim = AiChatDailyLimitService::dailyLimitForUser($db, $usersId);
            if ($effLim === 0) {
                return $limitMsg;
            }
            $bucketIds = AiChatDailyLimitService::bucketUserIdsForWebAi($db, $usersId);
            $todayCount = AiChatDailyLimitService::countTodayForUserIds($db, $bucketIds, true);
            if ($todayCount >= $effLim) {
                return $limitMsg;
            }
        } else {
            $effLim = max(0, (int) ($instansi['wa_global_harian_per_pengirim'] ?? 10));
            if ($effLim === 0) {
                return $limitMsg;
            }
            $todayCount = AiChatDailyLimitService::countTodayForUserAndSession($db, $usersId, $sessionId);
            if ($todayCount >= $effLim) {
                return $limitMsg;
            }
        }

        if ($replyMode === 'verified') {
            $agentWaReply = AiAgentWaConfirmService::tryHandleVerifiedUserMessage($db, $usersId, $prompt);
            if ($agentWaReply !== null) {
                try {
                    self::persistAiWaExchange($db, $usersId, $prompt, $agentWaReply, '', $sessionId, $guestLabel, $guestEmail);
                } catch (\Throwable $e) {
                    error_log('AiWhatsappBridgeService::persistAiWaExchange agent ' . $e->getMessage());
                }

                return self::finalizeReplyForWhatsAppDelivery($agentWaReply);
            }
        }

        $agentPendingBlock = $replyMode === 'verified'
            ? AiAgentWaConfirmService::buildPendingJobPromptBlock($db, $usersId)
            : '';

        if ($replyMode === 'verified') {
            $ai = AiEbeddienWaOfficialChatService::chatForVerifiedUser(
                $db,
                $usersId,
                $prompt,
                $nomorCanon,
                $attachments,
                $agentPendingBlock
            );
        } else {
            $guestPrompt = $prompt;
            if ($guestPrompt === '' && $attachments !== []) {
                $guestPrompt = 'Pengguna mengirim lampiran. (Mode pengunjung WA belum mendukung analisis berkas — minta login/verifikasi no_wa.)';
            }
            $ai = self::callDeepseekApi($db, $usersId, $guestPrompt, $sessionId, $nomorCanon, $agentPendingBlock);
        }
        if (empty($ai['ok'])) {
            error_log('AiWhatsappBridgeService::tryHandle error=' . ($ai['message'] ?? 'unknown'));

            return (string) ($ai['message'] ?? 'Maaf, AI sedang tidak tersedia. Coba lagi sebentar.');
        }
        $reply = self::finalizeReplyForWhatsAppDelivery((string) ($ai['reply'] ?? ''));
        $thinking = (string) ($ai['thinking'] ?? '');
        try {
            self::persistAiWaExchange($db, $usersId, $prompt, $reply, $thinking, $sessionId, $guestLabel, $guestEmail);
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::persistAiWaExchange ' . $e->getMessage());
        }

        return $reply;
    }

    /**
     * @param list<mixed> $attachments
     *
     * @return list<array{mime_type: string, data: string}>
     */
    private static function normalizeWaAttachments(array $attachments): array
    {
        if ($attachments === []) {
            return [];
        }
        [$ok, , $norm] = \App\Helpers\AiAgentImageInputHelper::normalize($attachments);

        return $ok ? $norm : [];
    }

    /**
     * Diagnosa singkat di error.log jika tidak ada balasan AI (bukan error teknis).
     *
     * @param array<string, mixed> $instansi
     */
    /**
     * @param bool $nomorLooksValid nomor masuk sudah ≥10 digit setelah normalisasi
     */
    private static function logNoUserMatch(
        \PDO $db,
        string $nomorTujuan,
        ?string $fromJid,
        array $instansi,
        bool $nomorLooksValid = true
    ): void {
        $jidHint = $fromJid !== null && $fromJid !== '' ? ' jid=' . $fromJid : '';
        $ts = !empty($instansi['terima_semua_pengirim']) ? '1' : '0';
        $bid = (int) ($instansi['kuota_users_id'] ?? 0);
        $bucketOk = $bid > 0 && AiWaInstansiSettingsService::isValidQuotaUser($db, $bid);
        $canon = WhatsAppService::formatPhoneNumber($nomorTujuan);
        $hintVerified = '';
        if ($nomorLooksValid && strlen($canon) >= 10) {
            $rawIds = AiChatDailyLimitService::collectUserIdsByCanonicalWaDigits($db, $canon);
            if ($rawIds !== []) {
                $hintVerified = ' Ada users dengan no_wa cocok tapi belum terverifikasi (no_wa_verified_at) atau AI dinonaktifkan.';
            } else {
                $hintVerified = ' Tidak ada users.no_wa yang cocok (08/62 dinormalisasi ke 62…).';
            }
        }
        error_log(
            'AiWhatsappBridgeService: AI WA skip — master aktif tapi tidak membalas. terima_semua=' . $ts
            . ' kuota_users_id=' . $bid . ' kuota_valid=' . ($bucketOk ? '1' : '0')
            . ' nomor_masuk=' . $nomorTujuan . ' nomor_canon=' . $canon . $jidHint
            . $hintVerified
            . ' Pengguna terverifikasi dibalas otomatis; lainnya butuh "balas semua pengirim" + kuota valid.'
        );
    }
}
