<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Untuk basis data yang sudah menjalankan versi lama 20260330160000 (aksi dashboard).
 * Fresh install memakai 20260330160000 yang sudah tanpa dashboard + sudah ada hapus_santri.
 */
final class PendaftaranRemoveDashboardActionsAddHapusSantri extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $codes = [
            'action.pendaftaran.dashboard.stats_cards',
            'action.pendaftaran.dashboard.charts',
            'action.pendaftaran.dashboard.last_pendaftar',
        ];
        $placeholders = implode(',', array_fill(0, count($codes), '?'));
        $del = $conn->prepare("DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` IN ($placeholders)");
        $del->execute($codes);

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
            'action.pendaftaran.biodata.hapus_santri',
            'Pendaftaran · Hapus registrasi / santri (biodata)',
            95,
            $metaPsb,
        ]);
    }

    public function down(): void
    {
        $this->execute(
            "DELETE FROM `app___fitur` WHERE `id_app` = 1 AND `type` = 'action' AND `code` = 'action.pendaftaran.biodata.hapus_santri'"
        );
        $conn = $this->getAdapter()->getConnection();

        $metaPsb = '{"requiresRole":["admin_psb","petugas_psb","super_admin"]}';
        $pidStmt = $conn->prepare('SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = ? LIMIT 1');
        $pidStmt->execute(['menu.dashboard_pendaftaran']);
        $prow = $pidStmt->fetch(\PDO::FETCH_ASSOC);
        if ($prow === false || empty($prow['id'])) {
            return;
        }
        $parentId = (int) $prow['id'];
        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . 'VALUES (1, ?, \'action\', ?, ?, NULL, NULL, \'Pendaftaran\', ?, ?)'
        );
        foreach (
            [
                ['action.pendaftaran.dashboard.stats_cards', 'Dashboard PSB · Kartu statistik', 10],
                ['action.pendaftaran.dashboard.charts', 'Dashboard PSB · Diagram', 20],
                ['action.pendaftaran.dashboard.last_pendaftar', 'Dashboard PSB · 10 pendaftar terakhir', 30],
            ] as $r
        ) {
            $ins->execute([$parentId, $r[0], $r[1], $r[2], $metaPsb]);
        }
    }
}
