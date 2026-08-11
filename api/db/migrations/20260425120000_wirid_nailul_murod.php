<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kumpulan wirid & amaliyah (Nailul Murod) — isi/arti HTML (Quill) dengan dukungan Arab/RTL.
 */
final class WiridNailulMurod extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `wirid___nailul_murod` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bab` varchar(255) NOT NULL DEFAULT '' COMMENT 'Nama bagian (bab/bab) untuk pengelompokan',
  `judul` varchar(500) NOT NULL DEFAULT '',
  `isi` longtext NULL COMMENT 'HTML (wirid, Arab, dsb.)',
  `arti` longtext NULL COMMENT 'HTML (terjemahan/penjelasan Latin)',
  `urutan` int(11) NOT NULL DEFAULT 0,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_diedit` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_nailul_bab_urutan` (`bab`, `urutan`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL);
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');

        $conn = $this->getAdapter()->getConnection();
        $this->execute(sprintf(
            'INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (33, %s, %s)',
            $conn->quote('admin_wirid'),
            $conn->quote('Admin Wirid')
        ));

        foreach (['admin_wirid', 'super_admin'] as $i => $rk) {
            $this->execute(sprintf(
                'INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)',
                $conn->quote('wiridNailulMurodSelectors'),
                $conn->quote($rk),
                (int) $i
            ));
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $this->execute(sprintf(
            'DELETE FROM `ebeddien_legacy_route_role` WHERE `legacy_key` = %s',
            $conn->quote('wiridNailulMurodSelectors')
        ));
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `wirid___nailul_murod`');
        $this->execute("DELETE FROM `role` WHERE `id` = 33 AND `key` = 'admin_wirid'");
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
