<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Cabut grant otomatis menu.alumni ke role yang punya Santri/Lulusan
 * (migrasi 20260724130000). ISBAD/Alumni hanya lewat penugasan eksplisit
 * (super_admin tetap; role lain lewat Pengaturan → Fitur).
 */
final class AlumniIsbadRevokeAutoGrant extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(
            'DELETE rf FROM `role___fitur` rf
             INNER JOIN `app___fitur` f ON f.`id` = rf.`fitur_id`
               AND f.`id_app` = 1
               AND f.`code` IN (
                 \'menu.alumni\',
                 \'action.alumni.edit\',
                 \'action.alumni.hapus\',
                 \'action.alumni.status\'
               )
             INNER JOIN `role` r ON r.`id` = rf.`role_id`
             WHERE r.`key` <> \'super_admin\''
        );

        // Pastikan super_admin tetap punya menu + aksi alumni
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT r.`id`, f.`id`
             FROM `role` r
             CROSS JOIN `app___fitur` f
             WHERE r.`key` = \'super_admin\'
               AND f.`id_app` = 1
               AND f.`code` IN (
                 \'menu.alumni\',
                 \'action.alumni.edit\',
                 \'action.alumni.hapus\',
                 \'action.alumni.status\'
               )'
        );
    }

    public function down(): void
    {
        // Kembalikan grant ke role yang punya Santri/Lulusan (menu saja)
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT DISTINCT rf.`role_id`, alum.`id`
             FROM `role___fitur` rf
             INNER JOIN `app___fitur` src ON src.`id` = rf.`fitur_id`
               AND src.`id_app` = 1
               AND src.`type` = \'menu\'
               AND src.`code` IN (\'menu.lulusan\', \'menu.santri\')
             CROSS JOIN `app___fitur` alum
               ON alum.`code` = \'menu.alumni\' AND alum.`id_app` = 1 AND alum.`type` = \'menu\''
        );
    }
}
