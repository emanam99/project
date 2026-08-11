<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Broadcast kemajuan kirim WA massal Manage Data ke semua klien Socket.IO (server live).
 */
final class LiveManageWaBulkBroadcastHelper
{
    /**
     * @param array<string, mixed> $payload
     */
    public static function emit(array $payload): void
    {
        $config = require __DIR__ . '/../../config.php';
        $live = $config['live_server'] ?? [];
        $base = isset($live['url']) ? trim((string) $live['url']) : '';
        $key = isset($live['api_key']) ? (string) $live['api_key'] : '';
        if ($base === '' || $key === '') {
            return;
        }

        $url = rtrim($base, '/') . '/internal/broadcast-manage-wa-bulk';
        $body = json_encode(['payload' => $payload], JSON_UNESCAPED_UNICODE);
        if ($body === false) {
            return;
        }

        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nX-API-Key: {$key}\r\n",
                'content' => $body,
                'timeout' => 5,
                'ignore_errors' => true,
            ],
        ]);
        @file_get_contents($url, false, $ctx);
    }
}
