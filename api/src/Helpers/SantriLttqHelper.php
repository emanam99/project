<?php

namespace App\Helpers;

use PDO;

/**
 * Helper riwayat & JOIN LTTQ santri (tabel lttq_tingkatan, santri___lttq).
 */
class SantriLttqHelper
{
    public static function joinSql(string $santriAlias = 's'): string
    {
        return 'LEFT JOIN lttq_tingkatan lt ON lt.id = ' . $santriAlias . '.id_lttq_tingkatan';
    }

    /** Kolom alias kompatibel UI lama (lttq, kelas_lttq, kel_lttq). */
    public static function selectAliasSql(): string
    {
        return 's.id_lttq_tingkatan,
            lt.tingkatan AS lttq,
            CASE
                WHEN lt.kelompok IS NOT NULL AND TRIM(lt.kelompok) LIKE \'%-%\'
                    THEN TRIM(SUBSTRING_INDEX(lt.kelompok, \'-\', 1))
                ELSE COALESCE(TRIM(lt.kelompok), \'\')
            END AS kelas_lttq,
            CASE
                WHEN lt.kelompok IS NOT NULL AND TRIM(lt.kelompok) LIKE \'%-%\'
                    THEN TRIM(SUBSTRING_INDEX(lt.kelompok, \'-\', -1))
                ELSE \'\'
            END AS kel_lttq,
            lt.kelompok AS lttq_kelompok';
    }

    public static function appendLttqRiwayat(
        PDO $db,
        int $id_santri,
        int $id_lttq_tingkatan,
        string $tahun_ajaran,
        int $id_pengurus,
        ?string $nim = null
    ): void {
        if ($id_pengurus <= 0) {
            throw new \InvalidArgumentException('id_pengurus wajib diisi saat mengubah tingkatan LTTQ.');
        }
        $tahun_ajaran = trim($tahun_ajaran);
        if ($tahun_ajaran === '') {
            return;
        }
        $stmt = $db->prepare('
            INSERT IGNORE INTO santri___lttq (id_lttq_tingkatan, id_santri, nim, tahun_ajaran, id_pengurus, tanggal_dibuat)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ');
        $stmt->execute([$id_lttq_tingkatan, $id_santri, $nim, $tahun_ajaran, $id_pengurus]);
    }

    public static function getDefaultTahunAjaran(PDO $db, string $kategori = 'hijriyah'): ?string
    {
        return SantriRombelHelper::getDefaultTahunAjaran($db, $kategori);
    }

    /** @return int|null id_lttq_tingkatan dari tingkatan program UWABA (ex kolom lttq) */
    public static function resolveIdByTingkatan(PDO $db, ?string $tingkatan, ?string $kelompok = null): ?int
    {
        $tingkatan = trim((string) $tingkatan);
        if ($tingkatan === '') {
            return null;
        }
        $kelompok = $kelompok !== null ? trim($kelompok) : '';
        $stmt = $db->prepare('
            SELECT id FROM lttq_tingkatan
            WHERE lembaga_id = \'LTTQ\'
              AND COALESCE(TRIM(tingkatan), \'\') = ?
              AND COALESCE(TRIM(kelompok), \'\') = ?
            LIMIT 1
        ');
        $stmt->execute([$tingkatan, $kelompok]);
        $id = $stmt->fetchColumn();

        return $id !== false && $id !== null && (int) $id > 0 ? (int) $id : null;
    }
}
