/**
 * Aksi halaman modul Lembaga — selaras app___fitur (migrasi lembaga_halaman_fitur_actions).
 * Membolehkan peran dengan aksi saja (tanpa menu induk) mengakses rute & sidebar.
 */
export const LEMBAGA_HALAMAN_ACTION_BY_MENU_CODE = {
  'menu.santri': 'action.santri.halaman',
  'menu.rombel': 'action.rombel.halaman',
  'menu.manage_jabatan': 'action.manage_jabatan.halaman',
  'menu.mapel': 'action.mapel.halaman'
}

/**
 * @param {string} menuCode
 * @param {Set<string>} codesSet
 */
export function codesSetHasMenuOrHalamanAksi(menuCode, codesSet) {
  const mc = String(menuCode || '')
  if (!mc || !codesSet.has(mc)) {
    const act = LEMBAGA_HALAMAN_ACTION_BY_MENU_CODE[mc]
    if (act && codesSet.has(act)) return true
    return false
  }
  return true
}
