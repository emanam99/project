<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Logo lembaga: path relatif ke folder uploads (uploads/lembaga/...), hanya PNG via API.
 */
final class LembagaLogoPath extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        if (!$this->hasTable('lembaga')) {
            return;
        }
        $table = $this->table('lembaga');
        if (!$table->hasColumn('logo_path')) {
            $table->addColumn('logo_path', 'string', [
                'limit' => 500,
                'null' => true,
                'default' => null,
                'comment' => 'Path relatif logo PNG (uploads/lembaga/...)',
                'after' => 'deskripsi',
            ])->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('lembaga')) {
            return;
        }
        $table = $this->table('lembaga');
        if ($table->hasColumn('logo_path')) {
            $table->removeColumn('logo_path')->update();
        }
    }
}
