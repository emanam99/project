<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Alter madrasah: tambah kolom desa, kecamatan, kabupaten, provinsi, kode_pos,
 * id_koordinator (FK pengurus), wilayah.
 * AMAN: Cek kolom dulu; tidak menghapus data.
 */
final class MadrasahAlamatKoordinatorWilayah extends AbstractMigration
{
    private function hasColumn(string $tableName, string $columnName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = ?
            LIMIT 1
        ");
        $stmt->execute([$tableName, $columnName]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    public function up(): void
    {
        if (!$this->hasColumn('madrasah', 'desa')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN desa VARCHAR(255) NULL DEFAULT NULL AFTER rw");
        }
        if (!$this->hasColumn('madrasah', 'kecamatan')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN kecamatan VARCHAR(255) NULL DEFAULT NULL AFTER desa");
        }
        if (!$this->hasColumn('madrasah', 'kabupaten')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN kabupaten VARCHAR(255) NULL DEFAULT NULL AFTER kecamatan");
        }
        if (!$this->hasColumn('madrasah', 'provinsi')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN provinsi VARCHAR(255) NULL DEFAULT NULL AFTER kabupaten");
        }
        if (!$this->hasColumn('madrasah', 'kode_pos')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN kode_pos VARCHAR(10) NULL DEFAULT NULL AFTER provinsi");
        }
        if (!$this->hasColumn('madrasah', 'id_koordinator')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 0');
            $this->execute("
                ALTER TABLE madrasah
                ADD COLUMN id_koordinator INT(7) NULL DEFAULT NULL COMMENT 'FK ke pengurus.id' AFTER kode_pos,
                ADD KEY idx_madrasah_id_koordinator (id_koordinator),
                ADD CONSTRAINT fk_madrasah_koordinator FOREIGN KEY (id_koordinator) REFERENCES pengurus (id) ON DELETE SET NULL ON UPDATE CASCADE
            ");
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
        }
        if (!$this->hasColumn('madrasah', 'wilayah')) {
            $this->execute("ALTER TABLE madrasah ADD COLUMN wilayah VARCHAR(255) NULL DEFAULT NULL AFTER id_koordinator");
        }
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasColumn('madrasah', 'id_koordinator')) {
            $fk = $this->fetchRow("
                SELECT 1 AS ok FROM information_schema.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'madrasah'
                  AND CONSTRAINT_NAME = 'fk_madrasah_koordinator' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
                LIMIT 1
            ");
            if ($fk !== false && !empty($fk)) {
                $this->execute('ALTER TABLE madrasah DROP FOREIGN KEY fk_madrasah_koordinator');
            }
            $this->execute('ALTER TABLE madrasah DROP COLUMN id_koordinator');
        }
        foreach (['wilayah', 'kode_pos', 'provinsi', 'kabupaten', 'kecamatan', 'desa'] as $col) {
            if ($this->hasColumn('madrasah', $col)) {
                $this->execute("ALTER TABLE madrasah DROP COLUMN " . $col);
            }
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
