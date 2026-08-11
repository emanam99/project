<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Master jenis pelanggaran (per kategori) + log santri___pelanggaran dengan snapshot rombel/kamar.
 */
final class PelanggaranMasterDanSantriPelanggaran extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('pelanggaran')) {
            $this->execute(<<<'SQL'
CREATE TABLE `pelanggaran` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `kategori` enum('ringan','sedang','berat','buku_hitam') NOT NULL COMMENT 'Ringan, Sedang, Berat, Buku Hitam',
  `nama` varchar(255) NOT NULL,
  `urutan` smallint(6) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_pelanggaran_kategori_aktif` (`kategori`, `aktif`, `urutan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        }

        if (!$this->hasTable('santri___pelanggaran')) {
            $this->execute(<<<'SQL'
CREATE TABLE `santri___pelanggaran` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id_santri` int(11) NOT NULL,
  `id_pelanggaran` int(11) NOT NULL,
  `catatan` text DEFAULT NULL,
  `id_rombel_diniyah` int(11) DEFAULT NULL COMMENT 'Snapshot santri.id_diniyah',
  `id_rombel_formal` int(11) DEFAULT NULL COMMENT 'Snapshot santri.id_formal',
  `id_kamar` int(11) DEFAULT NULL COMMENT 'Snapshot santri.id_kamar',
  `id_pengurus` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_santri_pelanggaran_santri_tgl` (`id_santri`, `tanggal_dibuat`),
  KEY `idx_santri_pelanggaran_pelanggaran` (`id_pelanggaran`),
  KEY `idx_santri_pelanggaran_pengurus` (`id_pengurus`),
  CONSTRAINT `fk_santri_pelanggaran_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_pelanggaran_master` FOREIGN KEY (`id_pelanggaran`) REFERENCES `pelanggaran` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_pelanggaran_rombel_diniyah` FOREIGN KEY (`id_rombel_diniyah`) REFERENCES `lembaga___rombel` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_pelanggaran_rombel_formal` FOREIGN KEY (`id_rombel_formal`) REFERENCES `lembaga___rombel` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_pelanggaran_kamar` FOREIGN KEY (`id_kamar`) REFERENCES `daerah___kamar` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_pelanggaran_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        }

        $row = $this->fetchRow('SELECT COUNT(*) AS c FROM pelanggaran');
        if ($row && (int) $row['c'] === 0) {
            $this->execute(<<<'SQL'
INSERT INTO `pelanggaran` (`kategori`, `nama`, `urutan`, `aktif`) VALUES
('ringan', 'Terlambat kegiatan', 1, 1),
('ringan', 'Tidak membawa perlengkapan wajib', 2, 1),
('sedang', 'Bolos kelas tanpa keterangan', 1, 1),
('sedang', 'Melanggar aturan asrama', 2, 1),
('berat', 'Berkelahi', 1, 1),
('berat', 'Membawa barang terlarang', 2, 1),
('buku_hitam', 'Pelanggaran berat berulang', 1, 1),
('buku_hitam', 'Tindakan merugikan pesantren', 2, 1)
SQL);
        }
    }

    public function down(): void
    {
        if ($this->hasTable('santri___pelanggaran')) {
            $this->execute('DROP TABLE IF EXISTS `santri___pelanggaran`');
        }
        if ($this->hasTable('pelanggaran')) {
            $this->execute('DROP TABLE IF EXISTS `pelanggaran`');
        }
    }
}
