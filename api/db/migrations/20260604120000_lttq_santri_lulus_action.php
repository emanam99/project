<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Aksi lulus santri dari tingkatan LTTQ (bulk).
 */
final class LttqSantriLulusAction extends AbstractMigration
{
    private const ID_APP = 1;
    private const GROUP_LABEL = 'LTTQ';

    public function up(): void
    {
        if (!$this->hasTable('app___fitur')) {
            return;
        }
        $conn = $this->getAdapter()->getConnection();
        $exists = $conn->prepare('SELECT id FROM app___fitur WHERE code = ? LIMIT 1');
        $exists->execute(['action.lttq.santri.lulus']);
        if ($exists->fetch(\PDO::FETCH_ASSOC)) {
            return;
        }
        $pidStmt = $conn->prepare('SELECT id FROM app___fitur WHERE id_app = ? AND code = ? LIMIT 1');
        $pidStmt->execute([self::ID_APP, 'menu.lttq.santri']);
        $parent = $pidStmt->fetch(\PDO::FETCH_ASSOC);
        if (!$parent || empty($parent['id'])) {
            return;
        }
        $ins = $conn->prepare(
            'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) '
            . "VALUES (?, ?, 'action', ?, ?, NULL, NULL, ?, 30, NULL)"
        );
        $ins->execute([self::ID_APP, (int) $parent['id'], 'action.lttq.santri.lulus', 'Santri LTTQ · Luluskan', self::GROUP_LABEL]);

        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` IN ('super_admin','admin_lttq')
               AND f.`code` = 'action.lttq.santri.lulus'"
        );
        $this->execute(
            "INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` = 'petugas_lttq'
               AND f.`code` = 'action.lttq.santri.lulus'"
        );
    }

    public function down(): void
    {
        if (!$this->hasTable('app___fitur')) {
            return;
        }
        $row = $this->fetchRow("SELECT id FROM app___fitur WHERE code = 'action.lttq.santri.lulus' LIMIT 1");
        if (!$row) {
            return;
        }
        $id = (int) $row['id'];
        $this->execute("DELETE FROM role___fitur WHERE fitur_id = {$id}");
        $this->execute("DELETE FROM app___fitur WHERE id = {$id}");
    }
}
