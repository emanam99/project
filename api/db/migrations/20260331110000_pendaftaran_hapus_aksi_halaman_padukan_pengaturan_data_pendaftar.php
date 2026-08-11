<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus aksi halaman penuh (Padukan Data, Pengaturan) dan aksi eksport/ubah massal Data Pendaftar.
 * Tambah satu aksi: filter formal/diniyah bisa semua lembaga (tanpa aksi = hanya lembaga sesuai scope role).
 */
final class PendaftaranHapusAksiHalamanPadukanPengaturanDataPendaftar extends AbstractMigration
{
    public function up(): void
    {
        $remove = [
            'action.pendaftaran.data_pendaftar.export',
            'action.pendaftaran.data_pendaftar.bulk_edit',
            'action.pendaftaran.route.padukan_data',
            'action.pendaftaran.route.pengaturan',
        ];
        $in = "'" . implode("','", $remove) . "'";
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ($in)"
        );

        $conn = $this->getAdapter()->getConnection();
        $metaPsb = '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}';
        $pidStmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $pidStmt->execute(['menu.pendaftaran.data_pendaftar']);
        $prow = $pidStmt->fetch(\PDO::FETCH_ASSOC);
        if ($prow === false || empty($prow['id'])) {
            return;
        }
        $parentId = (int) $prow['id'];
        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'Pendaftaran\', ?, ?)'
        );
        $ins->execute([
            $parentId,
            'action.pendaftaran.data_pendaftar.filter_formal_diniyah_semua_lembaga',
            'Data Pendaftar · Filter formal/diniyah semua lembaga',
            10,
            $metaPsb,
        ]);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.data_pendaftar.filter_formal_diniyah_semua_lembaga'"
        );
    }
}
