<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Ganti nama tabel lama users_webauthn_credentials → user___webauthn (selaras konvensi ___).
 * Untuk DB yang sudah menjalankan migrasi sebelum nama tabel diperbarui.
 */
final class RenameUsersWebauthnCredentialsTable extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('users_webauthn_credentials') && !$this->hasTable('user___webauthn')) {
            $this->execute('RENAME TABLE `users_webauthn_credentials` TO `user___webauthn`');
        }
    }

    public function down(): void
    {
        if ($this->hasTable('user___webauthn') && !$this->hasTable('users_webauthn_credentials')) {
            $this->execute('RENAME TABLE `user___webauthn` TO `users_webauthn_credentials`');
        }
    }
}
