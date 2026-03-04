<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * psb___registrasi, psb___transaksi, psb___registrasi_detail.
 */
final class PsbRegistrasi extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $statements = [
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___registrasi` (
  `tanggal_dibuat` timestamp NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tanggal_biodata_simpan` datetime DEFAULT NULL COMMENT 'Tanggal pertama kali biodata disimpan',
  `tanggal_berkas_lengkap` datetime DEFAULT NULL COMMENT 'Tanggal saat berkas lengkap',
  `tanggal_pembayaran_pertama` datetime DEFAULT NULL COMMENT 'Tanggal pembayaran pertama',
  `tanggal_diverifikasi` datetime DEFAULT NULL COMMENT 'Tanggal diverifikasi',
  `id_pengurus_verifikasi` int(11) DEFAULT NULL COMMENT 'Pengurus verifikasi',
  `tanggal_aktif_pondok` datetime DEFAULT NULL COMMENT 'Tanggal aktif di pondok',
  `id_pengurus_aktif` int(11) DEFAULT NULL COMMENT 'Pengurus yang mengaktifkan',
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) NOT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `status_pendaftar` varchar(50) DEFAULT NULL,
  `status_santri` varchar(50) DEFAULT NULL,
  `daftar_formal` varchar(50) DEFAULT NULL,
  `status_murid` varchar(255) DEFAULT NULL,
  `prodi` varchar(255) DEFAULT NULL COMMENT 'Program studi',
  `gelombang` varchar(50) DEFAULT NULL COMMENT 'Gelombang pendaftaran (1, 2, 3, dst)',
  `daftar_diniyah` varchar(255) DEFAULT NULL,
  `wajib` int(11) DEFAULT NULL,
  `bayar` int(11) DEFAULT NULL,
  `kurang` int(11) DEFAULT NULL,
  `admin` varchar(255) DEFAULT NULL,
  `id_admin` int(7) DEFAULT NULL COMMENT 'ID admin yang membuat/mengupdate registrasi',
  `pc` varchar(255) DEFAULT NULL,
  `keterangan_status` varchar(255) DEFAULT NULL,
  `rincian_true` varchar(255) DEFAULT NULL,
  `rincian_false` varchar(255) DEFAULT NULL,
  `tahun_hijriyah` varchar(50) DEFAULT NULL,
  `tahun_masehi` varchar(50) DEFAULT NULL,
  `madrasah` varchar(255) DEFAULT NULL COMMENT 'Jenis madrasah',
  `nama_madrasah` varchar(255) DEFAULT NULL COMMENT 'Nama madrasah',
  `alamat_madrasah` varchar(255) DEFAULT NULL COMMENT 'Alamat madrasah',
  `lulus_madrasah` year(4) DEFAULT NULL COMMENT 'Tahun lulus madrasah',
  `sekolah` varchar(255) DEFAULT NULL COMMENT 'Jenis sekolah',
  `nama_sekolah` varchar(255) DEFAULT NULL COMMENT 'Nama sekolah',
  `alamat_sekolah` varchar(255) DEFAULT NULL COMMENT 'Alamat sekolah',
  `lulus_sekolah` year(4) DEFAULT NULL COMMENT 'Tahun lulus sekolah',
  `npsn` varchar(50) DEFAULT NULL COMMENT 'Nomor Pokok Sekolah Nasional',
  `nsm` varchar(50) DEFAULT NULL COMMENT 'Nomor Statistik Madrasah',
  `jurusan` varchar(255) DEFAULT NULL COMMENT 'Jurusan sekolah',
  `program_sekolah` varchar(255) DEFAULT NULL COMMENT 'Program sekolah',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_santri_tahun_hijriyah_tahun_masehi` (`id_santri`,`tahun_hijriyah`,`tahun_masehi`),
  KEY `id_santri` (`id_santri`),
  KEY `tahun_hijriyah` (`tahun_hijriyah`),
  KEY `tahun_masehi` (`tahun_masehi`),
  KEY `fk_psb_registrasi_id_admin` (`id_admin`),
  CONSTRAINT `fk_psb_registrasi__id_santri_v1` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_registrasi_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1611 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___transaksi` (
  `tanggal_dibuat` timestamp NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_payment` int(11) DEFAULT NULL COMMENT 'ID dari tabel payment (induk)',
  `id_registrasi` int(11) DEFAULT NULL,
  `id_santri` int(7) DEFAULT NULL COMMENT 'ID santri dari tabel santri (diambil dari psb___registrasi.id_santri)',
  `nominal` int(10) DEFAULT NULL,
  `via` varchar(50) NOT NULL DEFAULT 'Cash',
  `hijriyah` varchar(50) DEFAULT NULL,
  `masehi` date DEFAULT NULL,
  `admin` varchar(50) DEFAULT NULL,
  `id_admin` int(7) DEFAULT NULL COMMENT 'ID admin yang membuat transaksi',
  `pc` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_psb_transaksi__id_registrasi` (`id_registrasi`),
  KEY `fk_psb_transaksi_id_admin` (`id_admin`),
  KEY `fk_psb_transaksi_id_santri` (`id_santri`),
  KEY `fk_psb_transaksi_id_payment` (`id_payment`),
  CONSTRAINT `fk_psb_transaksi__id_registrasi` FOREIGN KEY (`id_registrasi`) REFERENCES `psb___registrasi` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_transaksi_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_transaksi_id_payment` FOREIGN KEY (`id_payment`) REFERENCES `payment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_transaksi_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2589 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `psb___registrasi_detail` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_registrasi` int(11) NOT NULL COMMENT 'ID registrasi PSB',
  `id_item` int(11) NOT NULL,
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total pembayaran yang sudah masuk untuk item ini (dihitung dari psb___transaksi)',
  `status_ambil` enum('belum_ambil','sudah_ambil') NOT NULL DEFAULT 'belum_ambil' COMMENT 'Status pengambilan item fisik: belum_ambil, sudah_ambil',
  `tanggal_ambil` datetime DEFAULT NULL COMMENT 'Tanggal pengambilan item fisik (NULL jika belum ambil)',
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan tambahan item',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang menambahkan/mengupdate detail',
  `admin` varchar(255) DEFAULT NULL COMMENT 'Nama admin',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_psb_registrasi_detail_id_registrasi` (`id_registrasi`),
  KEY `fk_psb_registrasi_detail_id_admin` (`id_admin`),
  KEY `idx_status_ambil` (`status_ambil`),
  KEY `fk_psb_registrasi_detail__id_item` (`id_item`),
  CONSTRAINT `fk_psb_registrasi_detail__id_item` FOREIGN KEY (`id_item`) REFERENCES `psb___item` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_registrasi_detail_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_psb_registrasi_detail_id_registrasi` FOREIGN KEY (`id_registrasi`) REFERENCES `psb___registrasi` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15258 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
        $this->execute('DROP TABLE IF EXISTS psb___registrasi_detail');
        $this->execute('DROP TABLE IF EXISTS psb___transaksi');
        $this->execute('DROP TABLE IF EXISTS psb___registrasi');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
