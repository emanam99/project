<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom no_wa di user___setup_tokens untuk menyimpan nomor WA saat daftar (sebelum akun users dibuat).
 * Dipakai oleh postSetupAkun untuk mengisi users.no_wa saat buat akun.
 */
final class UserSetupTokensAddNoWa extends AbstractMigration
{
    public function up(): void
    {
        $table = $this->table('user___setup_tokens');
        if (!$table->hasColumn('no_wa')) {
            $table->addColumn('no_wa', 'string', ['limit' => 20, 'null' => true, 'after' => 'expires_at'])
                ->update();
        }
    }

    public function down(): void
    {
        $table = $this->table('user___setup_tokens');
        if ($table->hasColumn('no_wa')) {
            $table->removeColumn('no_wa')->update();
        }
    }
}
