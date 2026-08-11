<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Instalasi lama memakai ai_wa_activation_tokens — rename ke ai___aktivasi.
 */
final class RenameAiWaActivationTokensTable extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('ai_wa_activation_tokens') && !$this->hasTable('ai___aktivasi')) {
            $this->execute('RENAME TABLE `ai_wa_activation_tokens` TO `ai___aktivasi`');
        }
    }

    public function down(): void
    {
        if ($this->hasTable('ai___aktivasi') && !$this->hasTable('ai_wa_activation_tokens')) {
            $this->execute('RENAME TABLE `ai___aktivasi` TO `ai_wa_activation_tokens`');
        }
    }
}
