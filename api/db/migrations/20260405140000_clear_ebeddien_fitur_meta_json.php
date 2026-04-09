<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menyelaraskan app___fitur eBeddien dengan model akses berbasis role___fitur saja:
 * hapus meta_json (requiresRole, dll.) dari semua menu & aksi id_app=1.
 * Penugasan tetap di Pengaturan → Fitur; seed tidak lagi menulis aturan di meta.
 */
final class ClearEbeddienFiturMetaJson extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            "UPDATE `app___fitur` SET `meta_json` = NULL WHERE `id_app` = 1 AND `type` IN ('menu', 'action')"
        );
    }

    public function down(): void
    {
        // Tidak dipulihkan — meta lama bervariasi per lingkungan.
    }
}
