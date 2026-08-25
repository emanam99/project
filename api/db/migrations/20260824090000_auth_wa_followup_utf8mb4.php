<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Token handshake WA harus utf8mb4 agar emoji ack (🔄) tidak jadi tanda tanya.
 */
final class AuthWaFollowupUtf8mb4 extends AbstractMigration
{
    public function up(): void
    {
        foreach (['daftar_santri_wa_tokens', 'mybeddian_auth_wa_tokens'] as $table) {
            if (!$this->hasTable($table)) {
                continue;
            }
            $this->execute(
                "ALTER TABLE `{$table}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            );
        }
    }
}
