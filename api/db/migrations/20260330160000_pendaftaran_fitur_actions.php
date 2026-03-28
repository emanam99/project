<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi modul Pendaftaran: dashboard, data pendaftar, sub-rute admin (parent menu terkait).
 * Tanpa aksi granular dashboard; termasuk aksi biodata hapus santri. Setelah migrasi: seed RoleFiturMenuSeed bila perlu.
 */
final class PendaftaranFiturActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $metaPsb = '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}';
        $metaSuperOnly = '{"requiresSuperAdmin":true}';

        $groups = [
            [
                'parent_code' => 'menu.pendaftaran.data_pendaftar',
                'rows' => [
                    ['action.pendaftaran.data_pendaftar.filter_formal_diniyah_semua_lembaga', 'Data Pendaftar · Filter formal/diniyah semua lembaga', 10, $metaPsb],
                ],
            ],
            [
                'parent_code' => 'menu.pendaftaran',
                'rows' => [
                    ['action.pendaftaran.biodata.hapus_santri', 'Pendaftaran · Hapus registrasi / santri (biodata)', 95, $metaPsb],
                ],
            ],
            [
                'parent_code' => 'menu.pendaftaran.item',
                'rows' => [
                    ['action.pendaftaran.route.item', 'Item · Daftar item', 100, $metaSuperOnly],
                    ['action.pendaftaran.route.manage_item_set', 'Item · Item Set', 110, $metaSuperOnly],
                    ['action.pendaftaran.route.manage_kondisi', 'Item · Kondisi', 120, $metaSuperOnly],
                    ['action.pendaftaran.route.kondisi_registrasi', 'Item · Registrasi', 130, $metaSuperOnly],
                    ['action.pendaftaran.route.assign_item', 'Item · Assign item', 140, $metaSuperOnly],
                    ['action.pendaftaran.route.simulasi', 'Item · Simulasi', 150, $metaSuperOnly],
                ],
            ],
        ];

        $pidStmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'Pendaftaran\', ?, ?)'
        );

        foreach ($groups as $g) {
            $pidStmt->execute([$g['parent_code']]);
            $prow = $pidStmt->fetch(\PDO::FETCH_ASSOC);
            if ($prow === false || empty($prow['id'])) {
                continue;
            }
            $parentId = (int) $prow['id'];
            foreach ($g['rows'] as $r) {
                $ins->execute([$parentId, $r[0], $r[1], $r[2], $r[3]]);
            }
        }
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` LIKE 'action.pendaftaran.%'"
        );
    }
}
