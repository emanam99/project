<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * WebAuthn / passkey: kredensial per user + challenge sementara untuk ceremony.
 * Kolom users: credential_id, public_key, counter (anti replay) + JSON penuh untuk library.
 */
final class UsersWebauthn extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "ALTER TABLE `users` ADD COLUMN `webauthn_credential_id` VARBINARY(255) DEFAULT NULL COMMENT 'Raw credential ID (binary)' AFTER `last_login_at`"
        );
        $this->execute(
            "ALTER TABLE `users` ADD COLUMN `webauthn_public_key` LONGBLOB DEFAULT NULL COMMENT 'COSE public key bytes' AFTER `webauthn_credential_id`"
        );
        $this->execute(
            "ALTER TABLE `users` ADD COLUMN `webauthn_counter` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Sign counter (anti replay)' AFTER `webauthn_public_key`"
        );
        $this->execute(
            "ALTER TABLE `users` ADD COLUMN `webauthn_credential_json` LONGTEXT DEFAULT NULL COMMENT 'PublicKeyCredentialSource JSON (web-auth)' AFTER `webauthn_counter`"
        );
        $this->execute('ALTER TABLE `users` ADD UNIQUE KEY `uniq_webauthn_credential_id` (`webauthn_credential_id`(255))');

        $this->execute(
            'CREATE TABLE `webauthn_challenges` ('
            . '`id` char(36) NOT NULL,'
            . '`users_id` int(11) NOT NULL,'
            . '`purpose` enum(\'registration\',\'authentication\') NOT NULL,'
            . '`challenge` varbinary(255) NOT NULL,'
            . '`expires_at` datetime NOT NULL,'
            . '`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,'
            . 'PRIMARY KEY (`id`),'
            . 'KEY `idx_users_id` (`users_id`),'
            . 'KEY `idx_expires_at` (`expires_at`),'
            . 'CONSTRAINT `fk_webauthn_challenges_users` FOREIGN KEY (`users_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `webauthn_challenges`');
        $this->execute('ALTER TABLE `users` DROP KEY `uniq_webauthn_credential_id`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_credential_json`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_counter`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_public_key`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_credential_id`');
    }
}
