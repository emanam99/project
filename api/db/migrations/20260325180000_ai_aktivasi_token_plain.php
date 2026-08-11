<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Simpan plaintext token hanya untuk baris belum dipakai (reuse wa.me); dibuang saat used_at.
 */
final class AiAktivasiTokenPlain extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('ai___aktivasi')) {
            return;
        }
        $t = $this->table('ai___aktivasi');
        if (!$t->hasColumn('token_plain')) {
            $this->execute(
                'ALTER TABLE `ai___aktivasi` ADD COLUMN `token_plain` varchar(80) DEFAULT NULL '
                . 'COMMENT \'Hanya baris aktif; NULL setelah dipakai\' AFTER `token_hash`'
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('ai___aktivasi')) {
            return;
        }
        $t = $this->table('ai___aktivasi');
        if ($t->hasColumn('token_plain')) {
            $this->execute('ALTER TABLE `ai___aktivasi` DROP COLUMN `token_plain`');
        }
    }
}
