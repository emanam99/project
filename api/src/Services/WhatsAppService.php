<?php

namespace App\Services;

use App\Database;

/**
 * Layanan kirim pesan WhatsApp - memakai backend WA baru (wa/): wa.alutsmani.id / wa2.alutsmani.id.
 *
 * Konfigurasi: WA_API_URL, WA_API_KEY (harus sama dengan wa/.env), opsional WA_SESSION_ID (ID slot Node — sama dengan dropdown "Kirim tes").
 * Request: POST { phoneNumber, message [, sessionId, chatId] } atau + imageBase64; header X-API-Key.
 * Semua pesan terkirim dicatat di tabel whatsapp (id_santri, id_pengurus, kategori, sumber).
 */
class WhatsAppService
{
    /** Kategori notif yang dibatasi 5 hari: jika sudah dikirim ke no + id_santri dalam N hari, tidak kirim lagi. */
    private const THROTTLE_KATEGORI = [
        'biodata_terdaftar',
        'berkas_lengkap',
        'pembayaran_link',
        'pembayaran_berhasil',
        'pembayaran_gagal',
        'pembayaran_kadaluarsa',
    ];

    /** Pesanan pembayaran & pembatalan: tidak pakai batas 5 hari; hanya diblok jika sama dalam 1 menit. */
    private const THROTTLE_1MIN_ONLY_KATEGORI = [
        'pembayaran_ipaymu_order',
        'pembayaran_ipaymu_qris',
        'pembayaran_dibatalkan',
    ];
    /** Kategori notifikasi yang dipicu dari alur pendaftaran. */
    private const PENDAFTARAN_KATEGORI = [
        'biodata_terdaftar',
        'berkas_lengkap',
        'sudah_diverifikasi',
        'verifikasi',
        'pembayaran_link',
        'pembayaran_berhasil',
        'pembayaran_gagal',
        'pembayaran_kadaluarsa',
        'pembayaran_ipaymu_order',
        'pembayaran_ipaymu_qris',
        'pembayaran_dibatalkan',
    ];

    private const THROTTLE_DAYS = 5;

    /**
     * Sementara: nonaktifkan semua notif WA template PSB (sendPsb*): daftar, berkas, pembayaran (termasuk iPayMu),
     * status transaksi, dan diverifikasi. Set false untuk mengaktifkan kembali.
     */
    private const PSB_FLOW_WA_NOTIF_DISABLED = true;

    private static function getConfig(): array
    {
        $config = require __DIR__ . '/../../config.php';
        $wa = $config['whatsapp'] ?? [];
        return [
            'api_url' => getenv('WA_API_URL') ?: ($wa['api_url'] ?? 'https://wa.alutsmani.id/api/whatsapp/send'),
            'api_key' => getenv('WA_API_KEY') ?: ($wa['api_key'] ?? ''),
            'instance' => getenv('WA_INSTANCE') ?: ($wa['instance'] ?? 'uwaba1'),
            'session_id' => trim((string) (getenv('WA_SESSION_ID') !== false ? getenv('WA_SESSION_ID') : ($wa['session_id'] ?? ''))),
        ];
    }

    /**
     * Session default untuk kirim / aktivasi (config WA_SESSION_ID atau "default").
     */
    public static function getPrimaryWaSessionId(): string
    {
        $cfg = self::getConfig();
        $sid = trim((string) ($cfg['session_id'] ?? ''));

        return $sid !== '' ? $sid : 'default';
    }

    /**
     * URL GET /status pada server Node (tanpa auth) dari WA_API_URL …/send.
     */
    private static function getWaStatusApiUrl(): string
    {
        $cfg = self::getConfig();
        $apiUrl = $cfg['api_url'];
        $statusUrl = preg_replace('#/send$#', '/status', rtrim((string) $apiUrl, '/'));
        if ($statusUrl === $apiUrl) {
            $statusUrl = rtrim((string) $apiUrl, '/') . '/status';
        }

        return $statusUrl;
    }

    /**
     * Ambil status satu session dari server Node WA (Baileys / slot).
     *
     * @return array<string, mixed>|null data: baileysStatus, baileysPhoneNumber, phoneNumber, …
     */
    public static function fetchNodeSessionStatus(string $sessionId = 'default'): ?array
    {
        $url = self::getWaStatusApiUrl() . '?sessionId=' . rawurlencode($sessionId);
        try {
            $client = new \GuzzleHttp\Client(['timeout' => 8]);
            $response = $client->get($url);
            $body = json_decode((string) $response->getBody(), true);
            if (!is_array($body) || empty($body['data']) || !is_array($body['data'])) {
                return null;
            }

            return $body['data'];
        } catch (\Throwable $e) {
            error_log('WhatsAppService::fetchNodeSessionStatus ' . $e->getMessage());

            return null;
        }
    }

    /**
     * Samakan session kirim dengan slot WA yang terhubung (Node: req.body.sessionId).
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private static function mergeWaSessionPayload(array $payload, array $cfg): array
    {
        $sid = trim((string) ($cfg['session_id'] ?? ''));
        if ($sid !== '') {
            $payload['sessionId'] = $sid;
        }

        return $payload;
    }

    /**
     * Respons Node /send success:false — layak dicoba lagi setelah wake (socket mati / baru bangun).
     */
    private static function nodeSendIndicatesReconnect(string $msg): bool
    {
        $m = mb_strtolower($msg, 'UTF-8');

        return str_contains($m, 'belum login')
            || str_contains($m, 'belum terhubung')
            || str_contains($m, 'scan qr')
            || str_contains($m, 'terputus')
            || str_contains($m, 'menyambung')
            || str_contains($m, 'hubungkan nomor')
            || str_contains($m, 'koneksi wa')
            || str_contains($m, 'baileys');
    }

    /**
     * @param array<string, mixed> $data
     */
    private static function mapNodeWaErrorMessage(array $data, string $fallback): string
    {
        $code = isset($data['code']) ? (string) $data['code'] : '';
        if ($code === 'wa_not_paired') {
            return 'WhatsApp belum terhubung. Hubungkan nomor lembaga di halaman Koneksi WA lalu scan QR.';
        }
        if ($code === 'wa_disconnected') {
            return 'WhatsApp terputus atau masih menyambung. Coba lagi sebentar atau buka halaman Koneksi WA.';
        }

        return $fallback;
    }

