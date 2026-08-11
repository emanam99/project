<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom santri_id di user___aktivitas untuk mencatat aksi yang dilakukan oleh santri
 * (mis. santri mengubah biodata sendiri lewat aplikasi daftar).
 * - user_id / pengurus_id = aktor dari sisi pengurus/users
 * - santri_id = aktor dari sisi santri (jika yang melakukan aksi adalah santri, isi id santri tersebut)
 */
final class UserAktivitasAddSantriId extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("
            ALTER TABLE `user___aktivitas`
            ADD COLUMN `santri_id` int(11) DEFAULT NULL COMMENT 'santri.id - jika aksi dilakukan oleh santri (aplikasi daftar)' AFTER `pengurus_id`,
            ADD KEY `idx_santri_id` (`santri_id`),
            ADD CONSTRAINT `fk_aktivitas_santri` FOREIGN KEY (`santri_id`) REFERENCES `santri` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
        ");
    }

    public function down(): void
    {
        $this->execute("
            ALTER TABLE `user___aktivitas`
            DROP FOREIGN KEY `fk_aktivitas_santri`,
            DROP KEY `idx_santri_id`,
            DROP COLUMN `santri_id`
        ");
    }
}
