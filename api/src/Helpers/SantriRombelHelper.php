<?php

namespace App\Helpers;

use PDO;

/**
 * Helper untuk riwayat rombel santri (tabel santri___rombel).
 * Setiap insert/update santri yang mengubah id_diniyah atau id_formal harus menyisakan riwayat
 * dengan id_pengurus wajib (siapa yang melakukan perubahan).
 */
class SantriRombelHelper
{
    /**
     * Sisipkan riwayat ke santri___rombel. id_pengurus wajib (tolak jika tidak disertakan).
     * Duplikat (id_santri, id_rombel, tahun_ajaran) diabaikan (INSERT IGNORE).
     *
     * @param PDO $db
     * @param int $id_santri santri.id
     * @param int $id_rombel lembaga___rombel.id
     * @param string $tahun_ajaran harus ada di master tahun_ajaran
     * @param int $id_pengurus pengurus.id — wajib (siapa yang melakukan update)
     * @param string|null $nim NIM opsional
     * @throws \InvalidArgumentException jika id_pengurus tidak valid (0 atau negatif)
     */
    public static function appendRombelRiwayat(
        PDO $db,
        int $id_santri,
        int $id_rombel,
        string $tahun_ajaran,
        int $id_pengurus,
        ?string $nim = null
    ): void {
        if ($id_pengurus <= 0) {
            throw new \InvalidArgumentException('id_pengurus wajib diisi (siapa yang melakukan perubahan rombel).');
        }
        $tahun_ajaran = trim($tahun_ajaran);
        if ($tahun_ajaran === '') {
            return;
        }
        $stmt = $db->prepare("
            INSERT IGNORE INTO santri___rombel (id_rombel, id_santri, nim, tahun_ajaran, id_pengurus, tanggal_dibuat)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ");
        $stmt->execute([$id_rombel, $id_santri, $nim, $tahun_ajaran, $id_pengurus]);
    }

    /**
     * Ambil tahun ajaran default dari master (satu terbaru per kategori).
     *
     * @param PDO $db
     * @param string $kategori 'hijriyah' atau 'masehi'
     * @return string|null contoh '1447-1448' atau '2024-2025'
     */
    public static function getDefaultTahunAjaran(PDO $db, string $kategori): ?string
    {
        $k = strtolower(trim($kategori));
        if (!in_array($k, ['hijriyah', 'masehi'], true)) {
            return null;
        }
        $stmt = $db->prepare("
            SELECT tahun_ajaran FROM tahun_ajaran
            WHERE kategori = ?
            ORDER BY dari DESC, tahun_ajaran DESC
            LIMIT 1
        ");
        $stmt->execute([$k]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (string) $row['tahun_ajaran'] : null;
    }
}
