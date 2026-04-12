<?php

namespace App\Helpers;

/**
 * Setelah pesan tersimpan di DB lewat POST /api/chat/send, beri tahu server live agar
 * mengirim event receive_message ke socket klien (realtime tanpa lewat Node saveMessage).
 */
final class LiveChatMessageNotifier
{
    /**
     * @param int[] $targetUserIds users.id — semua anggota conversation (termasuk pengirim untuk sinkron tab lain)
     * @param array<string, mixed> $payload sama bentuknya dengan emit Node (receive_message)
     */
    public static function emit(array $targetUserIds, array $payload): void
    {
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

        $url = rtrim($base, '/') . '/internal/broadcast-chat-message';
        $body = json_encode([
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
