<?php

namespace App\Services;

/**
 * Proxy ke WatZap API (https://api.watzap.id/v1/).
 * Dokumentasi: https://api-docs.watzap.id/ | https://docs.watzap.id/help/integrations/mendapatkan-number-key-untuk-api
 * Format kirim: api_key, number_key ("ALL" = semua nomor terhubung), phone_no, message. Tidak pakai device_id.
 */
class WatzapService
{
    private static function getConfig(): array
    {
        $config = require __DIR__ . '/../../config.php';
        $watzap = $config['watzap'] ?? [];
        $numberKey = self::getNumberKeyFromSettings();
        if ($numberKey === null) {
            $numberKey = getenv('WATZAP_NUMBER_KEY') ?: ($watzap['number_key'] ?? 'ALL');
        }
        return [
            'api_url' => rtrim(getenv('WATZAP_API_URL') ?: ($watzap['api_url'] ?? 'https://api.watzap.id/v1'), '/'),
            'api_key' => getenv('WATZAP_API_KEY') ?: ($watzap['api_key'] ?? ''),
            'number_key' => $numberKey,
        ];
    }

    /**
     * Baca number_key dari app___settings (pengaturan WatZap di aplikasi). Return null jika belum di-set.
     */
    private static function getNumberKeyFromSettings(): ?string
    {
        try {
            $db = \App\Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'app___settings'");
            if ($tableCheck->rowCount() === 0) {
                return null;
            }
            $stmt = $db->prepare("SELECT `value` FROM app___settings WHERE `key` = 'watzap_number_key' LIMIT 1");
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row === false || $row['value'] === null || trim((string) $row['value']) === '') {
                return null;
            }
            return trim((string) $row['value']);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Simpan number_key ke app___settings (pengaturan WatZap di aplikasi). Prioritas di atas .env.
     *
     * @param string $numberKey Nilai number key (kosong = pakai default dari .env)
     */
    public static function setNumberKey(string $numberKey): void
    {
        $value = trim($numberKey);
        try {
            $db = \App\Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'app___settings'");
            if ($tableCheck->rowCount() === 0) {
                return;
            }
            $stmt = $db->prepare("INSERT INTO app___settings (`key`, `value`) VALUES ('watzap_number_key', ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()");
            $stmt->execute([$value, $value]);
        } catch (\Throwable $e) {
            error_log('WatzapService::setNumberKey: ' . $e->getMessage());
        }
    }

    private static function request(string $method, string $path, array $body = []): array
    {
        $cfg = self::getConfig();
        $base = $cfg['api_url'];
        $apiKey = $cfg['api_key'];

        if ($base === '' || $apiKey === '') {
            return [
                'success' => false,
                'data' => null,
                'message' => 'WATZAP_API_URL atau WATZAP_API_KEY belum di-set di .env',
            ];
        }

        $url = $base . $path;
        $options = [
            'timeout' => 15,
            'headers' => [
                'Content-Type' => 'application/json',
            ],
        ];
        if (!empty($body)) {
            $options['json'] = $body;
        }
        if ($method === 'GET' && empty($body)) {
            $options['headers']['Authorization'] = 'Bearer ' . $apiKey;
        }

        try {
            $client = new \GuzzleHttp\Client();
            $response = $client->request($method, $url, $options);
            $code = $response->getStatusCode();
            $bodyStr = (string) $response->getBody();
            $data = json_decode($bodyStr, true) ?? [];

            if ($code >= 200 && $code < 300) {
                return [
                    'success' => true,
                    'data' => $data,
                    'message' => $data['message'] ?? 'OK',
                ];
            }

            return [
                'success' => false,
                'data' => $data,
                'message' => $data['message'] ?? $data['error'] ?? "HTTP {$code}",
            ];
        } catch (\GuzzleHttp\Exception\RequestException $e) {
            $res = $e->getResponse();
            $bodyStr = $res ? (string) $res->getBody() : '';
            $data = json_decode($bodyStr, true);
            $msg = is_array($data) ? ($data['message'] ?? $data['error'] ?? $e->getMessage()) : $e->getMessage();
            error_log('WatzapService: ' . $msg);
            return [
                'success' => false,
                'data' => null,
                'message' => $msg,
            ];
        } catch (\Throwable $e) {
            error_log('WatzapService: ' . $e->getMessage());
            return [
                'success' => false,
                'data' => null,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Status koneksi WatZap (jika API menyediakan endpoint status).
     */
    public static function getStatus(): array
    {
        $cfg = self::getConfig();
        if ($cfg['api_key'] === '') {
            return ['success' => false, 'data' => null, 'message' => 'WATZAP_API_KEY belum di-set'];
        }
        return [
            'success' => true,
            'data' => [
                'configured' => true,
                'api_url' => $cfg['api_url'],
                'number_key' => $cfg['number_key'],
            ],
            'message' => 'WatZap terkonfigurasi. Kirim pesan pakai number_key "' . $cfg['number_key'] . '".',
        ];
    }

    /**
     * Daftar nomor (number key) dari WatZap. Jika API tidak menyediakan list, return kosong.
     */
    public static function getDevices(): array
    {
        $res = self::request('GET', '/devices');
        if ($res['success'] && is_array($res['data'])) {
            $list = $res['data']['data'] ?? $res['data']['devices'] ?? (isset($res['data'][0]) ? $res['data'] : []);
            if (!is_array($list)) {
                $list = [];
            }
            return [
                'success' => true,
                'data' => $list,
                'message' => $res['message'],
            ];
        }
        return [
            'success' => true,
            'data' => [],
            'message' => $res['message'] ?? 'Pakai number_key ALL atau set WATZAP_NUMBER_KEY di .env',
        ];
    }

    /**
     * Kirim pesan teks via WatZap.
     * Body sesuai dokumentasi: api_key, number_key ("ALL" atau key dari dashboard), phone_no, message.
     * @param string $numberKey "ALL" atau number key dari WatZap; kosong = pakai default dari config (ALL).
     */
    public static function sendMessage(string $phoneNumber, string $message, string $numberKey = ''): array
    {
        $phone = WhatsAppService::formatPhoneNumber($phoneNumber);
        if (strlen($phone) < 10) {
            return ['success' => false, 'message' => 'Nomor tidak valid'];
        }

        $cfg = self::getConfig();
        if ($cfg['api_key'] === '') {
            return ['success' => false, 'message' => 'WATZAP_API_KEY belum di-set di .env'];
        }

        $body = [
            'api_key' => $cfg['api_key'],
            'number_key' => $numberKey !== '' ? $numberKey : $cfg['number_key'],
            'phone_no' => $phone,
            'message' => $message,
        ];

        $res = self::request('POST', '/send_message', $body);

        if ($res['success']) {
            return [
                'success' => true,
                'message' => $res['message'] ?? 'Pesan terkirim',
            ];
        }

        return [
            'success' => false,
            'message' => $res['message'] ?? 'Gagal mengirim',
        ];
    }

    /**
     * Cek apakah nomor terdaftar di WhatsApp via WatZap (jika API mendukung).
     * Return format sama dengan WhatsAppService::checkNumber.
     * Jika WatZap tidak punya endpoint cek nomor, return success + isRegistered true (anggap terdaftar).
     *
     * @param string $phoneNumber Nomor 62xxxxxxxxxx (sudah diformat)
     * @return array ['success' => bool, 'data' => ['phoneNumber' => string, 'isRegistered' => bool], 'message' => string]
     */
    public static function checkNumber(string $phoneNumber): array
    {
        $phone = WhatsAppService::formatPhoneNumber($phoneNumber);
        if (strlen($phone) < 10) {
            return [
                'success' => false,
                'data' => ['phoneNumber' => $phone, 'isRegistered' => false],
                'message' => 'Nomor tidak valid',
            ];
        }

        $cfg = self::getConfig();
        if ($cfg['api_key'] === '') {
            return [
                'success' => true,
                'data' => ['phoneNumber' => $phone, 'isRegistered' => true],
                'message' => 'WatZap belum dikonfigurasi; anggap terdaftar',
            ];
        }

        $body = [
            'api_key' => $cfg['api_key'],
            'number_key' => $cfg['number_key'],
            'phone_no' => $phone,
        ];
        $res = self::request('POST', '/check_number', $body);

        if ($res['success'] && is_array($res['data'])) {
            $isRegistered = (bool) ($res['data']['is_registered'] ?? $res['data']['registered'] ?? $res['data']['exists'] ?? true);
            return [
                'success' => true,
                'data' => [
                    'phoneNumber' => $res['data']['phone_no'] ?? $phone,
                    'isRegistered' => $isRegistered,
                ],
                'message' => $res['data']['message'] ?? ($isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp'),
            ];
        }

        // WatZap mungkin tidak punya endpoint check_number; anggap terdaftar agar alur daftar tidak putus
        return [
            'success' => true,
            'data' => ['phoneNumber' => $phone, 'isRegistered' => true],
            'message' => 'WatZap tidak menyediakan cek nomor; anggap terdaftar',
        ];
    }

    /**
     * URL webhook kita yang didaftarkan ke WatZap (untuk copy-paste di dashboard WatZap).
     * Dari env API_PUBLIC_URL (staging: https://api2.alutsmani.id, production: https://api.alutsmani.id)
     * atau WATZAP_WEBHOOK_URL (full URL). Jika kosong, return string kosong.
     */
    public static function getWebhookUrl(): string
    {
        $full = getenv('WATZAP_WEBHOOK_URL');
        if ($full !== false && $full !== '') {
            return rtrim($full, '/');
        }
        $base = getenv('API_PUBLIC_URL');
        if ($base === false || $base === '') {
            $config = require __DIR__ . '/../../config.php';
            $base = $config['api_public_url'] ?? '';
        }
        $base = rtrim((string) $base, '/');
        if ($base === '') {
            return '';
        }
        return $base . '/api/watzap/webhook';
    }

    /**
     * Daftarkan webhook URL ke WatZap (jika API mereka mendukung).
     * Jika tidak ada endpoint set webhook, return success dengan pesan agar set manual di dashboard.
     *
     * @param string|null $url Jika null, pakai getWebhookUrl()
     * @return array ['success' => bool, 'message' => string]
     */
    public static function setWebhook(?string $url = null): array
    {
        $webhookUrl = $url ?? self::getWebhookUrl();
        if ($webhookUrl === '') {
            return [
                'success' => false,
                'message' => 'API_PUBLIC_URL atau WATZAP_WEBHOOK_URL belum di-set di .env',
            ];
        }

        $cfg = self::getConfig();
        if ($cfg['api_key'] === '') {
            return ['success' => false, 'message' => 'WATZAP_API_KEY belum di-set'];
        }

        $body = [
            'api_key' => $cfg['api_key'],
            'webhook_url' => $webhookUrl,
        ];
        $res = self::request('POST', '/webhook', $body);

        if ($res['success']) {
            return [
                'success' => true,
                'message' => $res['message'] ?? 'Webhook berhasil didaftarkan',
            ];
        }

        // API set webhook mungkin tidak ada; arahkan set manual di dashboard WatZap
        return [
            'success' => true,
            'message' => 'Set webhook manual di dashboard WatZap (menu API/n8n). URL: ' . $webhookUrl,
        ];
    }

    /**
     * Ambil daftar webhook yang terdaftar di WatZap (GET webhook).
     * Dokumentasi: https://api-docs.watzap.id/
     * Return array of ['url' => string] untuk ditampilkan di UI.
     *
     * @return array ['success' => bool, 'data' => array<{url: string}>, 'message' => string]
     */
    public static function getWebhooks(): array
    {
        $cfg = self::getConfig();
        if ($cfg['api_key'] === '') {
            return [
                'success' => false,
                'data' => [],
                'message' => 'WATZAP_API_KEY belum di-set di .env',
            ];
        }

        $res = self::request('GET', '/webhook');
        if (!$res['success'] || $res['data'] === null) {
            return [
                'success' => false,
                'data' => [],
                'message' => $res['message'] ?? 'Gagal mengambil daftar webhook',
            ];
        }

        $raw = $res['data'];
        $list = [];
        if (isset($raw['data']) && is_array($raw['data'])) {
            foreach ($raw['data'] as $item) {
                $url = is_array($item) ? ($item['url'] ?? $item['webhook_url'] ?? $item['webhook'] ?? '') : (string) $item;
                if ($url !== '') {
                    $list[] = ['url' => $url];
                }
            }
        } elseif (isset($raw['webhook_url']) && (string) $raw['webhook_url'] !== '') {
            $list[] = ['url' => (string) $raw['webhook_url']];
        } elseif (isset($raw['url']) && (string) $raw['url'] !== '') {
            $list[] = ['url' => (string) $raw['url']];
        } elseif (isset($raw['webhook']) && (string) $raw['webhook'] !== '') {
            $list[] = ['url' => (string) $raw['webhook']];
        }

        return [
            'success' => true,
            'data' => $list,
            'message' => $res['message'] ?? 'OK',
        ];
    }
}
