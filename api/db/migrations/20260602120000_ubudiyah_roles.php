<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul Ubudiyah: tambah role baru (ubudiyah, wakil_ubudiyah)
 * agar role bisa ditugaskan ke pengurus tanpa menunggu RoleSeed dijalankan.
 *
 * Akses fitur/menu dibiarkan kosong di sini — pengguna akan menambah
 * sendiri lewat eBeddien (Role & Akses).
 *
 * Idempoten: INSERT IGNORE (id sengaja tetap untuk konsistensi referensi).
 */
final class UbudiyahRoles extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (39, 'ubudiyah', 'Ubudiyah')");
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (40, 'wakil_ubudiyah', 'Wakil Ubudiyah')");
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `role` WHERE `key` IN ('ubudiyah','wakil_ubudiyah')");
    }
}
