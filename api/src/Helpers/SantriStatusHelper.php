<?php

namespace App\Helpers;

use PDO;

class SantriStatusHelper
{
    /** Enum status santri tetap (tanpa tabel master). */
    public const ALLOWED = [
        'Mukim',
        'Boyong',
        'Khoriji',
        'Guru Tugas',
        'Pengurus',
        'Alumni',
    ];

    public static function allowedList(): array
    {
        return self::ALLOWED;
    }

    /**
     * Normalisasi label ke enum kanonis, atau null jika tidak dikenal / kosong.
     */
    public static function normalize(?string $statusSantri): ?string
    {
        $raw = trim((string) $statusSantri);
        if ($raw === '') {
            return null;
        }
        foreach (self::ALLOWED as $allowed) {
            if (strcasecmp($raw, $allowed) === 0) {
                return $allowed;
            }
        }

        return null;
    }

    /**
     * Ekspresi SQL label status aktif: histori terbuka, fallback kolom santri.
     */
    public static function statusSelectSql(string $statusAlias = 'st', string $santriAlias = 's'): string
    {
        return "COALESCE(NULLIF(TRIM({$statusAlias}.status_santri), ''), NULLIF(TRIM({$santriAlias}.status_santri), ''), '')";
    }

    /**
     * JOIN histori status aktif. Alias `$statusAlias` memakai baris santri___status
     * (kolom status_santri). Kategori Banin/Banat ambil dari daerah, bukan status.
     */
    public static function currentStatusJoinSql(string $santriAlias = 's', string $statusAlias = 'st', string $historyAlias = 'ss'): string
    {
        // Satu JOIN sebagai $statusAlias agar SELECT st.status_santri tetap jalan.
        // Jika historyAlias beda, alias ganda ke baris yang sama (BC query lama yang pakai ss.).
        $join = "
            LEFT JOIN santri___status {$statusAlias}
                ON {$statusAlias}.id_santri = {$santriAlias}.id
                AND {$statusAlias}.sampai IS NULL
                AND {$statusAlias}.id = (
                    SELECT MAX(ss2.id) FROM santri___status ss2
                    WHERE ss2.id_santri = {$santriAlias}.id AND ss2.sampai IS NULL
                )
        ";
        if ($historyAlias !== $statusAlias) {
            $join .= "
            LEFT JOIN santri___status {$historyAlias}
                ON {$historyAlias}.id = {$statusAlias}.id
            ";
        }

        return $join;
    }

