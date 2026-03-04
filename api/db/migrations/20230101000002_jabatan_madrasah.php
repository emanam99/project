<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Jabatan, madrasah. Semua definisi inline di PHP (tanpa baca file SQL).
 * FK ke lembaga, alamat, pengurus — jalankan dengan FOREIGN_KEY_CHECKS=0 (pengurus ada di migrasi 03).
 */
final class JabatanMadrasah extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // Pastikan tabel dari migrasi 001 pakai utf8mb4_unicode_ci agar FK jabatan->lembaga valid
        foreach (['lembaga', 'role', 'alamat'] as $t) {
            if ($this->hasTable($t)) {
                $this->execute("ALTER TABLE `{$t}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }
        }

        if (!$this->hasTable('jabatan')) {
            $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `jabatan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama` varchar(255) NOT NULL,
  `kategori` enum('struktural','diniyah','formal') DEFAULT 'struktural',
  `lembaga_id` varchar(50) DEFAULT NULL,
  `deskripsi` text DEFAULT NULL,
  `urutan` int(11) DEFAULT 0,
  `status` enum('aktif','nonaktif') DEFAULT 'aktif',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_kategori` (`kategori`),
  KEY `idx_lembaga_id` (`lembaga_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_jabatan_lembaga` FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        }

        if (!$this->hasTable('madrasah')) {
            // FK ke pengurus ditambah di migrasi 003a (pengurus baru ada di migrasi 003)
            $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `madrasah` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `identitas` varchar(100) DEFAULT NULL COMMENT 'Nomor identitas (NSPN/NSM/dll)',
  `nama` varchar(255) NOT NULL COMMENT 'Nama madrasah / pesantren',
  `kategori` enum('Madrasah','Pesantren','Yayasan','Sekolah','Lainnya') DEFAULT NULL,
  `id_alamat` varchar(50) DEFAULT NULL COMMENT 'FK ke alamat.id',
  `dusun` varchar(255) DEFAULT NULL,
  `rt` varchar(10) DEFAULT NULL,
  `rw` varchar(10) DEFAULT NULL,
  `nama_pengasuh` varchar(255) DEFAULT NULL,
  `id_pengasuh` int(7) DEFAULT NULL COMMENT 'FK ke pengurus.id',
  `no_pengasuh` varchar(20) DEFAULT NULL,
  `nama_pjgt` varchar(255) DEFAULT NULL,
  `id_pjgt` int(7) DEFAULT NULL COMMENT 'FK ke pengurus.id',
  `no_pjgt` varchar(20) DEFAULT NULL,
  `tpq` tinyint(1) NOT NULL DEFAULT 0,
  `ula` tinyint(1) NOT NULL DEFAULT 0,
  `wustha` tinyint(1) NOT NULL DEFAULT 0,
  `ulya` tinyint(1) NOT NULL DEFAULT 0,
  `ma_had_ali` tinyint(1) NOT NULL DEFAULT 0,
  `kurikulum` enum('Depag','Diniyah (Mandiri)') DEFAULT NULL,
  `jumlah_murid` int(11) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_madrasah_kategori` (`kategori`),
  KEY `idx_madrasah_id_alamat` (`id_alamat`),
  KEY `idx_madrasah_id_pengasuh` (`id_pengasuh`),
  KEY `idx_madrasah_id_pjgt` (`id_pjgt`),
  CONSTRAINT `fk_madrasah_alamat` FOREIGN KEY (`id_alamat`) REFERENCES `alamat` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS madrasah');
        $this->execute('DROP TABLE IF EXISTS jabatan');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
