<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Rename wa_interactive_menu_* → whatsapp___menu_* untuk instalasi yang sudah menjalankan migrasi lama.
 */
final class RenameWhatsappMenuTables extends AbstractMigration
{
    public function up(): void
    {
        if ($this->hasTable('wa_interactive_menu_node') && !$this->hasTable('whatsapp___menu_node')) {
            $this->execute(
                'RENAME TABLE `wa_interactive_menu_session` TO `whatsapp___menu_session`, `wa_interactive_menu_node` TO `whatsapp___menu_node`'
            );
        }
    }

    public function down(): void
    {
        if ($this->hasTable('whatsapp___menu_node') && !$this->hasTable('wa_interactive_menu_node')) {
            $this->execute(
                'RENAME TABLE `whatsapp___menu_session` TO `wa_interactive_menu_session`, `whatsapp___menu_node` TO `wa_interactive_menu_node`'
            );
        }
    }
}
