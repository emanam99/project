<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class DaftarSantriWaTokens extends AbstractMigration
{
    public function change(): void
    {
        if ($this->hasTable('daftar_santri_wa_tokens')) {
            return;
        }
        $this->table('daftar_santri_wa_tokens', ['id' => false, 'primary_key' => ['id']])
            ->addColumn('id', 'integer', ['identity' => true, 'signed' => false])
            ->addColumn('token_hash', 'string', ['limit' => 64, 'null' => false])
            ->addColumn('nik', 'string', ['limit' => 16, 'null' => false])
            ->addColumn('no_wa', 'string', ['limit' => 20, 'null' => false])
            ->addColumn('sender_wa', 'string', ['limit' => 20, 'null' => true, 'default' => null])
            ->addColumn('wa_verified_at', 'datetime', ['null' => true, 'default' => null])
            ->addColumn('used_at', 'datetime', ['null' => true, 'default' => null])
            ->addColumn('expires_at', 'datetime', ['null' => false])
            ->addColumn('created_at', 'datetime', ['null' => false, 'default' => 'CURRENT_TIMESTAMP'])
            ->addIndex(['token_hash'], ['unique' => true, 'name' => 'uq_daftar_santri_wa_token_hash'])
            ->addIndex(['nik'], ['name' => 'idx_daftar_santri_wa_nik'])
            ->addIndex(['expires_at'], ['name' => 'idx_daftar_santri_wa_expires'])
            ->create();
    }
}
