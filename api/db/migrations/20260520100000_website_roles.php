<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul Website: tambah role baru (admin_web, petugas_web, conten_web)
 * agar role bisa ditugaskan ke pengurus tanpa menunggu RoleSeed dijalankan.
 *
 * Idempoten: INSERT IGNORE (id sengaja tetap untuk konsistensi referensi).
 */
final class WebsiteRoles extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (36, 'admin_web', 'Admin Web')");
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (37, 'petugas_web', 'Petugas Web')");
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (38, 'conten_web', 'Konten Web')");
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `role` WHERE `key` IN ('admin_web','petugas_web','conten_web')");
    }
}
