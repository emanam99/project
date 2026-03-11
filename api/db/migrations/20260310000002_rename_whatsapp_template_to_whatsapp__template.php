<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Rename tabel whatsapp_template → whatsapp___template (dua garis bawah).
 */
final class RenameWhatsappTemplateToWhatsappTemplate extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('RENAME TABLE `whatsapp_template` TO `whatsapp___template`');
    }

    public function down(): void
    {
        $this->execute('RENAME TABLE `whatsapp___template` TO `whatsapp_template`');
    }
}
