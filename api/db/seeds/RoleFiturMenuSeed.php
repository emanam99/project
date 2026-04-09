<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Bootstrap minimal role___fitur untuk eBeddien (app___fitur id_app=1, type menu|action).
 *
 * Hanya menambahkan penugasan untuk role super_admin → semua menu & aksi yang ada.
 * Role lain: tidak diisi oleh seed — atur lewat Pengaturan → Fitur (role___fitur).
 *
 * Menjalankan seed ini lagi tidak akan menghapus atau menimpa penugasan manual untuk role lain
 * (hanya INSERT IGNORE untuk pasangan super_admin + fitur yang belum ada).
 *
 * Butuh: AppSeed, AppFiturMenuSeed, MenuActionsFiturSeed, lalu seed ini.
 * Cara: php vendor/bin/phinx seed:run -s RoleFiturMenuSeed
 */
class RoleFiturMenuSeed extends AbstractSeed
{
    public function run(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $stmt = $conn->query("SELECT `id` FROM `role` WHERE `key` = 'super_admin' LIMIT 1");
        $row = $stmt ? $stmt->fetch(\PDO::FETCH_ASSOC) : false;
        if ($row === false || empty($row['id'])) {
            return;
        }
        $superId = (int) $row['id'];

        $fiturStmt = $conn->query(
            'SELECT `id` FROM `app___fitur` WHERE `id_app` = 1 AND `type` IN (\'menu\', \'action\') ORDER BY `sort_order`, `id`'
        );
        $fiturs = $fiturStmt ? $fiturStmt->fetchAll(\PDO::FETCH_ASSOC) : [];
        if ($fiturs === []) {
            return;
        }

        foreach ($fiturs as $f) {
            $fiturId = (int) $f['id'];
            $this->execute(sprintf(
                'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`) VALUES (%d, %d)',
                $superId,
                $fiturId
            ));
        }
    }
}
