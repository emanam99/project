<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Pengetahuan umum Aplikasi MyBeddian (publik) — install, login, lupa NIS, cek tagihan, fitur.
 * Disisipkan ke prompt bila pertanyaan menyentuh topik MyBeddian; siapa saja boleh memakai.
 */
final class AiMybeddianChatContextHelper
{
    private const MAX_BLOCK_CHARS = 12000;

    public static function tryBuildMybeddianContext(string $lastUserMessage): ?string
    {
        $trimmed = trim($lastUserMessage);
        if ($trimmed === '') {
            return null;
        }
        if (!self::messageSuggestsMybeddianTopic($trimmed)) {
            return null;
        }

        try {
            return self::trimBlock(self::buildBlock());
        } catch (\Throwable $e) {
            error_log('AiMybeddianChatContextHelper: ' . $e->getMessage());

            return null;
        }
    }

    private static function messageSuggestsMybeddianTopic(string $text): bool
    {
        $t = mb_strtolower($text, 'UTF-8');

        if (preg_match('/\b(my\s*beddien|mybeddien|mybeddian)\b/iu', $t)) {
            return true;
        }

        if (preg_match('/\b(portal\s+wali|aplikasi\s+(wali|santri)|web\s+santri)\b/iu', $t)) {
            return true;
        }

        if (preg_match('/\b(lupa\s+nis|cek\s+nis|mengetahui\s+nis|pengajuan\s+nis)\b/iu', $t)) {
            return true;
        }

        if (preg_match(
            '/\b(install|pasang|unduh|download|add\s+to\s+home|pwa|home\s+screen)\b/iu',
            $t
        ) && preg_match('/\b(santri|wali|beddien|portal)\b/iu', $t)) {
            return true;
        }

        if (preg_match(
            '/\b(riwayat\s+pembayaran|cek\s+tagihan|lihat\s+tagihan|bayar\s+online|status\s+pembayaran)\b/iu',
            $t
        ) && preg_match('/\b(santri|wali|login|beddien|portal|uwaba|pendaftaran|tunggakan|khusus)\b/iu', $t)) {
            return true;
        }

        if (preg_match(
            '/\b(login|daftar|passkey|fingerprint|lupa\s+password|setup\s+akun)\b/iu',
            $t
        ) && preg_match('/\b(santri|wali|beddien|portal)\b/iu', $t)) {
            return true;
        }

        return false;
    }

    private static function resolvePortalUrl(): string
    {
        $fromEnv = trim((string) (getenv('MYBEDDIAN_APP_URL') ?: ''));
        if ($fromEnv !== '') {
            return rtrim($fromEnv, '/');
        }
        try {
            $config = require dirname(__DIR__, 2) . '/config.php';
            $url = trim((string) ($config['app']['mybeddian_url'] ?? $config['mybeddian_app_url'] ?? ''));

            return $url !== '' ? rtrim($url, '/') : 'https://mybeddien.alutsmani.id';
        } catch (\Throwable $e) {
            return 'https://mybeddien.alutsmani.id';
        }
    }

