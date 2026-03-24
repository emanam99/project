<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiTrainingRagHelper;

/**
 * Balasan WA lewat Deepseek untuk pengguna dengan ai_whatsapp_enabled = 1.
 */
final class AiWhatsappBridgeService
{
    private const AI_WA_SESSION_ID = 'ebeddien-main';

    private static function lidDigitsFromJid(?string $jid): ?string
    {
        if ($jid === null || trim($jid) === '') {
            return null;
        }
        $jid = trim($jid);
        if (preg_match('/^(\d+)@lid$/i', $jid, $m)) {
            return $m[1];
        }

        return null;
    }

    /**
     * Dari "nomor" palsu 62+LID (bukan MSISDN) yang dikirim klien WA lama tanpa canonicalNumber.
     */
    private static function lidDigitsFromPseudo62Number(string $nomorTujuan): ?string
    {
        $d = preg_replace('/\D/', '', $nomorTujuan) ?? '';
        if ($d === '' || !str_starts_with($d, '62')) {
            return null;
        }
        $rest = substr($d, 2);
        // MSISDN ID: biasanya ≤11 digit setelah 62. LID lebih panjang.
        if (strlen($rest) >= 13) {
            return $rest;
        }

        return null;
    }

    private static function kontakHasNomorKanonikColumn(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nomor_kanonik'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Cocokkan pengirim @lid ke baris kontak (nomor_kanonik), lalu ke users.no_wa.
     */
    private static function usersIdByKontakLid(\PDO $db, ?string $fromJid, string $nomorTujuan): ?int
    {
        if (!self::kontakHasNomorKanonikColumn($db)) {
            return null;
        }
        $lid = self::lidDigitsFromJid($fromJid) ?? self::lidDigitsFromPseudo62Number($nomorTujuan);
        if ($lid === null || $lid === '') {
            return null;
        }
        try {
            $stmt = $db->prepare(
                'SELECT nomor FROM whatsapp___kontak '
                . 'WHERE nomor_kanonik IS NOT NULL AND TRIM(nomor_kanonik) != \'\' '
                . 'AND (TRIM(nomor_kanonik) = ? OR TRIM(nomor_kanonik) = ? OR TRIM(nomor_kanonik) = ? '
                . 'OR REPLACE(REPLACE(TRIM(nomor_kanonik), \'@lid\', \'\'), \'@c.us\', \'\') = ?) '
                . 'LIMIT 1'
            );
            $stmt->execute([$lid, $lid . '@lid', $lid . '@c.us', $lid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row || empty($row['nomor'])) {
                return null;
            }

            return self::usersIdByWaNumber($db, (string) $row['nomor']);
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::usersIdByKontakLid ' . $e->getMessage());

            return null;
        }
    }

    private static function usersIdByWaNumber(\PDO $db, string $nomor62): ?int
    {
        try {
            $col = $db->query("SHOW COLUMNS FROM users LIKE 'ai_whatsapp_enabled'");
            if ($col === false || $col->rowCount() === 0) {
                return null;
            }
        } catch (\Throwable $e) {
            return null;
        }
        $digits = preg_replace('/\D/', '', $nomor62) ?? '';
        if (strlen($digits) < 10) {
            return null;
        }
        $last10 = substr($digits, -10);
        $stmt = $db->prepare("SELECT id, no_wa, ai_whatsapp_enabled, COALESCE(ai_enabled,1) AS ai_enabled, COALESCE(ai_daily_limit,5) AS ai_daily_limit FROM users WHERE ai_whatsapp_enabled = 1 AND COALESCE(ai_enabled,1)=1 AND no_wa IS NOT NULL AND TRIM(no_wa) != '' AND (no_wa LIKE ? OR no_wa LIKE ?) LIMIT 50");
        $stmt->execute(['%' . $digits . '%', '%' . $last10 . '%']);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) {
            return null;
        }
        foreach ($rows as $row) {
            $n = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
            if ($n !== '' && $n === $digits) {
                return (int) $row['id'];
            }
        }
        if ($rows) {
            $norm = [];
            foreach (array_slice($rows, 0, 5) as $row) {
                $norm[] = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
            }
            error_log(
                'AiWhatsappBridgeService: ada ' . count($rows) . ' user (toggle+no_wa LIKE) tapi no_wa ternormalisasi != masuk; '
                . 'digit_masuk=' . $digits . ' contoh_norm=' . implode(',', $norm)
            );
        }

        return null;
    }

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

    /**
     * @return array{ok: bool, reply?: string, thinking?: string, message?: string}
     */
    private static function callDeepseekApi(string $prompt): array
    {
        $apiKey = trim((string) (getenv('DEEPSEEK_API_KEY') ?: ''));
        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'Kunci API AI belum di-set'];
        }
        $payload = [
            'model' => 'deepseek-chat',
            'messages' => [
                ['role' => 'system', 'content' => AiTrainingRagHelper::getEbeddienAssistantSystemPrompt()],
                ['role' => 'user', 'content' => $prompt],
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

    private static function persistAiWaExchange(\PDO $db, int $usersId, string $prompt, string $reply, string $thinking): void
    {
        $fullAi = $reply;
        if ($thinking !== '') {
            $fullAi .= "\n\n---\n[thinking]\n" . $thinking;
        }
        [$userName, $userEmail] = self::fetchAiChatUserDisplay($db, $usersId);
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
            self::AI_WA_SESSION_ID,
        ]);
    }

