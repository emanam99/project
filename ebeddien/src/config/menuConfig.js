/**
 * Satu sumber kebenaran untuk semua menu: Sidebar, Expanded (nav bawah), Header, Semua Menu, Beranda.
 * Ubah di sini → semua tampilan ikut (nama, ikon, grup, akses).
 */

/** Urutan grup untuk Sidebar, Expanded, Semua Menu, Header */
export const GROUP_ORDER = [
  'My Workspace',
  'Super Admin',
  'Pendaftaran',
  'UWABA',
  'UGT',
  'Cashless',
  'Keuangan',
  'Umroh',
  'Ijin',
  'Kalender',
  'Kalender Pesantren',
  'Domisili',
  'Lembaga',
  'Setting',
  'Tentang'
]

/**
 * Daftar menu dalam urutan tampilan. Setiap item: path, label, iconKey, group, akses (requiresRole / requiresSuperAdmin / requiresPermission).
 * iconKey dipakai di menuIcons.getIcon(key, className).
 */
export const MENU_ITEMS = [
  // ========== My Workspace ==========
  { path: '/beranda', label: 'Beranda', iconKey: 'home', group: 'My Workspace' },
  { path: '/profil', label: 'Profil', iconKey: 'user', group: 'My Workspace' },
  { path: '/aktivitas-saya', label: 'Aktivitas Saya', iconKey: 'activity', group: 'My Workspace' },
  { path: '/chat', label: 'Chat', iconKey: 'chat', group: 'My Workspace' },
  { path: '/chat-ai', label: 'eBeddien', iconKey: 'sparkles', group: 'My Workspace' },
  // ========== Super Admin ==========
  { path: '/super-admin/dashboard', label: 'Online', iconKey: 'usersGroup', group: 'Super Admin', requiresSuperAdmin: true },
  // ========== Pendaftaran ==========
  { path: '/dashboard-pendaftaran', label: 'Dashboard', iconKey: 'dashboard', group: 'Pendaftaran', requiresRole: ['admin_psb', 'petugas_psb', 'super_admin'] },
  { path: '/pendaftaran', label: 'Pendaftaran', iconKey: 'document', group: 'Pendaftaran', requiresRole: ['admin_psb', 'petugas_psb', 'super_admin'] },
  { path: '/pendaftaran/item', label: 'Item', iconKey: 'documentStack', group: 'Pendaftaran', requiresSuperAdmin: true },
  { path: '/pendaftaran/data-pendaftar', label: 'Data Pendaftar', iconKey: 'usersGroup', group: 'Pendaftaran', requiresRole: ['admin_psb', 'petugas_psb', 'super_admin'] },
  { path: '/pendaftaran/padukan-data', label: 'Padukan Data', iconKey: 'link', group: 'Pendaftaran', requiresSuperAdmin: true },
  { path: '/pendaftaran/pengaturan', label: 'Pengaturan', iconKey: 'cog', group: 'Pendaftaran', requiresRole: ['super_admin'] },
  // ========== UWABA ==========
  { path: '/dashboard-pembayaran', label: 'Dashboard Pembayaran', iconKey: 'dashboard', group: 'UWABA', requiresRole: ['admin_uwaba', 'petugas_uwaba', 'super_admin'] },
  { path: '/uwaba', label: 'UWABA', iconKey: 'calendar', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/tunggakan', label: 'Tunggakan', iconKey: 'creditCard', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/khusus', label: 'Khusus', iconKey: 'badge', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/pembayaran/manage-data', label: 'Manage Data', iconKey: 'users', group: 'UWABA', requiresRole: ['petugas_uwaba', 'admin_uwaba', 'super_admin'] },
  { path: '/laporan', label: 'Laporan', iconKey: 'chartBar', group: 'UWABA', requiresRole: ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin'] },
  // ========== UGT ==========
  { path: '/ugt/data-madrasah', label: 'Data Madrasah', iconKey: 'building', group: 'UGT', requiresRole: ['admin_ugt', 'koordinator_ugt', 'super_admin'] },
  { path: '/koordinator', label: 'Koordinator', iconKey: 'usersGroup', group: 'UGT', requiresRole: ['admin_ugt', 'super_admin'] },
  // ========== Cashless ==========
  { path: '/cashless/cetak-kartu', label: 'Cetak Kartu', iconKey: 'cardPrint', group: 'Cashless', requiresRole: ['admin_cashless', 'super_admin'] },
  { path: '/cashless/data-toko', label: 'Data Toko', iconKey: 'building', group: 'Cashless', requiresRole: ['admin_cashless', 'super_admin'] },
  { path: '/cashless/topup', label: 'Top Up Dana', iconKey: 'currency', group: 'Cashless', requiresRole: ['admin_cashless', 'petugas_cashless', 'super_admin'] },
  { path: '/cashless/pembuatan-akun', label: 'Akun Cashless', iconKey: 'wallet', group: 'Cashless', requiresRole: ['admin_cashless', 'super_admin'] },
  { path: '/cashless/pengaturan', label: 'Pengaturan Cashless', iconKey: 'cog', group: 'Cashless', requiresRole: ['admin_cashless', 'super_admin'] },
  // ========== Keuangan ==========
  { path: '/dashboard-keuangan', label: 'Dashboard Keuangan', iconKey: 'chartPie', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'], requiresPermission: 'manage_finance' },
  { path: '/pengeluaran', label: 'Pengeluaran', iconKey: 'cash', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  { path: '/pemasukan', label: 'Pemasukan', iconKey: 'currency', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  { path: '/aktivitas', label: 'Aktivitas', iconKey: 'clock', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  { path: '/aktivitas-tahun-ajaran', label: 'Aktivitas TA', iconKey: 'chartStack', group: 'Keuangan', requiresRole: ['admin_uwaba', 'super_admin'] },
  // ========== Umroh ==========
  { path: '/dashboard-umroh', label: 'Dashboard Umroh', iconKey: 'dashboard', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  { path: '/umroh/jamaah', label: 'Jamaah Umroh', iconKey: 'usersGroup', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  { path: '/umroh/tabungan', label: 'Tabungan Umroh', iconKey: 'currency', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  { path: '/laporan-umroh', label: 'Laporan Umroh', iconKey: 'chartBar', group: 'Umroh', requiresRole: ['petugas_umroh', 'super_admin'] },
  // ========== Ijin ==========
  { path: '/dashboard-ijin', label: 'Dashboard', iconKey: 'dashboard', group: 'Ijin', requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin'] },
  { path: '/ijin/data-ijin', label: 'Data Ijin', iconKey: 'documentText', group: 'Ijin', requiresRole: ['admin_ijin', 'petugas_ijin', 'super_admin'] },
  { path: '/ijin/data-boyong', label: 'Data Boyong', iconKey: 'arrowRight', group: 'Ijin', requiresRole: ['admin_ijin', 'super_admin'] },
  // ========== Kalender ==========
  { path: '/kalender', label: 'Kalender', iconKey: 'calendar', group: 'Kalender' },
  { path: '/kalender/hari-penting', label: 'Hari Penting', iconKey: 'star', group: 'Kalender' },
  { path: '/converter', label: 'Converter', iconKey: 'arrows', group: 'Kalender', requiresRole: ['super_admin', 'admin_kalender'] },
  { path: '/kalender/pengaturan', label: 'Pengaturan Kalender', iconKey: 'cog', group: 'Kalender', requiresRole: ['admin_kalender', 'super_admin'] },
  // ========== Kalender Pesantren ==========
  { path: '/kalender-pesantren', label: 'Jadwal Pesantren', iconKey: 'calendar', group: 'Kalender Pesantren', requiresSuperAdmin: true },
  { path: '/kalender-pesantren/kelola-event', label: 'Kelola Event', iconKey: 'plus', group: 'Kalender Pesantren', requiresSuperAdmin: true },
  { path: '/kalender-pesantren/pengaturan', label: 'Pengaturan Google Kalender', iconKey: 'cog', group: 'Kalender Pesantren', requiresSuperAdmin: true },
  // ========== Domisili ==========
  { path: '/domisili/daerah', label: 'Daerah', iconKey: 'mapPin', group: 'Domisili', requiresRole: ['tarbiyah'] },
  { path: '/domisili/kamar', label: 'Kamar', iconKey: 'homeRoom', group: 'Domisili', requiresRole: ['tarbiyah'] },
  // ========== Lembaga ==========
  { path: '/pengurus', label: 'Pengurus', iconKey: 'usersGroup', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/lembaga', label: 'Lembaga', iconKey: 'building', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/absen', label: 'Absen', iconKey: 'clock', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/santri', label: 'Santri', iconKey: 'usersGroup', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/lulusan', label: 'Lulusan', iconKey: 'academic', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/rombel', label: 'Rombel', iconKey: 'users', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/manage-jabatan', label: 'Jabatan', iconKey: 'briefcase', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/kitab', label: 'Kitab', iconKey: 'documentText', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  { path: '/mapel', label: 'Mapel', iconKey: 'mapel', group: 'Lembaga', requiresRole: ['tarbiyah'] },
  // ========== Setting (hanya super_admin) ==========
  { path: '/dashboard-umum', label: 'Dashboard Umum', iconKey: 'dashboard', group: 'Setting', requiresSuperAdmin: true },
  { path: '/manage-users', label: 'Kelola User', iconKey: 'users', group: 'Setting', requiresSuperAdmin: true },
  { path: '/manage-users/import', label: 'Import Users', iconKey: 'upload', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/tahun-ajaran', label: 'Tahun Ajaran', iconKey: 'calendar', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/role-akses', label: 'Role & Akses', iconKey: 'shield', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/fitur', label: 'Fitur', iconKey: 'cube', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/notifikasi', label: 'Notifikasi', iconKey: 'bell', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/watzap', label: 'WatZap', iconKey: 'whatsapp', group: 'Setting', requiresSuperAdmin: true },
  { path: '/settings/wa-interactive-menu', label: 'Menu WA interaktif', iconKey: 'chat', group: 'Setting', requiresSuperAdmin: true },
  { path: '/manage-uploads', label: 'Kelola File', iconKey: 'folder', group: 'Setting', requiresSuperAdmin: true },
  { path: '/whatsapp-koneksi', label: 'WhatsApp', iconKey: 'whatsapp', group: 'Setting', requiresSuperAdmin: true },
  { path: '/juara/data-juara', label: 'Data Juara', iconKey: 'trophy', group: 'Setting', requiresSuperAdmin: true },
  // ========== Tentang ==========
  { path: '/tentang', label: 'Tentang', iconKey: 'info', group: 'Tentang' },
  { path: '/version', label: 'Versi', iconKey: 'code', group: 'Tentang' },
  { path: '/info-aplikasi', label: 'Info Aplikasi', iconKey: 'building', group: 'Tentang' }
]

/**
 * Tambah showSeparatorAfter: true pada item terakhir tiap grup (untuk Sidebar).
 */
export function getMenuItemsWithSeparators() {
  const groups = new Map()
  MENU_ITEMS.forEach((item, index) => {
    const g = item.group
    if (!groups.has(g)) groups.set(g, { lastIndex: index })
    else groups.get(g).lastIndex = index
  })
  const lastIndices = new Set(Array.from(groups.values()).map((x) => x.lastIndex))
  return MENU_ITEMS.map((item, i) => ({
    ...item,
    showSeparatorAfter: lastIndices.has(i)
  }))
}

/**
 * Untuk expanded menu: item dengan showSeparator + groupLabel pada item terakhir tiap grup.
 */
export function getExpandedMenuItemsMeta() {
  const withSep = getMenuItemsWithSeparators()
  return withSep.map((item) => ({
    ...item,
    showSeparator: item.showSeparatorAfter ?? false,
    groupLabel: item.showSeparatorAfter ? item.group : undefined
  }))
}

/**
 * Lookup item by path (untuk Beranda getMenuIcon, dll).
 */
export function getItemByPath(path) {
  return MENU_ITEMS.find((item) => item.path === path)
}

/** Urutan grup untuk Header (breadcrumb) — Pendaftaran … Setting (termasuk Domisili+Lembaga) … Tentang */
const HEADER_GROUP_ORDER = ['Super Admin', 'Pendaftaran', 'UWABA', 'UGT', 'Keuangan', 'Ijin', 'Kalender', 'Cashless', 'Setting', 'Tentang']

/**
 * HEADER_GROUPS format: [{ name, routes: [{ path, label, prefix? }] }]. Setting = Setting + Domisili + Lembaga.
 * prefix: true jika ada route lain di grup yang path-nya diawali path ini + '/'
 */
export function getHeaderGroups() {
  const byGroup = new Map()
  MENU_ITEMS.forEach((item) => {
    if (item.group === 'My Workspace' || item.group === 'Kalender Pesantren') return
    const target = (item.group === 'Domisili' || item.group === 'Lembaga') ? 'Setting' : item.group
    if (!byGroup.has(target)) byGroup.set(target, [])
    byGroup.get(target).push({ path: item.path, label: item.label })
  })
  return HEADER_GROUP_ORDER.map((name) => {
    const routes = byGroup.get(name) || []
    const withPrefix = routes.map((r) => {
      const prefix = routes.some((o) => o.path !== r.path && o.path.startsWith(r.path + '/'))
      return { ...r, prefix: prefix || undefined }
    })
    return { name, routes: withPrefix }
  })
}

/** Backward compatibility: daftar flat untuk Fitur, Semua Menu, Beranda (path, label, group, requiresRole, requiresSuperAdmin, requiresPermission) */
export const navMenuItems = MENU_ITEMS.map(({ path, label, group, requiresRole, requiresSuperAdmin, requiresPermission }) => ({
  path,
  label,
  group,
  ...(requiresRole && { requiresRole }),
  ...(requiresSuperAdmin && { requiresSuperAdmin }),
  ...(requiresPermission && { requiresPermission })
}))