    private static function buildBlock(): string
    {
        $url = self::resolvePortalUrl();
        $lines = [];
        $lines[] = 'Panduan resmi Aplikasi MyBeddian (Digital Service Center untuk santri & wali). '
            . 'Gunakan blok ini untuk menjawab; jangan mengarang URL atau langkah di luar daftar berikut.';
        $lines[] = '';
        $lines[] = '=== Ringkasan ===';
        $lines[] = '• MyBeddian = aplikasi web/PWA untuk santri, wali, dan peran terkait (bukan eBeddien — eBeddien untuk staf/pengurus).';
        $lines[] = '• URL utama: ' . $url;
        $lines[] = '• Data tagihan/riwayat bayar per santri hanya setelah login akun yang terhubung ke santri tersebut (privasi).';
        $lines[] = '';
        $lines[] = '=== Cara install (PWA) di HP / tablet ===';
        $lines[] = '1) Buka ' . $url . ' di browser (disarankan Chrome Android atau Safari iPhone).';
        $lines[] = '2) Login terlebih dahulu (manifest PWA aktif setelah login — halaman login belum menawarkan install).';
        $lines[] = '3) Setelah masuk, tunggu ±3 detik: banner biru «Install Aplikasi myBeddien» di bagian atas → tap «Install» → ikuti dialog browser.';
        $lines[] = '4) Jika banner tidak muncul:';
        $lines[] = '   • Android Chrome: menu ⋮ → «Install app» / «Tambahkan ke layar utama».';
        $lines[] = '   • iPhone/iPad Safari: tombol Share → «Add to Home Screen».';
        $lines[] = '5) Sudah terpasang bila aplikasi terbuka tanpa bilah alamat browser (mode standalone).';
        $lines[] = '';
        $lines[] = '=== Login & daftar akun ===';
        $lines[] = '• Login: ' . $url . '/login — username + password, atau passkey (sidik jari/face) bila sudah didaftarkan di menu Profil setelah login.';
        $lines[] = '• Daftar akun baru (santri): ' . $url . '/daftar — siapkan NIS 7 digit, NIK 16 digit, nomor WhatsApp aktif (min. 10 digit; sistem cek nomor terdaftar di WA).';
        $lines[] = '• Daftar PJGT (penanggung jawab guru tugas): ' . $url . '/daftar-pjgt (alur terpisah).';
        $lines[] = '• Lupa password: ' . $url . '/lupa-password — pilih mode Santri/PJGT/Toko; verifikasi seperti daftar; link ubah password dikirim ke WA.';
        $lines[] = '• Lupa username: ' . $url . '/lupa-username — pilih mode Santri/PJGT/Toko; verifikasi data seperti daftar (NIS+NIK+WA / identitas madrasah / kode toko); username dikirim ke WhatsApp.';
        $lines[] = '• Setup akun dari tautan WA: buka link setup/ubah password yang dikirim institusi (token di URL).';
        $lines[] = '• Bila satu username terhubung ke beberapa santri, setelah login sistem meminta memilih identitas santri.';
        $lines[] = '';
        $lines[] = '=== Lupa / tidak tahu NIS ===';
        $lines[] = '• Buka ' . $url . '/lupa-nis (juga dari link di halaman login).';
        $lines[] = '• Isi: nama lengkap santri, NIK 16 digit, tanggal lahir, nomor WhatsApp (diverifikasi aktif di WA).';
        $lines[] = '• Jika data cocok: halaman hasil menampilkan NIS — gunakan untuk daftar atau login.';
        $lines[] = '• Jika belum terdaftar di sistem: lanjut pengajuan NIS + unggah foto KK (alur /lupa-nis/upload-kk).';
        $lines[] = '• Layanan dibatasi frekuensi untuk keamanan; jika gagal, pastikan data sama persis dengan pendaftaran.';
        $lines[] = '';
        $lines[] = '=== Cek tagihan & riwayat pembayaran (perlu login santri) ===';
        $lines[] = '• Tanpa login: asisten TIDAK bisa menampilkan tagihan/utang NIS tertentu (rahasia). Hanya bisa menjelaskan tarif umum PSB/UWABA dari blok lain bila ditanya.';
        $lines[] = '• Dengan login sebagai santri: menu Beranda → «Riwayat Pembayaran» atau langsung ' . $url . '/santri/riwayat-pembayaran';
        $lines[] = '• Jenis: Pendaftaran (PSB), UWABA (syahriah bulanan), Khusus, Tunggakan — masing-masing punya halaman detail & status Belum / Kurang (nominal sisa) / Lunas.';
        $lines[] = '• Pembayaran online (bila diaktifkan): VA, QRIS, e-wallet (DANA, OVO, GoPay, dll.) dari layar bayar di riwayat.';
        $lines[] = '• Biodata santri: ' . $url . '/santri/biodata';
        $lines[] = '';
        $lines[] = '=== Fitur lain (setelah login, sesuai akses akun) ===';
        $lines[] = '• Menu lengkap: Beranda, Menu, Profil (username, passkey, foto).';
        $lines[] = '• Santri: riwayat ijin, pelanggaran, e-rapor, riwayat kamar, LTTQ, diniyah/formal, laporan guru tugas, dll.';
        $lines[] = '• Wali santri: area khusus (menu wali-santri) — beberapa fitur masih disiapkan.';
        $lines[] = '• Toko koperasi: bila akun punya akses toko.';
        $lines[] = '• PJGT: dashboard madrasah, laporan, riwayat guru tugas (' . $url . '/pjgt/...).';
        $lines[] = '';
        $lines[] = '=== Batasan & arahan ===';
        $lines[] = '(1) Jangan mengarang nominal tagihan, NIS, atau status lunas per orang tanpa login mereka.';
        $lines[] = '(2) Pertanyaan biaya umum PSB/UWABA (berapa harga) → pakai blok BIAYA PSB / TARIF UWABA bila ada di prompt yang sama.';
        $lines[] = '(3) Staf/pengurus administrasi → arahkan ke eBeddien (bukan MyBeddian).';
        $lines[] = '(4) Jawab langkah praktis berurutan; sebut URL ' . $url . ' bila pengguna belum tahu alamat aplikasi.';

        return implode("\n", $lines);
    }

    private static function trimBlock(string $block): string
    {
        $block = trim($block);
        if (mb_strlen($block, 'UTF-8') <= self::MAX_BLOCK_CHARS) {
            return $block;
        }

        return mb_substr($block, 0, self::MAX_BLOCK_CHARS, 'UTF-8') . "\n…(cuplikan dipotong)";
    }
}
