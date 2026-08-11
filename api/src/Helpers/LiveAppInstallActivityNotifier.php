<?php

namespace App\Helpers;

/**
 * Mengirim hint realtime ke live server setelah tracking install activity tersimpan.
 * Live server akan broadcast event Socket.IO agar halaman Online update tanpa polling.
 */
final class LiveAppInstallActivityNotifier
{
    /**
     * @param array<string, mixed> $payload
     */
    public static function ping(array $payload = []): void
    {
        $config = require __DIR__ . '/../../config.php';
        $live = $config['live_server'] ?? [];
        $base = isset($live['url']) ? trim((string) $live['url']) : '';
        $key = isset($live['api_key']) ? (string) $live['api_key'] : '';
        if ($base === '' || $key === '') {
            return;
        }

        $url = rtrim($base, '/') . '/internal/broadcast-app-install-activity';
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($body === false) {
            return;
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nX-API-Key: {$key}\r\n",
                'content' => $body,
                'timeout' => 1.5,
                'ignore_errors' => true,
            ],
        ]);
        @file_get_contents($url, false, $ctx);
    }
}
