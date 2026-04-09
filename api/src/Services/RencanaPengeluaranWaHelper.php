<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Template pesan WA rencana pengeluaran (selaras dengan generateRencanaWhatsAppMessage di ebeddien).
 */
final class RencanaPengeluaranWaHelper
{
    public static function ebeddienBaseUrl(): string
    {
        $config = require __DIR__ . '/../../config.php';
        $u = trim((string) ($config['app']['ebeddien_url'] ?? ''));
        if ($u !== '') {
            return rtrim($u, '/');
        }
        $u = trim((string) ($config['app']['url'] ?? ''));

        return $u !== '' ? rtrim($u, '/') : 'http://localhost:5173';
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

        return "{$link}\n\nDi Approve ✅\n\n> {$ket}\n\nTotal : {$total}\nDibuat : {$dibuat}\nDi Approve: {$approve}";
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

        return "{$link}\n\nDitolak ❌\n\n> {$ket}\n\nTotal : {$total}\nDibuat : {$dibuat}\nDitolak: {$tolak}";
    }

    /**
     * Pesan WA saat draft rencana disimpan / diperbarui (penerima: role dengan aksi notif draft).
     */
    public static function buildDraftSavedMessage(
        int $rencanaId,
        string $keterangan,
        string $lembagaLabel,
        string $namaPenyimpan,
        bool $isUpdate
    ): string {
        $link = self::ebeddienBaseUrl() . '/pengeluaran?tab=draft&rencana=' . $rencanaId;
        $ket = trim($keterangan) !== '' ? trim($keterangan) : 'Tanpa Keterangan';
        $tag = $isUpdate ? 'Diperbarui' : 'Baru';

        return "{$link}\n\n*Draft rencana* ({$tag})\n\n> {$ket}\nLembaga: {$lembagaLabel}\n\nDisimpan oleh: {$namaPenyimpan}\n\n> Simpan nomor ini agar link di atas bisa diklik.";
    }
}
