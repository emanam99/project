<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Bersihkan nilai "Array" pada kolom nama ayah/ibu/wali (efek cast array→string di PHP).
 */
final class FixSantriAyahIbuArrayString extends AbstractMigration
{
    public function up(): void
    {
        foreach (['ayah', 'ibu', 'wali'] as $col) {
            $this->execute(
                "UPDATE `santri` SET `{$col}` = NULL WHERE `{$col}` = 'Array' OR `{$col}` = 'array'"
            );
        }
    }

    public function down(): void
    {
        // Data rusak tidak dipulihkan.
    }
}
