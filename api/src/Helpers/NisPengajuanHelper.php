<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Pencocokan santri & utilitas pengajuan NIS myBeddien.
 */
final class NisPengajuanHelper
{
    public const STATUS_MENUNGGU_KK = 'menunggu_kk';

    /** KK sudah diunggah; menunggu user kirim token lewat WhatsApp. */
    public const STATUS_MENUNGGU_WA = 'menunggu_wa';

    public const STATUS_MENUNGGU_REVIEW = 'menunggu_review';

    public const STATUS_SELESAI = 'selesai';

    public const STATUS_DITOLAK = 'ditolak';

    public static function normalizeJudulForCompare(string $s): string
    {
        $s = trim($s);
        if ($s === '') {
            return '';
        }
        $lower = mb_strtolower($s, 'UTF-8');
        $dashNorm = preg_replace('/[\x{2010}\x{2011}\x{2012}\x{2013}\x{2014}\x{2212}–—−]/u', '-', $lower);
        $oneSpace = preg_replace('/\s+/u', ' ', is_string($dashNorm) ? $dashNorm : $lower);

        return is_string($oneSpace) ? $oneSpace : $lower;
    }

    public static function normalizeNoWaTo62(string $noWa): ?string
    {
        $digits = preg_replace('/\D/', '', $noWa);
        if ($digits === null || $digits === '') {
            return null;
        }
        if (str_starts_with($digits, '0')) {
            $digits = '62' . substr($digits, 1);
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62' . $digits;
        } elseif (!str_starts_with($digits, '62')) {
            return null;
        }
        if (strlen($digits) < 11 || strlen($digits) > 15) {
            return null;
        }

        return $digits;
    }

    /**
     * @return string NIS 7 digit untuk tampilan
     */
    public static function formatNisForDisplay(array $santri): string
    {
        $rawNis = $santri['nis'] ?? $santri['NIS'] ?? null;
        if ($rawNis !== null && $rawNis !== '') {
            $digits = preg_replace('/\D/', '', (string) $rawNis);
            if ($digits !== '' && $digits !== '0') {
                return strlen($digits) >= 7 ? substr($digits, -7) : str_pad($digits, 7, '0', STR_PAD_LEFT);
            }
        }

        $id = (int) ($santri['id'] ?? $santri['ID'] ?? 0);
        if ($id > 0) {
            return str_pad((string) $id, 7, '0', STR_PAD_LEFT);
        }

        return '';
    }

    /**
     * Cari tepat satu santri by NIK + tanggal lahir + nama.
     *
     * @return array{matched: bool, santri?: array<string, mixed>}
     */
    public static function findSantriByIdentity(PDO $db, string $nikNorm, string $tanggalLahir, string $namaInput): array
    {
        $stmt = $db->prepare(
            'SELECT id, nama, nik, nis, tanggal_lahir, id_user
             FROM santri
             WHERE nik IS NOT NULL AND CHAR_LENGTH(TRIM(nik)) > 0
             AND DATE(tanggal_lahir) = ?
             LIMIT 50'
        );
        $stmt->execute([$tanggalLahir]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($rows === []) {
            return ['matched' => false];
        }

        $namaNorm = self::normalizeJudulForCompare($namaInput);
        $matches = [];
        foreach ($rows as $row) {
            $nikDb = NikHelper::normalize((string) ($row['nik'] ?? ''));
            if ($nikDb === null || $nikDb === '' || $nikDb !== $nikNorm) {
                continue;
            }
            $namaDb = self::normalizeJudulForCompare((string) ($row['nama'] ?? ''));
            if ($namaDb !== $namaNorm) {
                continue;
            }
            $matches[] = $row;
        }

        if (count($matches) !== 1) {
            return ['matched' => false];
        }

        return ['matched' => true, 'santri' => $matches[0]];
    }

    public static function resolveLembagaIdForSantri(PDO $db, ?int $idSantri): ?string
    {
        if ($idSantri === null || $idSantri < 1) {
            return null;
        }
        $stmt = $db->prepare(
            'SELECT daftar_formal FROM psb___registrasi WHERE id_santri = ? ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute([$idSantri]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        $lem = trim((string) ($row['daftar_formal'] ?? ''));

        return $lem !== '' ? $lem : null;
    }

    public static function recordCheckAttempt(PDO $db, string $noWa62, ?string $ip): void
    {
        $ipHash = $ip !== null && $ip !== '' ? hash('sha256', $ip) : null;
        $stmt = $db->prepare(
            'INSERT INTO mybeddian___nis_check_attempt (no_wa, ip_hash) VALUES (?, ?)'
        );
        $stmt->execute([$noWa62, $ipHash]);
    }

    public static function isCheckRateLimited(PDO $db, string $noWa62, int $maxPerHour = 10): bool
    {
        $stmt = $db->prepare(
            'SELECT COUNT(*) AS c FROM mybeddian___nis_check_attempt
             WHERE no_wa = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)'
        );
        $stmt->execute([$noWa62]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $count = (int) ($row['c'] ?? 0);

        return $count >= $maxPerHour;
    }

    public static function hasPendingPengajuan(PDO $db, string $nikNorm, string $noWa62): bool
    {
        return self::findPendingPengajuan($db, $nikNorm, $noWa62) !== null;
    }

    /**
     * Pengajuan aktif (belum selesai/ditolak) untuk NIK + WA yang sama.
     *
     * @return array<string, mixed>|null
     */
    public static function findPendingPengajuan(PDO $db, string $nikNorm, string $noWa62): ?array
    {
        $stmt = $db->prepare(
            "SELECT id, nama, nik, tanggal_lahir, no_wa, status, path_file
             FROM mybeddian___nis_pengajuan
             WHERE nik = ? AND no_wa = ?
             AND status IN (?, ?, ?)
             ORDER BY id DESC
             LIMIT 1"
        );
        $stmt = $db->prepare(
            "SELECT id, nama, nik, tanggal_lahir, no_wa, status, path_file
             FROM mybeddian___nis_pengajuan
             WHERE nik = ? AND no_wa = ?
             AND status IN (?, ?, ?)
             ORDER BY id DESC
             LIMIT 1"
        );
        $stmt->execute([
            $nikNorm,
            $noWa62,
            self::STATUS_MENUNGGU_KK,
            self::STATUS_MENUNGGU_WA,
            self::STATUS_MENUNGGU_REVIEW,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row !== false ? $row : null;
    }
}