    /**
     * Panggil endpoint wake di server WA agar koneksi dinyalakan jika sedang off.
     * Dipanggil saat pendaftar menekan "Aktifkan notifikasi" agar WA siap menerima pesan Daftar Notifikasi.
     * Hanya dipanggil jika notification_provider = wa_sendiri.
     *
     * @return array ['success' => bool, 'message' => string]
     */
    public static function wakeWaServer(): array
    {
        if (self::getNotificationProvider() !== 'wa_sendiri') {
            return ['success' => true, 'message' => 'Provider bukan WA server sendiri.'];
        }
        $cfg = self::getConfig();
        $apiUrl = $cfg['api_url'];
        $apiKey = $cfg['api_key'];
        if (empty($apiUrl) || empty($apiKey)) {
            return ['success' => false, 'message' => 'Backend WA belum dikonfigurasi.'];
        }
        $wakeUrl = preg_replace('#/send$#', '/wake', rtrim($apiUrl, '/'));
        if ($wakeUrl === $apiUrl) {
            $wakeUrl = rtrim($apiUrl, '/') . '/wake';
        }
        try {
            $client = new \GuzzleHttp\Client(['timeout' => 10]);
            $response = $client->post($wakeUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $apiKey,
                ],
                'json' => (object) [],
            ]);
            $body = (string) $response->getBody();
            $data = is_string($body) ? json_decode($body, true) : [];
            $ok = $response->getStatusCode() >= 200 && $response->getStatusCode() < 300;
            return [
                'success' => $ok,
                'message' => is_array($data) && isset($data['message']) ? (string) $data['message'] : ($ok ? 'OK' : 'Request gagal'),
            ];
        } catch (\Throwable $e) {
            error_log('WhatsAppService::wakeWaServer: ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    /**
     * Base URL aplikasi pendaftaran (untuk link di WA notifikasi PSB).
     */
    public static function getDaftarAppUrl(): string
    {
        $config = require __DIR__ . '/../../config.php';
        $url = $config['daftar_app_url'] ?? getenv('DAFTAR_APP_URL') ?: 'https://daftar.alutsmani.id';
        return rtrim((string) $url, '/');
    }

    /**
     * Base URL aplikasi mybeddian (untuk link di WA notifikasi Uwaba/Khusus/Tunggakan).
     */
    public static function getMybeddianAppUrl(): string
    {
        $config = require __DIR__ . '/../../config.php';
        $url = $config['mybeddian_app_url'] ?? $config['app']['mybeddian_url'] ?? getenv('MYBEDDIAN_APP_URL') ?: 'https://mybeddian.alutsmani.id';
        return rtrim((string) $url, '/');
    }

    /**
     * Format nomor untuk API (62xxxxxxxxxx).
     */
    public static function formatPhoneNumber(string $phone): string
    {
        $phone = trim($phone);
        if ($phone === '') {
            return '';
        }
        if (str_contains($phone, '@')) {
            $phone = strstr($phone, '@', true) ?: '';
        }
        if ($phone !== '' && str_contains($phone, ':')) {
            $phone = explode(':', $phone, 2)[0];
        }
        $phone = preg_replace('/\D/', '', $phone);
        if ($phone === '') {
            return '';
        }
        if (strpos($phone, '0') === 0) {
            $phone = '62' . substr($phone, 1);
        } elseif (strpos($phone, '62') !== 0) {
            $phone = '62' . $phone;
        }
        return $phone;
    }

    /**
     * Normalisasi field "from" webhook (Baileys): chat @lid mengirim digit LID, bukan MSISDN — jangan pakai formatPhoneNumber.
     */
    public static function normalizeWebhookFrom(string $from, ?string $fromJid): string
    {
        $fromJid = $fromJid !== null ? trim((string) $fromJid) : '';
        if ($fromJid !== '' && preg_match('/@lid$/i', $fromJid)) {
            return preg_replace('/\D/', '', $from) ?? '';
        }

        return self::formatPhoneNumber($from);
    }

    /**
     * Normalisasi canonicalNumber dari webhook (MSISDN atau digit LID mentah).
     */
    public static function normalizeWebhookDestination(string $value): string
    {
        $v = trim($value);
        if ($v === '') {
            return '';
        }
        if (self::looksLikeLidIdentifier($v)) {
            return preg_replace('/\D/', '', $v) ?? '';
        }

        return self::formatPhoneNumber($v);
    }

    /**
     * Ambil pesan chat dari server WA (pesan yang dikirim lewat WA langsung atau pesan masuk saat WA off).
     *
     * @param string $phoneNumber Nomor 08xxx atau 62xxx
     * @param int $limit Jumlah pesan (default 50, max 100)
     * @return array ['success' => bool, 'data' => array of ['id','body','fromMe','timestamp','status','nomor_tujuan'], 'message' => string]
     */
    public static function fetchChatMessagesFromWa(string $phoneNumber, int $limit = 50): array
    {
        $phone = self::formatPhoneNumber($phoneNumber);
        if (strlen($phone) < 10) {
            return ['success' => false, 'data' => [], 'message' => 'Nomor tidak valid'];
        }
        $cfg = self::getConfig();
        $apiKey = $cfg['api_key'];
        $apiUrl = $cfg['api_url'];
        if (empty($apiKey) || empty($apiUrl)) {
            return ['success' => false, 'data' => [], 'message' => 'Backend WA belum dikonfigurasi'];
        }
        $baseUrl = preg_replace('#/send$#', '', $apiUrl);
        $chatMessagesUrl = rtrim($baseUrl, '/') . '/chat-messages';
        $limit = max(1, min(100, $limit));
        try {
            $client = new \GuzzleHttp\Client(['timeout' => 30]);
            $response = $client->post($chatMessagesUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $apiKey,
                ],
                'json' => [
                    'phoneNumber' => $phone,
                    'limit' => $limit,
                ],
            ]);
            $code = $response->getStatusCode();
            $body = (string) $response->getBody();
            $data = json_decode($body, true);
            if ($code >= 200 && $code < 300 && !empty($data['success']) && isset($data['data'])) {
                return [
                    'success' => true,
                    'data' => is_array($data['data']) ? $data['data'] : [],
                    'message' => $data['message'] ?? 'OK',
                ];
            }
            return [
                'success' => false,
                'data' => [],
                'message' => $data['message'] ?? $data['error'] ?? "HTTP {$code}",
            ];
        } catch (\Throwable $e) {
            error_log('WhatsAppService::fetchChatMessagesFromWa: ' . $e->getMessage());
            return ['success' => false, 'data' => [], 'message' => $e->getMessage()];
        }
    }

    /**
     * Cek apakah nomor terdaftar/aktif di WhatsApp (backend WA baru).
     * Return format sama dengan response backend: success, data: { phoneNumber, isRegistered }, message.
     *
     * @param string $noWa Nomor WA (08xxx atau 62xxx)
     * @return array ['success' => bool, 'data' => ['phoneNumber' => string, 'isRegistered' => bool], 'message' => string]
     */
    public static function checkNumber(string $noWa): array
    {
        $phone = self::formatPhoneNumber($noWa);
        if (strlen($phone) < 10) {
            return [
                'success' => false,
                'data' => ['phoneNumber' => $phone, 'isRegistered' => false],
                'message' => 'Nomor tidak valid',
            ];
        }

        if (self::getNotificationProvider() === 'watzap') {
            return \App\Services\WatzapService::checkNumber($noWa);
        }

        $cfg = self::getConfig();
        $apiUrl = $cfg['api_url'];
        $apiKey = $cfg['api_key'];
        $checkUrl = preg_replace('#/api/whatsapp/send$#', '/api/whatsapp/check', $apiUrl);

        if (empty($checkUrl) || empty($apiKey)) {
            return [
                'success' => true,
                'data' => ['phoneNumber' => $phone, 'isRegistered' => true],
                'message' => 'OK (dev)',
            ];
        }

        try {
            $client = new \GuzzleHttp\Client(['timeout' => 10]);
            $response = $client->post($checkUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $apiKey,
                ],
                'json' => ['phoneNumber' => $phone],
            ]);

            $code = $response->getStatusCode();
            $body = (string) $response->getBody();
            $data = json_decode($body, true);

            if ($code >= 200 && $code < 300 && isset($data['success']) && isset($data['data'])) {
                return [
                    'success' => (bool) $data['success'],
                    'data' => [
                        'phoneNumber' => $data['data']['phoneNumber'] ?? $phone,
                        'isRegistered' => (bool) ($data['data']['isRegistered'] ?? false),
                    ],
                    'message' => $data['message'] ?? ($data['data']['isRegistered'] ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp'),
                ];
            }

            $errMsg = $data['message'] ?? $data['error'] ?? "HTTP {$code}";
            return [
                'success' => false,
                'data' => ['phoneNumber' => $phone, 'isRegistered' => false],
                'message' => $errMsg,
            ];
        } catch (\Throwable $e) {
            error_log('WhatsAppService::checkNumber: ' . $e->getMessage());
            return [
                'success' => false,
                'data' => ['phoneNumber' => $phone, 'isRegistered' => false],
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Panggil server WA Node: POST /api/whatsapp/resolve-jids (onWhatsApp → daftar JID termasuk @lid).
     *
     * @return array{success:bool, jids:array, message:string, reason?:string}
     */
    public static function resolveJidsFromWaNode(string $noWa, ?string $sessionId = null): array
    {
        $phone = self::formatPhoneNumber($noWa);
        if (strlen($phone) < 10) {
            return ['success' => false, 'jids' => [], 'message' => 'Nomor tidak valid'];
        }
        if (self::getNotificationProvider() === 'watzap') {
            return ['success' => false, 'jids' => [], 'message' => 'Ambil LID hanya untuk provider WA server sendiri (bukan WatZap).'];
        }

        $cfg = self::getConfig();
        $apiUrl = $cfg['api_url'];
        $apiKey = $cfg['api_key'];
        $resolveUrl = preg_replace('#/api/whatsapp/send$#', '/api/whatsapp/resolve-jids', $apiUrl);

        if (empty($resolveUrl) || empty($apiKey)) {
            return ['success' => false, 'jids' => [], 'message' => 'Backend WA belum dikonfigurasi'];
        }

        try {
            $client = new \GuzzleHttp\Client(['timeout' => 25]);
            $payload = ['phoneNumber' => $phone];
            if ($sessionId !== null && trim($sessionId) !== '') {
                $payload['sessionId'] = trim($sessionId);
            }
            $response = $client->post($resolveUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $apiKey,
                ],
                'json' => $payload,
            ]);
            $code = $response->getStatusCode();
            $body = (string) $response->getBody();
            $data = json_decode($body, true);
            $jids = [];
            if (is_array($data) && isset($data['data']['jids']) && is_array($data['data']['jids'])) {
                $jids = $data['data']['jids'];
            }
            $reason = is_array($data['data'] ?? null) ? ($data['data']['reason'] ?? null) : null;
            $source = is_array($data['data'] ?? null) ? ($data['data']['source'] ?? null) : null;
            if ($code >= 200 && $code < 300 && !empty($data['success'])) {
                return [
                    'success' => true,
                    'jids' => $jids,
                    'message' => (string) ($data['message'] ?? 'OK'),
                    'reason' => $reason,
                    'source' => $source,
                ];
            }
            $msg = $data['message'] ?? $data['error'] ?? "HTTP {$code}";
            return [
                'success' => false,
                'jids' => $jids,
                'message' => (string) $msg,
                'reason' => $reason,
                'source' => $source,
            ];
        } catch (\Throwable $e) {
            error_log('WhatsAppService::resolveJidsFromWaNode: ' . $e->getMessage());
            return ['success' => false, 'jids' => [], 'message' => $e->getMessage()];
        }
    }

    /**
     * Ambil digit LID pertama dari daftar JID (mis. "123...@lid" → "123...").
     */
    public static function extractLidDigitsFromJids(array $jids): ?string
    {
        foreach ($jids as $jid) {
            if (!is_string($jid)) {
                continue;
            }
            $j = trim($jid);
            if (preg_match('/^(\d+)@lid$/i', $j, $m)) {
                return $m[1];
            }
        }
        return null;
    }

    /**
     * True jika ada JID pengguna PN (@s.whatsapp.net) dari hasil onWhatsApp — nomor terdaftar, tanpa @lid.
     */
    public static function hasPnUserJidInJids(array $jids): bool
    {
        foreach ($jids as $jid) {
            if (!is_string($jid)) {
                continue;
            }
            if (preg_match('/@s\.whatsapp\.net$/i', trim($jid)) === 1) {
                return true;
            }
        }
        return false;
    }

    /**
     * Cek apakah notif dengan kategori ini sudah dikirim ke nomor + id_santri dalam N hari terakhir.
     * Dipakai untuk biodata_terdaftar, berkas, pembayaran (bukan order/batalkan) agar tidak kirim ulang ke no yang sama.
     */
    private static function alreadySentRecently(string $nomorTujuan, ?int $idSantri, string $kategori, int $days = self::THROTTLE_DAYS): bool
    {
        if (!in_array($kategori, self::THROTTLE_KATEGORI, true)) {
            return false;
        }
        $nomorNormal = self::formatPhoneNumber($nomorTujuan);
        if (strlen($nomorNormal) < 10) {
            return false;
        }
        try {
            $db = Database::getInstance()->getConnection();
            $stmt = $db->prepare(
                'SELECT 1 FROM whatsapp WHERE nomor_tujuan = ? AND kategori = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) AND (id_santri <=> ?) LIMIT 1'
            );
            $stmt->execute([$nomorNormal, $kategori, $days, $idSantri]);
            return $stmt->fetch() !== false;
        } catch (\Throwable $e) {
            error_log('WhatsAppService::alreadySentRecently: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Cek apakah notif dengan kategori ini sudah dikirim ke nomor + id_santri dalam 1 menit terakhir.
     * Dipakai untuk pesanan pembayaran dan pembatalan: tetap kirim, kecuali duplikat dalam 1 menit.
     */
    private static function alreadySentInLastMinute(string $nomorTujuan, ?int $idSantri, string $kategori): bool
    {
        if (!in_array($kategori, self::THROTTLE_1MIN_ONLY_KATEGORI, true)) {
            return false;
        }
        $nomorNormal = self::formatPhoneNumber($nomorTujuan);
        if (strlen($nomorNormal) < 10) {
            return false;
        }
        try {
            $db = Database::getInstance()->getConnection();
            $stmt = $db->prepare(
                'SELECT 1 FROM whatsapp WHERE nomor_tujuan = ? AND kategori = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE) AND (id_santri <=> ?) LIMIT 1'
            );
            $stmt->execute([$nomorNormal, $kategori, $idSantri]);
            return $stmt->fetch() !== false;
        } catch (\Throwable $e) {
            error_log('WhatsAppService::alreadySentInLastMinute: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Simpan log pesan WA ke tabel whatsapp.
     * Jika wa_message_id diset, nanti message_ack dari server WA bisa update status (sent/delivered/read).
     *
     * @param string $nomorTujuan Nomor tujuan; untuk chat @lid bisa berupa id numerik mentah
     * @param string $isiPesan Isi pesan
     * @param int $punyaGambar 0 atau 1
     * @param string $status terkirim|gagal|sent|delivered|read
     * @param string|null $responseMessage Pesan dari API
     * @param int|null $idSantri id santri (konteks) ketika tujuan=santri atau wali_santri
     * @param int|null $idPengurus pengurus sebagai PENERIMA (tujuan) ketika tujuan=pengurus
     * @param string $tujuan pengurus|santri|wali_santri (dikirim ke siapa)
     * @param int|null $idPengurusPengirim pengurus yang memicu mengirim (manual); null = system
     * @param string $kategori biodata_terdaftar, verifikasi, pembayaran_*, dll
     * @param string $sumber system, daftar, uwaba, manage_users, auth, api_wa
     * @param string|null $waMessageId ID pesan dari WA (untuk sinkronisasi status sent/delivered/read via message_ack)
     */
    private static function logSentMessage(string $nomorTujuan, string $isiPesan, int $punyaGambar, string $status, ?string $responseMessage, ?int $idSantri, ?int $idPengurus, string $tujuan, ?int $idPengurusPengirim, string $kategori, string $sumber, ?string $waMessageId = null): void
    {
        $digitsRaw = preg_replace('/\D/', '', (string) $nomorTujuan) ?? '';
        $isRawNonMsisdn = $digitsRaw !== ''
            && strlen($digitsRaw) >= 10
            && strlen($digitsRaw) <= 18
            && strpos($digitsRaw, '62') !== 0
            && strpos($digitsRaw, '0') !== 0;
        $nomorNormal = $isRawNonMsisdn ? $digitsRaw : self::formatPhoneNumber($nomorTujuan);
        try {
            $db = Database::getInstance()->getConnection();
            $cols = ['id_santri', 'id_pengurus', 'tujuan', 'id_pengurus_pengirim', 'kategori', 'sumber', 'nomor_tujuan', 'isi_pesan', 'punya_gambar', 'status', 'response_message'];
            $vals = [$idSantri, $idPengurus, $tujuan, $idPengurusPengirim, $kategori, $sumber, $nomorNormal, $isiPesan, $punyaGambar, $status, $responseMessage !== null ? substr($responseMessage, 0, 500) : null];
            $hasArah = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $hasWaMessageId = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;
            if ($hasArah) {
                $cols[] = 'arah';
                $vals[] = 'keluar';
            }
            if ($hasWaMessageId && $waMessageId !== null && trim($waMessageId) !== '') {
                $cols[] = 'wa_message_id';
                $vals[] = trim($waMessageId);
            }
            $placeholders = implode(', ', array_fill(0, count($cols), '?'));
            $stmt = $db->prepare('INSERT INTO whatsapp (' . implode(', ', $cols) . ') VALUES (' . $placeholders . ')');
            $stmt->execute($vals);
        } catch (\Throwable $e) {
            error_log('WhatsAppService::logSentMessage: ' . $e->getMessage());
        }
    }

    /**
     * Status kontak di whatsapp___kontak untuk cek sebelum kirim notif.
     * Semua notifikasi harus melewati cek ini.
     *
     * @return array ['exists' => bool, 'siap_terima_notif' => bool] exists=false berarti nomor belum ada (boleh kirim, lalu insert dengan default tidak menerima)
     */
    private static function getKontakStatus(string $nomorNormal): array
    {
        if (strlen($nomorNormal) < 10) {
            return ['exists' => false, 'siap_terima_notif' => true];
        }
        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return ['exists' => false, 'siap_terima_notif' => true];
            }
            $stmt = $db->prepare('SELECT siap_terima_notif FROM whatsapp___kontak WHERE nomor = ? LIMIT 1');
            $stmt->execute([$nomorNormal]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row === false) {
                return ['exists' => false, 'siap_terima_notif' => true];
            }
            return [
                'exists' => true,
                'siap_terima_notif' => (int) ($row['siap_terima_notif'] ?? 0) === 1,
            ];
        } catch (\Throwable $e) {
            error_log('WhatsAppService::getKontakStatus: ' . $e->getMessage());
            return ['exists' => false, 'siap_terima_notif' => true];
        }
    }

    /**
     * Status kontak untuk dipanggil dari luar (mis. endpoint pendaftaran).
     * @return array ['exists' => bool, 'siap_terima_notif' => bool]
     */
    public static function getKontakStatusForNomor(string $nomor): array
    {
        $nomorNormal = self::formatPhoneNumber($nomor);
        return self::getKontakStatus($nomorNormal);
    }

    /**
     * Insert kontak ke whatsapp___kontak (hanya jika belum ada). Nomor unik.
     * Dipanggil setelah berhasil kirim notif ke nomor baru, atau saat flow Daftar Notifikasi dapat "No WA:" (simpan nomor kanonik di kontak).
     *
     * @param int $siapTerimaNotif 0 = tidak menerima, 1 = menerima (default 0 untuk kontak baru)
     */
    public static function ensureKontak(string $nomorNormal, int $siapTerimaNotif = 0, ?string $nama = null): void
    {
        if (strlen($nomorNormal) < 10) {
            return;
        }
        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                return;
            }
            $hasNamaCol = self::kontakTableHasNama($db);
            $namaTrim = is_string($nama) ? trim($nama) : '';
            if ($hasNamaCol && $namaTrim !== '') {
                $stmt = $db->prepare('INSERT INTO whatsapp___kontak (nomor, nama, siap_terima_notif) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE nama = COALESCE(NULLIF(nama, ""), VALUES(nama))');
                $stmt->execute([$nomorNormal, $namaTrim, $siapTerimaNotif]);
            } else {
                $stmt = $db->prepare('INSERT IGNORE INTO whatsapp___kontak (nomor, siap_terima_notif) VALUES (?, ?)');
                $stmt->execute([$nomorNormal, $siapTerimaNotif]);
            }
        } catch (\Throwable $e) {
            error_log('WhatsAppService::ensureKontak: ' . $e->getMessage());
        }
    }

    /**
     * Set status notifikasi kontak: insert atau update whatsapp___kontak.
     * Dipakai oleh flow Daftar Notifikasi (balas otomatis).
     *
     * @param int $siapTerimaNotif 0 = tidak menerima, 1 = menerima
     * @param string|null $nomorKanonik Nomor dari form (No WA di pesan); jika ada, disimpan di kolom nomor_kanonik
     * @param string|null $nama Nama kontak (jika tersedia)
     */
    public static function setKontakNotif(string $nomor, int $siapTerimaNotif, ?string $nomorKanonik = null, ?string $nama = null): void
    {
        $nomorNormal = self::formatPhoneNumber($nomor);
        if (strlen($nomorNormal) < 10) {
            return;
        }
        $kanonikNormal = $nomorKanonik !== null && $nomorKanonik !== '' ? self::formatPhoneNumber($nomorKanonik) : null;
        if ($kanonikNormal !== null && strlen($kanonikNormal) < 10) {
            $kanonikNormal = null;
        }
        $value = $siapTerimaNotif === 1 ? 1 : 0;
        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) {
                error_log('WhatsAppService::setKontakNotif: tabel whatsapp___kontak tidak ada');
                return;
            }
            $hasKanonikCol = self::kontakTableHasNomorKanonik($db);
            $hasNamaCol = self::kontakTableHasNama($db);
            $namaTrim = is_string($nama) ? trim($nama) : '';
            // Cari baris yang nomor-nya (setelah dinormalisasi di PHP) sama, lalu update by id (paling pasti)
            $stmt = $db->prepare('SELECT id, nomor FROM whatsapp___kontak WHERE nomor = ? OR nomor LIKE ?');
            $stmt->execute([$nomorNormal, '%' . substr($nomorNormal, -10) . '%']); // exact atau mengandung 10 digit terakhir
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $idToUpdate = null;
            foreach ($rows as $row) {
                $storedNormal = self::formatPhoneNumber((string) ($row['nomor'] ?? ''));
                if ($storedNormal !== '' && $storedNormal === $nomorNormal) {
                    $idToUpdate = (int) $row['id'];
                    break;
                }
            }
            if ($idToUpdate !== null) {
                if ($hasKanonikCol && $kanonikNormal !== null && $hasNamaCol && $namaTrim !== '') {
                    $stmt = $db->prepare('UPDATE whatsapp___kontak SET siap_terima_notif = ?, nomor_kanonik = ?, nama = ?, updated_at = NOW() WHERE id = ?');
                    $stmt->execute([$value, $kanonikNormal, $namaTrim, $idToUpdate]);
                } else if ($hasKanonikCol && $kanonikNormal !== null) {
                    $stmt = $db->prepare('UPDATE whatsapp___kontak SET siap_terima_notif = ?, nomor_kanonik = ?, updated_at = NOW() WHERE id = ?');
                    $stmt->execute([$value, $kanonikNormal, $idToUpdate]);
                } else if ($hasNamaCol && $namaTrim !== '') {
                    $stmt = $db->prepare('UPDATE whatsapp___kontak SET siap_terima_notif = ?, nama = ?, updated_at = NOW() WHERE id = ?');
                    $stmt->execute([$value, $namaTrim, $idToUpdate]);
                } else {
                    $stmt = $db->prepare('UPDATE whatsapp___kontak SET siap_terima_notif = ?, updated_at = NOW() WHERE id = ?');
                    $stmt->execute([$value, $idToUpdate]);
                }
                $updated = $stmt->rowCount();
                error_log('WhatsAppService::setKontakNotif: id=' . $idToUpdate . ' nomor=' . $nomorNormal . ($kanonikNormal ? ' nomor_kanonik=' . $kanonikNormal : '') . ' siap_terima_notif=' . $value . ' rows_updated=' . $updated);
            } else {
                // Fallback: update by nomor exact, lalu by nomor dinormalisasi (strip spasi/dash)
                $stmt = $db->prepare('UPDATE whatsapp___kontak SET siap_terima_notif = ?, updated_at = NOW() WHERE nomor = ?');
                $stmt->execute([$value, $nomorNormal]);
                $updated = $stmt->rowCount();
                if ($updated === 0) {
                    $stmt = $db->prepare("UPDATE whatsapp___kontak SET siap_terima_notif = ?, updated_at = NOW() WHERE REPLACE(REPLACE(REPLACE(nomor, ' ', ''), '-', ''), '+', '') = ?");
                    $stmt->execute([$value, $nomorNormal]);
                    $updated = $stmt->rowCount();
                }
                if ($updated > 0 && $hasKanonikCol && $kanonikNormal !== null) {
                    $stmt = $db->prepare('UPDATE whatsapp___kontak SET nomor_kanonik = ?, updated_at = NOW() WHERE nomor = ?');
                    $stmt->execute([$kanonikNormal, $nomorNormal]);
                }
                if ($updated > 0 && $hasNamaCol && $namaTrim !== '') {
                    $stmt = $db->prepare('UPDATE whatsapp___kontak SET nama = ?, updated_at = NOW() WHERE nomor = ?');
                    $stmt->execute([$namaTrim, $nomorNormal]);
                }
                if ($updated > 0) {
                    error_log('WhatsAppService::setKontakNotif: fallback UPDATE by nomor=' . $nomorNormal . ' rows_updated=' . $updated);
                } else {
                    $cols = 'nomor, siap_terima_notif';
                    $vals = '?, ?';
                    $params = [$nomorNormal, $value];
                    $dupParts = ['siap_terima_notif = VALUES(siap_terima_notif)', 'updated_at = NOW()'];
                    if ($hasKanonikCol && $kanonikNormal !== null) {
                        $cols .= ', nomor_kanonik';
                        $vals .= ', ?';
                        $params[] = $kanonikNormal;
                        $dupParts[] = 'nomor_kanonik = VALUES(nomor_kanonik)';
                    }
                    if ($hasNamaCol && $namaTrim !== '') {
                        $cols .= ', nama';
                        $vals .= ', ?';
                        $params[] = $namaTrim;
                        $dupParts[] = 'nama = VALUES(nama)';
                    }
                    $dup = 'ON DUPLICATE KEY UPDATE ' . implode(', ', $dupParts);
                    $stmt = $db->prepare("INSERT INTO whatsapp___kontak ({$cols}) VALUES ({$vals}) {$dup}");
                    $stmt->execute($params);
                    error_log('WhatsAppService::setKontakNotif: insert/upsert nomor=' . $nomorNormal . ' siap_terima_notif=' . $value);
                }
            }
        } catch (\Throwable $e) {
            error_log('WhatsAppService::setKontakNotif: ' . $e->getMessage());
        }
    }

    private static function kontakTableHasNomorKanonik(\PDO $db): bool
    {
        try {
            $stmt = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nomor_kanonik'");
            return $stmt !== false && $stmt->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function kontakTableHasNama(\PDO $db): bool
    {
        try {
            $stmt = $db->query("SHOW COLUMNS FROM whatsapp___kontak LIKE 'nama'");
            return $stmt !== false && $stmt->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    private static function isPendaftaranContactContext(?array $logContext): bool
    {
        if ($logContext === null) {
            return false;
        }
        $kategori = trim((string) ($logContext['kategori'] ?? ''));
        return in_array($kategori, self::PENDAFTARAN_KATEGORI, true);
    }

    /**
     * Nama kontak untuk penyimpanan otomatis dari flow pendaftaran.
     * Format: "Nama Pendaftar (wali)" atau "Nama Pendaftar (santri)".
     */
    private static function deriveKontakLabelFromLogContext(?array $logContext): ?string
    {
        if (!self::isPendaftaranContactContext($logContext)) {
            return null;
        }
        $idSantri = isset($logContext['id_santri']) && is_numeric($logContext['id_santri']) ? (int) $logContext['id_santri'] : 0;
        if ($idSantri <= 0) {
            return null;
        }
        try {
            $db = Database::getInstance()->getConnection();
            $stmt = $db->prepare('SELECT nama FROM santri WHERE id = ? LIMIT 1');
            $stmt->execute([$idSantri]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $nama = trim((string) ($row['nama'] ?? ''));
            if ($nama === '') {
                return null;
            }
            $tujuan = trim((string) ($logContext['tujuan'] ?? ''));
            $suffix = $tujuan === 'wali_santri' ? ' (wali)' : ($tujuan === 'santri' ? ' (santri)' : '');
            if ($suffix !== '' && !preg_match('/\((wali|santri)\)\s*$/i', $nama)) {
                $nama .= $suffix;
            }
            return $nama;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Resolve nomor tujuan pengiriman: jika kontak punya nomor_kanonik (nomor yang dipakai user saat daftar),
     * kirim ke nomor itu agar notifikasi sampai di HP yang dipakai.
     * Jadi jika biodata = B tapi user daftar dari nomor A → kirim ke A.
     *
     * @return array ['nomor' => string, 'chatId' => ?string] nomor untuk kirim (bisa beda dari input)
     */
    public static function resolveDeliveryTarget(string $nomor): array
    {
        $phone = self::formatPhoneNumber($nomor);
        if (strlen($phone) < 10) {
            return ['nomor' => $phone, 'chatId' => null];
        }
        try {
            $db = Database::getInstance()->getConnection();
            if (self::kontakTableHasNomorKanonik($db)) {
                $stmt = $db->prepare('SELECT nomor_kanonik FROM whatsapp___kontak WHERE nomor = ? AND nomor_kanonik IS NOT NULL AND TRIM(nomor_kanonik) != "" LIMIT 1');
                $stmt->execute([$phone]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($row !== false) {
                    $raw = trim((string) $row['nomor_kanonik']);
                    if ($raw !== '') {
                        // Jika nomor_kanonik berisi LID (atau JID @lid), gunakan sebagai chatId agar delivery tepat sasaran.
                        // Ini penting untuk kasus WA menyimpan kontak sebagai @lid sehingga kirim ke MSISDN kadang tidak nyangkut.
                        if (self::looksLikeLidIdentifier($raw)) {
                            $lid = self::extractLidFromIdentifier($raw);
                            if ($lid !== null) {
                                return ['nomor' => $phone, 'chatId' => $lid . '@lid'];
                            }
                        }
                        // Default: treat nomor_kanonik sebagai nomor HP kanonik (62xxx) dan kirim ke situ.
                        $kanonik = self::formatPhoneNumber($raw);
                        if (strlen($kanonik) >= 10 && $kanonik !== $phone) {
                            return ['nomor' => $kanonik, 'chatId' => null];
                        }
                    }
                }
            }
        } catch (\Throwable $e) {
            // ignore
        }
        return ['nomor' => $phone, 'chatId' => null];
    }

    /**
     * Jika provider mengirim meta JID @lid pada incoming message, simpan LID itu ke tabel kontak (kolom nomor_kanonik).
     * Tujuan: saat kirim pesan berikutnya, kita bisa pakai chatId = "{lid}@lid" agar tepat sasaran.
     *
     * Catatan: dibuat konservatif — hanya mengisi nomor_kanonik jika masih kosong (agar tidak menimpa mapping lama).
     */
    public static function syncKontakLidFromIncomingMeta(string $canonicalPhone, ?string $fromJid): void
    {
        if ($fromJid === null) return;
        $fromJid = trim((string) $fromJid);
        if ($fromJid === '') return;

        $lid = self::extractLidFromIdentifier($fromJid);
        if ($lid === null) return;

        $phone = self::looksLikeLidIdentifier($canonicalPhone)
            ? (preg_replace('/\D/', '', $canonicalPhone) ?? '')
            : self::formatPhoneNumber($canonicalPhone);
        if (strlen($phone) < 10) return;

        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___kontak'");
            if ($tableCheck->rowCount() === 0) return;
            if (!self::kontakTableHasNomorKanonik($db)) return;

            // Pastikan ada baris kontak untuk nomor ini (tidak mengubah siap_terima_notif).
            self::ensureKontak($phone, 0, null);

            // Isi nomor_kanonik hanya jika masih kosong.
            $stmt = $db->prepare('UPDATE whatsapp___kontak SET nomor_kanonik = ?, updated_at = NOW() WHERE nomor = ? AND (nomor_kanonik IS NULL OR TRIM(nomor_kanonik) = "")');
            $stmt->execute([$lid, $phone]);
        } catch (\Throwable $e) {
            error_log('WhatsAppService::syncKontakLidFromIncomingMeta: ' . $e->getMessage());
        }
    }

    private static function looksLikeLidIdentifier(string $value): bool
    {
        $v = trim($value);
        if ($v === '') return false;
        if (preg_match('/@lid$/i', $v) === 1) return true;
        // Heuristik: LID biasanya numeric panjang dan bukan MSISDN (tidak diawali 0/62).
        $digits = preg_replace('/\D/', '', $v) ?? '';
        if ($digits === '') return false;
        if (strpos($digits, '62') === 0 || strpos($digits, '0') === 0) return false;
        return strlen($digits) >= 10;
    }

    /**
     * Terima input berupa:
     * - "123456789@lid"
     * - "123456789" (raw LID numeric)
     * Return: "123456789" atau null.
     */
    private static function extractLidFromIdentifier(string $value): ?string
    {
        $v = trim($value);
        if ($v === '') return null;
        if (preg_match('/@lid$/i', $v) === 1) {
            $v = preg_replace('/@lid$/i', '', $v) ?? '';
        }
        $digits = preg_replace('/\D/', '', $v) ?? '';
        if ($digits === '') return null;
        // Jangan treat MSISDN sebagai LID.
        if (strpos($digits, '62') === 0 || strpos($digits, '0') === 0) return null;
        if (strlen($digits) < 10) return null;
        return $digits;
    }

    /**
     * Baca provider notifikasi WA dari app___settings: wa_sendiri | watzap.
     */
    public static function getNotificationProvider(): string
    {
        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'app___settings'");
            if ($tableCheck->rowCount() === 0) {
                return 'wa_sendiri';
            }
            $stmt = $db->prepare("SELECT `value` FROM app___settings WHERE `key` = 'notification_provider' LIMIT 1");
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $provider = ($row && isset($row['value']) && trim((string) $row['value']) === 'watzap') ? 'watzap' : 'wa_sendiri';
            return $provider;
        } catch (\Throwable $e) {
            return 'wa_sendiri';
        }
    }

    /**
     * Kirim pesan teks ke nomor WA.
     * Menggunakan API yang sama dengan offcanvas kwitansi/biodata UWABA.
     * Jika pengaturan notifikasi = watzap, kirim lewat WatZap (api_key + number_key "ALL").
     * Jika $logContext diset, pesan dicatat di tabel whatsapp.
     *
     * @param string $noWa Nomor WA (08xxx atau 62xxx)
     * @param string $message Pesan teks
     * @param string|null $instance Instance (default dari config, biasanya uwaba1)
     * @param array|null $logContext ['id_santri'=>?, 'id_pengurus'=>? (penerima), 'tujuan'=>pengurus|santri|wali_santri, 'id_pengurus_pengirim'=>?, 'kategori'=>?, 'sumber'=>?]
     * @param string|null $chatId JID asli dari WA (mis. xxx@c.us atau xxx@lid) untuk balas ke chat yang sama; jika ada, server WA pakai ini sebagai target
     * @return array ['success' => bool, 'message' => string]
     */
    public static function sendMessage(string $noWa, string $message, ?string $instance = null, ?array $logContext = null, ?string $chatId = null): array
    {
        $rawDigitsInput = preg_replace('/\D/', '', (string) $noWa) ?? '';
        $isLidChat = is_string($chatId) && preg_match('/@lid$/i', trim($chatId)) === 1;
        $rawLooksNonMsisdn = $rawDigitsInput !== '' && strpos($rawDigitsInput, '62') !== 0 && strpos($rawDigitsInput, '0') !== 0;
        $useRawLidTarget = $isLidChat && $rawLooksNonMsisdn;

        $originalPhone = self::formatPhoneNumber($noWa);
        if (strlen($originalPhone) < 10) {
            return ['success' => false, 'message' => 'Nomor tidak valid'];
        }
        // Cek siap_terima_notif untuk nomor kontak (biodata), bukan nomor tujuan kirim
        $kontakStatus = self::getKontakStatus($originalPhone);
        $isDaftarNotifReply = $logContext !== null && ($logContext['kategori'] ?? '') === 'daftar_notif';
        $isWaInteractiveMenuReply = $logContext !== null && ($logContext['kategori'] ?? '') === 'wa_interactive_menu';
        $isAiWhatsappReply = $logContext !== null && ($logContext['kategori'] ?? '') === 'ai_whatsapp';
        /** OTP ganti nomor WA: harus ke nomor yang diketik user, bukan nomor_kanonik & bukan diblok siap_terima_notif (sama perilaku "Kirim tes" dari UI). */
        $isWaChangeOtp = $logContext !== null && ($logContext['kategori'] ?? '') === 'wa_change_otp';
        /** Notifikasi rencana/pengeluaran ke admin (termasuk kirim ulang): sama seperti flow operasional penting — jangan blokir lewat siap_terima_notif. */
        $isPengeluaranKeuanganNotif = $logContext !== null && in_array(($logContext['kategori'] ?? ''), ['pengeluaran_rencana_notif', 'pengeluaran_notif'], true);
        // Balasan flow "Daftar Notifikasi", menu interaktif, AI WA, OTP ganti nomor, & notif keuangan internal harus tetap dikirim; skip cek siap_terima untuk itu.
        if (!$isDaftarNotifReply && !$isWaInteractiveMenuReply && !$isAiWhatsappReply && !$isWaChangeOtp && !$isPengeluaranKeuanganNotif && $kontakStatus['exists'] && !$kontakStatus['siap_terima_notif']) {
            if ($logContext !== null) {
                self::logSentMessage(
                    $originalPhone,
                    $message,
                    0,
                    'skip_kontak_tidak_siap',
                    'Kontak tidak menerima notifikasi (pengaturan di Daftar Kontak)',
                    $logContext['id_santri'] ?? null,
                    $logContext['id_pengurus'] ?? null,
                    $logContext['tujuan'] ?? 'wali_santri',
                    $logContext['id_pengurus_pengirim'] ?? null,
                    $logContext['kategori'] ?? 'custom',
                    $logContext['sumber'] ?? 'system'
                );
            }
            return ['success' => true, 'message' => 'Kontak tidak menerima notifikasi (diatur di Daftar Kontak)'];
        }

        // Untuk chat @lid non-MSISDN, jangan normalisasi ke 62 dan jangan resolve nomor kanonik.
        // Balas ke target mentah agar sesuai identitas yang diberikan provider.
        if ($useRawLidTarget) {
            $phone = $rawDigitsInput;
        } elseif ($isWaChangeOtp) {
            // Jangan aliaskan ke nomor_kanonik — user sedang verifikasi nomor baru; UI tes juga kirim ke input mentah.
            $phone = $originalPhone;
        } else {
            $delivery = self::resolveDeliveryTarget($originalPhone);
            $phone = $delivery['nomor'];
            $chatId = $chatId ?? $delivery['chatId'];
        }

        $kategori = $logContext !== null ? ($logContext['kategori'] ?? null) : null;
        $idSantri = $logContext['id_santri'] ?? null;
        if ($kategori !== null) {
            if (in_array($kategori, self::THROTTLE_1MIN_ONLY_KATEGORI, true)) {
                if (self::alreadySentInLastMinute($phone, $idSantri, $kategori)) {
                    $skipMsg = 'Skip duplikat - sudah dikirim dalam 1 menit';
                    if ($logContext !== null) {
                        self::logSentMessage(
                            $phone,
                            $message,
                            0,
                            'skip_duplikat',
                            $skipMsg,
                            $idSantri,
                            $logContext['id_pengurus'] ?? null,
                            $logContext['tujuan'] ?? 'wali_santri',
                            $logContext['id_pengurus_pengirim'] ?? null,
                            $kategori,
                            $logContext['sumber'] ?? 'system'
                        );
                    }
                    return ['success' => true, 'message' => 'OK (duplicate, skipped - sudah dikirim dalam 1 menit)'];
                }
            } elseif (self::alreadySentRecently($phone, $idSantri, $kategori)) {
                $skipMsg = 'Skip duplikat - sudah dikirim dalam ' . self::THROTTLE_DAYS . ' hari';
                if ($logContext !== null) {
                    self::logSentMessage(
                        $phone,
                        $message,
                        0,
                        'skip_duplikat',
                        $skipMsg,
                        $idSantri,
                        $logContext['id_pengurus'] ?? null,
                        $logContext['tujuan'] ?? 'wali_santri',
                        $logContext['id_pengurus_pengirim'] ?? null,
                        $kategori,
                        $logContext['sumber'] ?? 'system'
                    );
                }
                return ['success' => true, 'message' => 'OK (duplicate, skipped - sudah dikirim dalam ' . self::THROTTLE_DAYS . ' hari)'];
            }
        }

        if (self::getNotificationProvider() === 'watzap') {
            if ($logContext !== null && in_array(($logContext['kategori'] ?? ''), ['daftar_notif', 'wa_interactive_menu', 'ai_whatsapp'], true)) {
                error_log('WhatsAppService: ' . ($logContext['kategori'] ?? '') . ' kirim via WatZap (bukan WA server). Tidak ada POST ke Node.');
            }
            if ($isLidChat && $rawLooksNonMsisdn) {
                $res = \App\Services\WatzapService::sendMessageRaw($rawDigitsInput, $message, '', $chatId);
                error_log('WhatsAppService: WatZap kirim fallback raw sender untuk chat @lid, phone_no=' . $rawDigitsInput . ', chat_id=' . (string) $chatId);
            } else {
                $res = \App\Services\WatzapService::sendMessage($phone, $message, '', $chatId);
            }
            if ($res['success'] && $logContext !== null) {
                self::logSentMessage(
                    $phone,
                    $message,
                    0,
                    'sent',
                    $res['message'] ?? null,
                    $logContext['id_santri'] ?? null,
                    $logContext['id_pengurus'] ?? null,
                    $logContext['tujuan'] ?? 'wali_santri',
                    $logContext['id_pengurus_pengirim'] ?? null,
                    $logContext['kategori'] ?? 'custom',
                    $logContext['sumber'] ?? 'system',
                    null
                );
            }
            if (!$res['success'] && $logContext !== null) {
                self::logSentMessage(
                    $phone,
                    $message,
                    0,
                    'gagal',
                    $res['message'] ?? null,
                    $logContext['id_santri'] ?? null,
                    $logContext['id_pengurus'] ?? null,
                    $logContext['tujuan'] ?? 'wali_santri',
                    $logContext['id_pengurus_pengirim'] ?? null,
                    $logContext['kategori'] ?? 'custom',
                    $logContext['sumber'] ?? 'system'
                );
            }
            if ($res['success'] && !$kontakStatus['exists']) {
                self::ensureKontak($phone, 0, self::deriveKontakLabelFromLogContext($logContext));
            }
            return ['success' => $res['success'], 'message' => $res['message']];
        }

        $cfg = self::getConfig();
        $apiUrl = $cfg['api_url'];
        $apiKey = $cfg['api_key'];

        if (empty($apiUrl) || empty($apiKey)) {
            error_log('WhatsAppService: WA_API_URL/WA_API_KEY tidak diset. Pesan ke ' . $phone . ' tidak dikirim.');
            return [
                'success' => false,
                'message' => 'Backend WhatsApp belum dikonfigurasi. Set WA_API_URL dan WA_API_KEY di .env API (harus sama dengan wa/.env). Lalu hubungkan WA di Kelola Koneksi WA.',
            ];
        }

        if ($logContext !== null && ($logContext['kategori'] ?? '') === 'daftar_notif') {
            error_log('WhatsAppService: daftar_notif POST ke WA server url=' . $apiUrl);
        }

        $jsonPayload = self::mergeWaSessionPayload(array_merge([
            'phoneNumber' => $phone,
            'message' => $message,
        ], ($chatId !== null && $chatId !== '' ? ['chatId' => $chatId] : [])), $cfg);

        if (self::getNotificationProvider() === 'wa_sendiri') {
            self::wakeWaServer();
        }

        for ($attempt = 0; $attempt < 2; $attempt++) {
            if ($attempt > 0) {
                usleep(2500000);
                self::wakeWaServer();
            }
            try {
                $client = new \GuzzleHttp\Client(['timeout' => 20]);
                $response = $client->post($apiUrl, [
                    'headers' => [
                        'Content-Type' => 'application/json',
                        'X-API-Key' => $apiKey,
                    ],
                    'json' => $jsonPayload,
                ]);

                $code = $response->getStatusCode();
                $body = (string) $response->getBody();
                $data = is_string($body) ? json_decode($body, true) : [];
                if (!is_array($data)) {
                    $data = [];
                }

                if ($code >= 200 && $code < 300 && !empty($data['success'])) {
                    $messageId = isset($data['messageId']) && trim((string) $data['messageId']) !== '' ? trim((string) $data['messageId']) : null;
                    $result = [
                        'success' => true,
                        'message' => $data['message'] ?? 'OK',
                        'messageId' => $messageId,
                        'senderPhoneNumber' => !empty($data['senderPhoneNumber']) ? trim((string) $data['senderPhoneNumber']) : null,
                    ];
                    if ($logContext !== null) {
                        self::logSentMessage(
                            $phone,
                            $message,
                            0,
                            'sent',
                            $data['message'] ?? null,
                            $logContext['id_santri'] ?? null,
                            $logContext['id_pengurus'] ?? null,
                            $logContext['tujuan'] ?? 'wali_santri',
                            $logContext['id_pengurus_pengirim'] ?? null,
                            $logContext['kategori'] ?? 'custom',
                            $logContext['sumber'] ?? 'system',
                            $messageId
                        );
                    }
                    if (!$kontakStatus['exists']) {
                        self::ensureKontak($phone, 0, self::deriveKontakLabelFromLogContext($logContext));
                    }

                    return $result;
                }

                $rawErr = (string) ($data['message'] ?? $data['error'] ?? "HTTP {$code}");
                $errMsg = self::mapNodeWaErrorMessage($data, $rawErr);
                if ($attempt === 0 && self::nodeSendIndicatesReconnect($errMsg)) {
                    error_log('WhatsAppService: Node WA belum siap, retry setelah wake: ' . $errMsg);

                    continue;
                }
                error_log('WhatsAppService: ' . $errMsg . ' body=' . substr($body, 0, 200));
                $result = ['success' => false, 'message' => $errMsg];
                if ($logContext !== null) {
                    self::logSentMessage(
                        $phone,
                        $message,
                        0,
                        'gagal',
                        $errMsg,
                        $logContext['id_santri'] ?? null,
                        $logContext['id_pengurus'] ?? null,
                        $logContext['tujuan'] ?? 'wali_santri',
                        $logContext['id_pengurus_pengirim'] ?? null,
                        $logContext['kategori'] ?? 'custom',
                        $logContext['sumber'] ?? 'system'
                    );
                }

                return $result;
            } catch (\Throwable $e) {
                error_log('WhatsAppService: attempt ' . ($attempt + 1) . ' ' . $e->getMessage());
                if ($attempt === 0 && self::getNotificationProvider() === 'wa_sendiri') {
                    continue;
                }
                $errText = $e->getMessage();
                $result = ['success' => false, 'message' => $errText];
                if ($logContext !== null) {
                    self::logSentMessage(
                        $phone,
                        $message,
                        0,
                        'gagal',
                        $errText,
                        $logContext['id_santri'] ?? null,
                        $logContext['id_pengurus'] ?? null,
                        $logContext['tujuan'] ?? 'wali_santri',
                        $logContext['id_pengurus_pengirim'] ?? null,
                        $logContext['kategori'] ?? 'custom',
                        $logContext['sumber'] ?? 'system'
                    );
                }

                return $result;
            }
        }

        return ['success' => false, 'message' => 'Gagal menghubungi server WhatsApp.'];
    }

    /**
     * Edit pesan WA yang sudah dikirim (hanya dalam 15 menit setelah kirim).
     *
     * @param string $noWa Nomor WA (08xxx atau 62xxx)
     * @param string $messageId ID pesan dari WA (wa_message_id)
     * @param string $newMessage Isi pesan baru
     * @return array ['success' => bool, 'message' => string, 'messageId' => string|null]
     */
    public static function editMessage(string $noWa, string $messageId, string $newMessage): array
    {
        $phone = self::formatPhoneNumber($noWa);
        if (strlen($phone) < 10) {
            return ['success' => false, 'message' => 'Nomor tidak valid', 'messageId' => null];
        }
        $msgId = trim($messageId);
        $newBody = trim($newMessage);
        if ($msgId === '') {
            return ['success' => false, 'message' => 'messageId wajib', 'messageId' => null];
        }
        if ($newBody === '') {
            return ['success' => false, 'message' => 'Isi pesan baru tidak boleh kosong', 'messageId' => null];
        }

        $cfg = self::getConfig();
        $apiUrl = $cfg['api_url'];
        $apiKey = $cfg['api_key'];
        $baseUrl = preg_replace('#/send$#', '', $apiUrl);
        $editUrl = rtrim($baseUrl, '/') . '/edit-message';

        if (empty($apiKey) || empty($editUrl)) {
            return [
                'success' => false,
                'message' => 'Backend WhatsApp belum dikonfigurasi',
                'messageId' => null,
            ];
        }

        try {
            $client = new \GuzzleHttp\Client(['timeout' => 15]);
            $response = $client->post($editUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $apiKey,
                ],
                'json' => self::mergeWaSessionPayload([
                    'phoneNumber' => $phone,
                    'messageId' => $msgId,
                    'newMessage' => $newBody,
                ], $cfg),
            ]);

            $code = $response->getStatusCode();
            $body = (string) $response->getBody();
            $data = json_decode($body, true);

            if ($code >= 200 && $code < 300 && !empty($data['success'])) {
                return [
                    'success' => true,
                    'message' => $data['message'] ?? 'Pesan berhasil diedit',
                    'messageId' => $msgId,
                ];
            }

            $errMsg = $data['message'] ?? $data['error'] ?? "HTTP {$code}";
            return ['success' => false, 'message' => $errMsg, 'messageId' => null];
        } catch (\Throwable $e) {
            error_log('WhatsAppService::editMessage: ' . $e->getMessage());
            return ['success' => false, 'message' => $e->getMessage(), 'messageId' => null];
        }
    }

    /**
     * Kirim pesan WA dengan gambar (caption + imageBase64).
     * Sesuai wa-api.md: imageBase64 tanpa prefix data:image/...;base64,
     * Jika $logContext diset, pesan dicatat di tabel whatsapp (punya_gambar=1).
     *
     * @param string $noWa Nomor WA (08xxx atau 62xxx)
     * @param string $message Caption / isi pesan (boleh kosong)
     * @param string $imageBase64 Data gambar Base64 tanpa prefix
     * @param string $imageMimetype image/png, image/jpeg, dll. Default image/png
     * @param string|null $instance Instance (default dari config)
     * @param array|null $logContext ['id_santri'=>?, 'id_pengurus'=>?, 'kategori'=>?, 'sumber'=>?]
     * @return array ['success' => bool, 'message' => string]
     */
    public static function sendMessageWithImage(string $noWa, string $message, string $imageBase64, string $imageMimetype = 'image/png', ?string $instance = null, ?array $logContext = null): array
    {
        $originalPhone = self::formatPhoneNumber($noWa);
        if (strlen($originalPhone) < 10) {
            return ['success' => false, 'message' => 'Nomor tidak valid'];
        }

        $kontakStatus = self::getKontakStatus($originalPhone);
        if ($kontakStatus['exists'] && !$kontakStatus['siap_terima_notif']) {
            if ($logContext !== null) {
                self::logSentMessage(
                    $originalPhone,
                    $message,
                    1,
                    'skip_kontak_tidak_siap',
                    'Kontak tidak menerima notifikasi (pengaturan di Daftar Kontak)',
                    $logContext['id_santri'] ?? null,
                    $logContext['id_pengurus'] ?? null,
                    $logContext['tujuan'] ?? 'wali_santri',
                    $logContext['id_pengurus_pengirim'] ?? null,
                    $logContext['kategori'] ?? 'custom',
                    $logContext['sumber'] ?? 'system'
                );
            }
            return ['success' => true, 'message' => 'Kontak tidak menerima notifikasi (diatur di Daftar Kontak)'];
        }

        $delivery = self::resolveDeliveryTarget($originalPhone);
        $phone = $delivery['nomor'];

        $kategori = $logContext !== null ? ($logContext['kategori'] ?? null) : null;
        $idSantri = $logContext['id_santri'] ?? null;
        if ($kategori !== null) {
            if (in_array($kategori, self::THROTTLE_1MIN_ONLY_KATEGORI, true)) {
                if (self::alreadySentInLastMinute($phone, $idSantri, $kategori)) {
                    $skipMsg = 'Skip duplikat - sudah dikirim dalam 1 menit';
                    if ($logContext !== null) {
                        self::logSentMessage(
                            $phone,
                            $message,
                            1,
                            'skip_duplikat',
                            $skipMsg,
                            $idSantri,
                            $logContext['id_pengurus'] ?? null,
                            $logContext['tujuan'] ?? 'wali_santri',
                            $logContext['id_pengurus_pengirim'] ?? null,
                            $kategori,
                            $logContext['sumber'] ?? 'system'
                        );
                    }
                    return ['success' => true, 'message' => 'OK (duplicate, skipped - sudah dikirim dalam 1 menit)'];
                }
            } elseif (self::alreadySentRecently($phone, $idSantri, $kategori)) {
                $skipMsg = 'Skip duplikat - sudah dikirim dalam ' . self::THROTTLE_DAYS . ' hari';
                if ($logContext !== null) {
                    self::logSentMessage(
                        $phone,
                        $message,
                        1,
                        'skip_duplikat',
                        $skipMsg,
                        $idSantri,
                        $logContext['id_pengurus'] ?? null,
                        $logContext['tujuan'] ?? 'wali_santri',
                        $logContext['id_pengurus_pengirim'] ?? null,
                        $kategori,
                        $logContext['sumber'] ?? 'system'
                    );
                }
                return ['success' => true, 'message' => 'OK (duplicate, skipped - sudah dikirim dalam ' . self::THROTTLE_DAYS . ' hari)'];
            }
        }

        $cfg = self::getConfig();
        $apiUrl = $cfg['api_url'];
        $apiKey = $cfg['api_key'];

        if (empty($apiUrl) || empty($apiKey)) {
            error_log('WhatsAppService: WA_API_URL/WA_API_KEY tidak diset. Pesan+gambar ke ' . $phone . ' tidak dikirim.');
            return [
                'success' => false,
                'message' => 'Backend WhatsApp belum dikonfigurasi. Set WA_API_URL dan WA_API_KEY di .env API.',
            ];
        }

        $payload = [
            'phoneNumber' => $phone,
            'message' => $message,
        ];
        if ($imageBase64 !== '' && $imageMimetype !== '') {
            $payload['imageBase64'] = $imageBase64;
            $payload['imageMimetype'] = $imageMimetype;
        }
        $payload = self::mergeWaSessionPayload($payload, $cfg);

        try {
            $client = new \GuzzleHttp\Client(['timeout' => 20]);
            $response = $client->post($apiUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $apiKey,
                ],
                'json' => $payload,
            ]);

            $code = $response->getStatusCode();
            $body = (string) $response->getBody();
            $data = json_decode($body, true);

            if ($code >= 200 && $code < 300 && !empty($data['success'])) {
                $result = [
                    'success' => true,
                    'message' => $data['message'] ?? 'OK',
                    'senderPhoneNumber' => !empty($data['senderPhoneNumber']) ? trim((string) $data['senderPhoneNumber']) : null,
                ];
                if ($logContext !== null) {
                    self::logSentMessage(
                        $phone,
                        $message,
                        1,
                        'terkirim',
                        $result['message'],
                        $logContext['id_santri'] ?? null,
                        $logContext['id_pengurus'] ?? null,
                        $logContext['tujuan'] ?? 'wali_santri',
                        $logContext['id_pengurus_pengirim'] ?? null,
                        $logContext['kategori'] ?? 'custom',
                        $logContext['sumber'] ?? 'system'
                    );
                }
                if (!$kontakStatus['exists']) {
                    self::ensureKontak($phone, 0, self::deriveKontakLabelFromLogContext($logContext));
                }
                return $result;
            }

            $errMsg = $data['message'] ?? $data['error'] ?? "HTTP {$code}";
            error_log('WhatsAppService sendMessageWithImage: ' . $errMsg);
            $result = ['success' => false, 'message' => $errMsg];
            if ($logContext !== null) {
                self::logSentMessage(
                    $phone,
                    $message,
                    1,
                    'gagal',
                    $errMsg,
                    $logContext['id_santri'] ?? null,
                    $logContext['id_pengurus'] ?? null,
                    $logContext['tujuan'] ?? 'wali_santri',
                    $logContext['id_pengurus_pengirim'] ?? null,
                    $logContext['kategori'] ?? 'custom',
                    $logContext['sumber'] ?? 'system'
                );
            }
            return $result;
        } catch (\Throwable $e) {
            error_log('WhatsAppService sendMessageWithImage: ' . $e->getMessage());
            $result = ['success' => false, 'message' => $e->getMessage()];
            if ($logContext !== null) {
                self::logSentMessage(
                    $phone,
                    $message,
                    1,
                    'gagal',
                    $e->getMessage(),
                    $logContext['id_santri'] ?? null,
                    $logContext['id_pengurus'] ?? null,
                    $logContext['tujuan'] ?? 'wali_santri',
                    $logContext['id_pengurus_pengirim'] ?? null,
                    $logContext['kategori'] ?? 'custom',
                    $logContext['sumber'] ?? 'system'
                );
            }
            return $result;
        }
    }

    /**
     * Konversi qr_code dari iPayMu ke string Base64 mentah (tanpa prefix data:...).
     * - data:image/...;base64,xxx → xxx
     * - sudah raw base64 → return as is
     * - string EMVCo/URL → fetch dari api.qrserver.com, return base64_encode(image)
     */
    public static function qrCodeToBase64(string $qrCode): ?string
    {
        $s = trim($qrCode);
        if ($s === '') {
            return null;
        }
        if (preg_match('/^data:image\/[^;]+;base64,(.+)$/s', $s, $m)) {
            return $m[1];
        }
        if (strlen($s) > 200 && preg_match('/^[A-Za-z0-9+\/=]+$/', $s)) {
            return $s;
        }
        $url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' . rawurlencode($s);
        try {
            $client = new \GuzzleHttp\Client(['timeout' => 10]);
            $res = $client->get($url);
            $body = (string) $res->getBody();
            if ($body !== '') {
                return base64_encode($body);
            }
        } catch (\Throwable $e) {
            error_log('WhatsAppService qrCodeToBase64 fetch: ' . $e->getMessage());
        }
        return null;
    }

    /**
     * Kirim WA notifikasi PSB: santri sudah terdaftar (setelah simpan biodata).
     * Menggunakan template: WhatsAppTemplates::biodataTerdaftar.
     * Log satu tabel dengan aplikasi daftar; throttle 5 hari agar tidak ganda (mis. admin edit + simpan).
     *
     * @param array $santriData ['nama' => ..., 'nik' => ..., 'id' => ..., 'nis' => ..., 'email' => ..., dll]
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri) - duplikat disaring
     * @param array $logOptions ['sumber' => 'uwaba'|'daftar'|'system', 'id_pengurus_pengirim' => int|null]
     */
    public static function sendPsbBiodataTerdaftar(array $santriData, array $phoneNumbers, array $logOptions = []): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        if (empty($numbers)) {
            return;
        }

        $linkPendaftaran = self::getDaftarAppUrl();
        $message = WhatsAppTemplates::biodataTerdaftar($santriData, $linkPendaftaran);
        $idSantri = isset($santriData['id']) ? (int) $santriData['id'] : null;
        $sumber = $logOptions['sumber'] ?? 'system';
        $idPengurusPengirim = isset($logOptions['id_pengurus_pengirim']) ? (int) $logOptions['id_pengurus_pengirim'] : null;
        $logContext = [
            'id_santri' => $idSantri,
            'id_pengurus' => null,
            'tujuan' => 'wali_santri',
            'id_pengurus_pengirim' => $idPengurusPengirim,
            'kategori' => 'biodata_terdaftar',
            'sumber' => $sumber,
        ];

        foreach ($numbers as $num) {
            try {
                self::sendMessage($num, $message, null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbBiodataTerdaftar: ' . $e->getMessage());
            }
        }
    }

    /**
     * Simpan notif biodata_terdaftar ke antrian pending (NIS belum ada).
     * Akan dikirim 3 detik setelah NIS tersedia saat processPending() dijalankan.
     */
    public static function addPendingBiodataTerdaftar(int $idSantri, array $phoneNumbers, array $context, array $logOptions = []): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        if (empty($numbers)) {
            return;
        }
        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___pending'");
            if ($tableCheck->rowCount() === 0) {
                error_log('WhatsAppService::addPendingBiodataTerdaftar: tabel whatsapp___pending tidak ada');
                return;
            }
            $contextJson = json_encode($context, JSON_UNESCAPED_UNICODE);
            $logOptionsJson = json_encode($logOptions, JSON_UNESCAPED_UNICODE);
            $stmt = $db->prepare(
                'INSERT INTO whatsapp___pending (id_santri, kategori, nomor_tujuan, context_json, log_options_json) VALUES (?, ?, ?, ?, ?)'
            );
            foreach ($numbers as $num) {
                $nomorNormal = self::formatPhoneNumber($num);
                if (strlen($nomorNormal) < 10) {
                    continue;
                }
                $stmt->execute([$idSantri, 'biodata_terdaftar', $nomorNormal, $contextJson, $logOptionsJson]);
            }
        } catch (\Throwable $e) {
            error_log('WhatsAppService::addPendingBiodataTerdaftar: ' . $e->getMessage());
        }
    }

    /**
     * Proses antrian whatsapp___pending: jika NIS sudah ada, jadwalkan kirim 3 detik kemudian;
     * jika send_after sudah lewat, kirim dan hapus dari pending.
     * Dipanggil oleh cron atau endpoint POST /api/wa/process-pending.
     */
    public static function processPending(): array
    {
        $sent = 0;
        $skipped = 0;
        try {
            $db = Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'whatsapp___pending'");
            if ($tableCheck->rowCount() === 0) {
                return ['success' => true, 'sent' => 0, 'skipped' => 0];
            }
            $stmt = $db->query('SELECT id, id_santri, nomor_tujuan, context_json, log_options_json, send_after FROM whatsapp___pending WHERE kategori = \'biodata_terdaftar\' ORDER BY id ASC');
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $stmtNis = $db->prepare('SELECT nis FROM santri WHERE id = ? LIMIT 1');
            $stmtUpdate = $db->prepare('UPDATE whatsapp___pending SET send_after = ? WHERE id = ?');
            $stmtDelete = $db->prepare('DELETE FROM whatsapp___pending WHERE id = ?');

            foreach ($rows as $row) {
                $now = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->format('Y-m-d H:i:s');
                $id = (int) $row['id'];
                $idSantri = (int) $row['id_santri'];
                $sendAfter = $row['send_after'];
                $context = json_decode($row['context_json'], true);
                $logOptions = json_decode($row['log_options_json'] ?? '{}', true) ?: [];
                if (!is_array($context)) {
                    $stmtDelete->execute([$id]);
                    $skipped++;
                    continue;
                }
                $stmtNis->execute([$idSantri]);
                $nisRow = $stmtNis->fetch(\PDO::FETCH_ASSOC);
                $nis = $nisRow ? trim((string) ($nisRow['nis'] ?? '')) : '';

                if ($nis === '') {
                    $skipped++;
                    continue;
                }
                if ($sendAfter === null || $sendAfter === '') {
                    $threeSecLater = (new \DateTime('now', new \DateTimeZone('Asia/Jakarta')))->modify('+3 seconds')->format('Y-m-d H:i:s');
                    $stmtUpdate->execute([$threeSecLater, $id]);
                    $skipped++;
                    continue;
                }
                if (strtotime($sendAfter) > strtotime($now)) {
                    $skipped++;
                    continue;
                }
                $context['nis'] = $nis;
                $context['id'] = $idSantri;
                try {
                    self::sendPsbBiodataTerdaftar($context, [$row['nomor_tujuan']], $logOptions);
                    $stmtDelete->execute([$id]);
                    $sent++;
                } catch (\Throwable $e) {
                    error_log('WhatsAppService::processPending send: ' . $e->getMessage());
                    $skipped++;
                }
            }
        } catch (\Throwable $e) {
            error_log('WhatsAppService::processPending: ' . $e->getMessage());
        }
        return ['success' => true, 'sent' => $sent, 'skipped' => $skipped];
    }

    /**
     * Kirim WA notifikasi PSB: ringkasan berkas (semua upload/tandai tidak ada).
     * Menggunakan template: WhatsAppTemplates::berkasLengkap
     *
     * @param array $santriData ['nama' => ..., 'id' => ...]
     * @param array $listAda Daftar nama berkas yang ada (uploaded)
     * @param array $listTidakAda Daftar nama berkas yang ditandai tidak ada
     * @param array $phoneNumbers Daftar nomor
     */
    public static function sendPsbBerkasLengkap(array $santriData, array $listAda, array $listTidakAda, array $phoneNumbers): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        if (empty($numbers)) {
            return;
        }

        $message = WhatsAppTemplates::berkasLengkap($santriData, $listAda, $listTidakAda);
        $idSantri = isset($santriData['id']) ? (int) $santriData['id'] : null;
        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'berkas_lengkap', 'sumber' => 'system'];

        foreach ($numbers as $num) {
            try {
                self::sendMessage($num, $message, null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbBerkasLengkap: ' . $e->getMessage());
            }
        }
    }

    /**
     * Kirim WA notifikasi PSB: link ke halaman pembayaran (upload bukti / pilih ipaymu).
     * Menggunakan template: WhatsAppTemplates::pembayaranLink
     *
     * @param string $noWa Nomor WA santri/orang tua
     * @param string $nama Nama santri (untuk personalisasi)
     * @param string $mode 'open' = offcanvas pembayaran umum, 'ipaymu' = offcanvas ipaymu
     */
    public static function sendPsbPembayaranLink(string $noWa, string $nama, string $mode = 'open', ?int $idSantri = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $formatted = self::formatPhoneNumber($noWa);
        if (strlen($formatted) < 10) {
            return;
        }

        $baseUrl = self::getDaftarAppUrl();
        $path = $mode === 'ipaymu' ? '/pembayaran?payment=ipaymu' : '/pembayaran?payment=open';
        $link = $baseUrl . $path;
        $message = WhatsAppTemplates::pembayaranLink($nama, $link);
        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'pembayaran_link', 'sumber' => 'system'];

        try {
            self::sendMessage($formatted, $message, null, $logContext);
        } catch (\Throwable $e) {
            error_log('WhatsAppService sendPsbPembayaranLink: ' . $e->getMessage());
        }
    }

    /**
     * Kirim WA notifikasi PSB: pembayaran berhasil (nominal sudah terbayar).
     * Menggunakan template: WhatsAppTemplates::pembayaranBerhasil
     *
     * @param string $noWa Nomor WA
     * @param string $nama Nama santri
     * @param float|int $nominal Nominal yang dibayar
     */
    public static function sendPsbPembayaranBerhasil(string $noWa, string $nama, $nominal, ?int $idSantri = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $formatted = self::formatPhoneNumber($noWa);
        if (strlen($formatted) < 10) {
            return;
        }

        $nominalFormatted = 'Rp ' . number_format((float) $nominal, 0, ',', '.');
        $message = WhatsAppTemplates::pembayaranBerhasil($nama, $nominalFormatted);
        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'pembayaran_berhasil', 'sumber' => 'system'];

        try {
            self::sendMessage($formatted, $message, null, $logContext);
        } catch (\Throwable $e) {
            error_log('WhatsAppService sendPsbPembayaranBerhasil: ' . $e->getMessage());
        }
    }

    /**
     * Kirim WA notifikasi PSB: pesanan pembayaran iPayMu berhasil dibuat (VA atau CStore).
     * Menggunakan template: WhatsAppTemplates::pembayaranIpaymuOrder.
     * Mengirim ke semua nomor di $phoneNumbers (biasanya no_telpon & no_wa_santri).
     *
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri) - duplikat disaring
     * @param string $nama Nama santri
     * @param float|int $amount Nominal pembayaran
     * @param float|int|null $adminFee Biaya admin (rupiah); null = tampilkan "sesuai merchant / admin bank"
     * @param float|int|null $total Total; null bila belum ada dari iPayMu
     * @param string $paymentMethod va, cstore, qris
     * @param string $paymentChannel bca, bni, alfamart, indomaret, dll
     * @param string $vaOrCode Nomor VA atau kode pembayaran CStore
     * @param string $link Url halaman pembayaran (opsional)
     * @param int|null $idSantri id santri (untuk log)
     */
    public static function sendPsbPembayaranIpaymuOrder(array $phoneNumbers, string $nama, $amount, $adminFee, $total, string $paymentMethod, string $paymentChannel, string $vaOrCode, string $link = '', ?int $idSantri = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        if ($vaOrCode === '') {
            return;
        }

        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'pembayaran_ipaymu_order', 'sumber' => 'system'];
        $channelLabel = self::paymentChannelToLabel($paymentChannel, $paymentMethod);
        $amountFormatted = 'Rp ' . number_format((float) $amount, 0, ',', '.');
        $adminFeeFormatted = ($adminFee !== null && $adminFee !== '') ? ('Rp ' . number_format((float) $adminFee, 0, ',', '.')) : null;
        $totalFormatted = ($total !== null && $total !== '') ? ('Rp ' . number_format((float) $total, 0, ',', '.')) : null;

        $instruksi = '';
        if ($paymentMethod === 'va') {
            $instruksi = "Transfer ke Virtual Account di atas via ATM, iBanking, atau Mobile Banking.";
        } elseif ($paymentMethod === 'cstore') {
            $store = strtolower($paymentChannel);
            if ($store === 'alfamart') {
                $instruksi = "1. Datang ke gerai Alfamart\n2. Beri tahu kasir: Bayar PLASAMAL\n3. Sebutkan kode pembayaran di atas\n4. Bayar sesuai nominal";
            } elseif ($store === 'indomaret') {
                $instruksi = "1. Datang ke gerai Indomaret\n2. Beri tahu kasir: Bayar LINKITA\n3. Sebutkan kode pembayaran di atas\n4. Bayar sesuai nominal";
            } else {
                $instruksi = "Datang ke gerai, sebutkan kode pembayaran di atas ke kasir, lalu bayar sesuai nominal.";
            }
        }

        if ($link === '') {
            $link = self::getDaftarAppUrl() . '/pembayaran?payment=ipaymu';
        }

        $message = WhatsAppTemplates::pembayaranIpaymuOrder($nama, $amountFormatted, $adminFeeFormatted, $totalFormatted, $channelLabel, $vaOrCode, $instruksi, $link);
        $numbers = self::collectPhoneNumbers($phoneNumbers);

        foreach ($numbers as $no) {
            try {
                self::sendMessage($no, $message, null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbPembayaranIpaymuOrder: ' . $e->getMessage());
            }
        }
    }

    /**
     * Kirim WA notifikasi PSB: pesanan pembayaran iPayMu QRIS (teks + gambar QR).
     * Menggunakan template pembayaranIpaymuQris sebagai caption dan kirim gambar QR via sendMessageWithImage.
     *
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri)
     * @param string $nama Nama santri
     * @param float|int $amount Nominal
     * @param float|int|null $adminFee Biaya admin (rupiah); null = "sesuai merchant / admin bank"
     * @param float|int|null $total Total; null bila belum ada dari iPayMu
     * @param string $qrCode qr_code dari iPayMu (base64, data URL, atau string EMVCo)
     * @param string $link Url halaman pembayaran (opsional)
     * @param int|null $idSantri id santri (untuk log)
     */
    public static function sendPsbPembayaranIpaymuQris(array $phoneNumbers, string $nama, $amount, $adminFee, $total, string $qrCode, string $link = '', ?int $idSantri = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $base64 = self::qrCodeToBase64($qrCode);
        if ($base64 === null || $base64 === '') {
            error_log('WhatsAppService sendPsbPembayaranIpaymuQris: qrCode tidak bisa dikonversi ke base64');
            return;
        }

        if ($link === '') {
            $link = self::getDaftarAppUrl() . '/pembayaran?payment=ipaymu';
        }
        $amountFormatted = 'Rp ' . number_format((float) $amount, 0, ',', '.');
        $adminFeeFormatted = ($adminFee !== null && $adminFee !== '') ? ('Rp ' . number_format((float) $adminFee, 0, ',', '.')) : null;
        $totalFormatted = ($total !== null && $total !== '') ? ('Rp ' . number_format((float) $total, 0, ',', '.')) : null;
        $message = WhatsAppTemplates::pembayaranIpaymuQris($nama, $amountFormatted, $adminFeeFormatted, $totalFormatted, $link);
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'pembayaran_ipaymu_qris', 'sumber' => 'system'];

        foreach ($numbers as $no) {
            try {
                self::sendMessageWithImage($no, $message, $base64, 'image/png', null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbPembayaranIpaymuQris: ' . $e->getMessage());
            }
        }
    }

    /**
     * Kirim WA notifikasi PSB: pesanan pembayaran iPayMu dibatalkan.
     * Menggunakan template: WhatsAppTemplates::pembayaranDibatalkan.
     *
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri) - duplikat disaring
     * @param string $nama Nama santri
     */
    public static function sendPsbPembayaranDibatalkan(array $phoneNumbers, string $nama, ?int $idSantri = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        if (empty($numbers)) {
            return;
        }
        $message = WhatsAppTemplates::pembayaranDibatalkan($nama);
        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'pembayaran_dibatalkan', 'sumber' => 'system'];
        foreach ($numbers as $no) {
            try {
                self::sendMessage($no, $message, null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbPembayaranDibatalkan: ' . $e->getMessage());
            }
        }
    }

    /**
     * Kirim WA notifikasi PSB: pembayaran iPayMu gagal (dari callback).
     * Menggunakan template: WhatsAppTemplates::pembayaranGagal.
     *
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri)
     * @param string $nama Nama santri
     */
    public static function sendPsbPembayaranGagal(array $phoneNumbers, string $nama, ?int $idSantri = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        if (empty($numbers)) {
            return;
        }
        $message = WhatsAppTemplates::pembayaranGagal($nama);
        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'pembayaran_gagal', 'sumber' => 'system'];
        foreach ($numbers as $no) {
            try {
                self::sendMessage($no, $message, null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbPembayaranGagal: ' . $e->getMessage());
            }
        }
    }

    /**
     * Kirim WA notifikasi PSB: pesanan pembayaran iPayMu kadaluarsa.
     * Menggunakan template: WhatsAppTemplates::pembayaranKadaluarsa.
     *
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri) - duplikat disaring
     * @param string $nama Nama santri
     */
    public static function sendPsbPembayaranKadaluarsa(array $phoneNumbers, string $nama, ?int $idSantri = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        if (empty($numbers)) {
            return;
        }
        $message = WhatsAppTemplates::pembayaranKadaluarsa($nama);
        $logContext = ['id_santri' => $idSantri, 'id_pengurus' => null, 'tujuan' => 'wali_santri', 'id_pengurus_pengirim' => null, 'kategori' => 'pembayaran_kadaluarsa', 'sumber' => 'system'];
        foreach ($numbers as $no) {
            try {
                self::sendMessage($no, $message, null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbPembayaranKadaluarsa: ' . $e->getMessage());
            }
        }
    }

    /**
     * Map payment_channel ke label tampilan (BCA, Alfamart, Indomaret, dll).
     */
    private static function paymentChannelToLabel(string $channel, string $paymentMethod): string
    {
        $c = strtolower(trim($channel));
        $vaLabels = [
            'bca' => 'BCA', 'bni' => 'BNI', 'bri' => 'BRI', 'mandiri' => 'Mandiri',
            'permata' => 'Permata', 'cimb' => 'CIMB', 'danamon' => 'Danamon',
            'bca_syariah' => 'BCA Syariah', 'bni_syariah' => 'BNI Syariah',
            'bri_syariah' => 'BRI Syariah', 'mandiri_syariah' => 'Mandiri Syariah',
        ];
        $cstoreLabels = ['alfamart' => 'Alfamart', 'indomaret' => 'Indomaret'];
        if ($paymentMethod === 'cstore' && isset($cstoreLabels[$c])) {
            return $cstoreLabels[$c];
        }
        if (isset($vaLabels[$c])) {
            return $vaLabels[$c];
        }
        return $channel !== '' ? ucfirst(str_replace('_', ' ', $channel)) : 'Pembayaran';
    }

    /**
     * Kirim WA notifikasi PSB: pendaftaran sudah diverifikasi (ke 2 nomor: no_telpon & no_wa_santri).
     * Menggunakan template: WhatsAppTemplates::sudahDiverifikasi (icon centang hijau).
     *
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri) - duplikat disaring
     * @param array $biodata ['id' => ..., 'nama' => ..., 'nik' => ..., ...]
     * @param int|null $idPengurus Pengurus yang melakukan verifikasi (untuk log); null = system
     */
    public static function sendPsbSudahDiverifikasi(array $phoneNumbers, array $biodata, ?int $idPengurus = null): void
    {
        if (self::PSB_FLOW_WA_NOTIF_DISABLED) {
            return;
        }
        $numbers = self::collectPhoneNumbers($phoneNumbers);
        if (empty($numbers)) {
            return;
        }

        $message = WhatsAppTemplates::sudahDiverifikasi($biodata);
        $logContext = [
            'id_santri' => isset($biodata['id']) ? (int) $biodata['id'] : null,
            'id_pengurus' => null,
            'tujuan' => 'wali_santri',
            'id_pengurus_pengirim' => $idPengurus,
            'kategori' => 'sudah_diverifikasi',
            'sumber' => $idPengurus !== null ? 'uwaba' : 'system',
        ];

        foreach ($numbers as $num) {
            try {
                self::sendMessage($num, $message, null, $logContext);
            } catch (\Throwable $e) {
                error_log('WhatsAppService sendPsbSudahDiverifikasi: ' . $e->getMessage());
            }
        }
    }

    /**
     * Kumpulkan nomor WA dari array: format 62xxx, buang duplikat dan invalid.
     * Jika no_telpon dan no_wa_santri sama (atau setelah format jadi sama), hanya satu yang dikirim.
     *
     * @param array $phoneNumbers Daftar nomor (string)
     * @return array Daftar nomor terformat (unique)
     */
    private static function collectPhoneNumbers(array $phoneNumbers): array
    {
        $numbers = [];
        foreach ($phoneNumbers as $n) {
            $n = $n === null ? '' : trim((string) $n);
            if ($n === '') {
                continue;
            }
            $formatted = self::formatPhoneNumber($n);
            if (strlen($formatted) >= 10 && !in_array($formatted, $numbers, true)) {
                $numbers[] = $formatted;
            }
        }
        return $numbers;
    }

    /**
     * Daftar nomor WA unik (format 62xxx, duplikat disaring).
     * Gunakan sebelum kirim notifikasi ke banyak nomor agar nomor sama hanya dapat 1 pesan.
     *
     * @param array $phoneNumbers Daftar nomor (no_telpon, no_wa_santri, dll)
     * @return array Daftar nomor terformat dan unique
     */
    public static function getUniquePhoneNumbers(array $phoneNumbers): array
    {
        return self::collectPhoneNumbers($phoneNumbers);
    }
}
