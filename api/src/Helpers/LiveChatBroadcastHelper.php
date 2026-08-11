<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Broadcast event Socket.IO arbitrer ke users.id tertentu (server live).
 */
final class LiveChatBroadcastHelper
{
    /**
     * @param int[] $targetUserIds users.id
     * @param array<string, mixed> $payload
     */
    public static function emit(string $eventName, array $targetUserIds, array $payload): void
    {
        $eventName = trim($eventName);
        if ($eventName === '') {
            return;
        }
        $ids = array_values(array_unique(array_filter(array_map('intval', $targetUserIds), static fn ($id) => $id > 0)));
        if ($ids === []) {
            return;
        }

        $config = require __DIR__ . '/../../config.php';
        $live = $config['live_server'] ?? [];
        $base = isset($live['url']) ? trim((string) $live['url']) : '';
        $key = isset($live['api_key']) ? (string) $live['api_key'] : '';
        if ($base === '' || $key === '') {
            return;
        }

        $url = rtrim($base, '/') . '/internal/broadcast-chat-event';
        $body = json_encode([
            'event' => $eventName,
            'target_user_ids' => $ids,
            'payload' => $payload,
        ], JSON_UNESCAPED_UNICODE);
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
