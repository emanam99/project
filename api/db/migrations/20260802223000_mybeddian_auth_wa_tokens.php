<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Token handshake WA untuk daftar / lupa password / lupa username myBeddien
 * (pola sama daftar_santri_wa_tokens: user kirim ke nomor QR, bot balas link).
 */
final class MybeddianAuthWaTokens extends AbstractMigration
{
    public function change(): void
    {
        if ($this->hasTable('mybeddian_auth_wa_tokens')) {
            return;
        }
        $this->table('mybeddian_auth_wa_tokens', ['id' => false, 'primary_key' => ['id']])
            ->addColumn('id', 'integer', ['identity' => true, 'signed' => false])
            ->addColumn('token_hash', 'string', ['limit' => 64, 'null' => false])
            ->addColumn('purpose', 'string', ['limit' => 32, 'null' => false]) // daftar|lupa_password|lupa_username
            ->addColumn('mode', 'string', ['limit' => 16, 'null' => false]) // santri|pjgt|toko
            ->addColumn('no_wa', 'string', ['limit' => 20, 'null' => false])
            ->addColumn('sender_wa', 'string', ['limit' => 20, 'null' => true, 'default' => null])
            ->addColumn('payload_json', 'text', ['null' => false])
            ->addColumn('wa_verified_at', 'datetime', ['null' => true, 'default' => null])
            ->addColumn('used_at', 'datetime', ['null' => true, 'default' => null])
            ->addColumn('expires_at', 'datetime', ['null' => false])
            ->addColumn('created_at', 'datetime', ['null' => false, 'default' => 'CURRENT_TIMESTAMP'])
            ->addIndex(['token_hash'], ['unique' => true, 'name' => 'uq_mybeddian_auth_wa_token_hash'])
            ->addIndex(['purpose', 'no_wa'], ['name' => 'idx_mybeddian_auth_wa_purpose_wa'])
            ->addIndex(['expires_at'], ['name' => 'idx_mybeddian_auth_wa_expires'])
            ->create();
    }
}
