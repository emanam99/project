<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tingkatan madrasah: satu kolom JSON (array slug), ganti tpq/ula/wustha/ulya/ma_had_ali.
 */
final class MadrasahTingkatanJson extends AbstractMigration
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
        if (!$this->hasColumn('tingkatan')) {
            $after = $this->hasColumn('ma_had_ali') ? 'ma_had_ali' : 'no_pjgt';
            $this->execute(
                "ALTER TABLE `madrasah` ADD COLUMN `tingkatan` JSON NULL DEFAULT NULL
                 COMMENT 'Daftar tingkatan (slug JSON array)' AFTER `{$after}`"
            );
        }

        $rows = $this->fetchAll('SELECT id, tpq, ula, wustha, ulya, ma_had_ali, tingkatan FROM madrasah');
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $existing = $row['tingkatan'] ?? null;
            if ($existing !== null && $existing !== '' && $existing !== '[]') {
                continue;
            }
            $slugs = [];
            foreach (['tpq', 'ula', 'wustha', 'ulya', 'ma_had_ali'] as $slug) {
                if (!empty($row[$slug]) && (int) $row[$slug] === 1) {
                    $slugs[] = $slug;
                }
            }
            $json = $slugs === [] ? null : json_encode($slugs, JSON_UNESCAPED_UNICODE);
            $quoted = $json === null ? 'NULL' : $this->getAdapter()->getConnection()->quote($json);
            $this->execute("UPDATE madrasah SET tingkatan = {$quoted} WHERE id = {$id}");
        }

        foreach (['ma_had_ali', 'ulya', 'wustha', 'ula', 'tpq'] as $col) {
            if ($this->hasColumn($col)) {
                $this->execute("ALTER TABLE `madrasah` DROP COLUMN `{$col}`");
            }
        }
    }

    public function down(): void
    {
        foreach (
            [
                'tpq' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'ula' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'wustha' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'ulya' => 'TINYINT(1) NOT NULL DEFAULT 0',
                'ma_had_ali' => 'TINYINT(1) NOT NULL DEFAULT 0',
            ] as $col => $def
        ) {
            if (!$this->hasColumn($col)) {
                $after = $col === 'tpq' ? 'no_pjgt' : (
                    $col === 'ula' ? 'tpq' : ($col === 'wustha' ? 'ula' : ($col === 'ulya' ? 'wustha' : 'ulya'))
                );
                $this->execute("ALTER TABLE `madrasah` ADD COLUMN `{$col}` {$def} AFTER `{$after}`");
            }
        }

        if ($this->hasColumn('tingkatan')) {
            $rows = $this->fetchAll('SELECT id, tingkatan FROM madrasah');
            foreach ($rows as $row) {
                $id = (int) $row['id'];
                $slugs = json_decode((string) ($row['tingkatan'] ?? ''), true);
                if (!is_array($slugs)) {
                    $slugs = [];
                }
                $set = [];
                foreach (['tpq', 'ula', 'wustha', 'ulya', 'ma_had_ali'] as $slug) {
                    $set[] = $slug . ' = ' . (in_array($slug, $slugs, true) ? 1 : 0);
                }
                $this->execute('UPDATE madrasah SET ' . implode(', ', $set) . " WHERE id = {$id}");
            }
            $this->execute('ALTER TABLE `madrasah` DROP COLUMN `tingkatan`');
        }
    }
}
