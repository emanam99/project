<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus fitur "Akses AI dari WA (per akun)": kolom users, tabel token aktivasi.
 */
final class DropPersonalWaAiAccess extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('ai___aktivasi')) {
            $this->execute('DROP TABLE `ai___aktivasi`');
        }
        if ($this->hasTable('ai_wa_activation_tokens')) {
            $this->execute('DROP TABLE `ai_wa_activation_tokens`');
        }

        if (!$this->hasTable('users')) {
            return;
        }

        if ($this->tableHasColumn('users', 'ai_wa_jid')) {
            $this->execute('ALTER TABLE `users` DROP COLUMN `ai_wa_jid`');
        }

        if ($this->tableHasColumn('users', 'ai_whatsapp_enabled')) {
            try {
                $this->execute('ALTER TABLE `users` DROP INDEX `idx_ai_whatsapp_enabled`');
            } catch (\Throwable $e) {
                // indeks mungkin sudah tidak ada atau nama berbeda
            }
            $this->execute('ALTER TABLE `users` DROP COLUMN `ai_whatsapp_enabled`');
        }
    }

    public function down(): void
    {
        // Tidak dipulihkan: fitur per-akun dihapus permanen.
    }

    private function tableHasColumn(string $table, string $column): bool
    {
        $t = str_replace('`', '``', $table);
        $c = str_replace('`', '``', $column);
        $rows = $this->fetchAll("SHOW COLUMNS FROM `{$t}` LIKE '{$c}'");

        return is_array($rows) && count($rows) > 0;
    }
}
