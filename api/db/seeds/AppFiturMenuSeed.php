<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Seed menu navigasi eBeddien ke app___fitur (type=menu, id_app=1).
 * Selaras ebeddien/src/config/menuConfig.js — meta_json menyimpan requiresRole / requiresSuperAdmin / requiresPermission.
 *
 * Cara pakai (setelah AppSeed): php vendor/bin/phinx seed:run -s AppFiturMenuSeed
 * Aman berulang: INSERT IGNORE pada (id_app, code).
 */
class AppFiturMenuSeed extends AbstractSeed
{
    private const ID_APP_EBEDDIEN = 1;

    public function run(): void
    {
        $conn = $this->getAdapter()->getConnection();
        $sort = 0;
        foreach ($this->menuRows() as $row) {
            $code = $this->pathToCode($row['path']);
            $meta = $this->buildMetaJson($row);
            $metaSql = $meta === null ? 'NULL' : $conn->quote($meta);

            $this->execute(sprintf(
                'INSERT IGNORE INTO `app___fitur` (`id_app`, `parent_id`, `type`, `code`, `label`, `path`, `icon_key`, `group_label`, `sort_order`, `meta_json`) VALUES (%d, NULL, %s, %s, %s, %s, %s, %s, %d, %s)',
                self::ID_APP_EBEDDIEN,
                $conn->quote('menu'),
                $conn->quote($code),
                $conn->quote($row['label']),
                $conn->quote($row['path']),
                $conn->quote($row['iconKey']),
                $conn->quote($row['group']),
                $sort,
                $metaSql
            ));
            $sort += 10;
        }
    }

    private function pathToCode(string $path): string
    {
        $p = trim($path, '/');
        $p = strtr($p, ['/' => '.', '-' => '_']);

        return 'menu.' . $p;
    }

