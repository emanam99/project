<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Banyak passkey per akun: pindahkan dari kolom users ke tabel user___webauthn (konvensi nama tabel ___).
 */
final class UsersWebauthnCredentialsMulti extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'CREATE TABLE IF NOT EXISTS `user___webauthn` ('
            . '`id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,'
            . '`users_id` int(11) NOT NULL,'
            . '`credential_id` varbinary(255) NOT NULL COMMENT \'Raw credential ID\','
            . '`public_key` LONGBLOB NOT NULL,'
            . '`counter` bigint(20) unsigned NOT NULL DEFAULT 0,'
            . '`credential_json` LONGTEXT NOT NULL COMMENT \'PublicKeyCredentialSource JSON\','
            . '`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,'
            . '`updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,'
            . 'PRIMARY KEY (`id`),'
            . 'UNIQUE KEY `uk_user_webauthn_credential_id` (`credential_id`(255)),'
            . 'KEY `idx_user_webauthn_users_id` (`users_id`),'
            . 'CONSTRAINT `fk_user_webauthn_users` FOREIGN KEY (`users_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=\'Passkey WebAuthn per user (banyak baris per users_id)\''
        );

        // Migrasi data lama (satu kredensial per user di kolom users)
        $this->execute(
            'INSERT INTO `user___webauthn` (`users_id`, `credential_id`, `public_key`, `counter`, `credential_json`) '
            . 'SELECT `id`, `webauthn_credential_id`, `webauthn_public_key`, `webauthn_counter`, `webauthn_credential_json` '
            . 'FROM `users` WHERE `webauthn_credential_id` IS NOT NULL AND `webauthn_credential_json` IS NOT NULL AND `webauthn_credential_json` != \'\''
        );

        $this->execute('ALTER TABLE `users` DROP KEY `uniq_webauthn_credential_id`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_credential_json`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_counter`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_public_key`');
        $this->execute('ALTER TABLE `users` DROP COLUMN `webauthn_credential_id`');
    }

    public function down(): void
    {
        $this->execute(
            'ALTER TABLE `users` ADD COLUMN `webauthn_credential_id` VARBINARY(255) DEFAULT NULL COMMENT \'Raw credential ID (binary)\' AFTER `last_login_at`'
        );
        $this->execute(
            'ALTER TABLE `users` ADD COLUMN `webauthn_public_key` LONGBLOB DEFAULT NULL COMMENT \'COSE public key bytes\' AFTER `webauthn_credential_id`'
        );
        $this->execute(
            'ALTER TABLE `users` ADD COLUMN `webauthn_counter` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT \'Sign counter (anti replay)\' AFTER `webauthn_public_key`'
        );
        $this->execute(
            'ALTER TABLE `users` ADD COLUMN `webauthn_credential_json` LONGTEXT DEFAULT NULL COMMENT \'PublicKeyCredentialSource JSON (web-auth)\' AFTER `webauthn_counter`'
        );
        $this->execute('ALTER TABLE `users` ADD UNIQUE KEY `uniq_webauthn_credential_id` (`webauthn_credential_id`(255))');

        // Pulihkan satu baris per user (kredensial terbaru)
        $this->execute(
            'UPDATE `users` u INNER JOIN ('
            . 'SELECT w1.users_id, w1.credential_id, w1.public_key, w1.counter, w1.credential_json FROM `user___webauthn` w1 '
            . 'INNER JOIN (SELECT users_id, MAX(id) AS mid FROM `user___webauthn` GROUP BY users_id) t '
            . 'ON w1.users_id = t.users_id AND w1.id = t.mid'
            . ') x ON u.id = x.users_id '
            . 'SET u.webauthn_credential_id = x.credential_id, u.webauthn_public_key = x.public_key, '
            . 'u.webauthn_counter = x.counter, u.webauthn_credential_json = x.credential_json'
        );

        $this->execute('DROP TABLE IF EXISTS `user___webauthn`');
    }
}
