<?php

namespace App\Services;

use App\Database;

/**
 * Layanan WhatsApp Cloud API (resmi Meta).
 * Kirim pesan langsung ke Graph API dari PHP — tidak butuh server Node/VPS.
 * Ref: https://developers.facebook.com/docs/whatsapp/cloud-api
 * Sample: https://github.com/fbsamples/whatsapp-business-jaspers-market
 */
class WhatsAppCloudService
{
    private const GRAPH_API_VERSION = 'v21.0';
    private const GRAPH_BASE = 'https://graph.facebook.com';

    public static function getConfig(): array
    {
        $config = require __DIR__ . '/../../config.php';
        $wc = $config['whatsapp_cloud'] ?? [];
        return [
            'enabled' => !empty($wc['enabled']),
            'phone_number_id' => trim((string) ($wc['phone_number_id'] ?? env('WA_CLOUD_PHONE_NUMBER_ID', ''))),
            'access_token' => trim((string) ($wc['access_token'] ?? env('WA_CLOUD_ACCESS_TOKEN', ''))),
            'verify_token' => trim((string) ($wc['verify_token'] ?? env('WA_CLOUD_VERIFY_TOKEN', ''))),
            'app_secret' => trim((string) ($wc['app_secret'] ?? env('WA_CLOUD_APP_SECRET', ''))),
        ];
    }

    /**
     * Cek apakah Cloud API siap dipakai (enabled + token + phone_number_id).
     */
    public static function isAvailable(): bool
    {
        $c = self::getConfig();
        return $c['enabled']
            && $c['phone_number_id'] !== ''
            && $c['access_token'] !== '';
    }

    /**
     * Format nomor ke format internasional (62xxxxxxxxxx).
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
     * Kirim pesan teks via WhatsApp Cloud API (Graph API).
     *
     * @param string $to Nomor tujuan (08xxx atau 62xxx)
     * @param string $text Isi pesan
     * @param string|null $phoneNumberId Override phone_number_id (default dari config)
     * @return array ['success' => bool, 'message_id' => ?string, 'message' => string]
     */
    public static function sendText(string $to, string $text, ?string $phoneNumberId = null): array
    {
        $to = self::formatPhoneNumber($to);
        if (strlen($to) < 10) {
            return ['success' => false, 'message_id' => null, 'message' => 'Nomor tidak valid'];
        }

        $c = self::getConfig();
        if (!$c['enabled'] || $c['phone_number_id'] === '' || $c['access_token'] === '') {
            return [
                'success' => false,
                'message_id' => null,
                'message' => 'WhatsApp Cloud API belum dikonfigurasi. Set WA_CLOUD_ENABLED, WA_CLOUD_PHONE_NUMBER_ID, WA_CLOUD_ACCESS_TOKEN di .env.',
            ];
        }

        $pnId = $phoneNumberId ?? $c['phone_number_id'];
        $url = self::GRAPH_BASE . '/' . self::GRAPH_API_VERSION . '/' . $pnId . '/messages';

        $body = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => preg_replace('/^62/', '', $to), // Graph API expects without country code sometimes - docs say "phone number without +"
            'type' => 'text',
            'text' => [
                'body' => $text,
            ],
        ];

        // Docs: "to" is phone number in international format; often 62xxx without + works
        $body['to'] = $to;

