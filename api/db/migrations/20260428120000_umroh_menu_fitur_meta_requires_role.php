<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Menyelaraskan meta_json menu Umroh di app___fitur dengan API & AppFiturMenuSeed:
 * admin_uwaba, petugas_uwaba, admin_umroh, petugas_umroh, super_admin.
 *
 * Setelah migrasi: jalankan php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 * agar role___fitur mendapat baris baru untuk role yang sebelumnya tidak dapat menu Umroh.
 */
final class UmrohMenuFiturMetaRequiresRole extends AbstractMigration
{
    private const PATHS = [
        '/dashboard-umroh',
        '/umroh/jamaah',
        '/umroh/tabungan',
        '/laporan-umroh',
    ];

    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $meta = json_encode([
            'requiresRole' => ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin'],
        ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $metaSql = $conn->quote($meta);
        foreach (self::PATHS as $path) {
            $this->execute(sprintf(
                'UPDATE `app___fitur` SET `meta_json` = %s WHERE `id_app` = 1 AND `type` = \'menu\' AND `path` = %s',
                $metaSql,
                $conn->quote($path)
            ));
        }
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $meta = json_encode([
            'requiresRole' => ['petugas_umroh', 'super_admin'],
        ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $metaSql = $conn->quote($meta);
        foreach (self::PATHS as $path) {
            $this->execute(sprintf(
                'UPDATE `app___fitur` SET `meta_json` = %s WHERE `id_app` = 1 AND `type` = \'menu\' AND `path` = %s',
                $metaSql,
                $conn->quote($path)
            ));
        }
    }
}
