<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Proxy ke Evolution API v2 (WhatsApp Baileys/Business).
 * Dokumentasi: https://doc.evolution-api.com/v2/en/get-started/introduction
 * Header otentikasi: apikey (bukan Bearer).
 */
final class EvolutionApiService
{
    private static function getConfig(): array
    {
        $config = require __DIR__ . '/../../config.php';
        $evo = $config['evolution_api'] ?? [];

        // Sumber kebenaran: config.php (sudah mempertimbangkan APP_ENV + EVOLUTION_API_BASE_URL_LOCAL).
        return [
            'base_url' => rtrim((string) ($evo['base_url'] ?? ''), '/'),
            'api_key' => (string) ($evo['api_key'] ?? ''),
            'uses_local_evolution' => filter_var($evo['uses_local_evolution'] ?? false, FILTER_VALIDATE_BOOLEAN),
        ];
    }

    private static function getInstanceNameFromSettings(): ?string
    {
        try {
            $db = \App\Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'app___settings'");
            if ($tableCheck->rowCount() === 0) {
                return null;
            }
            $stmt = $db->prepare("SELECT `value` FROM app___settings WHERE `key` = 'evolution_instance_name' LIMIT 1");
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

    public static function setInstanceName(string $name): void
    {
        $value = trim($name);
        try {
            $db = \App\Database::getInstance()->getConnection();
            $tableCheck = $db->query("SHOW TABLES LIKE 'app___settings'");
            if ($tableCheck->rowCount() === 0) {
                return;
            }
            $stmt = $db->prepare('INSERT INTO app___settings (`key`, `value`) VALUES (\'evolution_instance_name\', ?) ON DUPLICATE KEY UPDATE `value` = ?, updated_at = NOW()');
            $stmt->execute([$value, $value]);
        } catch (\Throwable $e) {
            error_log('EvolutionApiService::setInstanceName: ' . $e->getMessage());
        }
    }

    /**
     * Hilangkan kunci sensitif sebelum dikirim ke browser.
     *
     * @param mixed $data
     * @return mixed
     */
    public static function sanitizeForClient($data)
    {
        if (!\is_array($data)) {
            return $data;
        }
        $isList = $data === [] || array_keys($data) === range(0, \count($data) - 1);
        if ($isList) {
            $out = [];
            foreach ($data as $item) {
                $out[] = self::sanitizeForClient($item);
            }

            return $out;
        }
        $out = [];
        foreach ($data as $k => $v) {
            $lk = strtolower((string) $k);
            if ($lk === 'apikey' || $lk === 'api_key') {
                continue;
            }
            if ($lk === 'hash' && \is_array($v)) {
                $out[$k] = self::sanitizeForClient($v);
                continue;
            }
            if ($lk === 'integration' && \is_array($v)) {
                $int = self::sanitizeForClient($v);
                if (\is_array($int) && isset($int['token'])) {
                    unset($int['token']);
                }
                $out[$k] = $int;
                continue;
            }
            $out[$k] = \is_array($v) ? self::sanitizeForClient($v) : $v;
        }

        return $out;
    }

    /**
     * @return array{ok: bool, status: int, data: mixed, message: ?string}
     */
    public static function request(string $method, string $path, ?array $jsonBody = null, bool $sanitize = true): array
    {
        $cfg = self::getConfig();
        if ($cfg['base_url'] === '' || $cfg['api_key'] === '') {
            return [
                'ok' => false,
                'status' => 0,
                'data' => null,
                'message' => 'EVOLUTION_API_BASE_URL atau EVOLUTION_API_KEY belum di-set di .env / config.',
            ];
        }
        $path = '/' . ltrim($path, '/');
        $url = $cfg['base_url'] . $path;

        $options = [
            'timeout' => 45,
            'http_errors' => false,
            'headers' => [
                'apikey' => $cfg['api_key'],
                'Accept' => 'application/json',
            ],
        ];
        if ($jsonBody !== null && $jsonBody !== []) {
            $options['headers']['Content-Type'] = 'application/json';
            $options['json'] = $jsonBody;
        }

        try {
            $client = new \GuzzleHttp\Client();
            $response = $client->request($method, $url, $options);
            $code = $response->getStatusCode();
            $bodyStr = (string) $response->getBody();
            $data = json_decode($bodyStr, true);
            if ($sanitize && $data !== null) {
                $data = self::sanitizeForClient($data);
            }

            return [
                'ok' => $code >= 200 && $code < 300,
                'status' => $code,
                'data' => $data !== null ? $data : $bodyStr,
                'message' => null,
            ];
        } catch (\Throwable $e) {
            error_log('EvolutionApiService: ' . $e->getMessage());

            return [
                'ok' => false,
                'status' => 0,
                'data' => null,
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * Kirim teks lewat Evolution (POST /message/sendText/{instance}). Dipakai WhatsAppService saat notification_provider = evolution.
     *
     * @return array{ok: bool, status: int, data: mixed, message: ?string}
     */
    public static function sendTextToDigits(string $digits, string $text, ?string $instanceNameOverride = null): array
    {
        $inst = $instanceNameOverride !== null && trim($instanceNameOverride) !== ''
            ? trim($instanceNameOverride)
            : self::getStoredInstanceName();
        if ($inst === '' || strlen($inst) > 120 || !preg_match('/^[a-zA-Z0-9._-]+$/', $inst)) {
            return [
                'ok' => false,
                'status' => 0,
                'data' => null,
                'message' => 'Nama instance Evolution belum disimpan atau tidak valid (Setting → Evolution WA).',
            ];
        }

        return self::request('POST', '/message/sendText/' . rawurlencode($inst), [
            'number' => $digits,
            'text' => $text,
        ], true);
    }

    /**
     * Nama instance default dari app___settings (kosong jika belum disimpan).
     */
    public static function getStoredInstanceName(): string
    {
        $v = self::getInstanceNameFromSettings();

        return $v !== null ? $v : '';
    }

    /**
     * @return array{success: bool, data: ?array<string, mixed>, message: ?string}
     */
    public static function getAppConfig(): array
    {
        $cfg = self::getConfig();
        $fromDb = self::getInstanceNameFromSettings();

        $configAll = require __DIR__ . '/../../config.php';
        $pub = rtrim((string) ($configAll['api_public_url'] ?? ''), '/');
        $webhookUrl = $pub !== '' ? $pub . '/api/public/evolution-webhook' : '';

        return [
            'success' => true,
            'data' => [
                'configured' => $cfg['base_url'] !== '' && $cfg['api_key'] !== '',
                'base_url' => $cfg['base_url'],
                'uses_local_evolution' => $cfg['uses_local_evolution'],
                'instance_name' => $fromDb ?? '',
                'inbound_webhook_url' => $webhookUrl,
                'inbound_webhook_path' => '/api/public/evolution-webhook',
            ],
            'message' => null,
        ];
    }
}
