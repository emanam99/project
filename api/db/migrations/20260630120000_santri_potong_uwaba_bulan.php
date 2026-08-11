<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * MyBeddian: pilih bulan UWABA tujuan potong Bisyaroh berikutnya (per santri, per TA hijriyah).
 */
final class SantriPotongUwabaBulan extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('santri')) {
            return;
        }

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `santri___potong_uwaba_bulan` (
  `id_santri` int(7) NOT NULL,
  `tahun_ajaran` varchar(32) NOT NULL,
  `id_bulan` tinyint NOT NULL COMMENT 'id_bulan hijriyah uwaba: 11,12,1–8',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id_santri`, `tahun_ajaran`),
  KEY `idx_santri_potong_uwaba_bulan_ta` (`tahun_ajaran`),
  CONSTRAINT `fk_santri_potong_uwaba_bulan_s` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
COMMENT='Bulan UWABA tujuan potong Bisyaroh berikutnya (MyBeddian, per santri per TA)'
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `santri___potong_uwaba_bulan`');
    }
}
