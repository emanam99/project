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
            // Selaraskan dengan migrasi Website: submenu pakai underscore (bukan pathToCode …berita.kategori).
            $code = isset($row['code']) && $row['code'] !== ''
                ? (string) $row['code']
                : $this->pathToCode($row['path']);
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

        // Menu Umum: container aksi UI global — tidak tampil di sidebar/nav.
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'Umum\', `path` = \'\', `label` = \'Umum\', `icon_key` = \'cube\',
                 `meta_json` = \'{"hideFromNav":true}\', `sort_order` = 5
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.umum\' AND `type` = \'menu\''
        );

        // Menu Alumni: grup ISBAD (modul terpisah; menu lain akan ditambah berkala).
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'ISBAD\', `path` = \'/alumni\', `label` = \'Alumni\', `icon_key` = \'usersGroup\', `sort_order` = 10
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.alumni\' AND `type` = \'menu\''
        );

        // Buku Tamu & Data Mahrom: grup Wali Santri (pisah dari Cashless).
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'Wali Santri\'
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . '
               AND `type` = \'menu\'
               AND `code` IN (\'menu.cashless.buku_tamu\', \'menu.cashless.data_mahrom\')'
        );

        // Setting & Pengaturan disatukan → Pengaturan
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'Pengaturan\'
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `group_label` = \'Setting\''
        );

        // Nest Evo / WhatsApp koneksi / WatZap di bawah parent WhatsApp.
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'Pengaturan\', `path` = \'/settings/payment-gateway\', `label` = \'Payment Gateway\',
                 `icon_key` = \'creditCard\', `sort_order` = 10, `parent_id` = NULL
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.settings.payment_gateway\' AND `type` = \'menu\''
        );
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'Pengaturan\', `sort_order` = 20, `parent_id` = NULL
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.settings.notifikasi\' AND `type` = \'menu\''
        );
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'Pengaturan\', `sort_order` = 30, `parent_id` = NULL
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.settings.email_otp\' AND `type` = \'menu\''
        );
        $this->execute(
            'UPDATE `app___fitur`
             SET `group_label` = \'Pengaturan\', `path` = \'/settings/whatsapp\', `label` = \'WhatsApp\',
                 `icon_key` = \'whatsapp\', `sort_order` = 40, `parent_id` = NULL
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.settings.whatsapp\' AND `type` = \'menu\''
        );

        $conn = $this->getAdapter()->getConnection();
        $waParentId = 0;
        $waStmt = $conn->query(
            'SELECT `id` FROM `app___fitur`
             WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.settings.whatsapp\' AND `type` = \'menu\' LIMIT 1'
        );
        if ($waStmt) {
            $waParent = $waStmt->fetch(\PDO::FETCH_ASSOC);
            $waParentId = $waParent ? (int) $waParent['id'] : 0;
        }
        if ($waParentId > 0) {
            $this->execute(
                'UPDATE `app___fitur`
                 SET `group_label` = \'Pengaturan\', `parent_id` = ' . $waParentId . ', `label` = \'Evo\', `sort_order` = 10
                 WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.settings.evolution_wa\' AND `type` = \'menu\''
            );
            $this->execute(
                'UPDATE `app___fitur`
                 SET `group_label` = \'Pengaturan\', `parent_id` = ' . $waParentId . ', `label` = \'WhatsApp\', `sort_order` = 20
                 WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.whatsapp_koneksi\' AND `type` = \'menu\''
            );
            $this->execute(
                'UPDATE `app___fitur`
                 SET `group_label` = \'Pengaturan\', `parent_id` = ' . $waParentId . ', `label` = \'WatZap\', `sort_order` = 30
                 WHERE `id_app` = ' . self::ID_APP_EBEDDIEN . ' AND `code` = \'menu.settings.watzap\' AND `type` = \'menu\''
            );
        }

        // Ijin → Domisili (path/code tetap; hanya group + urutan)
        $domisiliOrder = [
            'menu.dashboard_ijin' => 10,
            'menu.ijin.data_ijin' => 20,
            'menu.ijin.data_boyong' => 30,
            'menu.domisili.daerah' => 40,
            'menu.domisili.kamar' => 50,
            'menu.domisili.status' => 60,
            'menu.domisili.pelanggaran' => 70,
        ];
        foreach ($domisiliOrder as $code => $order) {
            $this->execute(sprintf(
                'UPDATE `app___fitur`
                 SET `group_label` = \'Domisili\', `sort_order` = %d
                 WHERE `id_app` = %d AND `code` = %s AND `type` = \'menu\'',
                $order,
                self::ID_APP_EBEDDIEN,
                $conn->quote($code)
            ));
        }

        // Role yang sudah punya Dashboard/Tabungan Umroh ikut mendapat menu Pengeluaran
        $this->execute(
            'INSERT IGNORE INTO `role___fitur` (`role_id`, `fitur_id`)
             SELECT rf.role_id, pengeluaran.id
             FROM `app___fitur` pengeluaran
             INNER JOIN `app___fitur` sibling
               ON sibling.id_app = pengeluaran.id_app
              AND sibling.type = \'menu\'
              AND sibling.path IN (\'/umroh/tabungan\', \'/dashboard-umroh\')
             INNER JOIN `role___fitur` rf ON rf.fitur_id = sibling.id
             WHERE pengeluaran.id_app = ' . self::ID_APP_EBEDDIEN . '
               AND pengeluaran.type = \'menu\'
               AND pengeluaran.path = \'/umroh/pengeluaran\''
        );
    }

    private function pathToCode(string $path): string
    {
        $p = trim($path, '/');
        $p = strtr($p, ['/' => '.', '-' => '_']);

        return 'menu.' . $p;
    }

    /**
     * @return list<array{path:string,label:string,iconKey:string,group:string,code?:string}>
     */
    private function menuRows(): array
    {
        return [
            // Container fitur global (bukan halaman navigasi) — hideFromNav di UPDATE setelah insert.
            ['path' => '', 'label' => 'Umum', 'iconKey' => 'cube', 'group' => 'Umum', 'code' => 'menu.umum'],
            ['path' => '/beranda', 'label' => 'Beranda', 'iconKey' => 'home', 'group' => 'My Workspace'],
            ['path' => '/semua-menu', 'label' => 'Semua Menu', 'iconKey' => 'cube', 'group' => 'My Workspace'],
            ['path' => '/mybeddian', 'label' => 'MyBeddien', 'iconKey' => 'link', 'group' => 'My Workspace', 'code' => 'menu.mybeddian'],
            ['path' => '/profil', 'label' => 'Profil', 'iconKey' => 'user', 'group' => 'My Workspace'],
            ['path' => '/aktivitas-saya', 'label' => 'Aktivitas Saya', 'iconKey' => 'activity', 'group' => 'My Workspace'],
            ['path' => '/chat', 'label' => 'Chat', 'iconKey' => 'chat', 'group' => 'My Workspace'],
            ['path' => '/chat-ai', 'label' => 'eBeddien', 'iconKey' => 'sparkles', 'group' => 'My Workspace'],
            ['path' => '/super-admin/dashboard', 'label' => 'Dashboard', 'iconKey' => 'chartBar', 'group' => 'Super Admin'],
            ['path' => '/super-admin/online', 'label' => 'Online', 'iconKey' => 'usersGroup', 'group' => 'Super Admin'],
            ['path' => '/super-admin/install-activity', 'label' => 'Install Activity', 'iconKey' => 'chartBar', 'group' => 'Super Admin'],
            ['path' => '/super-admin/user-aktivitas', 'label' => 'Aktivitas User', 'iconKey' => 'activity', 'group' => 'Super Admin'],
            ['path' => '/dashboard-pendaftaran', 'label' => 'Dashboard', 'iconKey' => 'dashboard', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran', 'label' => 'Pendaftaran', 'iconKey' => 'document', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran/data-pendaftar', 'label' => 'Data Pendaftar', 'iconKey' => 'usersGroup', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran/analisis', 'label' => 'Analisis', 'iconKey' => 'chartBar', 'group' => 'Pendaftaran'],
            ['path' => '/pendaftaran/pengajuan-nis', 'label' => 'Pengajuan NIS', 'iconKey' => 'document', 'group' => 'Pendaftaran'],
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
            ['path' => '/ugt/guru-tugas', 'label' => 'Guru Tugas', 'iconKey' => 'usersGroup', 'group' => 'UGT'],
            ['path' => '/ugt/laporan', 'label' => 'Laporan', 'iconKey' => 'chartBar', 'group' => 'UGT'],
            ['path' => '/ugt/kompas', 'label' => 'KOMMPAS', 'iconKey' => 'trophy', 'group' => 'UGT'],
            ['path' => '/koordinator', 'label' => 'Koordinator', 'iconKey' => 'usersGroup', 'group' => 'UGT'],
            ['path' => '/cashless/cetak-kartu', 'label' => 'Cetak Kartu', 'iconKey' => 'cardPrint', 'group' => 'Cashless'],
            ['path' => '/cashless/data-toko', 'label' => 'Data Toko', 'iconKey' => 'building', 'group' => 'Cashless'],
            ['path' => '/cashless/topup', 'label' => 'Top Up Dana', 'iconKey' => 'currency', 'group' => 'Cashless'],
            ['path' => '/cashless/pembuatan-akun', 'label' => 'Akun Cashless', 'iconKey' => 'wallet', 'group' => 'Cashless'],
            ['path' => '/cashless/pengaturan', 'label' => 'Pengaturan Cashless', 'iconKey' => 'cog', 'group' => 'Cashless'],
            ['path' => '/cashless/buku-tamu', 'label' => 'Buku Tamu', 'iconKey' => 'document', 'group' => 'Wali Santri'],
            ['path' => '/cashless/data-mahrom', 'label' => 'Data Mahrom', 'iconKey' => 'usersGroup', 'group' => 'Wali Santri'],
            ['path' => '/dashboard-keuangan', 'label' => 'Dashboard Keuangan', 'iconKey' => 'chartPie', 'group' => 'Keuangan'],
            ['path' => '/pengeluaran', 'label' => 'Pengeluaran', 'iconKey' => 'cash', 'group' => 'Keuangan'],
            ['path' => '/pemasukan', 'label' => 'Pemasukan', 'iconKey' => 'currency', 'group' => 'Keuangan'],
            ['path' => '/aktivitas', 'label' => 'Aktivitas', 'iconKey' => 'clock', 'group' => 'Keuangan'],
            ['path' => '/aktivitas-tahun-ajaran', 'label' => 'Aktivitas TA', 'iconKey' => 'chartStack', 'group' => 'Keuangan'],
            ['path' => '/dashboard-umroh', 'label' => 'Dashboard Umroh', 'iconKey' => 'dashboard', 'group' => 'Umroh'],
            ['path' => '/umroh/jamaah', 'label' => 'Jamaah Umroh', 'iconKey' => 'usersGroup', 'group' => 'Umroh'],
            ['path' => '/umroh/tabungan', 'label' => 'Tabungan Umroh', 'iconKey' => 'currency', 'group' => 'Umroh'],
            ['path' => '/umroh/pengeluaran', 'label' => 'Pengeluaran Umroh', 'iconKey' => 'cash', 'group' => 'Umroh'],
            ['path' => '/laporan-umroh', 'label' => 'Laporan Umroh', 'iconKey' => 'chartBar', 'group' => 'Umroh'],
            ['path' => '/dashboard-ijin', 'label' => 'Dashboard', 'iconKey' => 'dashboard', 'group' => 'Domisili'],
            ['path' => '/ijin/data-ijin', 'label' => 'Data Ijin', 'iconKey' => 'documentText', 'group' => 'Domisili'],
            ['path' => '/ijin/data-boyong', 'label' => 'Data Boyong', 'iconKey' => 'arrowRight', 'group' => 'Domisili'],
            ['path' => '/wirid/nailul-murod', 'label' => 'Nailul Murod', 'iconKey' => 'documentText', 'group' => 'Wirid'],
            ['path' => '/kalender', 'label' => 'Kalender', 'iconKey' => 'calendar', 'group' => 'Kalender'],
            ['path' => '/kalender/hari-penting', 'label' => 'Hari Penting', 'iconKey' => 'star', 'group' => 'Kalender'],
            ['path' => '/converter', 'label' => 'Converter', 'iconKey' => 'arrows', 'group' => 'Kalender'],
            ['path' => '/kalender/pengaturan', 'label' => 'Pengaturan Kalender', 'iconKey' => 'cog', 'group' => 'Kalender'],
            ['path' => '/domisili/daerah', 'label' => 'Daerah', 'iconKey' => 'mapPin', 'group' => 'Domisili'],
            ['path' => '/domisili/kamar', 'label' => 'Kamar', 'iconKey' => 'homeRoom', 'group' => 'Domisili'],
            ['path' => '/domisili/status', 'label' => 'Status Santri', 'iconKey' => 'badgeCheck', 'group' => 'Domisili'],
            ['path' => '/domisili/pelanggaran', 'label' => 'Pelanggaran', 'iconKey' => 'alertTriangle', 'group' => 'Domisili'],
            ['path' => '/pengurus', 'label' => 'Pengurus', 'iconKey' => 'usersGroup', 'group' => 'Lembaga'],
            ['path' => '/lembaga', 'label' => 'Lembaga', 'iconKey' => 'building', 'group' => 'Lembaga'],
            ['path' => '/absen', 'label' => 'Absen', 'iconKey' => 'clock', 'group' => 'Lembaga'],
            ['path' => '/santri', 'label' => 'Santri', 'iconKey' => 'usersGroup', 'group' => 'Lembaga'],
            ['path' => '/lulusan', 'label' => 'Lulusan', 'iconKey' => 'academic', 'group' => 'Lembaga'],
            ['path' => '/alumni', 'label' => 'Alumni', 'iconKey' => 'usersGroup', 'group' => 'ISBAD'],
            ['path' => '/rombel', 'label' => 'Rombel', 'iconKey' => 'users', 'group' => 'Lembaga'],
            ['path' => '/manage-jabatan', 'label' => 'Jabatan', 'iconKey' => 'briefcase', 'group' => 'Lembaga'],
            ['path' => '/kitab', 'label' => 'Kitab', 'iconKey' => 'documentText', 'group' => 'Lembaga'],
            ['path' => '/mapel', 'label' => 'Mapel', 'iconKey' => 'mapel', 'group' => 'Lembaga'],
            ['path' => '/ujian', 'label' => 'Ujian', 'iconKey' => 'academic', 'group' => 'Lembaga'],
            ['path' => '/bisyaroh', 'label' => 'Bisyaroh', 'iconKey' => 'documentText', 'group' => 'Lembaga'],
            ['path' => '/dashboard-umum', 'label' => 'Dashboard Umum', 'iconKey' => 'dashboard', 'group' => 'Pengaturan'],
            ['path' => '/manage-users', 'label' => 'Kelola User', 'iconKey' => 'users', 'group' => 'Pengaturan'],
            ['path' => '/settings/tahun-ajaran', 'label' => 'Tahun Ajaran', 'iconKey' => 'calendar', 'group' => 'Pengaturan'],
            ['path' => '/settings/role-akses', 'label' => 'Role & Akses', 'iconKey' => 'shield', 'group' => 'Pengaturan'],
            ['path' => '/settings/fitur', 'label' => 'Fitur', 'iconKey' => 'cube', 'group' => 'Pengaturan'],
            ['path' => '/settings/wa-interactive-menu', 'label' => 'Menu WA interaktif', 'iconKey' => 'chat', 'group' => 'Pengaturan'],
            ['path' => '/manage-uploads', 'label' => 'Kelola File', 'iconKey' => 'folder', 'group' => 'Pengaturan'],
            ['path' => '/juara/data-juara', 'label' => 'Data Juara', 'iconKey' => 'trophy', 'group' => 'Pengaturan'],
            // Payment Gateway, Notifikasi, OTP Email, WhatsApp (+ anak Evo / WhatsApp / WatZap)
            ['path' => '/settings/payment-gateway', 'label' => 'Payment Gateway', 'iconKey' => 'creditCard', 'group' => 'Pengaturan', 'code' => 'menu.settings.payment_gateway'],
            ['path' => '/settings/notifikasi', 'label' => 'Notifikasi', 'iconKey' => 'bell', 'group' => 'Pengaturan'],
            ['path' => '/settings/email-otp', 'label' => 'OTP Email', 'iconKey' => 'chat', 'group' => 'Pengaturan'],
            ['path' => '/settings/whatsapp', 'label' => 'WhatsApp', 'iconKey' => 'whatsapp', 'group' => 'Pengaturan', 'code' => 'menu.settings.whatsapp'],
            ['path' => '/settings/evolution-wa', 'label' => 'Evo', 'iconKey' => 'whatsapp', 'group' => 'Pengaturan'],
            ['path' => '/whatsapp-koneksi', 'label' => 'WhatsApp', 'iconKey' => 'whatsapp', 'group' => 'Pengaturan'],
            ['path' => '/settings/watzap', 'label' => 'WatZap', 'iconKey' => 'whatsapp', 'group' => 'Pengaturan'],
            ['path' => '/website/dashboard', 'label' => 'Dashboard Website', 'iconKey' => 'dashboard', 'group' => 'Website'],
            ['path' => '/website/berita', 'label' => 'Berita', 'iconKey' => 'documentText', 'group' => 'Website'],
            ['path' => '/website/berita/kategori', 'code' => 'menu.website.berita_kategori', 'label' => 'Kategori Berita', 'iconKey' => 'documentStack', 'group' => 'Website'],
            ['path' => '/website/banner', 'label' => 'Banner Beranda', 'iconKey' => 'badge', 'group' => 'Website'],
            ['path' => '/website/halaman', 'label' => 'Halaman Statis', 'iconKey' => 'document', 'group' => 'Website'],
            ['path' => '/website/galeri', 'label' => 'Galeri Foto', 'iconKey' => 'folder', 'group' => 'Website'],
            ['path' => '/website/galeri/kategori', 'code' => 'menu.website.galeri_kategori', 'label' => 'Kategori Galeri', 'iconKey' => 'documentStack', 'group' => 'Website'],
            ['path' => '/website/seo', 'label' => 'Pengaturan SEO', 'iconKey' => 'cog', 'group' => 'Website'],
            ['path' => '/tentang', 'label' => 'Tentang', 'iconKey' => 'info', 'group' => 'Tentang'],
            ['path' => '/version', 'label' => 'Versi', 'iconKey' => 'code', 'group' => 'Tentang'],
            ['path' => '/info-aplikasi', 'label' => 'Info Aplikasi', 'iconKey' => 'building', 'group' => 'Tentang'],
        ];
    }
}
