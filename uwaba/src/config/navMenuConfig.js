/**
 * Daftar menu sidebar (path, label, group, akses).
 * Digunakan oleh halaman Fitur untuk menampilkan menu dan role yang bisa akses.
 * group = nama grup untuk pengelompokan tampilan.
 */
export const navMenuItems = [
  // Pendaftaran
  { path: '/dashboard-pendaftaran', label: 'Dashboard', group: 'Pendaftaran', requiresRole: ['admin_psb', 'petugas_psb', 'super_admin'] },
  { path: '/pendaftaran', label: 'Pendaftaran', group: 'Pendaftaran', requiresRole: ['admin_psb', 'petugas_psb', 'super_admin'] },
  { path: '/pendaftaran/item', label: 'Item', group: 'Pendaftaran', requiresSuperAdmin: true },
  { path: '/pendaftaran/data-pendaftar', label: 'Data Pendaftar', group: 'Pendaftaran', requiresRole: ['admin_psb', 'petugas_psb', 'super_admin'] },
  { path: '/pendaftaran/padukan-data', label: 'Padukan Data', group: 'Pendaftaran', requiresSuperAdmin: true },
  { path: '/pendaftaran/pengaturan', label: 'Pengaturan', group: 'Pendaftaran', requiresRole: ['super_admin'] },
  // Item Set, Kondisi, Registrasi, Assign, Simulasi = tab di dalam halaman Item, bukan menu utama
  // UWABA
  { path: '/dashboard-pembayaran', label: 'Dashboard Pembayaran', group: 'UWABA', requiresRole: ['admin_uwaba', 'petugas_uwaba', 'super_admin'] },
  { path: '/uwaba', label: 'UWABA', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/tunggakan', label: 'Tunggakan', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/khusus', label: 'Khusus', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/pembayaran/manage-data', label: 'Manage Data', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/laporan', label: 'Laporan', group: 'UWABA', requiresRole: ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin'] },
  // UGT
  { path: '/ugt/data-madrasah', label: 'Data Madrasah', group: 'UGT', requiresRole: ['admin_ugt', 'koordinator_ugt', 'super_admin'] },
  { path: '/koordinator', label: 'Koordinator', group: 'UGT', requiresRole: ['admin_ugt', 'super_admin'] },
  // Cashless
  { path: '/cashless/data-toko', label: 'Data Toko', group: 'Cashless', requiresRole: ['admin_cashless', 'super_admin'] },
  { path: '/cashless/topup', label: 'Top Up Dana', group: 'Cashless', requiresRole: ['admin_cashless', 'petugas_cashless', 'super_admin'] },
  { path: '/cashless/pembuatan-akun', label: 'Akun Cashless', group: 'Cashless', requiresRole: ['admin_cashless', 'super_admin'] },
  { path: '/cashless/pengaturan', label: 'Pengaturan Cashless', group: 'Cashless', requiresRole: ['admin_cashless', 'super_admin'] },
  // Keuangan
  { path: '/dashboard-keuangan', label: 'Dashboard Keuangan', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'], requiresPermission: 'manage_finance' },
  { path: '/pengeluaran', label: 'Pengeluaran', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  { path: '/pemasukan', label: 'Pemasukan', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  { path: '/aktivitas', label: 'Aktivitas', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  { path: '/aktivitas-tahun-ajaran', label: 'Aktivitas TA', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  // Umroh — hanya super_admin dan petugas_umroh
  { path: '/dashboard-umroh', label: 'Dashboard Umroh', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  { path: '/umroh/jamaah', label: 'Jamaah Umroh', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  { path: '/umroh/tabungan', label: 'Tabungan Umroh', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  { path: '/laporan-umroh', label: 'Laporan Umroh', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  // Ijin
  { path: '/dashboard-ijin', label: 'Dashboard', group: 'Ijin', requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin'] },
  { path: '/ijin/data-ijin', label: 'Data Ijin', group: 'Ijin', requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin'] },
  { path: '/ijin/data-boyong', label: 'Data Boyong', group: 'Ijin', requiresRole: ['admin_ijin', 'super_admin'] },
  // Kalender
  { path: '/kalender', label: 'Kalender', group: 'Kalender' },
  { path: '/kalender/hari-penting', label: 'Hari Penting', group: 'Kalender' },
  { path: '/converter', label: 'Converter', group: 'Kalender', requiresRole: ['super_admin', 'admin_kalender'] },
  { path: '/kalender/pengaturan', label: 'Pengaturan Kalender', group: 'Kalender', requiresRole: ['admin_kalender', 'super_admin'] },
  // Kalender Pesantren
  { path: '/kalender-pesantren', label: 'Jadwal Pesantren', group: 'Kalender Pesantren', requiresSuperAdmin: true },
  { path: '/kalender-pesantren/kelola-event', label: 'Kelola Event', group: 'Kalender Pesantren', requiresSuperAdmin: true },
  { path: '/kalender-pesantren/pengaturan', label: 'Pengaturan Google Kalender', group: 'Kalender Pesantren', requiresSuperAdmin: true },
  // Setting
  { path: '/dashboard-umum', label: 'Dashboard Umum', group: 'Setting', requiresRole: ['admin_uwaba', 'petugas_uwaba', 'super_admin'] },
  { path: '/manage-users', label: 'Kelola User', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/tahun-ajaran', label: 'Tahun Ajaran', group: 'Setting', requiresSuperAdmin: true },
  // Grup Domisili
  { path: '/domisili/daerah', label: 'Daerah', group: 'Domisili', requiresSuperAdmin: true },
  { path: '/domisili/kamar', label: 'Kamar', group: 'Domisili', requiresSuperAdmin: true },
  // Grup Lembaga
  { path: '/pengurus', label: 'Pengurus', group: 'Lembaga', requiresSuperAdmin: true },
  { path: '/lembaga', label: 'Lembaga', group: 'Lembaga', requiresSuperAdmin: true },
  { path: '/santri', label: 'Santri', group: 'Lembaga', requiresSuperAdmin: true },
  { path: '/lulusan', label: 'Lulusan', group: 'Lembaga', requiresSuperAdmin: true },
  { path: '/rombel', label: 'Rombel', group: 'Lembaga', requiresSuperAdmin: true },
  { path: '/rombel-santri', label: 'Rombel Santri', group: 'Lembaga', requiresSuperAdmin: true },
  { path: '/manage-jabatan', label: 'Jabatan', group: 'Lembaga', requiresSuperAdmin: true },
  { path: '/settings/role-akses', label: 'Role & Akses', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/fitur', label: 'Fitur', group: 'Setting', requiresSuperAdmin: true },
  { path: '/manage-uploads', label: 'Kelola File', group: 'Setting', requiresSuperAdmin: true },
  { path: '/juara/data-juara', label: 'Data Juara', group: 'Setting', requiresSuperAdmin: true },
  // My Workspace — semua user bisa akses
  { path: '/beranda', label: 'Beranda', group: 'My Workspace' },
  { path: '/profil', label: 'Profil', group: 'My Workspace' },
  { path: '/aktivitas-saya', label: 'Aktivitas Saya', group: 'My Workspace' },
  // Tentang
  { path: '/tentang', label: 'Tentang', group: 'Tentang' },
  { path: '/version', label: 'Versi', group: 'Tentang' },
  { path: '/info-aplikasi', label: 'Info Aplikasi', group: 'Tentang' }
]
