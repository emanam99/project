<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Template pesan WA rencana pengeluaran (selaras dengan generateRencanaWhatsAppMessage di ebeddien).
 */
final class RencanaPengeluaranWaHelper
{
    /**
     * Jika host api(.|2.|…)domain → ganti ke ebeddien(2.|…)domain agar link WA tidak mengarah ke backend.
     */
    private static function deriveEbeddienBaseFromUrl(string $url): string
    {
        $url = trim($url);
        if ($url === '') {
            return '';
        }
        $p = parse_url($url);
        if (!is_array($p) || empty($p['host'])) {
            return '';
        }
        $host = strtolower((string) $p['host']);
        if (!preg_match('/^api(\d*)\.(.+)$/i', $host, $m)) {
            return '';
        }
        $suffix = $m[2] ?? '';
        if ($suffix === '') {
            return '';
        }
        $n = $m[1] ?? '';
        $newHost = ($n !== '' ? 'ebeddien' . $n : 'ebeddien') . '.' . $suffix;
        $scheme = isset($p['scheme']) && $p['scheme'] !== '' ? $p['scheme'] . '://' : 'https://';

        return rtrim($scheme . $newHost, '/');
    }

    public static function ebeddienBaseUrl(): string
    {
        $config = require __DIR__ . '/../../config.php';
        $u = trim((string) ($config['app']['ebeddien_url'] ?? ''));
        if ($u !== '') {
            return rtrim($u, '/');
        }
        $apiPublic = trim((string) ($config['api_public_url'] ?? ''));
        if ($apiPublic !== '') {
            $d = self::deriveEbeddienBaseFromUrl($apiPublic);
            if ($d !== '') {
                return $d;
            }
        }
        $u = trim((string) ($config['app']['url'] ?? ''));
        if ($u !== '') {
            $d = self::deriveEbeddienBaseFromUrl($u);
            if ($d !== '') {
                return $d;
            }

            return rtrim($u, '/');
        }

        return 'http://localhost:5173';
    }

    public static function formatIdr(float $n): string
    {
        return 'Rp' . number_format($n, 0, ',', '.');
    }

    /**
     * @param array<string, mixed> $r Baris rencana + admin_nama, admin_approve_nama
     */
    public static function buildApproveMessage(array $r, float $totalNominal): string
    {
        $link = self::ebeddienBaseUrl() . '/pengeluaran?rencana=' . (int) ($r['id'] ?? 0);
        $ket = trim((string) ($r['keterangan'] ?? ''));
        if ($ket === '') {
            $ket = 'Tanpa Keterangan';
        }
        $dibuat = trim((string) ($r['admin_nama'] ?? '-'));
        $approve = trim((string) ($r['admin_approve_nama'] ?? '-'));
        $total = self::formatIdr($totalNominal);
        $catatan = trim((string) ($r['catatan'] ?? ''));
        $catatanLine = $catatan !== '' ? "\nCatatan : {$catatan}" : '';

        return "{$link}\n\nDi Approve ✅\n\n> {$ket}\n\nTotal : {$total}\nDibuat : {$dibuat}\nDi Approve: {$approve}{$catatanLine}";
    }

    /**
     * @param array<string, mixed> $r Baris rencana + admin_nama
     */
    public static function buildRejectMessage(array $r, float $totalNominal, string $ditolakOleh): string
    {
        $link = self::ebeddienBaseUrl() . '/pengeluaran?rencana=' . (int) ($r['id'] ?? 0);
        $ket = trim((string) ($r['keterangan'] ?? ''));
        if ($ket === '') {
            $ket = 'Tanpa Keterangan';
        }
        $dibuat = trim((string) ($r['admin_nama'] ?? '-'));
        $total = self::formatIdr($totalNominal);
        $tolak = trim($ditolakOleh) !== '' ? trim($ditolakOleh) : '-';
        $catatan = trim((string) ($r['catatan'] ?? ''));
        $alasanLine = $catatan !== '' ? "\nAlasan : {$catatan}" : '';

        return "{$link}\n\nDitolak ❌\n\n> {$ket}\n\nTotal : {$total}\nDibuat : {$dibuat}\nDitolak: {$tolak}{$alasanLine}";
    }

