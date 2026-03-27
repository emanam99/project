<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hitung login dengan password (bukan passkey) untuk interval pengingat daftar passkey.
 */
final class UsersPasswordLoginCount extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "ALTER TABLE `users` ADD COLUMN `password_login_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Jumlah login sukses via password (bukan WebAuthn)' AFTER `webauthn_credential_json`"
        );
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `users` DROP COLUMN `password_login_count`');
    }
}