    /**
     * @param array{path:string,label:string,iconKey:string,group:string,requiresRole?:list<string>,requiresSuperAdmin?:bool,requiresPermission?:string} $row
     */
    private function buildMetaJson(array $row): ?string
    {
        $meta = [];
        if (!empty($row['requiresRole'])) {
            $meta['requiresRole'] = $row['requiresRole'];
        }
        if (!empty($row['requiresSuperAdmin'])) {
            $meta['requiresSuperAdmin'] = true;
        }
        if (!empty($row['requiresPermission'])) {
            $meta['requiresPermission'] = $row['requiresPermission'];
        }
        if ($meta === []) {
            return null;
        }

        return json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * @return list<array{path:string,label:string,iconKey:string,group:string,requiresRole?:list<string>,requiresSuperAdmin?:bool,requiresPermission?:string}>
     */
    private function menuRows(): array
    {
        return [
            ['path' => '/beranda', 'label' => 'Beranda', 'iconKey' => 'home', 'group' => 'My Workspace'],
            ['path' => '/profil', 'label' => 'Profil', 'iconKey' => 'user', 'group' => 'My Workspace'],
            ['path' => '/aktivitas-saya', 'label' => 'Aktivitas Saya', 'iconKey' => 'activity', 'group' => 'My Workspace'],
            ['path' => '/chat', 'label' => 'Chat', 'iconKey' => 'chat', 'group' => 'My Workspace'],
            ['path' => '/chat-ai', 'label' => 'eBeddien', 'iconKey' => 'sparkles', 'group' => 'My Workspace'],
            ['path' => '/super-admin/dashboard', 'label' => 'Online', 'iconKey' => 'usersGroup', 'group' => 'Super Admin', 'requiresSuperAdmin' => true],
            ['path' => '/dashboard-pendaftaran', 'label' => 'Dashboard', 'iconKey' => 'dashboard', 'group' => 'Pendaftaran', 'requiresRole' => ['admin_psb', 'petugas_psb', 'super_admin']],
            ['path' => '/pendaftaran', 'label' => 'Pendaftaran', 'iconKey' => 'document', 'group' => 'Pendaftaran', 'requiresRole' => ['admin_psb', 'petugas_psb', 'super_admin']],
            ['path' => '/pendaftaran/data-pendaftar', 'label' => 'Data Pendaftar', 'iconKey' => 'usersGroup', 'group' => 'Pendaftaran', 'requiresRole' => ['admin_psb', 'petugas_psb', 'super_admin']],
            ['path' => '/pendaftaran/padukan-data', 'label' => 'Padukan Data', 'iconKey' => 'link', 'group' => 'Pendaftaran', 'requiresSuperAdmin' => true],
            ['path' => '/pendaftaran/pengaturan', 'label' => 'Pengaturan', 'iconKey' => 'cog', 'group' => 'Pendaftaran', 'requiresRole' => ['super_admin']],
            ['path' => '/pendaftaran/item', 'label' => 'Item', 'iconKey' => 'documentStack', 'group' => 'Pendaftaran', 'requiresSuperAdmin' => true],
            ['path' => '/dashboard-pembayaran', 'label' => 'Dashboard Pembayaran', 'iconKey' => 'dashboard', 'group' => 'UWABA', 'requiresRole' => ['admin_uwaba', 'petugas_uwaba', 'super_admin']],
            ['path' => '/uwaba', 'label' => 'UWABA', 'iconKey' => 'calendar', 'group' => 'UWABA', 'requiresRole' => ['petugas_uwaba', 'admin_uwaba', 'super_admin']],
            ['path' => '/tunggakan', 'label' => 'Tunggakan', 'iconKey' => 'creditCard', 'group' => 'UWABA', 'requiresRole' => ['petugas_uwaba', 'admin_uwaba', 'super_admin']],
            ['path' => '/khusus', 'label' => 'Khusus', 'iconKey' => 'badge', 'group' => 'UWABA', 'requiresRole' => ['petugas_uwaba', 'admin_uwaba', 'super_admin']],
            ['path' => '/pembayaran/manage-data', 'label' => 'Manage Data', 'iconKey' => 'users', 'group' => 'UWABA', 'requiresRole' => ['petugas_uwaba', 'admin_uwaba', 'super_admin']],
            ['path' => '/laporan', 'label' => 'Laporan', 'iconKey' => 'chartBar', 'group' => 'UWABA', 'requiresRole' => ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']],
            ['path' => '/ugt/data-madrasah', 'label' => 'Data Madrasah', 'iconKey' => 'building', 'group' => 'UGT', 'requiresRole' => ['admin_ugt', 'koordinator_ugt', 'super_admin']],
            ['path' => '/ugt/laporan', 'label' => 'Laporan', 'iconKey' => 'chartBar', 'group' => 'UGT', 'requiresRole' => ['admin_ugt', 'koordinator_ugt', 'super_admin']],
            ['path' => '/koordinator', 'label' => 'Koordinator', 'iconKey' => 'usersGroup', 'group' => 'UGT', 'requiresRole' => ['admin_ugt', 'super_admin']],
            ['path' => '/cashless/cetak-kartu', 'label' => 'Cetak Kartu', 'iconKey' => 'cardPrint', 'group' => 'Cashless', 'requiresRole' => ['admin_cashless', 'super_admin']],
            ['path' => '/cashless/data-toko', 'label' => 'Data Toko', 'iconKey' => 'building', 'group' => 'Cashless', 'requiresRole' => ['admin_cashless', 'super_admin']],
            ['path' => '/cashless/topup', 'label' => 'Top Up Dana', 'iconKey' => 'currency', 'group' => 'Cashless', 'requiresRole' => ['admin_cashless', 'petugas_cashless', 'super_admin']],
            ['path' => '/cashless/pembuatan-akun', 'label' => 'Akun Cashless', 'iconKey' => 'wallet', 'group' => 'Cashless', 'requiresRole' => ['admin_cashless', 'super_admin']],
            ['path' => '/cashless/pengaturan', 'label' => 'Pengaturan Cashless', 'iconKey' => 'cog', 'group' => 'Cashless', 'requiresRole' => ['admin_cashless', 'super_admin']],
            ['path' => '/dashboard-keuangan', 'label' => 'Dashboard Keuangan', 'iconKey' => 'chartPie', 'group' => 'Keuangan', 'requiresRole' => ['admin_uwaba', 'super_admin'], 'requiresPermission' => 'manage_finance'],
            ['path' => '/pengeluaran', 'label' => 'Pengeluaran', 'iconKey' => 'cash', 'group' => 'Keuangan', 'requiresRole' => ['admin_uwaba', 'super_admin']],
            ['path' => '/pemasukan', 'label' => 'Pemasukan', 'iconKey' => 'currency', 'group' => 'Keuangan', 'requiresRole' => ['admin_uwaba', 'super_admin']],
            ['path' => '/aktivitas', 'label' => 'Aktivitas', 'iconKey' => 'clock', 'group' => 'Keuangan', 'requiresRole' => ['admin_uwaba', 'super_admin']],
            ['path' => '/aktivitas-tahun-ajaran', 'label' => 'Aktivitas TA', 'iconKey' => 'chartStack', 'group' => 'Keuangan', 'requiresRole' => ['admin_uwaba', 'super_admin']],
            // Selaras api/routes/11_umroh.php + umrohModuleSelectors (UWABA staff + admin/petugas umroh)
            ['path' => '/dashboard-umroh', 'label' => 'Dashboard Umroh', 'iconKey' => 'dashboard', 'group' => 'Umroh', 'requiresRole' => ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin']],
            ['path' => '/umroh/jamaah', 'label' => 'Jamaah Umroh', 'iconKey' => 'usersGroup', 'group' => 'Umroh', 'requiresRole' => ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin']],
            ['path' => '/umroh/tabungan', 'label' => 'Tabungan Umroh', 'iconKey' => 'currency', 'group' => 'Umroh', 'requiresRole' => ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin']],
            ['path' => '/laporan-umroh', 'label' => 'Laporan Umroh', 'iconKey' => 'chartBar', 'group' => 'Umroh', 'requiresRole' => ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin']],
            ['path' => '/dashboard-ijin', 'label' => 'Dashboard', 'iconKey' => 'dashboard', 'group' => 'Ijin', 'requiresRole' => ['admin_ijin', 'petugas_ijin', 'super_admin']],
            ['path' => '/ijin/data-ijin', 'label' => 'Data Ijin', 'iconKey' => 'documentText', 'group' => 'Ijin', 'requiresRole' => ['admin_ijin', 'petugas_ijin', 'super_admin']],
            ['path' => '/ijin/data-boyong', 'label' => 'Data Boyong', 'iconKey' => 'arrowRight', 'group' => 'Ijin', 'requiresRole' => ['admin_ijin', 'super_admin']],
            ['path' => '/kalender', 'label' => 'Kalender', 'iconKey' => 'calendar', 'group' => 'Kalender'],
            ['path' => '/kalender/hari-penting', 'label' => 'Hari Penting', 'iconKey' => 'star', 'group' => 'Kalender'],
            ['path' => '/converter', 'label' => 'Converter', 'iconKey' => 'arrows', 'group' => 'Kalender', 'requiresRole' => ['super_admin', 'admin_kalender']],
            ['path' => '/kalender/pengaturan', 'label' => 'Pengaturan Kalender', 'iconKey' => 'cog', 'group' => 'Kalender', 'requiresRole' => ['admin_kalender', 'super_admin']],
            ['path' => '/kalender-pesantren', 'label' => 'Jadwal Pesantren', 'iconKey' => 'calendar', 'group' => 'Kalender Pesantren', 'requiresSuperAdmin' => true],
            ['path' => '/kalender-pesantren/kelola-event', 'label' => 'Kelola Event', 'iconKey' => 'plus', 'group' => 'Kalender Pesantren', 'requiresSuperAdmin' => true],
            ['path' => '/kalender-pesantren/pengaturan', 'label' => 'Pengaturan Google Kalender', 'iconKey' => 'cog', 'group' => 'Kalender Pesantren', 'requiresSuperAdmin' => true],
            ['path' => '/domisili/daerah', 'label' => 'Daerah', 'iconKey' => 'mapPin', 'group' => 'Domisili', 'requiresRole' => ['tarbiyah']],
            ['path' => '/domisili/kamar', 'label' => 'Kamar', 'iconKey' => 'homeRoom', 'group' => 'Domisili', 'requiresRole' => ['tarbiyah']],
            ['path' => '/pengurus', 'label' => 'Pengurus', 'iconKey' => 'usersGroup', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/lembaga', 'label' => 'Lembaga', 'iconKey' => 'building', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/absen', 'label' => 'Absen', 'iconKey' => 'clock', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/santri', 'label' => 'Santri', 'iconKey' => 'usersGroup', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/lulusan', 'label' => 'Lulusan', 'iconKey' => 'academic', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/rombel', 'label' => 'Rombel', 'iconKey' => 'users', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/manage-jabatan', 'label' => 'Jabatan', 'iconKey' => 'briefcase', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/kitab', 'label' => 'Kitab', 'iconKey' => 'documentText', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/mapel', 'label' => 'Mapel', 'iconKey' => 'mapel', 'group' => 'Lembaga', 'requiresRole' => ['tarbiyah']],
            ['path' => '/dashboard-umum', 'label' => 'Dashboard Umum', 'iconKey' => 'dashboard', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/manage-users', 'label' => 'Kelola User', 'iconKey' => 'users', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/manage-users/import', 'label' => 'Import Users', 'iconKey' => 'upload', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/settings/tahun-ajaran', 'label' => 'Tahun Ajaran', 'iconKey' => 'calendar', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/settings/role-akses', 'label' => 'Role & Akses', 'iconKey' => 'shield', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/settings/fitur', 'label' => 'Fitur', 'iconKey' => 'cube', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/settings/notifikasi', 'label' => 'Notifikasi', 'iconKey' => 'bell', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/settings/watzap', 'label' => 'WatZap', 'iconKey' => 'whatsapp', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/settings/wa-interactive-menu', 'label' => 'Menu WA interaktif', 'iconKey' => 'chat', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/manage-uploads', 'label' => 'Kelola File', 'iconKey' => 'folder', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/whatsapp-koneksi', 'label' => 'WhatsApp', 'iconKey' => 'whatsapp', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/juara/data-juara', 'label' => 'Data Juara', 'iconKey' => 'trophy', 'group' => 'Setting', 'requiresSuperAdmin' => true],
            ['path' => '/tentang', 'label' => 'Tentang', 'iconKey' => 'info', 'group' => 'Tentang'],
            ['path' => '/version', 'label' => 'Versi', 'iconKey' => 'code', 'group' => 'Tentang'],
            ['path' => '/info-aplikasi', 'label' => 'Info Aplikasi', 'iconKey' => 'building', 'group' => 'Tentang'],
        ];
    }
}
