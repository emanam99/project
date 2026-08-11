/** Helper penugasan Guru Tugas UGT (selaras kolom `is_aktif` API). */

export function rowGtAktif(row) {
  if (row?.is_aktif === undefined || row?.is_aktif === null) return true
  return Number(row.is_aktif) === 1
}

/** Santri unik dengan penugasan **aktif** di madrasah untuk tahun ajaran tertentu. */
export function uniqueSantriGtAktifUntukTa(rows, ta) {
  const taKey = String(ta ?? '').trim()
  if (!taKey) return []
  const map = new Map()
  for (const r of rows) {
    if (String(r.id_tahun_ajaran ?? '').trim() !== taKey) continue
    if (!rowGtAktif(r)) continue
    const nid = Number(r.id_santri)
    if (!Number.isFinite(nid) || nid <= 0) continue
    if (!map.has(nid)) {
      map.set(nid, {
        id: nid,
        nama: String(r.santri_nama ?? '').trim() || '—',
        nis: r.santri_nis != null ? String(r.santri_nis).trim() : ''
      })
    }
  }
  return [...map.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

export function formatSantriGtLabel(s) {
  if (!s) return ''
  const nama = s.nama || '—'
  const nis = s.nis != null && String(s.nis).trim() !== '' ? ` — NIS ${s.nis}` : ''
  return `${nama}${nis}`.trim()
}
