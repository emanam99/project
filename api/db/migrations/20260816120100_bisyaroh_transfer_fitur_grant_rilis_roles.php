<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Salin aksi transfer/tab Rilis ke role yang sudah punya action.bisyaroh.rekap.rilis.
 */
final class BisyarohTransferFiturGrantRilisRoles extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('app___fitur') || !$this->hasTable('role___fitur')) {
            return;
        }

        $this->execute(<<<'SQL'
INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
SELECT rf.`role_id`, f_new.`id`
FROM `role___fitur` rf
INNER JOIN `app___fitur` f_old ON f_old.`id` = rf.`fitur_id`
  AND f_old.`code` = 'action.bisyaroh.rekap.rilis'
CROSS JOIN `app___fitur` f_new
WHERE f_new.`id_app` = 1
  AND f_new.`type` = 'action'
  AND f_new.`code` IN (
    'action.bisyaroh.tab.rilis',
    'action.bisyaroh.transfer.upload',
    'action.bisyaroh.transfer.reconcile'
  )
SQL);
    }

    public function down(): void
    {
        /* tidak cabut grant agar tidak menghapus penugasan manual */
    }
}
