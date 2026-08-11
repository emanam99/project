/** Helper penugasan Guru Tugas PJGT (selaras kolom `is_aktif` API). */

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
        nis: r.santri_nis != null ? String(r.santri_nis).trim() : '',
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

/** Badge status penugasan untuk tampilan read-only. */
export function GtPenugasanStatusBadge({ aktif, className = '' }) {
  if (aktif) {
    return (
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 ${className}`.trim()}
      >
        Aktif
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 ${className}`.trim()}
    >
      Nonaktif
    </span>
  )
}
