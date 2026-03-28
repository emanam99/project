<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Laporan GT: id_koordinator & id_pembuat (selaras koordinator).
 * Laporan PJGT: id_tahun_ajaran, bulan, id_koordinator, id_pembuat + FK tahun ajaran & unik per periode.
 */
final class UgtGtPjgtKoordinatorPembuatTaBulan extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___gt`
  ADD COLUMN `id_koordinator` int(11) DEFAULT NULL COMMENT 'FK pengurus (koordinator madrasah)' AFTER `id_santri`,
  ADD COLUMN `id_pembuat` int(11) DEFAULT NULL COMMENT 'FK pengurus yang menyimpan' AFTER `id_koordinator`,
  ADD KEY `idx_koordinator` (`id_koordinator`),
  ADD KEY `idx_pembuat` (`id_pembuat`)
SQL);

        $this->execute(<<<'SQL'
UPDATE `ugt___gt` g
INNER JOIN `madrasah` m ON m.id = g.id_madrasah
SET g.id_koordinator = m.id_koordinator
SQL);

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___gt`
  ADD CONSTRAINT `fk_ugt_gt_koordinator` FOREIGN KEY (`id_koordinator`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ugt_gt_pembuat` FOREIGN KEY (`id_pembuat`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
SQL);

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___pjgt`
  ADD COLUMN `id_tahun_ajaran` varchar(50) DEFAULT NULL COMMENT 'FK tahun_ajaran.tahun_ajaran' AFTER `id_santri`,
  ADD COLUMN `bulan` tinyint(3) unsigned DEFAULT NULL COMMENT '1–12; UI: bulan Hijriyah' AFTER `id_tahun_ajaran`,
  ADD COLUMN `id_koordinator` int(11) DEFAULT NULL COMMENT 'FK pengurus (koordinator)' AFTER `bulan`,
  ADD COLUMN `id_pembuat` int(11) DEFAULT NULL COMMENT 'FK pengurus yang menyimpan' AFTER `id_koordinator`,
  ADD KEY `idx_ta_bulan` (`id_tahun_ajaran`,`bulan`),
  ADD KEY `idx_koordinator` (`id_koordinator`),
  ADD KEY `idx_pembuat` (`id_pembuat`)
SQL);

        $this->execute(<<<'SQL'
UPDATE `ugt___pjgt` p
INNER JOIN `madrasah` m ON m.id = p.id_madrasah
SET p.id_koordinator = m.id_koordinator
SQL);

        $taRow = $this->fetchRow('SELECT tahun_ajaran FROM tahun_ajaran ORDER BY tahun_ajaran DESC LIMIT 1');
        $ta = is_array($taRow) && isset($taRow['tahun_ajaran']) && $taRow['tahun_ajaran'] !== ''
            ? (string) $taRow['tahun_ajaran']
            : '1445/1446';

        $pjRows = $this->fetchAll('SELECT id, id_madrasah, id_santri FROM ugt___pjgt ORDER BY id_madrasah ASC, id_santri ASC, id ASC');
        $perMs = [];
        if (is_array($pjRows)) {
            foreach ($pjRows as $row) {
                $mid = (int) ($row['id_madrasah'] ?? 0);
                $sid = (int) ($row['id_santri'] ?? 0);
                $id = (int) ($row['id'] ?? 0);
                if ($mid <= 0 || $sid <= 0 || $id <= 0) {
                    continue;
                }
                $key = $mid . '_' . $sid;
                $perMs[$key] = ($perMs[$key] ?? 0) + 1;
                $bulan = min(12, (int) $perMs[$key]);
                $this->execute(
                    'UPDATE ugt___pjgt SET id_tahun_ajaran = ?, bulan = ? WHERE id = ?',
                    [$ta, $bulan, $id]
                );
            }
        }

        $this->dedupeLaporanGroups('ugt___pjgt');
        $this->dedupeLaporanGroups('ugt___gt');

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___pjgt`
  MODIFY `id_tahun_ajaran` varchar(50) NOT NULL COMMENT 'FK tahun_ajaran.tahun_ajaran',
  MODIFY `bulan` tinyint(3) unsigned NOT NULL COMMENT '1–12; UI: bulan Hijriyah'
SQL);

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___pjgt`
  ADD CONSTRAINT `fk_ugt_pjgt_ta` FOREIGN KEY (`id_tahun_ajaran`) REFERENCES `tahun_ajaran` (`tahun_ajaran`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ugt_pjgt_koordinator` FOREIGN KEY (`id_koordinator`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ugt_pjgt_pembuat` FOREIGN KEY (`id_pembuat`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD UNIQUE KEY `uq_pjgt_m_s_ta_bulan` (`id_madrasah`,`id_santri`,`id_tahun_ajaran`,`bulan`)
SQL);

        $this->execute(<<<'SQL'
ALTER TABLE `ugt___gt`
  ADD UNIQUE KEY `uq_gt_m_s_ta_bulan` (`id_madrasah`,`id_santri`,`id_tahun_ajaran`,`bulan`)
SQL);

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    /** Hapus baris duplikat (pertahankan id terkecil) agar UNIQUE aman. */
    private function dedupeLaporanGroups(string $table): void
    {
        $dupes = $this->fetchAll(
            "SELECT GROUP_CONCAT(id ORDER BY id) AS ids FROM `{$table}`
             GROUP BY id_madrasah, id_santri, id_tahun_ajaran, bulan HAVING COUNT(*) > 1"
        );
        if (!is_array($dupes)) {
            return;
        }
        foreach ($dupes as $d) {
            $ids = explode(',', (string) ($d['ids'] ?? ''));
            if (count($ids) < 2) {
                continue;
            }
            array_shift($ids);
            foreach ($ids as $idStr) {
                $id = (int) trim($idStr);
                if ($id > 0) {
                    $this->execute("DELETE FROM `{$table}` WHERE id = ?", [$id]);
                }
            }
        }
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('ALTER TABLE `ugt___gt` DROP INDEX `uq_gt_m_s_ta_bulan`');
        $this->execute('ALTER TABLE `ugt___gt` DROP FOREIGN KEY `fk_ugt_gt_pembuat`');
        $this->execute('ALTER TABLE `ugt___gt` DROP FOREIGN KEY `fk_ugt_gt_koordinator`');
        $this->execute('ALTER TABLE `ugt___gt` DROP COLUMN `id_pembuat`, DROP COLUMN `id_koordinator`');
        $this->execute('ALTER TABLE `ugt___pjgt` DROP INDEX `uq_pjgt_m_s_ta_bulan`');
        $this->execute('ALTER TABLE `ugt___pjgt` DROP FOREIGN KEY `fk_ugt_pjgt_pembuat`');
        $this->execute('ALTER TABLE `ugt___pjgt` DROP FOREIGN KEY `fk_ugt_pjgt_koordinator`');
        $this->execute('ALTER TABLE `ugt___pjgt` DROP FOREIGN KEY `fk_ugt_pjgt_ta`');
        $this->execute('ALTER TABLE `ugt___pjgt` DROP COLUMN `id_pembuat`, DROP COLUMN `id_koordinator`, DROP COLUMN `bulan`, DROP COLUMN `id_tahun_ajaran`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
