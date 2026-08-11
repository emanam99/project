<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Preferensi provider obrolan AI (DeepSeek / Gemini) — disinkronkan dari UI eBeddien, dipakai kanal WA.
 */
final class UsersAiChatApiProviderPref extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('users')) {
            return;
        }
        if (!$this->migrationColumnExists('users', 'ai_chat_api_provider_pref')) {
            $this->execute(
                "ALTER TABLE `users` ADD COLUMN `ai_chat_api_provider_pref` varchar(16) DEFAULT NULL "
                . "COMMENT 'deepseek|gemini — pilihan model di Chat AI (WA memakai ini)' AFTER `ai_chat_mode_pref`"
            );
        }
        if (!$this->migrationColumnExists('users', 'ai_chat_gemini_model_pref')) {
            $this->execute(
                "ALTER TABLE `users` ADD COLUMN `ai_chat_gemini_model_pref` varchar(64) DEFAULT NULL "
                . "COMMENT 'id model Gemini, mis. gemini-2.5-flash-lite' AFTER `ai_chat_api_provider_pref`"
            );
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('users')) {
            return;
        }
        if ($this->migrationColumnExists('users', 'ai_chat_gemini_model_pref')) {
            $this->execute('ALTER TABLE `users` DROP COLUMN `ai_chat_gemini_model_pref`');
        }
        if ($this->migrationColumnExists('users', 'ai_chat_api_provider_pref')) {
            $this->execute('ALTER TABLE `users` DROP COLUMN `ai_chat_api_provider_pref`');
        }
    }

    private function migrationColumnExists(string $table, string $column): bool
    {
        $t = str_replace('`', '``', $table);
        $c = str_replace('`', '``', $column);
        $rows = $this->fetchAll("SHOW COLUMNS FROM `{$t}` LIKE '{$c}'");

        return is_array($rows) && count($rows) > 0;
    }
}
