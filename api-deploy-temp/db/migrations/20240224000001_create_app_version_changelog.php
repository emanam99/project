<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel app_version_changelog: catatan perubahan versi per aplikasi (api, daftar, uwaba).
 * AMAN: CREATE TABLE IF NOT EXISTS. Rollback (down) = DROP tabel — hanya jika sengaja.
 */
final class CreateAppVersionChangelog extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("
            CREATE TABLE IF NOT EXISTS app_version_changelog (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                app VARCHAR(50) NOT NULL COMMENT 'Nama aplikasi: api, daftar, uwaba',
                version VARCHAR(50) NOT NULL COMMENT 'Nomor versi, mis. 1.0.0, 1.2.3',
                title VARCHAR(255) DEFAULT NULL COMMENT 'Judul singkat rilis (opsional)',
                changelog TEXT NOT NULL COMMENT 'Catatan: fitur baru, perbaikan, dll. (bisa bullet)',
                released_at DATETIME NOT NULL COMMENT 'Tanggal rilis versi ini',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_app (app),
                KEY idx_app_version (app, version),
                KEY idx_released (released_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Changelog versi per aplikasi (api, daftar, uwaba). App+version boleh sama (banyak catatan per rilis).'
        ");
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS app_version_changelog');
    }
}
