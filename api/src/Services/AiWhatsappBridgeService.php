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

    /** Sama dengan DeepseekController::RECENT_CHAT_CONTEXT_TURNS — utas singkat agar konsisten dengan chat web. */
    private const RECENT_CHAT_CONTEXT_TURNS = 3;

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

    private static function usersHasAiWaJidColumn(\PDO $db): bool
    {
        try {
            $c = $db->query("SHOW COLUMNS FROM users LIKE 'ai_wa_jid'");

            return $c !== false && $c->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function normActivationLabel(string $s): string
    {
        $s = trim($s);
        $s = preg_replace('/\s+/u', ' ', $s) ?? $s;

        return mb_strtolower($s, 'UTF-8');
    }

    /**
     * Pesan aktivasi: wajib token dari eBeddien (login) + Nama + Username + Nomor cocok profil.
     */
    private static function tryHandleActivation(\PDO $db, string $message, ?string $fromJid): ?string
    {
        if ($fromJid === null || trim($fromJid) === '') {
            return null;
        }
        if (!preg_match('/Aktifkan\s+eBeddien\s+AI\s+WhatsApp/i', $message)) {
            return null;
        }
        if (!AiWaActivationTokenService::tableExists($db)) {
            return 'Aktivasi membutuhkan token dari server. Admin: jalankan migrasi database terbaru (tabel token).';
        }
        if (!self::usersHasAiWaJidColumn($db)) {
            return 'Pengikatan JID belum tersedia di server. Jalankan migrasi database terbaru.';
        }
        $tokenRaw = null;
        if (preg_match('/Token:\s*(\S+)/iu', $message, $m)) {
            $tokenRaw = trim($m[1]);
        }
        if ($tokenRaw === null || $tokenRaw === '') {
            return 'Token aktivasi tidak ada di pesan. Login ke eBeddien, buka Chat AI, nyalakan "Akses AI dari WA", lalu minta token baru — pesan WhatsApp harus persis dari aplikasi (berisi Token).';
        }
        $namaRaw = null;
        if (preg_match('/Nama:\s*([^\r\n]+)/iu', $message, $m)) {
            $namaRaw = trim($m[1]);
        }
        $usernameRaw = null;
        if (preg_match('/Username:\s*([^\r\n]+)/iu', $message, $m)) {
            $usernameRaw = trim($m[1]);
        }
        $nomorRaw = null;
        if (preg_match('/Nomor:\s*([0-9+\s]+)/iu', $message, $m)) {
            $nomorRaw = trim($m[1]);
        }
        if ($namaRaw === null || $namaRaw === '' || $usernameRaw === null || $usernameRaw === '' || $nomorRaw === null || $nomorRaw === '') {
            return 'Format tidak lengkap. Wajib baris: Nama, Username, Nomor, dan Token — salin persis dari eBeddien setelah minta token.';
        }
        $digits = WhatsAppService::formatPhoneNumber($nomorRaw);
        if (strlen($digits) < 10) {
            return 'Nomor pada pesan aktivasi tidak valid.';
        }
        $valid = AiWaActivationTokenService::findValidByPlain($db, $tokenRaw);
        if ($valid === null) {
            $why = AiWaActivationTokenService::classifyPlainToken($db, $tokenRaw);
            if ($why === 'used') {
                return 'Token ini sudah dipakai. Login ke eBeddien dan minta token aktivasi baru.';
            }
            if ($why === 'expired') {
                return 'Token aktivasi sudah kadaluarsa. Login ke eBeddien dan minta token baru (token berlaku terbatas).';
            }

            return 'Token tidak dikenali atau salah ketik. Pastikan menyalin utuh dari eBeddien, atau minta token baru.';
        }
        $uid = (int) $valid['users_id'];
        $tid = (int) $valid['id'];
        $stmt = $db->prepare(
            'SELECT id, no_wa, ai_whatsapp_enabled, COALESCE(ai_enabled,1) AS ai_enabled FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$uid]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!is_array($row) || empty($row['id'])) {
            return 'Token tidak valid (akun tidak ditemukan). Minta token baru di eBeddien.';
        }
        if ((int) ($row['ai_whatsapp_enabled'] ?? 0) !== 1) {
            return 'Akses AI dari WA belum diaktifkan di eBeddien. Aktifkan di aplikasi lalu minta token baru.';
        }
        if ((int) ($row['ai_enabled'] ?? 1) !== 1) {
            return 'Akses AI untuk akun Anda sedang dinonaktifkan.';
        }
        [$expectedNama, $expectedUsernameLabel] = AiWaActivationTokenService::fetchActivationLabels($db, $uid);
        if (self::normActivationLabel($namaRaw) !== self::normActivationLabel($expectedNama)) {
            return 'Nama pada pesan tidak cocok dengan profil akun token ini. Periksa ejaan atau minta token baru setelah profil benar.';
        }
        if (self::normActivationLabel($usernameRaw) !== self::normActivationLabel($expectedUsernameLabel)) {
            return 'Username pada pesan tidak cocok dengan akun token ini. Salin persis dari eBeddien atau minta token baru.';
        }
        $nw = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
        if ($nw === '' || $nw !== $digits) {
            return 'Nomor pada pesan tidak cocok dengan nomor WhatsApp di profil eBeddien Anda.';
        }
        $jid = trim($fromJid);
        try {
            $upd = $db->prepare('UPDATE users SET ai_wa_jid = ? WHERE id = ?');
            $upd->execute([$jid, $uid]);
            AiWaActivationTokenService::markUsed($db, $tid);
        } catch (\Throwable $e) {
            error_log('AiWhatsappBridgeService::tryHandleActivation UPDATE ' . $e->getMessage());

            return 'Gagal menyimpan pengikatan WhatsApp. Coba lagi.';
        }

        return 'Aktivasi berhasil. eBeddien AI WhatsApp untuk akun Anda sudah terhubung. Silakan kirim pertanyaan lain.';
    }

    private static function usersIdByAiWaJid(\PDO $db, ?string $fromJid): ?int
    {
        if ($fromJid === null || trim($fromJid) === '') {
            return null;
        }
        if (!self::usersHasAiWaJidColumn($db)) {
            return null;
        }
        $jid = trim($fromJid);
        try {
            $stmt = $db->prepare(
                'SELECT id FROM users WHERE ai_whatsapp_enabled = 1 AND COALESCE(ai_enabled,1)=1 '
                . 'AND ai_wa_jid IS NOT NULL AND TRIM(ai_wa_jid) = ? LIMIT 1'
            );
            $stmt->execute([$jid]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $row && !empty($row['id']) ? (int) $row['id'] : null;
        } catch (\Throwable $e) {
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
    private static function callDeepseekApi(\PDO $db, int $usersId, string $userPrompt): array
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
        $historyBlock = self::buildRecentHistoryTextBlock($db, $usersId, self::AI_WA_SESSION_ID, self::RECENT_CHAT_CONTEXT_TURNS);
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
        $activationReply = self::tryHandleActivation($db, $prompt, $fromJid);
        if ($activationReply !== null) {
            return $activationReply;
        }
        $usersId = self::usersIdByAiWaJid($db, $fromJid);
        if ($usersId === null) {
            $usersId = self::usersIdByWaNumber($db, $nomorTujuan);
        }
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
        $ai = self::callDeepseekApi($db, $usersId, $prompt);
        if (empty($ai['ok'])) {
            error_log('AiWhatsappBridgeService::tryHandle error=' . ($ai['message'] ?? 'unknown'));

            return 'Maaf, AI sedang tidak tersedia. Coba lagi sebentar.';
        }
        $reply = self::stripTrailingCategoryLabel((string) ($ai['reply'] ?? ''));
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
