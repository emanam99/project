<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pastikan FK tahun_ajaran di santri___rombel ke tahun_ajaran terpasang.
 * Berguna jika tabel santri___rombel sudah ada tanpa FK (mis. dari migrasi partial).
 */
final class SantriRombelTahunAjaranFk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('santri___rombel') || !$this->hasTable('tahun_ajaran')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___rombel' AND CONSTRAINT_NAME = 'fk_santri_rombel_tahun_ajaran'
        ");
        $stmt->execute();
        if ($stmt->fetch(\PDO::FETCH_ASSOC) !== false) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $stmt = $conn->prepare("
            SELECT CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tahun_ajaran' AND COLUMN_NAME = 'tahun_ajaran'
        ");
        $stmt->execute();
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $charset = $row && !empty($row['CHARACTER_SET_NAME']) ? $row['CHARACTER_SET_NAME'] : 'utf8mb4';
        $collation = $row && !empty($row['COLLATION_NAME']) ? $row['COLLATION_NAME'] : 'utf8mb4_unicode_ci';

        $this->execute("
            ALTER TABLE santri___rombel
            MODIFY COLUMN tahun_ajaran VARCHAR(50) CHARACTER SET {$charset} COLLATE {$collation} NOT NULL
        ");

        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___rombel' AND COLUMN_NAME = 'tahun_ajaran'
            AND INDEX_NAME != 'PRIMARY' LIMIT 1
        ");
        $stmt->execute();
        if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
            $this->execute('ALTER TABLE santri___rombel ADD INDEX idx_tahun_ajaran_fk (tahun_ajaran)');
        }

        $this->execute("
            ALTER TABLE santri___rombel
            ADD CONSTRAINT fk_santri_rombel_tahun_ajaran
            FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran)
            ON DELETE RESTRICT ON UPDATE CASCADE
        ");

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('santri___rombel')) {
            try {
                $this->execute('ALTER TABLE santri___rombel DROP FOREIGN KEY fk_santri_rombel_tahun_ajaran');
            } catch (\Throwable $e) {}
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
