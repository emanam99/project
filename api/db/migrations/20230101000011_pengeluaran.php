<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * pengeluaran___rencana, pengeluaran___rencana_detail, pengeluaran___rencana_file, pengeluaran___viewer, pengeluaran___komentar, pengeluaran, pengeluaran___detail, pemasukan.
 */
final class Pengeluaran extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $statements = [
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran___rencana` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan rencana pengeluaran',
  `kategori` enum('Bisyaroh','Acara','Pengadaan','Perbaikan','ATK','lainnya','Listrik','Wifi','Langganan') DEFAULT NULL COMMENT 'Kategori pengeluaran',
  `lembaga` varchar(20) DEFAULT NULL COMMENT 'Lembaga pengeluaran',
  `sumber_uang` enum('Cash','TF') NOT NULL DEFAULT 'Cash' COMMENT 'Sumber uang: Cash atau Transfer',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang membuat rencana',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total nominal rencana pengeluaran',
  `hijriyah` varchar(50) DEFAULT NULL COMMENT 'Tanggal hijriyah',
  `tahun_ajaran` varchar(20) DEFAULT NULL COMMENT 'Tahun ajaran',
  `ket` enum('pending','ditolak','di edit','di approve','draft') NOT NULL DEFAULT 'pending' COMMENT 'Status rencana: pending, ditolak, di edit, di approve, draft',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pengeluaran_rencana_id_admin` (`id_admin`),
  KEY `idx_ket` (`ket`),
  KEY `idx_kategori` (`kategori`),
  KEY `idx_lembaga` (`lembaga`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_pengeluaran_rencana_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_rencana_lembaga` FOREIGN KEY (`lembaga`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1241 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran___rencana_detail` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_pengeluaran_rencana` int(11) NOT NULL COMMENT 'ID rencana pengeluaran',
  `item` varchar(255) NOT NULL COMMENT 'Nama item',
  `harga` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Harga satuan',
  `jumlah` int(11) NOT NULL DEFAULT 1 COMMENT 'Jumlah item',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total harga (harga * jumlah)',
  `versi` int(11) NOT NULL DEFAULT 1 COMMENT 'Versi detail (untuk tracking edit)',
  `id_detail_asal` int(11) DEFAULT NULL COMMENT 'ID detail asal jika ini hasil edit (untuk tracking)',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang menambahkan item detail',
  `rejected` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Status penolakan detail: 0=tidak ditolak, 1=ditolak',
  `alasan_penolakan` text DEFAULT NULL COMMENT 'Alasan penolakan detail item',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_per_rencana_versi` (`id_pengeluaran_rencana`,`item`,`versi`),
  KEY `fk_pengeluaran_rencana_detail_id_rencana` (`id_pengeluaran_rencana`),
  KEY `fk_pengeluaran_rencana_detail_id_detail_asal` (`id_detail_asal`),
  KEY `fk_pengeluaran_rencana_detail_id_admin` (`id_admin`),
  KEY `idx_item` (`item`),
  KEY `idx_versi` (`versi`),
  KEY `idx_rejected` (`rejected`),
  CONSTRAINT `fk_pengeluaran_rencana_detail_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_rencana_detail_id_detail_asal` FOREIGN KEY (`id_detail_asal`) REFERENCES `pengeluaran___rencana_detail` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_rencana_detail_id_rencana` FOREIGN KEY (`id_pengeluaran_rencana`) REFERENCES `pengeluaran___rencana` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1740 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran___rencana_file` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_pengeluaran_rencana` int(11) NOT NULL COMMENT 'ID rencana pengeluaran',
  `nama_file` varchar(255) NOT NULL COMMENT 'Nama file asli saat upload',
  `nama_file_simpan` varchar(255) NOT NULL COMMENT 'Nama file yang disimpan di server',
  `path_file` varchar(500) NOT NULL COMMENT 'Path relatif file dari root upload',
  `tipe_file` varchar(50) DEFAULT NULL COMMENT 'MIME type file (image/jpeg, application/pdf, dll)',
  `ukuran_file` bigint(20) DEFAULT NULL COMMENT 'Ukuran file dalam bytes',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang meng-upload file',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pengeluaran_rencana_file_id_rencana` (`id_pengeluaran_rencana`),
  KEY `fk_pengeluaran_rencana_file_id_admin` (`id_admin`),
  KEY `idx_tipe_file` (`tipe_file`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_pengeluaran_rencana_file_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_rencana_file_id_rencana` FOREIGN KEY (`id_pengeluaran_rencana`) REFERENCES `pengeluaran___rencana` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran___viewer` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_rencana` int(11) NOT NULL COMMENT 'ID rencana pengeluaran yang dilihat',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang melihat rencana pengeluaran',
  `tanggal_dilihat` timestamp NOT NULL DEFAULT current_timestamp() COMMENT 'Waktu pertama kali melihat',
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Waktu terakhir melihat',
  `jumlah_view` int(11) NOT NULL DEFAULT 1 COMMENT 'Jumlah kali melihat (untuk tracking)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_rencana_admin` (`id_rencana`,`id_admin`),
  KEY `fk_pengeluaran_viewer_id_rencana` (`id_rencana`),
  KEY `fk_pengeluaran_viewer_id_admin` (`id_admin`),
  KEY `idx_tanggal_dilihat` (`tanggal_dilihat`),
  CONSTRAINT `fk_pengeluaran_viewer_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_viewer_id_rencana` FOREIGN KEY (`id_rencana`) REFERENCES `pengeluaran___rencana` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2593 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran___komentar` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_rencana` int(11) NOT NULL COMMENT 'ID rencana pengeluaran yang dikomentari',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang membuat komentar',
  `komentar` text NOT NULL COMMENT 'Isi komentar',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pengeluaran_komentar_id_rencana` (`id_rencana`),
  KEY `fk_pengeluaran_komentar_id_admin` (`id_admin`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_pengeluaran_komentar_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_komentar_id_rencana` FOREIGN KEY (`id_rencana`) REFERENCES `pengeluaran___rencana` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan pengeluaran',
  `kategori` enum('Bisyaroh','Acara','Pengadaan','Perbaikan','ATK','lainnya','Listrik','Wifi','Langganan') DEFAULT NULL COMMENT 'Kategori pengeluaran',
  `lembaga` varchar(20) DEFAULT NULL,
  `sumber_uang` enum('Cash','TF') NOT NULL DEFAULT 'Cash' COMMENT 'Sumber uang: Cash atau Transfer',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang membuat pengeluaran',
  `id_admin_approve` int(11) DEFAULT NULL COMMENT 'ID admin yang meng-approve pengeluaran',
  `id_penerima` int(11) DEFAULT NULL COMMENT 'ID penerima pengeluaran (referensi ke tabel pengurus.id)',
  `id_rencana` int(11) DEFAULT NULL COMMENT 'ID rencana pengeluaran asal',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total nominal pengeluaran',
  `hijriyah` varchar(50) DEFAULT NULL COMMENT 'Tanggal hijriyah',
  `tahun_ajaran` varchar(20) DEFAULT NULL COMMENT 'Tahun ajaran',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pengeluaran_id_admin` (`id_admin`),
  KEY `fk_pengeluaran_id_admin_approve` (`id_admin_approve`),
  KEY `fk_pengeluaran_id_rencana` (`id_rencana`),
  KEY `idx_kategori` (`kategori`),
  KEY `idx_lembaga` (`lembaga`),
  KEY `idx_sumber_uang` (`sumber_uang`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  KEY `fk_pengeluaran_id_penerima` (`id_penerima`),
  CONSTRAINT `fk_pengeluaran_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_id_admin_approve` FOREIGN KEY (`id_admin_approve`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_id_penerima` FOREIGN KEY (`id_penerima`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_id_rencana` FOREIGN KEY (`id_rencana`) REFERENCES `pengeluaran___rencana` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_lembaga` FOREIGN KEY (`lembaga`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1222 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengeluaran___detail` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_pengeluaran` int(11) NOT NULL COMMENT 'ID pengeluaran',
  `item` varchar(255) NOT NULL COMMENT 'Nama item',
  `harga` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Harga satuan',
  `jumlah` int(11) NOT NULL DEFAULT 1 COMMENT 'Jumlah item',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total harga (harga * jumlah)',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang menambahkan item detail',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pengeluaran_detail_id_pengeluaran` (`id_pengeluaran`),
  KEY `fk_pengeluaran_detail_id_admin` (`id_admin`),
  KEY `idx_item` (`item`),
  CONSTRAINT `fk_pengeluaran_detail_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengeluaran_detail_id_pengeluaran` FOREIGN KEY (`id_pengeluaran`) REFERENCES `pengeluaran` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1567 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pemasukan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan pemasukan',
  `kategori` enum('UWABA','Tunggakan','Khusus','PSB','Beasiswa','Lembaga','Lainnya','Cashback','BOS') NOT NULL DEFAULT 'Lainnya' COMMENT 'Kategori pemasukan',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang membuat pemasukan',
  `status` enum('Cash','Bank','Lainnya') NOT NULL DEFAULT 'Cash' COMMENT 'Status pembayaran: Cash, Bank, Lainnya',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Nominal pemasukan',
  `hijriyah` varchar(50) DEFAULT NULL COMMENT 'Tanggal hijriyah',
  `tahun_ajaran` varchar(20) DEFAULT NULL COMMENT 'Tahun ajaran',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_pemasukan_id_admin` (`id_admin`),
  KEY `idx_kategori` (`kategori`),
  KEY `idx_status` (`status`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_pemasukan_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=619 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
        ];

        foreach ($statements as $sql) {
            $this->execute($sql);
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS pemasukan');
        $this->execute('DROP TABLE IF EXISTS pengeluaran___detail');
        $this->execute('DROP TABLE IF EXISTS pengeluaran');
        $this->execute('DROP TABLE IF EXISTS pengeluaran___komentar');
        $this->execute('DROP TABLE IF EXISTS pengeluaran___viewer');
        $this->execute('DROP TABLE IF EXISTS pengeluaran___rencana_file');
        $this->execute('DROP TABLE IF EXISTS pengeluaran___rencana_detail');
        $this->execute('DROP TABLE IF EXISTS pengeluaran___rencana');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
