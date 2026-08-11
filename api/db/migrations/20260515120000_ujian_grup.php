<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kelompok ujian: satu ujian_grup → banyak baris ujian (sub mapel + tanggal + jam).
 */
final class UjianGrup extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('ujian')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');

            return;
        }

        if (!$this->hasTable('ujian_grup')) {
            $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ujian_grup` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `judul` varchar(255) NOT NULL DEFAULT '',
  `jenis` varchar(64) DEFAULT NULL,
  `id_rombel_ids` varchar(512) NOT NULL DEFAULT '' COMMENT 'CSV id lembaga___rombel, terurut',
  `id_user_pembuat` int(11) DEFAULT NULL,
  `tanggal_dibuat` timestamp NOT NULL DEFAULT current_timestamp(),
  `tanggal_update` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ujian_grup_dibuat` (`tanggal_dibuat`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Header kelompok ujian (beberapa rombel + banyak sub jadwal)'
SQL);
        }

        if (!$this->table('ujian')->hasColumn('id_ujian_grup')) {
            $this->execute('ALTER TABLE `ujian` ADD COLUMN `id_ujian_grup` int(11) NULL DEFAULT NULL AFTER `id`');
        }

        $conn = $this->getAdapter()->getConnection();
        $rows = $conn->query(
            'SELECT u.id AS uid, u.judul, u.jenis, u.id_user_pembuat, r.id AS rombel_id
            FROM ujian u
            INNER JOIN lembaga___kitab lk ON lk.id = u.id_lembaga_kitab
            INNER JOIN lembaga___rombel r ON r.id = lk.id_rombel
            WHERE u.id_ujian_grup IS NULL'
        )->fetchAll(\PDO::FETCH_ASSOC);

        $insGrup = $conn->prepare(
            'INSERT INTO ujian_grup (judul, jenis, id_rombel_ids, id_user_pembuat) VALUES (?, ?, ?, ?)'
        );
        $updUjian = $conn->prepare('UPDATE ujian SET id_ujian_grup = ? WHERE id = ?');

        foreach ($rows as $row) {
            $rombelCsv = (string) (int) $row['rombel_id'];
            $insGrup->execute([
                $row['judul'] ?? 'Ujian',
                $row['jenis'],
                $rombelCsv,
                $row['id_user_pembuat'],
            ]);
            $gid = (int) $conn->lastInsertId();
            $updUjian->execute([$gid, (int) $row['uid']]);
        }

        $this->execute(
            'ALTER TABLE `ujian` MODIFY `id_ujian_grup` int(11) NOT NULL'
        );
        $this->execute(
            'ALTER TABLE `ujian` ADD CONSTRAINT `fk_ujian_grup` FOREIGN KEY (`id_ujian_grup`) REFERENCES `ujian_grup` (`id`) ON DELETE CASCADE ON UPDATE CASCADE'
        );
        $this->execute('ALTER TABLE `ujian` ADD KEY `idx_ujian_grup` (`id_ujian_grup`)');

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->table('ujian')->hasColumn('id_ujian_grup')) {
            $this->execute('ALTER TABLE `ujian` DROP FOREIGN KEY `fk_ujian_grup`');
            $this->execute('ALTER TABLE `ujian` DROP COLUMN `id_ujian_grup`');
        }
        $this->execute('DROP TABLE IF EXISTS `ujian_grup`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
