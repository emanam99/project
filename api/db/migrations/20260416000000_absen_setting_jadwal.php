<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel absen___setting (kunci/nilai JSON) + kolom jam pagi/sore/malam per titik lokasi.
 */
final class AbsenSettingJadwal extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `absen___setting` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `kunci` varchar(191) NOT NULL,
  `nilai` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
    COMMENT 'JSON — struktur tergantung kunci',
  `tanggal_ubah` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_absen_setting_kunci` (`kunci`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Pengaturan absen (jadwal default, sidik jari, dll.)';
SQL);

        $jadwal = (string) json_encode([
            'pagi' => ['mulai' => '06:00'],
            'sore' => ['mulai' => '15:00'],
            'malam' => ['mulai' => '19:00'],
        ], JSON_UNESCAPED_UNICODE);
        $sidik = (string) json_encode([
            'ikut_jadwal_default' => true,
            'toleransi_telat_menit' => 0,
        ], JSON_UNESCAPED_UNICODE);

        $rows = [
            ['kunci' => 'jadwal_default', 'nilai' => $jadwal],
            ['kunci' => 'sidik_jari_default', 'nilai' => $sidik],
        ];
        $this->table('absen___setting')->insert($rows)->saveData();

        if ($this->hasTable('absen___lokasi')) {
            $t = $this->table('absen___lokasi');
            if (!$t->hasColumn('jam_mulai_pagi')) {
                $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  ADD COLUMN `jam_mulai_pagi` time DEFAULT NULL COMMENT 'NULL = pakai default global' AFTER `sort_order`,
  ADD COLUMN `jam_mulai_sore` time DEFAULT NULL AFTER `jam_mulai_pagi`,
  ADD COLUMN `jam_mulai_malam` time DEFAULT NULL AFTER `jam_mulai_sore`
SQL);
            }
        }
    }

    public function down(): void
    {
        if ($this->hasTable('absen___lokasi')) {
            $t = $this->table('absen___lokasi');
            if ($t->hasColumn('jam_mulai_pagi')) {
                $this->execute(<<<'SQL'
ALTER TABLE `absen___lokasi`
  DROP COLUMN `jam_mulai_malam`,
  DROP COLUMN `jam_mulai_sore`,
  DROP COLUMN `jam_mulai_pagi`
SQL);
            }
        }
        $this->execute('DROP TABLE IF EXISTS `absen___setting`');
    }
}
