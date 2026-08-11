<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hubungkan psb___registrasi.tahun_hijriyah dan psb___registrasi.tahun_masehi
 * ke master tahun_ajaran (PK = tahun_ajaran). Isi kedua kolom sudah format
 * 1445-1446 / 2025-2026 sama dengan master. Kedua kolom tetap dipakai untuk validasi.
 */
final class PsbRegistrasiTahunAjaranFk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('tahun_ajaran') || !$this->hasTable('psb___registrasi')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        // 1) Sinkron nilai unik tahun_hijriyah dari psb___registrasi ke master (kategori hijriyah)
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
                    SELECT DISTINCT TRIM(tahun_hijriyah) AS ta FROM psb___registrasi
                    WHERE tahun_hijriyah IS NOT NULL AND TRIM(tahun_hijriyah) != ''
                ) AS src
            ) AS sub
        ");

        // 2) Sinkron nilai unik tahun_masehi dari psb___registrasi ke master (kategori masehi)
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
                    SELECT DISTINCT TRIM(tahun_masehi) AS ta FROM psb___registrasi
                    WHERE tahun_masehi IS NOT NULL AND TRIM(tahun_masehi) != ''
                ) AS src
            ) AS sub
        ");

        // 3) Pastikan kolom psb___registrasi VARCHAR(50) + charset sama dengan master (sudah 50, set charset)
        foreach (['tahun_hijriyah', 'tahun_masehi'] as $col) {
            $stmt = $conn->prepare("
                SELECT CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tahun_ajaran' AND COLUMN_NAME = 'tahun_ajaran'
            ");
            $stmt->execute();
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            $charset = $row && !empty($row['CHARACTER_SET_NAME']) ? $row['CHARACTER_SET_NAME'] : 'utf8mb4';
            $collation = $row && !empty($row['COLLATION_NAME']) ? $row['COLLATION_NAME'] : 'utf8mb4_unicode_ci';
            $this->execute("
                ALTER TABLE psb___registrasi
                MODIFY COLUMN `{$col}` VARCHAR(50) CHARACTER SET {$charset} COLLATE {$collation} NULL DEFAULT NULL
            ");
        }

        // 4) Index untuk FK (biasanya sudah ada KEY tahun_hijriyah / tahun_masehi)
        foreach (['tahun_hijriyah', 'tahun_masehi'] as $col) {
            $stmt = $conn->prepare("
                SELECT 1 FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'psb___registrasi' AND COLUMN_NAME = ?
                AND INDEX_NAME != 'PRIMARY' LIMIT 1
            ");
            $stmt->execute([$col]);
            if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
                $this->execute("ALTER TABLE psb___registrasi ADD INDEX idx_{$col}_fk ({$col})");
            }
        }

        // 5) Tambah FK tahun_hijriyah → tahun_ajaran
        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'psb___registrasi' AND CONSTRAINT_NAME = 'fk_psb_registrasi_tahun_hijriyah'
        ");
        $stmt->execute();
        if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
            $this->execute("
                ALTER TABLE psb___registrasi
                ADD CONSTRAINT fk_psb_registrasi_tahun_hijriyah
                FOREIGN KEY (tahun_hijriyah) REFERENCES tahun_ajaran (tahun_ajaran)
                ON UPDATE CASCADE ON DELETE RESTRICT
            ");
        }

        // 6) Tambah FK tahun_masehi → tahun_ajaran
        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'psb___registrasi' AND CONSTRAINT_NAME = 'fk_psb_registrasi_tahun_masehi'
        ");
        $stmt->execute();
        if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
            $this->execute("
                ALTER TABLE psb___registrasi
                ADD CONSTRAINT fk_psb_registrasi_tahun_masehi
                FOREIGN KEY (tahun_masehi) REFERENCES tahun_ajaran (tahun_ajaran)
                ON UPDATE CASCADE ON DELETE RESTRICT
            ");
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if ($this->hasTable('psb___registrasi')) {
            try {
                $this->execute('ALTER TABLE psb___registrasi DROP FOREIGN KEY fk_psb_registrasi_tahun_hijriyah');
            } catch (\Throwable $e) {}
            try {
                $this->execute('ALTER TABLE psb___registrasi DROP FOREIGN KEY fk_psb_registrasi_tahun_masehi');
            } catch (\Throwable $e) {}
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