    /**
     * Label status aktif + kategori display (dari daerah/gender, bukan master status).
     *
     * @return array{status_santri: string, kategori: string}
     */
    public static function currentStatusLabels(PDO $db, int $idSantri): array
    {
        $sql = 'SELECT COALESCE(ss.status_santri, s.status_santri, \'\') AS status_santri,
                COALESCE(d.kategori, \'\') AS kategori, s.gender
            FROM santri s
            LEFT JOIN santri___status ss ON ss.id_santri = s.id AND ss.sampai IS NULL
                AND ss.id = (SELECT MAX(ss2.id) FROM santri___status ss2 WHERE ss2.id_santri = s.id AND ss2.sampai IS NULL)
            LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
            LEFT JOIN daerah d ON d.id = dk.id_daerah
            WHERE s.id = ? LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute([$idSantri]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];

        $kategori = trim((string) ($row['kategori'] ?? ''));
        if ($kategori === '') {
            $kategori = self::kategoriFromGender($row['gender'] ?? null) ?? '';
        }

        return [
            'status_santri' => trim((string) ($row['status_santri'] ?? '')),
            'kategori' => $kategori,
        ];
    }

    /** Status aktif «Boyong» — tidak boleh akses portal santri myBeddien. */
    public static function isBoyong(PDO $db, int $idSantri): bool
    {
        if ($idSantri <= 0) {
            return false;
        }
        $labels = self::currentStatusLabels($db, $idSantri);
        if (strtolower(trim($labels['status_santri'])) === 'boyong') {
            return true;
        }

        try {
            $stmt = $db->prepare(
                'SELECT 1 FROM santri___status ss
                 WHERE ss.id_santri = ? AND ss.sampai IS NULL
                   AND LOWER(TRIM(ss.status_santri)) = \'boyong\'
                 LIMIT 1'
            );
            $stmt->execute([$idSantri]);
            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** Banin/Banat dari gender (L/P) — untuk display/domisili, bukan harga status. */
    public static function kategoriFromGender(?string $gender): ?string
    {
        $gender = trim((string) $gender);
        if ($gender === '') {
            return null;
        }
        $first = strtoupper(substr($gender, 0, 1));
        if ($first === 'L') {
            return 'Banin';
        }
        if ($first === 'P') {
            return 'Banat';
        }

        return null;
    }

    /**
     * @deprecated Gunakan normalize(). Tetap ada agar call site lama tidak fatal saat deploy bertahap.
     */
    public static function resolveStatusId(PDO $db, ?string $statusSantri, ?string $kategori = null): ?int
    {
        // Tidak ada lagi ID master. Call site harus pindah ke applyCurrentStatus(string).
        return null;
    }

    /**
     * Pastikan santri punya status aktif.
     * Jika $preferredStatus diisi (enum valid), set ke itu (ganti bila beda).
     * Default Mukim bila belum ada status.
     * @return string status kanonis yang aktif
     */
    public static function ensureCurrentStatus(
        PDO $db,
        int $idSantri,
        ?string $preferredStatus = null,
        ?string $preferredKategori = null,
        ?int $idPengurus = null
    ): string {
        if ($idSantri <= 0) {
            throw new \InvalidArgumentException('id_santri wajib');
        }

        $preferred = self::normalize($preferredStatus);
        $labels = self::currentStatusLabels($db, $idSantri);
        $existing = self::normalize($labels['status_santri'] ?? '');

        if ($preferred !== null) {
            if ($existing === $preferred) {
                $stmtSync = $db->prepare(
                    'UPDATE santri SET status_santri = ? WHERE id = ? AND (status_santri IS NULL OR status_santri <> ?)'
                );
                $stmtSync->execute([$preferred, $idSantri, $preferred]);
                return $preferred;
            }
            self::applyCurrentStatus($db, $idSantri, $preferred, $idPengurus);
            return $preferred;
        }

        if ($existing !== null) {
            $stmtSync = $db->prepare(
                'UPDATE santri SET status_santri = ? WHERE id = ? AND (status_santri IS NULL OR status_santri <> ?)'
            );
            $stmtSync->execute([$existing, $idSantri, $existing]);
            return $existing;
        }

        self::applyCurrentStatus($db, $idSantri, 'Mukim', $idPengurus);
        return 'Mukim';
    }

    /**
     * Set/ganti status aktif. statusSantri wajib (enum) — tidak boleh dikosongkan.
     */
    public static function applyCurrentStatus(PDO $db, int $idSantri, $statusSantri, ?int $idPengurus = null): void
    {
        if ($idSantri <= 0) {
            return;
        }

        // BC: call site lama sempat kirim id integer — abaikan & pastikan ada status.
        if (is_int($statusSantri) || (is_string($statusSantri) && ctype_digit(trim($statusSantri)))) {
            self::ensureCurrentStatus($db, $idSantri, null, null, $idPengurus);
            return;
        }

        $normalized = self::normalize(is_string($statusSantri) ? $statusSantri : null);
        if ($normalized === null) {
            self::ensureCurrentStatus($db, $idSantri, null, null, $idPengurus);
            return;
        }

        $stmtClose = $db->prepare('UPDATE santri___status SET sampai = CURRENT_TIMESTAMP WHERE id_santri = ? AND sampai IS NULL');
        $stmtClose->execute([$idSantri]);

        $stmtInsert = $db->prepare(
            'INSERT INTO santri___status (id_santri, status_santri, id_pengurus, dari, sampai, tanggal_dibuat)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)'
        );
        $stmtInsert->execute([$idSantri, $normalized, $idPengurus]);

        $stmtSantri = $db->prepare('UPDATE santri SET status_santri = ? WHERE id = ?');
        $stmtSantri->execute([$normalized, $idSantri]);
    }
}