        try {
            $client = new \GuzzleHttp\Client(['timeout' => 20]);
            $response = $client->post($url, [
                'headers' => [
                    'Authorization' => 'Bearer ' . $c['access_token'],
                    'Content-Type' => 'application/json',
                ],
                'json' => $body,
            ]);

            $code = $response->getStatusCode();
            $resBody = (string) $response->getBody();
            $data = json_decode($resBody, true);

            if ($code >= 200 && $code < 300 && !empty($data['messages'])) {
                $messageId = $data['messages'][0]['id'] ?? null;
                return [
                    'success' => true,
                    'message_id' => $messageId,
                    'message' => 'OK',
                ];
            }

            $errMsg = $data['error']['message'] ?? $data['error']['error_user_msg'] ?? $resBody ?: "HTTP {$code}";
            return [
                'success' => false,
                'message_id' => null,
                'message' => $errMsg,
            ];
        } catch (\GuzzleHttp\Exception\RequestException $e) {
            $res = $e->getResponse();
            $errBody = $res ? (string) $res->getBody() : '';
            $decoded = $errBody ? json_decode($errBody, true) : null;
            $errMsg = $decoded['error']['message'] ?? $decoded['error']['error_user_msg'] ?? $e->getMessage();
            error_log('WhatsAppCloudService::sendText ' . $errMsg);
            return [
                'success' => false,
                'message_id' => null,
                'message' => $errMsg,
            ];
        } catch (\Throwable $e) {
            error_log('WhatsAppCloudService::sendText ' . $e->getMessage());
            return [
                'success' => false,
                'message_id' => null,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Verifikasi signature webhook (x-hub-signature-256) dari Meta.
     * Payload = raw body request; secret = app_secret.
     */
    public static function verifyWebhookSignature(string $payload, string $signatureHeader): bool
    {
        $c = self::getConfig();
        if ($c['app_secret'] === '') {
            return false;
        }
        if ($signatureHeader === '') {
            return false;
        }
        $parts = explode('=', $signatureHeader, 2);
        $algo = $parts[0] ?? '';
        $received = $parts[1] ?? '';
        if (strtolower($algo) !== 'sha256' || $received === '') {
            return false;
        }
        $expected = hash_hmac('sha256', $payload, $c['app_secret']);
        return hash_equals($expected, $received);
    }

    /**
     * Parse payload webhook Meta (entry[].changes[].value) dan ekstrak messages/statuses.
     * Return ['messages' => [...], 'statuses' => [...], 'phone_number_id' => string|null].
     */
    public static function parseWebhookPayload(array $body): array
    {
        $messages = [];
        $statuses = [];
        $phoneNumberId = null;

        if (($body['object'] ?? '') !== 'whatsapp_business_account') {
            return ['messages' => [], 'statuses' => [], 'phone_number_id' => null];
        }

        $entries = $body['entry'] ?? [];
        foreach ($entries as $entry) {
            $changes = $entry['changes'] ?? [];
            foreach ($changes as $change) {
                $value = $change['value'] ?? [];
                if (empty($value)) {
                    continue;
                }
                if (isset($value['metadata']['phone_number_id'])) {
                    $phoneNumberId = (string) $value['metadata']['phone_number_id'];
                }
                foreach ($value['messages'] ?? [] as $msg) {
                    $messages[] = $msg;
                }
                foreach ($value['statuses'] ?? [] as $st) {
                    $statuses[] = $st;
                }
            }
        }

        return ['messages' => $messages, 'statuses' => $statuses, 'phone_number_id' => $phoneNumberId];
    }

    /**
     * Ambil teks dari satu object message (text, button reply, dll).
     */
    public static function getMessageText(array $rawMessage): string
    {
        $type = $rawMessage['type'] ?? '';
        if ($type === 'text') {
            return $rawMessage['text']['body'] ?? '';
        }
        if ($type === 'interactive' && isset($rawMessage['interactive']['button_reply']['title'])) {
            return $rawMessage['interactive']['button_reply']['title'];
        }
        if ($type === 'button' && isset($rawMessage['button']['text'])) {
            return $rawMessage['button']['text'];
        }
        return '';
    }

    /**
     * Simpan pesan masuk ke tabel whatsapp (jika tabel ada).
     */
    public static function logIncomingToDb(string $nomorTujuan, string $isiPesan, ?string $waMessageId = null): void
    {
        try {
            $db = Database::getInstance()->getConnection();
            if ($db->query("SHOW TABLES LIKE 'whatsapp'")->rowCount() === 0) {
                return;
            }
            $hasArah = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'arah'")->rowCount() > 0;
            $hasWaMessageId = $db->query("SHOW COLUMNS FROM whatsapp LIKE 'wa_message_id'")->rowCount() > 0;

            $cols = ['nomor_tujuan', 'isi_pesan', 'tujuan', 'kategori', 'sumber', 'status'];
            $vals = [$nomorTujuan, $isiPesan, 'wali_santri', 'incoming', 'wa_cloud', 'terkirim'];
            if ($hasArah) {
                $cols[] = 'arah';
                $vals[] = 'masuk';
            }
            if ($hasWaMessageId && $waMessageId !== null && $waMessageId !== '') {
                $cols[] = 'wa_message_id';
                $vals[] = $waMessageId;
            }
            $placeholders = implode(', ', array_fill(0, count($cols), '?'));
            $stmt = $db->prepare('INSERT INTO whatsapp (' . implode(', ', $cols) . ') VALUES (' . $placeholders . ')');
            $stmt->execute($vals);
        } catch (\Throwable $e) {
            error_log('WhatsAppCloudService::logIncomingToDb ' . $e->getMessage());
        }
    }
}
