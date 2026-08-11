<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Jam mulai/sampai per waktu kegiatan belajar (pagi, sore/siang, malam).
 * Backfill dari kegiatan_mulai / kegiatan_sampai bila centang aktif.
 */
final class MadrasahKegiatanJamPerWaktu extends AbstractMigration
{
    private function hasColumn(string $columnName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare(
            'SELECT 1 FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1'
        );
        $stmt->execute(['madrasah', $columnName]);

        return (bool) $stmt->fetch(\PDO::FETCH_ASSOC);
    }

    public function up(): void
    {
        $cols = [
            ['kegiatan_pagi_mulai', 'kegiatan_sampai', 'Jam mulai kegiatan pagi (HH:MM)'],
            ['kegiatan_pagi_sampai', 'kegiatan_pagi_mulai', 'Jam sampai kegiatan pagi (HH:MM)'],
            ['kegiatan_sore_mulai', 'kegiatan_pagi_sampai', 'Jam mulai kegiatan siang/sore (HH:MM)'],
            ['kegiatan_sore_sampai', 'kegiatan_sore_mulai', 'Jam sampai kegiatan siang/sore (HH:MM)'],
            ['kegiatan_malam_mulai', 'kegiatan_sore_sampai', 'Jam mulai kegiatan malam (HH:MM)'],
            ['kegiatan_malam_sampai', 'kegiatan_malam_mulai', 'Jam sampai kegiatan malam (HH:MM)'],
        ];
        foreach ($cols as [$name, $after, $comment]) {
            if ($this->hasColumn($name)) {
                continue;
            }
            $c = str_replace("'", "''", $comment);
            $this->execute(
                "ALTER TABLE `madrasah` ADD COLUMN `{$name}` VARCHAR(10) NULL DEFAULT NULL COMMENT '{$c}' AFTER `{$after}`"
            );
        }

        foreach (
            [
                ['kegiatan_pagi', 'kegiatan_pagi_mulai', 'kegiatan_pagi_sampai'],
                ['kegiatan_sore', 'kegiatan_sore_mulai', 'kegiatan_sore_sampai'],
                ['kegiatan_malam', 'kegiatan_malam_mulai', 'kegiatan_malam_sampai'],
            ] as [$flag, $mulai, $sampai]
        ) {
            $this->execute(
                "UPDATE `madrasah` SET
                    `{$mulai}` = COALESCE(NULLIF(TRIM(`{$mulai}`), ''), `kegiatan_mulai`),
                    `{$sampai}` = COALESCE(NULLIF(TRIM(`{$sampai}`), ''), `kegiatan_sampai`)
                 WHERE `{$flag}` = 1
                   AND (`kegiatan_mulai` IS NOT NULL OR `kegiatan_sampai` IS NOT NULL)"
            );
        }
    }

    public function down(): void
    {
        foreach (
            [
                'kegiatan_malam_sampai',
                'kegiatan_malam_mulai',
                'kegiatan_sore_sampai',
                'kegiatan_sore_mulai',
                'kegiatan_pagi_sampai',
                'kegiatan_pagi_mulai',
            ] as $col
        ) {
            if ($this->hasColumn($col)) {
                $this->execute("ALTER TABLE `madrasah` DROP COLUMN `{$col}`");
            }
        }
    }
}