    /**
     * Pesan WA saat draft rencana disimpan / diperbarui (penerima: role dengan aksi notif draft).
     * Susunan selaras template «Rencana pengeluaran» (pending) di ebeddien — beda judul/ikon & tab link.
     *
     * @param array{kategori?: string, sumber_uang?: string} $meta Opsional dari baris rencana
     */
    public static function buildDraftSavedMessage(
        int $rencanaId,
        string $keterangan,
        string $lembagaLabel,
        string $namaPenyimpan,
        bool $isUpdate,
        string $totalFormatted,
        array $meta = []
    ): string {
        $link = self::ebeddienBaseUrl() . '/pengeluaran?tab=draft&rencana=' . $rencanaId;
        $ket = trim($keterangan) !== '' ? trim($keterangan) : 'Tanpa Keterangan';
        $statusText = $isUpdate ? 'Diperbarui' : 'Baru';
        $kat = trim((string) ($meta['kategori'] ?? ''));
        if ($kat === '') {
            $kat = '-';
        }
        $lem = trim($lembagaLabel) !== '' ? trim($lembagaLabel) : '-';
        $sum = trim((string) ($meta['sumber_uang'] ?? ''));
        if ($sum === '') {
            $sum = '-';
        }
        $nama = trim($namaPenyimpan) !== '' ? trim($namaPenyimpan) : '-';

        return "{$link}\n\n*Draft Rencana Pengeluaran* 📝\n*Pesantren Salafiyah Al-Utsmani*\n\n> {$ket}\n\n*Kategori:* {$kat}\n*Lembaga:* {$lem}\n*Sumber Uang:* {$sum}\n*Total:* {$totalFormatted}\n*Status:* {$statusText}\n*Disimpan oleh:* {$nama}\n\n> Simpan nomor ini agar link di atas bisa diklik.";
    }

    /**
     * Pesan WA saat rencana diajukan / diedit (status pending / di edit).
     * Selaras generateRencanaWhatsAppMessage(..., 'pending') di ebeddien.
     *
     * @param array<string, mixed> $r keterangan, kategori, lembaga, sumber_uang, admin_nama, last_edit_admin_nama?
     */
    public static function buildPendingMessage(
        array $r,
        float $totalNominal,
        bool $isCreate,
        int $jumlahKomentar = 0,
        int $jumlahViewer = 0
    ): string {
        $link = self::ebeddienBaseUrl() . '/pengeluaran?rencana=' . (int) ($r['id'] ?? 0);
        $ket = trim((string) ($r['keterangan'] ?? ''));
        if ($ket === '') {
            $ket = 'Tanpa Keterangan';
        }
        $kat = trim((string) ($r['kategori'] ?? ''));
        if ($kat === '') {
            $kat = '-';
        }
        $lem = trim((string) ($r['lembaga'] ?? ''));
        if ($lem === '') {
            $lem = '-';
        }
        $sum = trim((string) ($r['sumber_uang'] ?? ''));
        if ($sum === '') {
            $sum = '-';
        }
        $dibuat = trim((string) ($r['admin_nama'] ?? '-'));
        if ($dibuat === '') {
            $dibuat = '-';
        }
        $statusText = $isCreate ? 'Baru' : 'Di Edit';
        $total = self::formatIdr($totalNominal);
        if ($isCreate) {
            $olehLines = "*Dibuat oleh:* {$dibuat}";
        } else {
            $diedit = trim((string) ($r['last_edit_admin_nama'] ?? ''));
            if ($diedit === '') {
                $diedit = '-';
            }
            $olehLines = "*Diedit oleh:* {$diedit}\n*Dibuat oleh:* {$dibuat}";
        }

        return "{$link}\n\n*Rencana Pengeluaran* ⚠️\n*Pesantren Salafiyah Al-Utsmani*\n\n> {$ket}\n\n*Kategori:* {$kat}\n*Lembaga:* {$lem}\n*Sumber Uang:* {$sum}\n*Total:* {$total}\n*Status:* {$statusText}\n{$olehLines}\n\n> 💬 {$jumlahKomentar} 👁️ {$jumlahViewer}";
    }
}
