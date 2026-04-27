<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah aksi granular Data Pendaftar:
 * - aktif pondok
 * - aktif diniyah
 * - aktif formal
 *
 * Aksi ini dipakai frontend untuk kontrol visibilitas tombol,
 * sehingga super_admin bisa assign per role secara terpisah.
 */
final class PendaftaranDataPendaftarAktifActions extends AbstractMigration
{
    public function up(): void
    {
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

        $rows = [
            ['action.pendaftaran.data_pendaftar.aktif_pondok', 'Data Pendaftar · Aktif Pondok', 20],
            ['action.pendaftaran.data_pendaftar.aktif_diniyah', 'Data Pendaftar · Aktif Diniyah', 30],
            ['action.pendaftaran.data_pendaftar.aktif_formal', 'Data Pendaftar · Aktif Formal', 40],
        ];

        foreach ($rows as $r) {
            $ins->execute([$parentId, $r[0], $r[1], $r[2], $metaPsb]);
        }
    }

    public function down(): void
    {
        $codes = [
            'action.pendaftaran.data_pendaftar.aktif_pondok',
            'action.pendaftaran.data_pendaftar.aktif_diniyah',
            'action.pendaftaran.data_pendaftar.aktif_formal',
        ];
        $in = "'" . implode("','", $codes) . "'";
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ($in)"
        );
    }
}
