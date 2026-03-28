<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi: koordinator UGT dengan hak ini melihat/mengelola semua madrasah (seperti admin_ugt).
 * Tanpa hak ini: tetap dibatasi id_koordinator = diri sendiri (backend + UI).
 * Meta requiresRole hanya admin_ugt & super_admin agar seed tidak memberi otomatis ke koordinator;
 * super_admin bisa menambahkan role koordinator_ugt lewat halaman Fitur.
 *
 * Setelah migrasi: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
final class UgtDataMadrasahScopeAllAction extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $stmt->execute(['menu.ugt.data_madrasah']);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row === false || empty($row['id'])) {
            return;
        }
        $parentId = (int) $row['id'];
        $meta = '{"requiresRole":["admin_ugt","super_admin"]}';

        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'UGT\', 10, ?)'
        );
        $ins->execute([
            $parentId,
            'action.ugt.data_madrasah.scope_all',
            'Data Madrasah · Lihat semua madrasah',
            $meta,
        ]);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.ugt.data_madrasah.scope_all'"
        );
    }
}
