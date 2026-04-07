<?php

namespace App\Helpers;

use PDO;

/**
 * Helper untuk riwayat kamar santri (tabel santri___kamar).
 * Setiap update santri yang mengubah id_kamar menulis riwayat.
 * id_pengurus: pengurus yang mencatatkan; NULL = santri sendiri (mis. aplikasi daftar).
 */
class SantriKamarHelper
{
    /**
     * Sisipkan riwayat ke santri___kamar. id_pengurus opsional (null = perubahan oleh santri).
     * Duplikat (id_santri, id_kamar, tahun_ajaran) diabaikan (INSERT IGNORE).
     *
     * @param PDO $db
     * @param int $id_santri santri.id
     * @param int $id_kamar daerah___kamar.id
     * @param string $tahun_ajaran harus ada di master tahun_ajaran
     * @param int|null $id_pengurus pengurus.id, atau null jika perubahan oleh santri (self-service)
     * @param string|null $status_santri snapshot dari santri.status_santri
     * @param string|null $kategori snapshot dari santri.kategori
     */
    public static function appendKamarRiwayat(
        PDO $db,
        int $id_santri,
        int $id_kamar,
        string $tahun_ajaran,
        ?int $id_pengurus,
        ?string $status_santri = null,
        ?string $kategori = null
    ): void {
        if ($id_pengurus !== null && $id_pengurus <= 0) {
            throw new \InvalidArgumentException('id_pengurus tidak valid (harus positif atau dikosongkan untuk perubahan oleh santri).');
        }
        $tahun_ajaran = trim($tahun_ajaran);
        if ($tahun_ajaran === '') {
            return;
        }
        $stmt = $db->prepare("
            INSERT IGNORE INTO santri___kamar (id_kamar, id_santri, tahun_ajaran, id_pengurus, status_santri, kategori, tanggal_dibuat)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ");
        $stmt->execute([
            $id_kamar,
            $id_santri,
            $tahun_ajaran,
            $id_pengurus,
            $status_santri !== null ? trim($status_santri) : null,
            $kategori !== null ? trim($kategori) : null
        ]);
    }
}
