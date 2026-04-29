<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class AddAdminDiniyahAdminFormalRoles extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "INSERT IGNORE INTO `role` (`id`, `key`, `label`) VALUES
            (34, 'admin_diniyah', 'Admin Diniyah'),
            (35, 'admin_formal', 'Admin Formal')"
        );
    }

    public function down(): void
    {
        $this->execute("DELETE FROM `role` WHERE `id` IN (34, 35) AND `key` IN ('admin_diniyah', 'admin_formal')");
    }
}

