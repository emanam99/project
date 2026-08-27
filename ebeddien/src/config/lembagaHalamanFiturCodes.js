/**
 * Aksi halaman modul Lembaga — selaras app___fitur (migrasi lembaga_halaman_fitur_actions).
 * Membolehkan peran dengan aksi saja (tanpa menu induk) mengakses rute & sidebar.
 */
export const LEMBAGA_HALAMAN_ACTION_BY_MENU_CODE = {
  'menu.santri': 'action.santri.halaman',
  'menu.rombel': 'action.rombel.halaman',
  'menu.manage_jabatan': 'action.manage_jabatan.halaman',
  'menu.mapel': 'action.mapel.halaman',
  'menu.kurikulum': 'action.kurikulum.halaman',
  'menu.ujian': 'action.ujian.halaman',
  'menu.bisyaroh': 'action.bisyaroh.halaman'
}

/**
 * @param {string} menuCode
 * @param {Set<string>} codesSet
 */
export function codesSetHasMenuOrHalamanAksi(menuCode, codesSet) {
  const mc = String(menuCode || '')
  if (!mc) return false
  if (codesSet.has(mc)) return true
  const act = LEMBAGA_HALAMAN_ACTION_BY_MENU_CODE[mc]
  if (act && codesSet.has(act)) return true
  if (mc === 'menu.kurikulum') {
    if (codesSet.has('menu.kitab') || codesSet.has('menu.mapel') || codesSet.has('action.mapel.halaman')) {
      return true
    }
    for (const c of codesSet) {
      if (String(c).startsWith('action.kurikulum.')) return true
    }
  }
  // Alumni: cukup punya salah satu aksi staff agar menu ISBAD tampil di nav
  if (mc === 'menu.alumni') {
    for (const c of codesSet) {
      if (String(c).startsWith('action.alumni.')) return true
    }
  }
  return false
}

/**
 * Di Pengaturan → Fitur (pohon menu), aksi `action.*.halaman` anak langsung dari menu lembaga
 * tidak ditampilkan: hak akses halaman sudah diwakili centang role pada baris menu induk.
 *
 * @param {string} menuCode
 * @param {Array<{ code?: string }>} children
 * @returns {Array<{ code?: string }>}
 */
export function filterLembagaHalamanChildActionsForFiturUi(menuCode, children) {
  const halaman = LEMBAGA_HALAMAN_ACTION_BY_MENU_CODE[String(menuCode || '')]
  if (!halaman || !Array.isArray(children)) return children || []
  return children.filter((c) => String(c?.code || '') !== halaman)
}

/**
 * @param {Array<{ code?: string, children?: unknown[] }>} roots
 */
export function mapFiturForestHideLembagaHalamanChildren(roots) {
  if (!Array.isArray(roots)) return roots
  return roots.map((r) => ({
    ...r,
    children: filterLembagaHalamanChildActionsForFiturUi(r.code, r.children || [])
  }))
}
