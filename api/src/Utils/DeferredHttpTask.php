<?php

declare(strict_types=1);

namespace App\Utils;

/**
 * Menjalankan pekerjaan setelah response HTTP dikirim ke klien (shutdown),
 * agar WA / Web Push tidak memperlambat JSON response.
 */
final class DeferredHttpTask
{
    public static function runAfterResponse(callable $callback): void
    {
        register_shutdown_function(static function () use ($callback): void {
            if (\function_exists('fastcgi_finish_request')) {
                @\fastcgi_finish_request();
            }
            try {
                $callback();
            } catch (\Throwable $e) {
                error_log('DeferredHttpTask: ' . $e->getMessage());
            }
        });
    }
}
