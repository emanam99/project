<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * users, santri, pengurus, pengurus___role, pengurus___jabatan, pengurus___subscription.
 * Semua definisi inline di PHP (tanpa baca file SQL).
 */
final class UsersSantriPengurus extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('SET SESSION innodb_strict_mode = 0');

        $stmts = $this->getCreateTableStatements();
        foreach ($stmts as $sql) {
            $this->execute($sql);
        }

        $this->execute('SET SESSION innodb_strict_mode = 1');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    private function getCreateTableStatements(): array
    {
        return [
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL COMMENT 'Untuk login',
  `password` varchar(255) NOT NULL COMMENT 'Password ter-hash',
  `no_wa` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `role` varchar(50) NOT NULL DEFAULT 'santri',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `no_wa_verified_at` timestamp NULL DEFAULT NULL,
  `remember_token` varchar(255) DEFAULT NULL,
  `tanggal_dibuat` timestamp NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_login_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_username` (`username`),
  KEY `idx_role` (`role`),
  KEY `idx_email` (`email`),
  KEY `idx_no_wa` (`no_wa`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_last_login_at` (`last_login_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL,
            $this->sqlSantri(),
            $this->sqlPengurus(),
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengurus___role` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pengurus_id` int(7) NOT NULL,
  `role_id` int(11) NOT NULL,
  `lembaga_id` varchar(50) DEFAULT NULL,
  `id_admin` int(7) NOT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pengurus_id` (`pengurus_id`),
  KEY `idx_role_id` (`role_id`),
  KEY `idx_lembaga_id` (`lembaga_id`),
  KEY `fk_pengurus___role_admin` (`id_admin`),
  CONSTRAINT `fk_pengurus___role_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_pengurus___role_lembaga` FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengurus___role_pengurus` FOREIGN KEY (`pengurus_id`) REFERENCES `pengurus` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pengurus___role_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengurus___jabatan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pengurus_id` int(7) NOT NULL,
  `jabatan_id` int(11) NOT NULL,
  `lembaga_id` varchar(50) DEFAULT NULL,
  `tanggal_mulai` date DEFAULT NULL,
  `tanggal_selesai` date DEFAULT NULL,
  `status` enum('aktif','nonaktif') DEFAULT 'aktif',
  `id_admin` int(7) NOT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_pengurus_id` (`pengurus_id`),
  KEY `idx_jabatan_id` (`jabatan_id`),
  KEY `idx_lembaga_id` (`lembaga_id`),
  KEY `idx_status` (`status`),
  KEY `fk_pengurus___jabatan_admin` (`id_admin`),
  CONSTRAINT `fk_pengurus___jabatan_admin` FOREIGN KEY (`id_admin`) REFERENCES `pengurus` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_pengurus___jabatan_jabatan` FOREIGN KEY (`jabatan_id`) REFERENCES `jabatan` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pengurus___jabatan_lembaga` FOREIGN KEY (`lembaga_id`) REFERENCES `lembaga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pengurus___jabatan_pengurus` FOREIGN KEY (`pengurus_id`) REFERENCES `pengurus` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL,
            <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengurus___subscription` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_pengurus` int(11) NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` text DEFAULT NULL,
  `auth` text DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_endpoint` (`endpoint`(255)),
  KEY `fk_pengurus_subscription_id_pengurus` (`id_pengurus`),
  KEY `idx_tanggal_dibuat` (`tanggal_dibuat`),
  CONSTRAINT `fk_pengurus_subscription_id_pengurus` FOREIGN KEY (`id_pengurus`) REFERENCES `pengurus` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL,
        ];
    }

    private function sqlSantri(): string
    {
        return <<<'SQL'
CREATE TABLE IF NOT EXISTS `santri` (
  `tanggal_dibuat` timestamp NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `grup` int(3) NOT NULL,
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nis` int(7) NOT NULL,
  `id_user` int(11) DEFAULT NULL,
  `nama` varchar(255) DEFAULT NULL,
  `nisn` varchar(20) DEFAULT NULL,
  `kip` varchar(20) DEFAULT NULL,
  `pkh` varchar(20) DEFAULT NULL,
  `kks` varchar(20) DEFAULT NULL,
  `no_kk` varchar(20) DEFAULT NULL,
  `kepala_keluarga` varchar(255) DEFAULT NULL,
  `nik` varchar(20) DEFAULT NULL,
  `tempat_lahir` varchar(100) DEFAULT NULL,
  `tanggal_lahir` date DEFAULT NULL,
  `usia` varchar(10) DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `anak_ke` varchar(10) DEFAULT NULL,
  `jumlah_saudara` varchar(10) DEFAULT NULL,
  `saudara_di_pesantren` varchar(255) DEFAULT NULL,
  `ukuran_baju` varchar(10) DEFAULT NULL,
  `hobi` varchar(50) DEFAULT NULL,
  `cita_cita` varchar(50) DEFAULT NULL,
  `kebutuhan_khusus` varchar(50) DEFAULT NULL,
  `kebutuhan_disabilitas` varchar(50) DEFAULT NULL,
  `tinggal_bersama` varchar(50) DEFAULT NULL,
  `ayah` varchar(255) DEFAULT NULL,
  `status_ayah` varchar(50) DEFAULT NULL,
  `nik_ayah` varchar(20) DEFAULT NULL,
  `tempat_lahir_ayah` varchar(100) DEFAULT NULL,
  `tanggal_lahir_ayah` date DEFAULT NULL,
  `pekerjaan_ayah` varchar(255) DEFAULT NULL,
  `pendidikan_ayah` varchar(255) DEFAULT NULL,
  `penghasilan_ayah` varchar(50) DEFAULT NULL,
  `ibu` varchar(255) DEFAULT NULL,
  `status_ibu` varchar(50) DEFAULT NULL,
  `nik_ibu` varchar(20) DEFAULT NULL,
  `tempat_lahir_ibu` varchar(100) DEFAULT NULL,
  `tanggal_lahir_ibu` date DEFAULT NULL,
  `pekerjaan_ibu` varchar(255) DEFAULT NULL,
  `pendidikan_ibu` varchar(255) DEFAULT NULL,
  `penghasilan_ibu` varchar(50) DEFAULT NULL,
  `bersama_wali` varchar(255) DEFAULT NULL,
  `hubungan_wali` varchar(50) DEFAULT NULL,
  `wali` varchar(255) DEFAULT NULL,
  `nik_wali` varchar(20) DEFAULT NULL,
  `tempat_lahir_wali` varchar(100) DEFAULT NULL,
  `tanggal_lahir_wali` date DEFAULT NULL,
  `pendidikan_wali` varchar(255) DEFAULT NULL,
  `pekerjaan_wali` varchar(255) DEFAULT NULL,
  `penghasilan_wali` varchar(50) DEFAULT NULL,
  `dusun` varchar(255) DEFAULT NULL,
  `rt` varchar(10) DEFAULT NULL,
  `rw` varchar(10) DEFAULT NULL,
  `desa` varchar(255) DEFAULT NULL,
  `kecamatan` varchar(255) DEFAULT NULL,
  `kabupaten` varchar(255) DEFAULT NULL,
  `provinsi` varchar(255) DEFAULT NULL,
  `kode_pos` varchar(10) DEFAULT NULL,
  `jarak_ke_pesantren` varchar(50) DEFAULT NULL,
  `madrasah` varchar(255) DEFAULT NULL,
  `nama_madrasah` varchar(255) DEFAULT NULL,
  `alamat_madrasah` varchar(255) DEFAULT NULL,
  `lulus_madrasah` year(4) DEFAULT NULL,
  `sekolah` varchar(255) DEFAULT NULL,
  `nama_sekolah` varchar(255) DEFAULT NULL,
  `alamat_sekolah` varchar(255) DEFAULT NULL,
  `lulus_sekolah` year(4) DEFAULT NULL,
  `npsn` varchar(50) DEFAULT NULL,
  `nsm` varchar(50) DEFAULT NULL,
  `status_murid` varchar(255) DEFAULT NULL,
  `status_pendaftar` varchar(50) DEFAULT NULL,
  `status_santri` varchar(50) DEFAULT NULL,
  `kategori` varchar(20) DEFAULT NULL,
  `daerah` varchar(50) DEFAULT NULL,
  `kamar` varchar(50) DEFAULT NULL,
  `riwayat_sakit` varchar(255) DEFAULT NULL,
  `pekerjaan` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `no_telpon` varchar(20) DEFAULT NULL,
  `status_nikah` enum('Belum Menikah','Menikah','Cerai Hidup','Cerai Mati') DEFAULT NULL,
  `hijriyah` varchar(50) DEFAULT NULL,
  `masehi` date DEFAULT NULL,
  `nim_diniyah` varchar(50) DEFAULT NULL,
  `diniyah` varchar(255) DEFAULT NULL,
  `kelas_diniyah` varchar(50) DEFAULT NULL,
  `kel_diniyah` varchar(50) DEFAULT NULL,
  `nim_formal` varchar(50) DEFAULT NULL,
  `formal` varchar(255) DEFAULT NULL,
  `kelas_formal` varchar(50) DEFAULT NULL,
  `kel_formal` varchar(50) DEFAULT NULL,
  `lttq` varchar(50) DEFAULT NULL,
  `kelas_lttq` varchar(50) DEFAULT NULL,
  `kel_lttq` varchar(50) DEFAULT NULL,
  `lpba` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `no_wa_santri` varchar(20) DEFAULT NULL,
  `sha256` varchar(255) DEFAULT NULL,
  `admin` varchar(255) DEFAULT NULL,
  `pc` varchar(50) DEFAULT NULL,
  `emis` varchar(255) DEFAULT NULL,
  `no_ijazah` varchar(50) DEFAULT NULL,
  `nama_wali_ijazah` varchar(255) DEFAULT NULL,
  `no_kk_wali` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nik` (`nik`),
  UNIQUE KEY `unique_santri_id_user` (`id_user`),
  KEY `nama` (`nama`),
  KEY `grup` (`grup`),
  KEY `idx_santri_id_user` (`id_user`),
  KEY `idx_santri_nis` (`nis`),
  CONSTRAINT `fk_santri_users` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL;
    }

    private function sqlPengurus(): string
    {
        return <<<'SQL'
CREATE TABLE IF NOT EXISTS `pengurus` (
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `grup` int(5) NOT NULL,
  `id` int(7) NOT NULL,
  `id_user` int(11) DEFAULT NULL,
  `gelar_awal` varchar(255) DEFAULT NULL,
  `nama` varchar(255) DEFAULT NULL,
  `gelar_akhir` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `remember_token` varchar(255) DEFAULT NULL,
  `akses` varchar(50) DEFAULT NULL,
  `nik` varchar(50) DEFAULT NULL,
  `no_kk` varchar(20) DEFAULT NULL,
  `kategori` varchar(50) DEFAULT NULL,
  `status_pengurus` varchar(50) DEFAULT NULL,
  `jabatan` varchar(255) DEFAULT NULL,
  `gender` varchar(50) DEFAULT NULL,
  `tempat_lahir` varchar(255) DEFAULT NULL,
  `tanggal_lahir` date DEFAULT NULL,
  `pendidikan_terakhir` varchar(100) DEFAULT NULL,
  `sekolah` varchar(255) DEFAULT NULL,
  `tahun_lulus` int(11) DEFAULT NULL,
  `s1` varchar(255) DEFAULT NULL,
  `s2` varchar(255) DEFAULT NULL,
  `s3` varchar(255) DEFAULT NULL,
  `tmt` date DEFAULT NULL,
  `bidang_studi` varchar(255) DEFAULT NULL,
  `jurusan_title` varchar(255) DEFAULT NULL,
  `status_nikah` enum('Belum Menikah','Menikah','Cerai Hidup','Cerai Mati') DEFAULT NULL,
  `pekerjaan` varchar(255) DEFAULT NULL,
  `niy` varchar(50) DEFAULT NULL,
  `nidn` varchar(50) DEFAULT NULL,
  `nuptk` varchar(50) DEFAULT NULL,
  `npk` varchar(50) DEFAULT NULL,
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
  `status` varchar(50) DEFAULT NULL,
  `daerah` varchar(255) DEFAULT NULL,
  `no_kamar` varchar(50) DEFAULT NULL,
  `diniyah` varchar(255) DEFAULT NULL,
  `jabatan_diniyah` varchar(255) DEFAULT NULL,
  `kelas_diniyah` varchar(255) DEFAULT NULL,
  `kel_diniyah` varchar(255) DEFAULT NULL,
  `formal` varchar(255) DEFAULT NULL,
  `jabatan_formal` varchar(255) DEFAULT NULL,
  `kelas_formal` varchar(50) DEFAULT NULL,
  `kel_formal` varchar(50) DEFAULT NULL,
  `sejak` date DEFAULT NULL,
  `mengajar` varchar(63) DEFAULT NULL,
  `nyabang` varchar(5) DEFAULT NULL,
  `hijriyah` varchar(50) DEFAULT NULL,
  `masehi` date NOT NULL DEFAULT current_timestamp(),
  `admin` varchar(255) DEFAULT NULL,
  `pw` varchar(255) DEFAULT NULL,
  `level` varchar(255) DEFAULT NULL,
  `rekening_jatim` varchar(50) DEFAULT NULL,
  `an_jatim` varchar(255) DEFAULT NULL,
  `foto_profil` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_pengurus_id_user` (`id_user`),
  KEY `idx_pengurus_id_user` (`id_user`),
  CONSTRAINT `fk_pengurus_users` FOREIGN KEY (`id_user`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL;
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS pengurus___subscription');
        $this->execute('DROP TABLE IF EXISTS pengurus___jabatan');
        $this->execute('DROP TABLE IF EXISTS pengurus___role');
        $this->execute('DROP TABLE IF EXISTS pengurus');
        $this->execute('DROP TABLE IF EXISTS santri');
        $this->execute('DROP TABLE IF EXISTS users');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
