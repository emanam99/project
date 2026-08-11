<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * FK tahun ajaran:
 * - santri___shohifah.tahun_ajaran → tahun_ajaran (kategori hijriyah)
 * - santri___boyong.tahun_hijriyah → tahun_ajaran
 * - santri___boyong.tahun_masehi → tahun_ajaran
 */
final class SantriShohifahBoyongTahunAjaranFk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('tahun_ajaran')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        // ---- 1) santri___shohifah ----
        if ($this->hasTable('santri___shohifah')) {
            // Sinkron nilai unik tahun_ajaran dari santri___shohifah ke master (kategori hijriyah)
            $this->execute("
                INSERT IGNORE INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                SELECT tahun_ajaran, kategori, dari, sampai FROM (
                    SELECT
                        ta AS tahun_ajaran,
                        'hijriyah' AS kategori,
                        CASE WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                            THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', 1), '-01-01'), '%Y-%m-%d')
                            ELSE NULL END AS dari,
                        CASE WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                            THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', -1), '-12-31'), '%Y-%m-%d')
                            ELSE NULL END AS sampai
                    FROM (
                        SELECT DISTINCT TRIM(tahun_ajaran) AS ta FROM santri___shohifah
                        WHERE tahun_ajaran IS NOT NULL AND TRIM(tahun_ajaran) != ''
                    ) AS src
                ) AS sub
            ");

            $stmt = $conn->prepare("
                SELECT CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tahun_ajaran' AND COLUMN_NAME = 'tahun_ajaran'
            ");
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $charset = $row && !empty($row['CHARACTER_SET_NAME']) ? $row['CHARACTER_SET_NAME'] : 'utf8mb4';
            $collation = $row && !empty($row['COLLATION_NAME']) ? $row['COLLATION_NAME'] : 'utf8mb4_unicode_ci';

            $this->execute("
                ALTER TABLE santri___shohifah
                MODIFY COLUMN tahun_ajaran VARCHAR(50) CHARACTER SET {$charset} COLLATE {$collation} NULL DEFAULT NULL
            ");

            $stmt = $conn->prepare("
                SELECT 1 FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___shohifah' AND COLUMN_NAME = 'tahun_ajaran'
                AND INDEX_NAME != 'PRIMARY' LIMIT 1
            ");
            $stmt->execute();
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute('ALTER TABLE santri___shohifah ADD INDEX idx_tahun_ajaran_fk (tahun_ajaran)');
            }

            $stmt = $conn->prepare("
                SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___shohifah' AND CONSTRAINT_NAME = 'fk_santri_shohifah_tahun_ajaran'
            ");
            $stmt->execute();
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute("
                    ALTER TABLE santri___shohifah
                    ADD CONSTRAINT fk_santri_shohifah_tahun_ajaran
                    FOREIGN KEY (tahun_ajaran) REFERENCES tahun_ajaran (tahun_ajaran)
                    ON UPDATE CASCADE ON DELETE RESTRICT
                ");
            }
        }

        // ---- 2) santri___boyong: tahun_hijriyah & tahun_masehi ----
        if ($this->hasTable('santri___boyong')) {
            // Sinkron tahun_hijriyah ke master (kategori hijriyah)
            $this->execute("
                INSERT IGNORE INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                SELECT tahun_ajaran, kategori, dari, sampai FROM (
                    SELECT
                        ta AS tahun_ajaran,
                        'hijriyah' AS kategori,
                        CASE WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                            THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', 1), '-01-01'), '%Y-%m-%d')
                            ELSE NULL END AS dari,
                        CASE WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                            THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', -1), '-12-31'), '%Y-%m-%d')
                            ELSE NULL END AS sampai
                    FROM (
                        SELECT DISTINCT TRIM(tahun_hijriyah) AS ta FROM santri___boyong
                        WHERE tahun_hijriyah IS NOT NULL AND TRIM(tahun_hijriyah) != ''
                    ) AS src
                ) AS sub
            ");

            // Sinkron tahun_masehi ke master (kategori masehi)
            $this->execute("
                INSERT IGNORE INTO tahun_ajaran (tahun_ajaran, kategori, dari, sampai)
                SELECT tahun_ajaran, kategori, dari, sampai FROM (
                    SELECT
                        ta AS tahun_ajaran,
                        'masehi' AS kategori,
                        CASE WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                            THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', 1), '-01-01'), '%Y-%m-%d')
                            ELSE NULL END AS dari,
                        CASE WHEN ta REGEXP '^[0-9]{4}-[0-9]{4}\$'
                            THEN STR_TO_DATE(CONCAT(SUBSTRING_INDEX(ta, '-', -1), '-12-31'), '%Y-%m-%d')
                            ELSE NULL END AS sampai
                    FROM (
                        SELECT DISTINCT TRIM(tahun_masehi) AS ta FROM santri___boyong
                        WHERE tahun_masehi IS NOT NULL AND TRIM(tahun_masehi) != ''
                    ) AS src
                ) AS sub
            ");

            $stmt = $conn->prepare("
                SELECT CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tahun_ajaran' AND COLUMN_NAME = 'tahun_ajaran'
            ");
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $charset = $row && !empty($row['CHARACTER_SET_NAME']) ? $row['CHARACTER_SET_NAME'] : 'utf8mb4';
            $collation = $row && !empty($row['COLLATION_NAME']) ? $row['COLLATION_NAME'] : 'utf8mb4_unicode_ci';

            foreach (['tahun_hijriyah', 'tahun_masehi'] as $col) {
                $this->execute("
                    ALTER TABLE santri___boyong
                    MODIFY COLUMN `{$col}` VARCHAR(50) CHARACTER SET {$charset} COLLATE {$collation} NULL DEFAULT NULL
                ");
            }

            foreach (['tahun_hijriyah', 'tahun_masehi'] as $col) {
                $stmt = $conn->prepare("
                    SELECT 1 FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___boyong' AND COLUMN_NAME = ?
                    AND INDEX_NAME != 'PRIMARY' LIMIT 1
                ");
                $stmt->execute([$col]);
                if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                    $this->execute("ALTER TABLE santri___boyong ADD INDEX idx_{$col}_fk ({$col})");
                }
            }

            $stmt = $conn->prepare("
                SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___boyong' AND CONSTRAINT_NAME = 'fk_santri_boyong_tahun_hijriyah'
            ");
            $stmt->execute();
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute("
                    ALTER TABLE santri___boyong
                    ADD CONSTRAINT fk_santri_boyong_tahun_hijriyah
                    FOREIGN KEY (tahun_hijriyah) REFERENCES tahun_ajaran (tahun_ajaran)
                    ON UPDATE CASCADE ON DELETE RESTRICT
                ");
            }

            $stmt = $conn->prepare("
                SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'santri___boyong' AND CONSTRAINT_NAME = 'fk_santri_boyong_tahun_masehi'
            ");
            $stmt->execute();
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute("
                    ALTER TABLE santri___boyong
                    ADD CONSTRAINT fk_santri_boyong_tahun_masehi
                    FOREIGN KEY (tahun_masehi) REFERENCES tahun_ajaran (tahun_ajaran)
                    ON UPDATE CASCADE ON DELETE RESTRICT
                ");
            }
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('santri___shohifah')) {
            try {
                $this->execute('ALTER TABLE santri___shohifah DROP FOREIGN KEY fk_santri_shohifah_tahun_ajaran');
            } catch (\Throwable $e) {}
        }

        if ($this->hasTable('santri___boyong')) {
            try {
                $this->execute('ALTER TABLE santri___boyong DROP FOREIGN KEY fk_santri_boyong_tahun_hijriyah');
            } catch (\Throwable $e) {}
            try {
                $this->execute('ALTER TABLE santri___boyong DROP FOREIGN KEY fk_santri_boyong_tahun_masehi');
            } catch (\Throwable $e) {}
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
