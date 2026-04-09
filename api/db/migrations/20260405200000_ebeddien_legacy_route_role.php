<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Fallback role per grup middleware (EbeddienFiturMiddleware arg ke-2) — satu sumber di DB.
 * Kunci selaras nama method EbeddienFiturAccess / selector; pengecualian: psbTarbiyahSuperSelectorsSantri.
 */
final class EbeddienLegacyRouteRole extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
CREATE TABLE IF NOT EXISTS `ebeddien_legacy_route_role` (
  `legacy_key` varchar(96) NOT NULL COMMENT 'Grup fallback; biasanya sama dengan selector_key fitur',
  `role_key` varchar(80) NOT NULL,
  `sort_order` smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (`legacy_key`, `role_key`),
  KEY `idx_legacy_key` (`legacy_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC
SQL);

        $groups = [
            'financeMenus' => ['admin_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin'],
            'superAdminMenus' => ['super_admin'],
            'ugtMenus' => ['admin_ugt', 'koordinator_ugt', 'super_admin'],
            'tarbiyahSuperSelectors' => ['super_admin', 'tarbiyah'],
            'kalenderGoogleStaffSelectors' => ['admin_kalender', 'super_admin'],
            'psbStaffSuperSelectors' => ['admin_psb', 'petugas_psb', 'super_admin', 'santri'],
            'psbAdminSuperSelectors' => ['admin_psb', 'super_admin'],
            'psbTarbiyahSuperSelectors' => ['admin_psb', 'petugas_psb', 'super_admin', 'tarbiyah'],
            'psbTarbiyahSuperSelectorsSantri' => ['admin_psb', 'petugas_psb', 'super_admin', 'santri', 'tarbiyah'],
            'dashboardLaporanIjinSelectors' => ['admin_uwaba', 'petugas_uwaba', 'admin_ijin', 'petugas_ijin', 'super_admin'],
            'dashboardLaporanPsbSelectors' => ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin'],
            'cashlessAdminSelectors' => ['admin_cashless', 'super_admin'],
            'kalenderPengaturanBulanSelectors' => ['admin_kalender', 'super_admin'],
            'kalenderPengaturanHariPentingSelectors' => ['admin_kalender', 'super_admin'],
            'umrohModuleSelectors' => ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin'],
            'uwabaStaffSuperSelectors' => ['petugas_uwaba', 'admin_uwaba', 'super_admin'],
            'aktivitasPemasukanAdminSelectors' => ['admin_uwaba', 'petugas_keuangan', 'super_admin'],
            'userListUwabaNotifySelectors' => ['admin_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin'],
            'uwabaStaffSelectors' => ['petugas_uwaba', 'admin_uwaba', 'super_admin'],
            'profilSaldoKeuanganSelectors' => ['admin_uwaba', 'petugas_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin'],
            'waSendSelectors' => ['super_admin', 'admin_psb', 'petugas_psb', 'admin_uwaba', 'petugas_uwaba'],
            'waProcessPendingSelectors' => ['super_admin', 'admin_psb', 'petugas_psb'],
            'chatStaffSelectors' => ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin'],
            'ijinStaffSelectors' => ['admin_ijin', 'petugas_ijin', 'super_admin'],
            'ijinBoyongSelectors' => ['admin_ijin', 'super_admin'],
            'manageUsersV2Selectors' => ['super_admin', 'admin_cashless'],
            'manageUsersLegacySelectors' => ['super_admin', 'admin_ugt', 'tarbiyah'],
            'lembagaGetSelectors' => ['super_admin', 'admin_uwaba', 'admin_lembaga', 'tarbiyah'],
            'lembagaWriteSelectors' => ['super_admin', 'tarbiyah'],
            'alamatListSelectors' => ['admin_ugt', 'super_admin', 'tarbiyah'],
            'pengurusListSelectors' => ['admin_ugt', 'super_admin', 'admin_uwaba', 'tarbiyah'],
        ];

        $conn = $this->getAdapter()->getConnection();
        foreach ($groups as $legacyKey => $roles) {
            $i = 0;
            foreach ($roles as $rk) {
                $lk = $conn->quote($legacyKey);
                $rkv = $conn->quote($rk);
                $this->execute(sprintf(
                    'INSERT IGNORE INTO `ebeddien_legacy_route_role` (`legacy_key`, `role_key`, `sort_order`) VALUES (%s, %s, %d)',
                    $lk,
                    $rkv,
                    $i
                ));
                ++$i;
            }
        }
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS `ebeddien_legacy_route_role`');
    }
}
