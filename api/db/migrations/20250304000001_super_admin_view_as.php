<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel super_admin_view_as: pengaturan "coba sebagai" role untuk super admin.
 * Hanya satu baris per pengurus (super_admin). Saat di-set, semua request API
 * memperlakukan user tersebut sebagai role + lembaga yang dipilih.
 */
final class SuperAdminViewAs extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `super_admin_view_as` (
  `pengurus_id` int(11) NOT NULL COMMENT 'pengurus.id yang berrole super_admin',
  `view_as_role` varchar(80) NOT NULL COMMENT 'role_key yang dipakai (mis. admin_psb)',
  `view_as_lembaga_id` int(11) DEFAULT NULL COMMENT 'lembaga_id untuk filter data',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`pengurus_id`),
  KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `super_admin_view_as`');
    }
}
