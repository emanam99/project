<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Menugaskan menu Nailul Murod ke role admin_wirid (selain lewat UI Fitur).
 * Butuh: RoleSeed, AppFiturMenuSeed, RoleFiturMenuSeed.
 * Aman diulang: INSERT IGNORE.
 */
class AdminWiridNailulMurodFiturSeed extends AbstractSeed
{
    public function run(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $r = $conn->query("SELECT `id` FROM `role` WHERE `key` = 'admin_wirid' LIMIT 1");
        $rowR = $r ? $r->fetch(\PDO::FETCH_ASSOC) : false;
        if ($rowR === false || empty($rowR['id'])) {
            return;
        }
        $roleId = (int) $rowR['id'];

        $f = $conn->query("SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `code` = 'menu.wirid.nailul_murod' LIMIT 1");
        $rowF = $f ? $f->fetch(\PDO::FETCH_ASSOC) : false;
        if ($rowF === false || empty($rowF['id'])) {
            return;
        }
        $fiturId = (int) $rowF['id'];

        $this->execute(sprintf(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`) VALUES (%d, %d)',
            $roleId,
            $fiturId
        ));
    }
}
