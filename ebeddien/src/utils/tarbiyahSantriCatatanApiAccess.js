/**
 * Selaras EbeddienFiturAccessDefinitions::tarbiyahSantriDomisiliApiSelectors (tanpa PREFIX).
 */
const TARBIYAH_LEMBAGA_MENU_CODES = [
  'menu.pengurus',
  'menu.lembaga',
  'menu.absen',
  'menu.santri',
  'menu.lulusan',
  'menu.rombel',
  'menu.manage_jabatan',
  'menu.kitab',
  'menu.mapel',
  'menu.ujian',
  'menu.bisyaroh',
  'menu.domisili.daerah',
  'menu.domisili.kamar',
  'menu.domisili.status'
]

const SUPER_ADMIN_MENU_CODES = [
  'menu.super_admin.online',
  'menu.super_admin.dashboard',
  'menu.dashboard_umum',
  'menu.manage_users',
  'menu.settings.tahun_ajaran',
  'menu.settings.role_akses',
  'menu.settings.fitur',
  'menu.settings.notifikasi',
  'menu.settings.watzap',
  'menu.settings.evolution_wa',
  'menu.settings.wa_interactive_menu',
  'menu.manage_uploads',
  'menu.whatsapp_koneksi',
  'menu.juara.data_juara'
]

const TARBIYAH_SANTRI_CATATAN_EXTRA = ['action.rombel.halaman', 'action.santri.halaman']

/**
 * @param {string[]|null|undefined} fiturMenuCodes
 */
export function userHasTarbiyahSantriCatatanApiAccess(fiturMenuCodes) {
  if (!Array.isArray(fiturMenuCodes) || fiturMenuCodes.length === 0) return false
  return fiturMenuCodes.some(
    (c) =>
      TARBIYAH_SANTRI_CATATAN_EXTRA.includes(c) ||
      TARBIYAH_LEMBAGA_MENU_CODES.includes(c) ||
      SUPER_ADMIN_MENU_CODES.includes(c)
  )
}
