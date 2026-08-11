<?php

namespace App\Helpers;

/**
 * Memberi tahu live server agar klien memuat ulang cache Domisili (daerah/kamar/santri) dari API ke IndexedDB.
 * Sama env dengan indeks santri: LIVE_SERVER_URL, LIVE_SERVER_API_KEY.
 */
final class LiveDomisiliCacheNotifier
{
    public static function ping(): void
    {
        $config = require __DIR__ . '/../../config.php';
        $live = $config['live_server'] ?? [];
        $base = isset($live['url']) ? trim((string) $live['url']) : '';
        $key = isset($live['api_key']) ? (string) $live['api_key'] : '';
        if ($base === '' || $key === '') {
            return;
        }

        $url = rtrim($base, '/') . '/internal/broadcast-domisili-cache-hint';
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\nX-API-Key: {$key}\r\n",
                'content' => '{}',
                'timeout' => 1.5,
                'ignore_errors' => true,
            ],
        ]);
        @file_get_contents($url, false, $ctx);
    }
}
