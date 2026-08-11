<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Foto profil akun portal Mybeddian tanpa entitas santri/toko (mis. PJGT/madrasah).
 */
final class UsersFotoProfilPortal extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('users')) {
            return;
        }
        $t = $this->table('users');
        if (!$t->hasColumn('foto_profil')) {
            $t->addColumn('foto_profil', 'string', ['limit' => 255, 'null' => true, 'after' => 'last_login_at'])
                ->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('users')) {
            return;
        }
        $t = $this->table('users');
        if ($t->hasColumn('foto_profil')) {
            $t->removeColumn('foto_profil')->update();
        }
    }
}
