<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel user___aktivitas: audit trail per aksi user pada entitas bisnis,
 * dengan old_data/new_data untuk fitur rollback oleh super admin.
 *
 * - user_id: siapa yang melakukan (users.id)
 * - pengurus_id: untuk tampilan nama (pengurus.id), nullable
 * - action: create | update | delete | rollback
 * - entity_type: nama tabel/logikal (pengeluaran, pemasukan, psb___registrasi, santri, uwaba___bayar, dll.)
 * - entity_id: nilai PK (atau string untuk composite key)
 * - old_data: JSON snapshot sebelum perubahan (dipakai untuk rollback)
 * - new_data: JSON snapshot setelah perubahan
 * - ref_aktivitas_id: jika action=rollback, referensi ke id aktivitas yang di-revert
 */
final class UserAktivitas extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `user___aktivitas` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL COMMENT 'users.id - siapa yang melakukan',
  `pengurus_id` int(11) DEFAULT NULL COMMENT 'pengurus.id - untuk tampilan nama',
  `action` varchar(50) NOT NULL COMMENT 'create, update, delete, rollback',
  `entity_type` varchar(80) NOT NULL COMMENT 'nama tabel atau entitas: pengeluaran, pemasukan, psb___registrasi, santri, uwaba___bayar, dll.',
  `entity_id` varchar(100) NOT NULL COMMENT 'nilai primary key (atau string untuk composite)',
  `old_data` json DEFAULT NULL COMMENT 'snapshot sebelum perubahan - untuk rollback',
  `new_data` json DEFAULT NULL COMMENT 'snapshot setelah perubahan',
  `ref_aktivitas_id` bigint(20) unsigned DEFAULT NULL COMMENT 'jika action=rollback, id aktivitas yang di-revert',
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_pengurus_id` (`pengurus_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_ref_aktivitas` (`ref_aktivitas_id`),
  KEY `idx_action` (`action`),
  CONSTRAINT `fk_aktivitas_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_aktivitas_pengurus` FOREIGN KEY (`pengurus_id`) REFERENCES `pengurus` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_aktivitas_ref` FOREIGN KEY (`ref_aktivitas_id`) REFERENCES `user___aktivitas` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit trail aksi user + data untuk rollback oleh super admin'
SQL
        );
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS user___aktivitas');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
