<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom role_id di app_version_changelog.
 * NULL = entri visible untuk semua (public). Isi = hanya role tersebut yang boleh lihat.
 * AMAN: Cek dulu apakah kolom/constraint sudah ada; tidak menghapus data.
 */
final class AddChangelogRoleId extends AbstractMigration
{
    public function up(): void
    {
        $row = $this->fetchRow("
            SELECT 1 AS ok FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'app_version_changelog'
              AND COLUMN_NAME = 'role_id'
            LIMIT 1
        ");
        $columnExists = $row !== false && !empty($row);

        if (!$columnExists) {
            $this->execute("
                ALTER TABLE app_version_changelog
                    ADD COLUMN role_id INT(11) NULL DEFAULT NULL COMMENT 'FK ke role.id; NULL = visible untuk semua role' AFTER app,
                    ADD KEY idx_role_id (role_id),
                    ADD CONSTRAINT fk_changelog_role FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE SET NULL ON UPDATE CASCADE
            ");
        }
    }

    public function down(): void
    {
        $row = $this->fetchRow("
            SELECT 1 AS ok FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'app_version_changelog'
              AND COLUMN_NAME = 'role_id'
            LIMIT 1
        ");
        if ($row === false || empty($row)) {
            return;
        }
        $fk = $this->fetchRow("
            SELECT 1 AS ok FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'app_version_changelog'
              AND CONSTRAINT_NAME = 'fk_changelog_role'
              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
            LIMIT 1
        ");
        if ($fk !== false && !empty($fk)) {
            $this->execute('ALTER TABLE app_version_changelog DROP FOREIGN KEY fk_changelog_role');
        }
        $this->execute('ALTER TABLE app_version_changelog DROP COLUMN role_id');
    }
}
