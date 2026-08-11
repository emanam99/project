/** Parse kolom kelompok DB ke kelas + kel (pola rombel). */
export function parseKelompok(kelompok) {
  const s = String(kelompok ?? '').trim()
  if (!s) return { kelas: '', kel: '' }
  const dash = s.indexOf('-')
  if (dash >= 0) {
    return { kelas: s.slice(0, dash).trim(), kel: s.slice(dash + 1).trim() }
  }
  return { kelas: '', kel: s }
}

/** Gabungkan kelas + kel ke kolom kelompok. */
export function combineKelompok(kelas, kel) {
  const k = String(kelas ?? '').trim()
  const l = String(kel ?? '').trim()
  if (k && l) return `${k}-${l}`
  return k || l
}

/** Label kartu / judul: Tingkatan (kelas-kel). */
export function formatTingkatanLabel(row) {
  const tk = String(row?.tingkatan ?? '').trim() || '-'
  const kelompok = String(row?.kelompok ?? '').trim()
  if (!kelompok) return tk
  return `${tk} (${kelompok})`
}

export function rowMatchesKelasKel(row, kelas, kel) {
  const { kelas: k, kel: l } = parseKelompok(row?.kelompok)
  return String(k).trim() === String(kelas ?? '').trim() && String(l).trim() === String(kel ?? '').trim()
}

export function findTingkatanByProgramKelasKel(list, tingkatan, kelas, kel) {
  const tk = String(tingkatan ?? '').trim()
  if (!tk) return null
  return (
    list.find(
      (r) => String(r.tingkatan || '').trim() === tk && rowMatchesKelasKel(r, kelas, kel)
    ) || null
  )
}

export function findTingkatanByProgramKelompok(list, tingkatan, kelompok) {
  const tk = String(tingkatan ?? '').trim()
  const k = String(kelompok ?? '').trim()
  if (!tk || !k) return null
  return (
    list.find(
      (r) => String(r.tingkatan || '').trim() === tk && String(r.kelompok ?? '').trim() === k
    ) || null
  )
}

/** Opsi kelompok unik dari daftar tingkatan (untuk pindah / filter). */
export function buildKelompokOptionsFromList(list, tingkatanProgram) {
  const map = new Map()
  const source = tingkatanProgram
    ? list.filter((r) => String(r.tingkatan || '').trim() === tingkatanProgram)
    : list
  source.forEach((r) => {
    const k = String(r.kelompok ?? '').trim()
    if (!k) return
    map.set(k, (map.get(k) || 0) + 1)
  })
  return [...map.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

/** Opsi kelas unik dari daftar tingkatan (untuk filter). */
export function buildKelasOptionsFromList(list, tingkatanProgram) {
  const map = new Map()
  const source = tingkatanProgram
    ? list.filter((r) => String(r.tingkatan || '').trim() === tingkatanProgram)
    : list
  source.forEach((r) => {
    const { kelas } = parseKelompok(r.kelompok)
    const k = String(kelas ?? '').trim()
    if (!k) return
    map.set(k, (map.get(k) || 0) + 1)
  })
  return [...map.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

/** Opsi kel unik dari daftar tingkatan (untuk filter). */
export function buildKelOptionsFromList(list, tingkatanProgram, kelas) {
  if (!kelas) return []
  const map = new Map()
  list
    .filter((r) => String(r.tingkatan || '').trim() === tingkatanProgram)
    .forEach((r) => {
      const parsed = parseKelompok(r.kelompok)
      if (String(parsed.kelas).trim() !== String(kelas).trim()) return
      const k = String(parsed.kel ?? '').trim()
      if (!k) return
      map.set(k, (map.get(k) || 0) + 1)
    })
  return [...map.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Pastikan nilai saat ini ada di opsi select. */
export function withCurrentOption(options, currentValue, label = null) {
  const v = String(currentValue ?? '').trim()
  if (!v) return options
  if (options.some((o) => String(o.value ?? o) === v)) return options
  return [{ value: v, label: label || v }, ...options]
}
