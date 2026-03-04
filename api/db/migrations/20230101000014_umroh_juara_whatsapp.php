<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * umroh___jamaah, umroh___tabungan, umroh___pengeluaran, umroh___pengeluaran___detail, santri___juara, whatsapp, whatsapp___pending.
 * umroh___tabungan butuh payment (08).
 */
final class UmrohJuaraWhatsapp extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $statements = [
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `umroh___jamaah` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `kode_jamaah` varchar(50) DEFAULT NULL COMMENT 'Kode unik jamaah (misal: UMR-001)',
  `nama_lengkap` varchar(255) NOT NULL COMMENT 'Nama lengkap jamaah',
  `gelar_awal` varchar(50) DEFAULT NULL,
  `gelar_akhir` varchar(50) DEFAULT NULL,
  `nik` varchar(20) DEFAULT NULL COMMENT 'NIK jamaah',
  `no_kk` varchar(20) DEFAULT NULL COMMENT 'Nomor Kartu Keluarga',
  `tempat_lahir` varchar(100) DEFAULT NULL,
  `tanggal_lahir` date DEFAULT NULL,
  `usia` int(3) DEFAULT NULL,
  `gender` enum('Laki-laki','Perempuan') DEFAULT NULL,
  `status_nikah` enum('Menikah','Belum Menikah','Cerai','Janda','Duda') DEFAULT NULL,
  `agama` varchar(50) DEFAULT 'Islam',
  `kewarganegaraan` varchar(50) DEFAULT 'Indonesia',
  `alamat` text DEFAULT NULL,
  `dusun` varchar(255) DEFAULT NULL,
  `rt` varchar(10) DEFAULT NULL,
  `rw` varchar(10) DEFAULT NULL,
  `desa` varchar(255) DEFAULT NULL,
  `kecamatan` varchar(255) DEFAULT NULL,
  `kabupaten` varchar(255) DEFAULT NULL,
  `provinsi` varchar(255) DEFAULT NULL,
  `kode_pos` varchar(10) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `no_telpon` varchar(20) DEFAULT NULL,
  `whatsapp` varchar(20) DEFAULT NULL,
  `no_paspor` varchar(50) DEFAULT NULL COMMENT 'Nomor paspor',
  `tanggal_terbit_paspor` date DEFAULT NULL,
  `tanggal_berlaku_paspor` date DEFAULT NULL,
  `tempat_terbit_paspor` varchar(255) DEFAULT NULL,
  `no_visa` varchar(50) DEFAULT NULL COMMENT 'Nomor visa umroh',
  `tanggal_terbit_visa` date DEFAULT NULL,
  `tanggal_berlaku_visa` date DEFAULT NULL,
  `paket_umroh` varchar(255) DEFAULT NULL COMMENT 'Nama paket umroh',
  `tanggal_keberangkatan` date DEFAULT NULL,
  `tanggal_kepulangan` date DEFAULT NULL,
  `maskapai` varchar(255) DEFAULT NULL,
  `hotel_mekah` varchar(255) DEFAULT NULL,
  `hotel_madinah` varchar(255) DEFAULT NULL,
  `kamar_mekah` varchar(50) DEFAULT NULL,
  `kamar_madinah` varchar(50) DEFAULT NULL,
  `nama_ayah` varchar(255) DEFAULT NULL,
  `nama_ibu` varchar(255) DEFAULT NULL,
  `nama_pasangan` varchar(255) DEFAULT NULL,
  `hubungan_pasangan` varchar(50) DEFAULT NULL COMMENT 'Istri/Suami',
  `jumlah_anak` int(3) DEFAULT 0,
  `pekerjaan` varchar(255) DEFAULT NULL,
  `pendidikan_terakhir` varchar(100) DEFAULT NULL,
  `penghasilan` varchar(50) DEFAULT NULL,
  `golongan_darah` enum('A','B','AB','O') DEFAULT NULL,
  `riwayat_penyakit` text DEFAULT NULL,
  `alergi` text DEFAULT NULL,
  `obat_rutin` text DEFAULT NULL,
  `kontak_darurat` varchar(255) DEFAULT NULL COMMENT 'Nama kontak darurat',
  `telpon_darurat` varchar(20) DEFAULT NULL,
  `hubungan_darurat` varchar(50) DEFAULT NULL COMMENT 'Hubungan dengan kontak darurat',
  `target_tabungan` decimal(15,2) DEFAULT 0.00 COMMENT 'Target tabungan umroh',
  `total_tabungan` decimal(15,2) DEFAULT 0.00 COMMENT 'Total tabungan yang sudah terkumpul',
  `status_pembayaran` enum('Belum Lunas','Lunas','Kredit') DEFAULT 'Belum Lunas',
  `status` enum('Aktif','Nonaktif','Selesai','Batal') DEFAULT 'Aktif',
  `status_keberangkatan` enum('Belum Berangkat','Sudah Berangkat','Sudah Pulang','Batal') DEFAULT 'Belum Berangkat',
  `keterangan` text DEFAULT NULL,
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang membuat data',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_kode_jamaah` (`kode_jamaah`),
  UNIQUE KEY `unique_nik` (`nik`),
  KEY `idx_nama_lengkap` (`nama_lengkap`),
  KEY `idx_status` (`status`),
  KEY `idx_status_keberangkatan` (`status_keberangkatan`),
  KEY `idx_status_pembayaran` (`status_pembayaran`),
  KEY `idx_paket_umroh` (`paket_umroh`),
  KEY `idx_tanggal_keberangkatan` (`tanggal_keberangkatan`),
  KEY `fk_umroh_jamaah_id_admin` (`id_admin`),
  CONSTRAINT `fk_umroh_jamaah_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `umroh___tabungan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_payment` int(11) DEFAULT NULL COMMENT 'ID dari tabel payment (induk)',
  `id_jamaah` int(11) NOT NULL COMMENT 'ID jamaah pemilik tabungan',
  `kode_transaksi` varchar(50) DEFAULT NULL COMMENT 'Kode transaksi unik (misal: TAB-UMR-001)',
  `jenis` enum('Setoran','Penarikan','Koreksi') NOT NULL DEFAULT 'Setoran' COMMENT 'Jenis transaksi tabungan',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Nominal transaksi',
  `saldo_sebelum` decimal(15,2) DEFAULT 0.00 COMMENT 'Saldo sebelum transaksi',
  `saldo_sesudah` decimal(15,2) DEFAULT 0.00 COMMENT 'Saldo setelah transaksi',
  `metode_pembayaran` enum('Cash','Transfer','QRIS','Lainnya') NOT NULL DEFAULT 'Cash' COMMENT 'Metode pembayaran',
  `bank` varchar(100) DEFAULT NULL COMMENT 'Nama bank jika transfer',
  `no_rekening` varchar(50) DEFAULT NULL COMMENT 'Nomor rekening jika transfer',
  `bukti_pembayaran` varchar(255) DEFAULT NULL COMMENT 'Path/file bukti pembayaran',
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan transaksi',
  `hijriyah` varchar(50) DEFAULT NULL COMMENT 'Tanggal hijriyah',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang membuat transaksi',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_kode_transaksi` (`kode_transaksi`),
  KEY `fk_umroh_tabungan_id_jamaah` (`id_jamaah`),
  KEY `fk_umroh_tabungan_id_admin` (`id_admin`),
  KEY `idx_jenis` (`jenis`),
  KEY `idx_metode_pembayaran` (`metode_pembayaran`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  KEY `fk_umroh_tabungan_id_payment` (`id_payment`),
  CONSTRAINT `fk_umroh_tabungan_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_umroh_tabungan_id_jamaah` FOREIGN KEY (`id_jamaah`) REFERENCES `umroh___jamaah` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_umroh_tabungan_id_payment` FOREIGN KEY (`id_payment`) REFERENCES `payment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `umroh___pengeluaran` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `kode_pengeluaran` varchar(50) DEFAULT NULL COMMENT 'Kode unik pengeluaran (misal: PGL-UMR-001)',
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan pengeluaran',
  `kategori` enum('Tiket Pesawat','Hotel','Visa','Transportasi','Makanan','Dokumentasi','Souvenir','Operasional','Lainnya') DEFAULT NULL COMMENT 'Kategori pengeluaran',
  `sumber_uang` enum('Cash','Transfer') NOT NULL DEFAULT 'Cash' COMMENT 'Sumber uang: Cash atau Transfer',
  `bank` varchar(100) DEFAULT NULL COMMENT 'Nama bank jika transfer',
  `no_rekening` varchar(50) DEFAULT NULL COMMENT 'Nomor rekening jika transfer',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang membuat pengeluaran',
  `id_admin_approve` int(11) DEFAULT NULL COMMENT 'ID admin yang meng-approve pengeluaran',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total nominal pengeluaran',
  `hijriyah` varchar(50) DEFAULT NULL COMMENT 'Tanggal hijriyah',
  `bukti_pengeluaran` varchar(255) DEFAULT NULL COMMENT 'Path/file bukti pengeluaran',
  `status` enum('Draft','Pending','Approved','Rejected','Cancelled') DEFAULT 'Draft' COMMENT 'Status pengeluaran',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tanggal_approve` timestamp NULL DEFAULT NULL COMMENT 'Tanggal approve pengeluaran',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_kode_pengeluaran` (`kode_pengeluaran`),
  KEY `fk_umroh_pengeluaran_id_admin` (`id_admin`),
  KEY `fk_umroh_pengeluaran_id_admin_approve` (`id_admin_approve`),
  KEY `idx_kategori` (`kategori`),
  KEY `idx_sumber_uang` (`sumber_uang`),
  KEY `idx_status` (`status`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_umroh_pengeluaran_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_umroh_pengeluaran_id_admin_approve` FOREIGN KEY (`id_admin_approve`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `umroh___pengeluaran___detail` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_pengeluaran` int(11) NOT NULL COMMENT 'ID pengeluaran',
  `item` varchar(255) NOT NULL COMMENT 'Nama item',
  `harga` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Harga satuan',
  `jumlah` int(11) NOT NULL DEFAULT 1 COMMENT 'Jumlah item',
  `satuan` varchar(50) DEFAULT NULL COMMENT 'Satuan (pcs, kg, dll)',
  `nominal` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total harga (harga * jumlah)',
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan item',
  `id_admin` int(11) DEFAULT NULL COMMENT 'ID admin yang menambahkan item detail',
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_umroh_pengeluaran_detail_id_pengeluaran` (`id_pengeluaran`),
  KEY `fk_umroh_pengeluaran_detail_id_admin` (`id_admin`),
  KEY `idx_item` (`item`),
  CONSTRAINT `fk_umroh_pengeluaran_detail_id_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_umroh_pengeluaran_detail_id_pengeluaran` FOREIGN KEY (`id_pengeluaran`) REFERENCES `umroh___pengeluaran` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `santri___juara` (
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) NOT NULL COMMENT 'ID Santri (FK ke santri.id)',
  `tahun_ajaran` varchar(20) DEFAULT NULL COMMENT 'Tahun Ajaran Hijriyah (contoh: 1446-1447)',
  `lembaga` varchar(50) DEFAULT NULL COMMENT 'Lembaga (FK ke lembaga.id)',
  `kelas` varchar(100) DEFAULT NULL COMMENT 'Kelas',
  `wali_kelas` varchar(255) DEFAULT NULL COMMENT 'Wali Kelas',
  `nilai` decimal(10,2) DEFAULT NULL COMMENT 'Nilai',
  `juara` varchar(50) DEFAULT NULL COMMENT 'Juara (1, 2, 3, Harapan, dll)',
  `keterangan` text DEFAULT NULL COMMENT 'Keterangan',
  PRIMARY KEY (`id`),
  KEY `idx_id_santri` (`id_santri`),
  KEY `idx_lembaga` (`lembaga`),
  KEY `idx_tahun_ajaran` (`tahun_ajaran`),
  CONSTRAINT `fk_santri_juara_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_santri_juara_lembaga` FOREIGN KEY (`lembaga`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) DEFAULT NULL COMMENT 'Santri (konteks) ketika tujuan=santri atau wali_santri',
  `id_pengurus` int(7) DEFAULT NULL COMMENT 'Pengurus sebagai PENERIMA (tujuan) ketika tujuan=pengurus',
  `tujuan` varchar(20) NOT NULL DEFAULT 'wali_santri' COMMENT 'pengurus=dikirim ke pengurus, santri=dikirim ke santri, wali_santri=dikirim ke wali (tetap id_santri)',
  `id_pengurus_pengirim` int(7) DEFAULT NULL COMMENT 'Pengurus yang memicu mengirim (manual); NULL = system',
  `kategori` varchar(80) NOT NULL DEFAULT 'custom' COMMENT 'verifikasi, biodata_terdaftar, berkas_lengkap, pembayaran_*, sudah_diverifikasi, custom',
  `sumber` varchar(50) NOT NULL DEFAULT 'system' COMMENT 'system=otomatis, daftar, uwaba, manage_users, auth, api_wa',
  `nomor_tujuan` varchar(20) NOT NULL COMMENT 'Nomor WA tujuan (62xxx)',
  `isi_pesan` text NOT NULL COMMENT 'Isi pesan yang dikirim',
  `punya_gambar` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 jika kirim dengan gambar (QR dll)',
  `status` varchar(20) NOT NULL DEFAULT 'terkirim' COMMENT 'terkirim, gagal',
  `response_message` varchar(500) DEFAULT NULL COMMENT 'Pesan dari API WA',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_whatsapp_id_santri` (`id_santri`),
  KEY `idx_whatsapp_id_pengurus` (`id_pengurus`),
  KEY `idx_whatsapp_tujuan` (`tujuan`),
  KEY `idx_whatsapp_id_pengurus_pengirim` (`id_pengurus_pengirim`),
  KEY `idx_whatsapp_kategori` (`kategori`),
  KEY `idx_whatsapp_sumber` (`sumber`),
  KEY `idx_whatsapp_created_at` (`created_at`),
  CONSTRAINT `fk_whatsapp_id_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_whatsapp_id_pengurus_pengirim` FOREIGN KEY (`id_pengurus_pengirim`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_whatsapp_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log pesan WhatsApp terkirim'
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `whatsapp___pending` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_santri` int(7) NOT NULL COMMENT 'Santri yang terkait',
  `kategori` varchar(80) NOT NULL DEFAULT 'biodata_terdaftar' COMMENT 'biodata_terdaftar, dll',
  `nomor_tujuan` varchar(20) NOT NULL COMMENT 'Nomor WA tujuan (62xxx)',
  `context_json` text NOT NULL COMMENT 'JSON: id, nama, nik, email untuk template',
  `log_options_json` text DEFAULT NULL COMMENT 'JSON: sumber, id_pengurus_pengirim',
  `send_after` datetime DEFAULT NULL COMMENT 'Kirim setelah waktu ini (3 detik setelah NIS ready)',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_wa_pending_id_santri` (`id_santri`),
  KEY `idx_wa_pending_send_after` (`send_after`),
  KEY `idx_wa_pending_kategori` (`kategori`),
  CONSTRAINT `fk_wa_pending_id_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Antrian notif WA menunggu kondisi (mis. NIS tersedia)'
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
        $this->execute('DROP TABLE IF EXISTS whatsapp___pending');
        $this->execute('DROP TABLE IF EXISTS whatsapp');
        $this->execute('DROP TABLE IF EXISTS santri___juara');
        $this->execute('DROP TABLE IF EXISTS umroh___pengeluaran___detail');
        $this->execute('DROP TABLE IF EXISTS umroh___pengeluaran');
        $this->execute('DROP TABLE IF EXISTS umroh___tabungan');
        $this->execute('DROP TABLE IF EXISTS umroh___jamaah');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
