<?php

namespace App\Helpers;

/**
 * Memberi tahu live server (Socket.IO) agar klien eBeddien melakukan sinkron indeks pencarian santri (delta / hapus lokal).
 * Membutuhkan LIVE_SERVER_URL dan LIVE_SERVER_API_KEY di .env (sama seperti live/.env).
 */
final class LiveSantriIndexNotifier
{
    /**
     * @param array{removed_ids?: int[]} $payload removed_ids: id santri yang dihapus dari DB (mis. setelah merge) agar klien bersihkan IndexedDB
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

        $url = rtrim($base, '/') . '/internal/broadcast-santri-search-hint';
        $body = [];
        if (!empty($payload['removed_ids']) && is_array($payload['removed_ids'])) {
            $body['removed_ids'] = array_values(array_filter(array_map('intval', $payload['removed_ids']), static fn ($id) => $id > 0));
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
