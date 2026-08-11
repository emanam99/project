<?php

namespace App\Helpers;

use PDO;

class SantriStatusHelper
{
    public static function currentStatusJoinSql(string $santriAlias = 's', string $statusAlias = 'st', string $historyAlias = 'ss'): string
    {
        // Bila >1 baris «buka» (sampai IS NULL) per santri, JOIN lama menduplikasi baris santri.
        // Ambil satu baris riwayat: id terbesar (paling baru).
        return "
            LEFT JOIN santri___status {$historyAlias}
                ON {$historyAlias}.id_santri = {$santriAlias}.id
                AND {$historyAlias}.sampai IS NULL
                AND {$historyAlias}.id = (
                    SELECT MAX(ss2.id) FROM santri___status ss2
                    WHERE ss2.id_santri = {$santriAlias}.id AND ss2.sampai IS NULL
                )
            LEFT JOIN status {$statusAlias}
                ON {$statusAlias}.id = {$historyAlias}.id_status
        ";
    }

    /**
     * Label status & kategori aktif santri (master status + fallback kategori dari daerah kamar).
     *
     * @return array{status_santri: string, kategori: string}
     */
    public static function currentStatusLabels(PDO $db, int $idSantri): array
    {
        $sql = 'SELECT COALESCE(st.status_santri, \'\') AS status_santri,
                COALESCE(st.kategori, d.kategori, \'\') AS kategori
            FROM santri s
            LEFT JOIN santri___status ss ON ss.id_santri = s.id AND ss.sampai IS NULL
                AND ss.id = (SELECT MAX(ss2.id) FROM santri___status ss2 WHERE ss2.id_santri = s.id AND ss2.sampai IS NULL)
            LEFT JOIN status st ON st.id = ss.id_status
            LEFT JOIN daerah___kamar dk ON dk.id = s.id_kamar
            LEFT JOIN daerah d ON d.id = dk.id_daerah
            WHERE s.id = ? LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute([$idSantri]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];

        return [
            'status_santri' => trim((string) ($row['status_santri'] ?? '')),
            'kategori' => trim((string) ($row['kategori'] ?? '')),
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

        // Data kotor: lebih dari satu baris «buka» — tolak jika salah satunya Boyong
        try {
            $stmt = $db->prepare(
                'SELECT 1 FROM santri___status ss
                 INNER JOIN status st ON st.id = ss.id_status
                 WHERE ss.id_santri = ? AND ss.sampai IS NULL
                   AND LOWER(TRIM(st.status_santri)) = \'boyong\'
                 LIMIT 1'
            );
            $stmt->execute([$idSantri]);
            return (bool) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function resolveStatusId(PDO $db, ?string $statusSantri, ?string $kategori): ?int
    {
        $statusSantri = trim((string) $statusSantri);
        $kategori = trim((string) $kategori);
        if ($statusSantri === '' || $kategori === '') {
            return null;
        }

        $stmt = $db->prepare('SELECT id FROM status WHERE status_santri = ? AND kategori = ? LIMIT 1');
        $stmt->execute([$statusSantri, $kategori]);
        $id = $stmt->fetchColumn();
        if ($id !== false) {
            return (int) $id;
        }

        $stmt = $db->prepare('INSERT INTO status (status_santri, kategori, status, tanggal_dibuat) VALUES (?, ?, "aktif", CURRENT_TIMESTAMP)');
        $stmt->execute([$statusSantri, $kategori]);
        return (int) $db->lastInsertId();
    }

    public static function applyCurrentStatus(PDO $db, int $idSantri, ?int $idStatus, ?int $idPengurus = null): void
    {
        $stmtClose = $db->prepare('UPDATE santri___status SET sampai = CURRENT_TIMESTAMP WHERE id_santri = ? AND sampai IS NULL');
        $stmtClose->execute([$idSantri]);

        if ($idStatus !== null) {
            $stmtInsert = $db->prepare(
                'INSERT INTO santri___status (id_santri, id_status, id_pengurus, dari, sampai, tanggal_dibuat)
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)'
            );
            $stmtInsert->execute([$idSantri, $idStatus, $idPengurus]);
        }

        $stmtSantri = $db->prepare('UPDATE santri SET id_status = ? WHERE id = ?');
        $stmtSantri->execute([$idStatus, $idSantri]);
    }
}