    /**
     * Balasan teks AI atau null jika pengguna tidak mengaktifkan AI WA / pesan kosong.
     */
    public static function tryHandle(\PDO $db, string $nomorTujuan, string $message, ?string $fromJid = null): ?string
    {
        $prompt = trim($message);
        if ($prompt === '' || $prompt === '(tanpa teks)') {
            return null;
        }
        $usersId = self::usersIdByWaNumber($db, $nomorTujuan);
        if ($usersId === null) {
            $usersId = self::usersIdByKontakLid($db, $fromJid, $nomorTujuan);
        }
        if ($usersId === null) {
            self::logNoUserMatch($db, $nomorTujuan, $fromJid);

            return null;
        }
        $digits = WhatsAppService::formatPhoneNumber($nomorTujuan);
        $bucketIds = strlen($digits) >= 10
            ? AiChatDailyLimitService::collectUserIdsByCanonicalWaDigits($db, $digits)
            : [];
        if (!in_array($usersId, $bucketIds, true)) {
            $bucketIds[] = $usersId;
        }
        $bucketIds = array_values(array_unique(array_filter(array_map('intval', $bucketIds), static fn (int $x): bool => $x > 0)));
        if ($bucketIds === []) {
            $bucketIds = [$usersId];
        }
        $todayCount = AiChatDailyLimitService::countTodayForUserIds($db, $bucketIds);
        $dailyLimit = AiChatDailyLimitService::dailyLimitForUser($db, $usersId);
        if ($todayCount >= $dailyLimit) {
            return 'anda sudah mencapai limit akses ai eBeddien.';
        }
        $ai = self::callDeepseekApi($prompt);
        if (empty($ai['ok'])) {
            error_log('AiWhatsappBridgeService::tryHandle error=' . ($ai['message'] ?? 'unknown'));

            return 'Maaf, AI sedang tidak tersedia. Coba lagi sebentar.';
        }
        $reply = (string) ($ai['reply'] ?? '');
        $thinking = (string) ($ai['thinking'] ?? '');
        try {
            self::persistAiWaExchange($db, $usersId, $prompt, $reply, $thinking);
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::persistAiWaExchange ' . $e->getMessage());
        }

        return $reply;
    }

    /**
     * Diagnosa singkat di error.log jika tidak ada balasan AI (bukan error teknis).
     */
    private static function logNoUserMatch(\PDO $db, string $nomorTujuan, ?string $fromJid): void
    {
        $digits = preg_replace('/\D/', '', $nomorTujuan) ?? '';
        $last10 = strlen($digits) >= 10 ? substr($digits, -10) : '';
        try {
            $col = $db->query("SHOW COLUMNS FROM users LIKE 'ai_whatsapp_enabled'");
            if ($col === false || $col->rowCount() === 0) {
                error_log('AiWhatsappBridgeService: AI WA skip — kolom ai_whatsapp_enabled belum ada (jalankan migrasi).');

                return;
            }
            $st = $db->query('SELECT COUNT(*) FROM users WHERE ai_whatsapp_enabled = 1 AND COALESCE(ai_enabled,1) = 1');
            $toggleOn = $st ? (int) $st->fetchColumn() : 0;
            $nearAny = 0;
            $nearToggle = 0;
            if ($digits !== '' && $last10 !== '') {
                $st2 = $db->prepare(
                    'SELECT COUNT(*) FROM users WHERE TRIM(COALESCE(no_wa,\'\')) != \'\' '
                    . 'AND (no_wa LIKE ? OR no_wa LIKE ?)'
                );
                $st2->execute(['%' . $digits . '%', '%' . $last10 . '%']);
                $nearAny = (int) $st2->fetchColumn();
                $st3 = $db->prepare(
                    'SELECT COUNT(*) FROM users WHERE ai_whatsapp_enabled = 1 AND COALESCE(ai_enabled,1) = 1 '
                    . 'AND TRIM(COALESCE(no_wa,\'\')) != \'\' AND (no_wa LIKE ? OR no_wa LIKE ?)'
                );
                $st3->execute(['%' . $digits . '%', '%' . $last10 . '%']);
                $nearToggle = (int) $st3->fetchColumn();
            }
            $jidHint = $fromJid !== null && $fromJid !== '' ? ' jid=' . $fromJid : '';
            error_log(
                'AiWhatsappBridgeService: AI WA skip — tidak ada user yang cocok untuk nomor_masuk=' . $nomorTujuan . $jidHint
                . ' | total_akun_dgn_toggle_AI_WA_aktif=' . $toggleOn
                . ' | akun_no_wa_mirip_nomor_ini=' . $nearAny
                . ' | di_antaranya_yg_toggle_AI_WA_juga=' . $nearToggle
                . '. Syarat: users.no_wa (profil) setelah normalisasi = digit masuk persis, ai_whatsapp_enabled=1, ai_enabled=1.'
            );
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::logNoUserMatch ' . $e->getMessage());
        }
    }
}
