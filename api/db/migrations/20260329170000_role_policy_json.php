<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kebijakan permission & allowed_apps per role: override opsional di DB (NULL = pakai RoleConfig PHP).
 */
final class RolePolicyJson extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('role')) {
            return;
        }
        $t = $this->table('role');
        $changed = false;
        if (!$t->hasColumn('permissions_json')) {
            $t->addColumn('permissions_json', 'json', [
                'null' => true,
                'comment' => 'NULL = pakai RoleConfig::ROLE_PERMISSIONS',
            ]);
            $changed = true;
        }
        if (!$t->hasColumn('allowed_apps_json')) {
            $t->addColumn('allowed_apps_json', 'json', [
                'null' => true,
                'comment' => 'NULL = pakai RoleConfig::ROLE_ALLOWED_APPS',
            ]);
            $changed = true;
        }
        if ($changed) {
            $t->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('role')) {
            return;
        }
        $t = $this->table('role');
        if ($t->hasColumn('allowed_apps_json')) {
            $t->removeColumn('allowed_apps_json');
        }
        if ($t->hasColumn('permissions_json')) {
            $t->removeColumn('permissions_json');
        }
        $t->update();
    }
}
