<?php

namespace App\Services;

use App\Database;

/**
 * Layanan kirim pesan WhatsApp - memakai backend WA baru (wa/): wa.alutsmani.id / wa2.alutsmani.id.
 *
 * Konfigurasi: WA_API_URL (mis. https://wa.alutsmani.id/api/whatsapp/send), WA_API_KEY (harus sama dengan wa/.env).
 * Request: POST { phoneNumber, message } atau + imageBase64, imageMimetype; header X-API-Key.
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

    private const THROTTLE_DAYS = 5;

    private static function getConfig(): array
    {
        $config = require __DIR__ . '/../../config.php';
        $wa = $config['whatsapp'] ?? [];
        return [
            'api_url' => getenv('WA_API_URL') ?: ($wa['api_url'] ?? 'https://wa.alutsmani.id/api/whatsapp/send'),
            'api_key' => getenv('WA_API_KEY') ?: ($wa['api_key'] ?? ''),
            'instance' => getenv('WA_INSTANCE') ?: ($wa['instance'] ?? 'uwaba1'),
        ];
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
     * @param string $nomorTujuan Nomor (08xxx/62xxx); disimpan dalam format 62xxx
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
        $nomorNormal = self::formatPhoneNumber($nomorTujuan);
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
     * Kirim pesan teks ke nomor WA.
     * Menggunakan API yang sama dengan offcanvas kwitansi/biodata UWABA.
     * Jika $logContext diset, pesan dicatat di tabel whatsapp.
     *
     * @param string $noWa Nomor WA (08xxx atau 62xxx)
     * @param string $message Pesan teks
     * @param string|null $instance Instance (default dari config, biasanya uwaba1)
     * @param array|null $logContext ['id_santri'=>?, 'id_pengurus'=>? (penerima), 'tujuan'=>pengurus|santri|wali_santri, 'id_pengurus_pengirim'=>?, 'kategori'=>?, 'sumber'=>?]
     * @return array ['success' => bool, 'message' => string]
     */
    public static function sendMessage(string $noWa, string $message, ?string $instance = null, ?array $logContext = null): array
    {
        $phone = self::formatPhoneNumber($noWa);
        if (strlen($phone) < 10) {
            return ['success' => false, 'message' => 'Nomor tidak valid'];
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

        try {
            $client = new \GuzzleHttp\Client(['timeout' => 15]);
            $response = $client->post($apiUrl, [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-API-Key' => $apiKey,
                ],
                'json' => [
                    'phoneNumber' => $phone,
                    'message' => $message,
                ],
            ]);

            $code = $response->getStatusCode();
            $body = (string) $response->getBody();
            $data = json_decode($body, true);

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
                return $result;
            }

            $errMsg = $data['message'] ?? $data['error'] ?? "HTTP {$code}";
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
            error_log('WhatsAppService: ' . $e->getMessage());
            $result = ['success' => false, 'message' => $e->getMessage()];
            if ($logContext !== null) {
                self::logSentMessage(
                    $phone,
                    $message,
                    0,
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
                'json' => [
                    'phoneNumber' => $phone,
                    'messageId' => $msgId,
                    'newMessage' => $newBody,
                ],
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
        $phone = self::formatPhoneNumber($noWa);
        if (strlen($phone) < 10) {
            return ['success' => false, 'message' => 'Nomor tidak valid'];
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
