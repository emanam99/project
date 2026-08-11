<?php

declare(strict_types=1);

namespace App\Utils;

/**
 * Menjalankan pekerjaan setelah response HTTP dikirim ke klien (shutdown),
 * agar WA / Web Push tidak memperlambat JSON response.
 *
 * Pola untuk notifikasi outbound (eBeddien / staff):
 * - Panggil hanya setelah transaksi DB sukses (setelah commit bila pakai transaksi).
 * - Di closure `use (...)` tangkap data primitif (string nomor, teks pesan, array logContext
 *   berisi skalar) — hindari menangkap Request/controller utuh kecuali benar-benar perlu.
 * - Endpoint "tes kirim WA" / cek nomor tetap sinkron; jangan defer di sana.
 *
 * Di PHP-FPM: `fastcgi_finish_request()`.
 * Di LiteSpeed (Hostinger): `litespeed_finish_request()` — tanpa ini klien menunggu
 * sampai kirim WA selesai di shutdown (terasa "simpan lama").
 */
final class DeferredHttpTask
{
    public static function runAfterResponse(callable $callback): void
    {
        register_shutdown_function(static function () use ($callback): void {
            self::finishHttpResponseEarly();
            try {
                $callback();
            } catch (\Throwable $e) {
                error_log('DeferredHttpTask: ' . $e->getMessage());
            }
        });
    }

    /** Lepas koneksi HTTP ke klien sebelum pekerjaan berat (WA/push). */
    public static function finishHttpResponseEarly(): void
    {
        if (\function_exists('fastcgi_finish_request')) {
            @\fastcgi_finish_request();

            return;
        }
        if (\function_exists('litespeed_finish_request')) {
            @\litespeed_finish_request();
        }
    }
}
