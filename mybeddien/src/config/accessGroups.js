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
  if (user?.madrasah_id) s.add(ACCESS_GROUP.pjgt)

  return s
}

/**
 * Fitur yang bisa diakses akun (untuk halaman profil).
 * @param {Record<string, unknown> | null | undefined} user
 * @param {string} [namaMadrasah] nama lembaga dari profil API (PJGT)
 * @param {{ nama_pengasuh?: string | null, nama_pjgt?: string | null } | null | undefined} [madrasahExtra] kolom madrasah dari API profil
 * @returns {{ id: string, title: string, description: string }[]}
 */
export function getProfilFiturAksesList(user, namaMadrasah = '', madrasahExtra = null) {
  const keys = resolveAccessGroupKeys(user)
  const mid = user?.madrasah_id != null ? Number(user.madrasah_id) : 0
  const namaM = typeof namaMadrasah === 'string' ? namaMadrasah.trim() : ''
  const pengasuh = madrasahExtra?.nama_pengasuh != null ? String(madrasahExtra.nama_pengasuh).trim() : ''
  const pjgtNama = madrasahExtra?.nama_pjgt != null ? String(madrasahExtra.nama_pjgt).trim() : ''
  /** @type {{ id: string, title: string, description: string }[]} */
  const items = []

  const hasSantriAkses =
    Boolean(user?.santri_id) ||
    (Array.isArray(user?.santri_options) && user.santri_options.length > 0)
  if (hasSantriAkses) {
    items.push({
      id: 'santri',
      title: 'Santri',
      description: 'Biodata dan riwayat pembayaran',
    })
  }
  if (user?.has_toko === true) {
    items.push({
      id: 'toko',
      title: 'Toko',
      description: 'Dashboard toko dan data barang',
    })
  }
  if (keys.has(ACCESS_GROUP.pjgt) || mid > 0) {
    const lines = []
    if (namaM) lines.push(`Nama madrasah: ${namaM}`)
    if (pengasuh) lines.push(`Pengasuh: ${pengasuh}`)
    if (pjgtNama) lines.push(`PJGT: ${pjgtNama}`)
    const description =
      lines.length > 0 ? lines.join('\n') : 'Beranda PJGT dan laporan bulanan'
    items.push({
      id: 'madrasah',
      title: 'Madrasah (PJGT)',
      description,
    })
  }
  if (keys.has(ACCESS_GROUP.wali_santri)) {
    items.push({
      id: 'wali',
      title: 'Wali santri',
      description: 'Ringkasan untuk wali santri',
    })
  }

  return items
}
