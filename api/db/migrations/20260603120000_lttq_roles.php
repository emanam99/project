<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Modul LTTQ: role admin_lttq, petugas_lttq, keuangan_lttq.
 */
final class LttqRoles extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (41, 'admin_lttq', 'Admin LTTQ')");
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (42, 'petugas_lttq', 'Petugas LTTQ')");
        $this->execute("INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES (43, 'keuangan_lttq', 'Keuangan LTTQ')");
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `role` WHERE `key` IN ('admin_lttq','petugas_lttq','keuangan_lttq')");
    }
}
