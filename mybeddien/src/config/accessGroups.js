/**
 * Grup akses utama myBeddien (dikembangkan bertahap).
 * Backend boleh mengirim `user.grup_akses: string[]`; jika kosong dipakai heuristik sederhana.
 */
export const ACCESS_GROUP = {
  workspace: 'workspace',
  santri: 'santri',
  wali_santri: 'wali_santri',
  toko: 'toko',
  pjgt: 'pjgt',
}

/** @param {Record<string, unknown> | null | undefined} user */
export function resolveAccessGroupKeys(user) {
  const fromApi = Array.isArray(user?.grup_akses)
    ? user.grup_akses.map((x) => String(x).trim()).filter(Boolean)
    : null

  if (fromApi && fromApi.length > 0) {
    const s = new Set(fromApi)
    s.add(ACCESS_GROUP.workspace)
    return s
  }

  const s = new Set([ACCESS_GROUP.workspace])
  if (user?.santri_id) s.add(ACCESS_GROUP.santri)
  if (user?.has_toko === true) s.add(ACCESS_GROUP.toko)

  const rk = String(user?.role_key || user?.role_label || '').toLowerCase()
  if (rk.includes('wali')) s.add(ACCESS_GROUP.wali_santri)
  if (rk.includes('pjgt')) s.add(ACCESS_GROUP.pjgt)

  return s
}
