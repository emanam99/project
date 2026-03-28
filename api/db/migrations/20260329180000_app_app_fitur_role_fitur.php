<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Fondasi RBAC berbasis fitur:
 * - app: daftar aplikasi (mis. eBeddien / UWABA / WA).
 * - app___fitur: menu & action hierarkis (parent_id), per aplikasi.
 * - role___fitur: pemetaan role.id → fitur yang diizinkan.
 *
 * Langkah berikutnya (terpisah): seed data + API + ganti RoleConfig/menuConfig.
 */
final class AppAppFiturRoleFitur extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `app` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(64) NOT NULL COMMENT 'slug stabil, selaras RoleConfig APPS / env',
  `label` varchar(255) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_key` (`key`),
  KEY `idx_app_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `app___fitur` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `id_app` int(11) NOT NULL,
  `parent_id` int(11) DEFAULT NULL COMMENT 'NULL = akar dalam aplikasi',
  `type` enum('menu','action') NOT NULL COMMENT 'menu = navigasi/halaman; action = izin di dalam halaman',
  `code` varchar(128) NOT NULL COMMENT 'kode stabil, unik per id_app',
  `label` varchar(255) NOT NULL DEFAULT '',
  `path` varchar(512) DEFAULT NULL COMMENT 'route frontend untuk type=menu',
  `icon_key` varchar(64) DEFAULT NULL,
  `group_label` varchar(128) DEFAULT NULL COMMENT 'grup sidebar / header',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `meta_json` json DEFAULT NULL COMMENT 'ekstensi: requiresPermission, flags UI, dll.',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_fitur_code` (`id_app`, `code`),
  KEY `idx_app_parent_sort` (`id_app`, `parent_id`, `sort_order`),
  CONSTRAINT `fk_app___fitur_app` FOREIGN KEY (`id_app`) REFERENCES `app` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_app___fitur_parent` FOREIGN KEY (`parent_id`) REFERENCES `app___fitur` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL);

        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `role___fitur` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_id` int(11) NOT NULL,
  `fitur_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_fitur` (`role_id`, `fitur_id`),
  KEY `idx_role___fitur_fitur` (`fitur_id`),
  CONSTRAINT `fk_role___fitur_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role___fitur_fitur` FOREIGN KEY (`fitur_id`) REFERENCES `app___fitur` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `role___fitur`');
        $this->execute('DROP TABLE IF EXISTS `app___fitur`');
        $this->execute('DROP TABLE IF EXISTS `app`');
    }
}
