<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi: ubah keterangan status di form biodata; kelola pembayaran PSB (tambah/hapus/alokasi).
 */
final class PendaftaranBiodataKeteranganPembayaranActions extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $metaPsb = '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}';

        $pidStmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $pidStmt->execute(['menu.pendaftaran']);
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
            'action.pendaftaran.biodata.ubah_keterangan_status',
            'Pendaftaran · Ubah keterangan status',
            88,
            $metaPsb,
        ]);
        $ins->execute([
            $parentId,
            'action.pendaftaran.pembayaran.kelola',
            'Pendaftaran · Kelola pembayaran PSB',
            90,
            $metaPsb,
        ]);
    }

    public function down(): void
    {
        $codes = [
            'action.pendaftaran.biodata.ubah_keterangan_status',
            'action.pendaftaran.pembayaran.kelola',
        ];
        $in = "'" . implode("','", $codes) . "'";
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ($in)"
        );
    }
}
