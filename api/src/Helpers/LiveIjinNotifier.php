<?php

namespace App\Helpers;

/**
 * Memberi tahu live server agar klien eBeddien memuat ulang data ijin (realtime lintas user).
 * Membutuhkan live_server url + api_key (sama seperti LiveSantriIndexNotifier).
 */
final class LiveIjinNotifier
{
    /**
     * @param array{
     *   id_santri?: int,
     *   tahun_ajaran?: string,
     *   action?: string
     * } $payload
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

        $url = rtrim($base, '/') . '/internal/broadcast-ijin-hint';
        $body = [];
        if (isset($payload['id_santri']) && (int) $payload['id_santri'] > 0) {
            $body['id_santri'] = (int) $payload['id_santri'];
        }
        if (isset($payload['tahun_ajaran']) && $payload['tahun_ajaran'] !== null && (string) $payload['tahun_ajaran'] !== '') {
            $body['tahun_ajaran'] = (string) $payload['tahun_ajaran'];
        }
        if (isset($payload['action']) && is_string($payload['action']) && $payload['action'] !== '') {
            $body['action'] = $payload['action'];
        }

        $json = json_encode($body, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return;
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nX-API-Key: {$key}\r\n",
                'content' => $json,
                'timeout' => 1.5,
                'ignore_errors' => true,
            ],
        ]);
        @file_get_contents($url, false, $ctx);
    }
}
