/**
 * Ubah entry hasil scan/API menjadi baris list buku tamu.
 * @param {object} entry
 * @param {object|null} mahromFull biodata mahrom lengkap dari scan (opsional)
 */
export function entryToListRow(entry, mahromFull = null) {
  if (!entry?.id) return null
  const m = entry.mahrom || {}
  const full = mahromFull || {}
  return {
    id: entry.id,
    id_mahrom: entry.id_mahrom,
    id_kartu: entry.id_kartu ?? null,
    waktu_datang: entry.waktu_datang,
    id_petugas: entry.id_petugas ?? null,
    petugas_nama: entry.petugas_nama ?? null,
    mahrom: {
      nim: String(full.nim ?? m.nim ?? ''),
      nama: String(full.nama ?? m.nama ?? ''),
      nik: String(full.nik ?? m.nik ?? ''),
      gender: full.gender ?? m.gender ?? null,
    },
    santri_didatangi: Array.isArray(entry.santri_didatangi) ? entry.santri_didatangi : [],
  }
}

/** @param {object} row @param {string} search */
export function rowMatchesSearch(row, search) {
  const q = String(search || '').trim().toLowerCase()
  if (!q) return true
  const parts = [
    row.mahrom?.nama,
    row.mahrom?.nim,
    row.mahrom?.nik,
    ...(row.santri_didatangi || []).flatMap((s) => [s.santri_nama, s.nis]),
  ]
  return parts.some((p) => String(p || '').toLowerCase().includes(q))
}

/**
 * Sisipkan baris baru di atas list (tanpa reload penuh).
 * @returns {boolean} true jika baris ditambahkan/diperbarui di list
 */
export function prependListRow(prev, row, perPage) {
  const isNew = !prev.some((r) => r.id === row.id)
  const next = [row, ...prev.filter((r) => r.id !== row.id)].slice(0, perPage)
  return { next, isNew }
}

/** @param {object} prev pagination */
export function bumpPaginationTotal(prev, perPage, delta = 1) {
  const total = Math.max(0, (prev.total ?? 0) + delta)
  return {
    ...prev,
    total,
    total_pages: total > 0 ? Math.ceil(total / perPage) : 0,
  }
}

/** @param {object[]} prev @param {object} entry */
export function patchListEntry(prev, entry) {
  if (!entry?.id) return prev
  return prev.map((r) =>
    r.id === entry.id
      ? {
          ...r,
          ...entry,
          mahrom: { ...r.mahrom, ...(entry.mahrom || {}) },
          santri_didatangi: entry.santri_didatangi ?? r.santri_didatangi,
        }
      : r
  )
}
