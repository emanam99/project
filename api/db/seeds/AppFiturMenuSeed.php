<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

/**
 * Seed menu navigasi eBeddien ke app___fitur (type=menu, id_app=1).
 * Hanya struktur menu (path, label, ikon, grup). Siapa berhak mengakses menu/aksi
 * diatur lewat tabel role___fitur (halaman Pengaturan → Fitur di eBeddien), bukan meta_json seed.
 *
 * Cara pakai (setelah AppSeed): php vendor/bin/phinx seed:run -s AppFiturMenuSeed
 * Setelah ini jalankan MenuActionsFiturSeed lalu RoleFiturMenuSeed.
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
            $metaSql = 'NULL';

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
     * @return list<array{path:string,label:string,iconKey:string,group:string}>
     */
    private function menuRows(): array
    {
        return [
            ['path' => '/beranda', 'label' => 'Beranda', 'iconKey' => 'home', 'group' => 'My Workspace'],
            ['path' => '/profil', 'label' => 'Profil', 'iconKey' => 'user', 'group' => 'My Workspace'],
            ['path' => '/aktivitas-saya', 'label' => 'Aktivitas Saya', 'iconKey' => 'activity', 'group' => 'My Workspace'],
            ['path' => '/chat', 'label' => 'Chat', 'iconKey' => 'chat', 'group' => 'My Workspace'],
            ['path' => '/chat-ai', 'label' => 'eBeddien', 'iconKey' => 'sparkles', 'group' => 'My Workspace'],
            ['path' => '/super-admin/dashboard', 'label' => 'Online', 'iconKey' => 'usersGroup', 'group' => 'Super Admin'],
            ['path' => '/dashboard-pendaftaran', 'label' => 'Dashboard', 'iconKey' => 'dashboard', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran', 'label' => 'Pendaftaran', 'iconKey' => 'document', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran/data-pendaftar', 'label' => 'Data Pendaftar', 'iconKey' => 'usersGroup', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran/padukan-data', 'label' => 'Padukan Data', 'iconKey' => 'link', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran/pengaturan', 'label' => 'Pengaturan', 'iconKey' => 'cog', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran/item', 'label' => 'Item', 'iconKey' => 'documentStack', 'group' => 'Pendaftaran'],
            ['path' => '/dashboard-pembayaran', 'label' => 'Dashboard Pembayaran', 'iconKey' => 'dashboard', 'group' => 'UWABA'],
            ['path' => '/uwaba', 'label' => 'UWABA', 'iconKey' => 'calendar', 'group' => 'UWABA'],
            ['path' => '/tunggakan', 'label' => 'Tunggakan', 'iconKey' => 'creditCard', 'group' => 'UWABA'],
            ['path' => '/khusus', 'label' => 'Khusus', 'iconKey' => 'badge', 'group' => 'UWABA'],
            ['path' => '/pembayaran/manage-data', 'label' => 'Manage Data', 'iconKey' => 'users', 'group' => 'UWABA'],
            ['path' => '/laporan', 'label' => 'Laporan', 'iconKey' => 'chartBar', 'group' => 'UWABA'],
            ['path' => '/ugt/data-madrasah', 'label' => 'Data Madrasah', 'iconKey' => 'building', 'group' => 'UGT'],
            ['path' => '/ugt/laporan', 'label' => 'Laporan', 'iconKey' => 'chartBar', 'group' => 'UGT'],
            ['path' => '/koordinator', 'label' => 'Koordinator', 'iconKey' => 'usersGroup', 'group' => 'UGT'],
            ['path' => '/cashless/cetak-kartu', 'label' => 'Cetak Kartu', 'iconKey' => 'cardPrint', 'group' => 'Cashless'],
            ['path' => '/cashless/data-toko', 'label' => 'Data Toko', 'iconKey' => 'building', 'group' => 'Cashless'],
            ['path' => '/cashless/topup', 'label' => 'Top Up Dana', 'iconKey' => 'currency', 'group' => 'Cashless'],
            ['path' => '/cashless/pembuatan-akun', 'label' => 'Akun Cashless', 'iconKey' => 'wallet', 'group' => 'Cashless'],
            ['path' => '/cashless/pengaturan', 'label' => 'Pengaturan Cashless', 'iconKey' => 'cog', 'group' => 'Cashless'],
            ['path' => '/dashboard-keuangan', 'label' => 'Dashboard Keuangan', 'iconKey' => 'chartPie', 'group' => 'Keuangan'],
            ['path' => '/pengeluaran', 'label' => 'Pengeluaran', 'iconKey' => 'cash', 'group' => 'Keuangan'],
            ['path' => '/pemasukan', 'label' => 'Pemasukan', 'iconKey' => 'currency', 'group' => 'Keuangan'],
            ['path' => '/aktivitas', 'label' => 'Aktivitas', 'iconKey' => 'clock', 'group' => 'Keuangan'],
            ['path' => '/aktivitas-tahun-ajaran', 'label' => 'Aktivitas TA', 'iconKey' => 'chartStack', 'group' => 'Keuangan'],
            ['path' => '/dashboard-umroh', 'label' => 'Dashboard Umroh', 'iconKey' => 'dashboard', 'group' => 'Umroh'],
            ['path' => '/umroh/jamaah', 'label' => 'Jamaah Umroh', 'iconKey' => 'usersGroup', 'group' => 'Umroh'],
            ['path' => '/umroh/tabungan', 'label' => 'Tabungan Umroh', 'iconKey' => 'currency', 'group' => 'Umroh'],
            ['path' => '/laporan-umroh', 'label' => 'Laporan Umroh', 'iconKey' => 'chartBar', 'group' => 'Umroh'],
            ['path' => '/dashboard-ijin', 'label' => 'Dashboard', 'iconKey' => 'dashboard', 'group' => 'Ijin'],
            ['path' => '/ijin/data-ijin', 'label' => 'Data Ijin', 'iconKey' => 'documentText', 'group' => 'Ijin'],
            ['path' => '/ijin/data-boyong', 'label' => 'Data Boyong', 'iconKey' => 'arrowRight', 'group' => 'Ijin'],
            ['path' => '/wirid/nailul-murod', 'label' => 'Nailul Murod', 'iconKey' => 'documentText', 'group' => 'Wirid'],
            ['path' => '/kalender', 'label' => 'Kalender', 'iconKey' => 'calendar', 'group' => 'Kalender'],
            ['path' => '/kalender/hari-penting', 'label' => 'Hari Penting', 'iconKey' => 'star', 'group' => 'Kalender'],
            ['path' => '/converter', 'label' => 'Converter', 'iconKey' => 'arrows', 'group' => 'Kalender'],
            ['path' => '/kalender/pengaturan', 'label' => 'Pengaturan Kalender', 'iconKey' => 'cog', 'group' => 'Kalender'],
            ['path' => '/domisili/daerah', 'label' => 'Daerah', 'iconKey' => 'mapPin', 'group' => 'Domisili'],
            ['path' => '/domisili/kamar', 'label' => 'Kamar', 'iconKey' => 'homeRoom', 'group' => 'Domisili'],
            ['path' => '/pengurus', 'label' => 'Pengurus', 'iconKey' => 'usersGroup', 'group' => 'Lembaga'],
            ['path' => '/lembaga', 'label' => 'Lembaga', 'iconKey' => 'building', 'group' => 'Lembaga'],
            ['path' => '/absen', 'label' => 'Absen', 'iconKey' => 'clock', 'group' => 'Lembaga'],
            ['path' => '/santri', 'label' => 'Santri', 'iconKey' => 'usersGroup', 'group' => 'Lembaga'],
            ['path' => '/lulusan', 'label' => 'Lulusan', 'iconKey' => 'academic', 'group' => 'Lembaga'],
            ['path' => '/rombel', 'label' => 'Rombel', 'iconKey' => 'users', 'group' => 'Lembaga'],
            ['path' => '/manage-jabatan', 'label' => 'Jabatan', 'iconKey' => 'briefcase', 'group' => 'Lembaga'],
            ['path' => '/kitab', 'label' => 'Kitab', 'iconKey' => 'documentText', 'group' => 'Lembaga'],
            ['path' => '/mapel', 'label' => 'Mapel', 'iconKey' => 'mapel', 'group' => 'Lembaga'],
            ['path' => '/dashboard-umum', 'label' => 'Dashboard Umum', 'iconKey' => 'dashboard', 'group' => 'Setting'],
            ['path' => '/manage-users', 'label' => 'Kelola User', 'iconKey' => 'users', 'group' => 'Setting'],
            ['path' => '/manage-users/import', 'label' => 'Import Users', 'iconKey' => 'upload', 'group' => 'Setting'],
            ['path' => '/settings/tahun-ajaran', 'label' => 'Tahun Ajaran', 'iconKey' => 'calendar', 'group' => 'Setting'],
            ['path' => '/settings/role-akses', 'label' => 'Role & Akses', 'iconKey' => 'shield', 'group' => 'Setting'],
            ['path' => '/settings/fitur', 'label' => 'Fitur', 'iconKey' => 'cube', 'group' => 'Setting'],
            ['path' => '/settings/notifikasi', 'label' => 'Notifikasi', 'iconKey' => 'bell', 'group' => 'Setting'],
            ['path' => '/settings/email-otp', 'label' => 'OTP Email', 'iconKey' => 'chat', 'group' => 'Setting'],
            ['path' => '/settings/watzap', 'label' => 'WatZap', 'iconKey' => 'whatsapp', 'group' => 'Setting'],
            ['path' => '/settings/evolution-wa', 'label' => 'Evolution WA', 'iconKey' => 'whatsapp', 'group' => 'Setting'],
            ['path' => '/settings/wa-interactive-menu', 'label' => 'Menu WA interaktif', 'iconKey' => 'chat', 'group' => 'Setting'],
            ['path' => '/manage-uploads', 'label' => 'Kelola File', 'iconKey' => 'folder', 'group' => 'Setting'],
            ['path' => '/whatsapp-koneksi', 'label' => 'WhatsApp', 'iconKey' => 'whatsapp', 'group' => 'Setting'],
            ['path' => '/juara/data-juara', 'label' => 'Data Juara', 'iconKey' => 'trophy', 'group' => 'Setting'],
            ['path' => '/tentang', 'label' => 'Tentang', 'iconKey' => 'info', 'group' => 'Tentang'],
            ['path' => '/version', 'label' => 'Versi', 'iconKey' => 'code', 'group' => 'Tentang'],
            ['path' => '/info-aplikasi', 'label' => 'Info Aplikasi', 'iconKey' => 'building', 'group' => 'Tentang'],
        ];
    }
}
