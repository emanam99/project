import { getMasehiHariIniYmd, toTahunAjaranYmd } from './tahunAjaranActive'

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rangesOverlap(a, b) {
  return a.dari <= b.sampai && b.dari <= a.sampai
}

function normalizeRow(row) {
  const ta = row?.tahun_ajaran != null ? String(row.tahun_ajaran).trim() : ''
  const dari = toTahunAjaranYmd(row?.dari)
  const sampai = toTahunAjaranYmd(row?.sampai)
  if (!ta) return null
  return { tahun_ajaran: ta, kategori: row?.kategori || '', dari, sampai, hasRentang: Boolean(dari && sampai) }
}

function formatIdDate(ymd) {
  if (!ymd) return '–'
  const [y, m, d] = ymd.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${Number(d)} ${months[Number(m) - 1] || m} ${y}`
}

/**
 * Analisis rentang satu kategori (hijriyah / masehi).
 * @param {Array} rows
 * @param {string} [masehiYmd] tanggal acuan (masehi)
 */
export function analyzeTahunAjaranKategori(rows, masehiYmd) {
  const today = toTahunAjaranYmd(masehiYmd) || getMasehiHariIniYmd()
  const normalized = (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter(Boolean)

  const withRentang = normalized.filter((r) => r.hasRentang)
  const missingRentang = normalized.filter((r) => !r.hasRentang).map((r) => r.tahun_ajaran)

  const activeMatches = withRentang.filter((r) => r.dari <= today && r.sampai >= today)
  const overlappingTahunAjaran = new Set()

  for (let i = 0; i < withRentang.length; i++) {
    for (let j = i + 1; j < withRentang.length; j++) {
      if (rangesOverlap(withRentang[i], withRentang[j])) {
        overlappingTahunAjaran.add(withRentang[i].tahun_ajaran)
        overlappingTahunAjaran.add(withRentang[j].tahun_ajaran)
      }
    }
  }

  const sorted = [...withRentang].sort((a, b) => a.dari.localeCompare(b.dari) || a.tahun_ajaran.localeCompare(b.tahun_ajaran))
  const gaps = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const dayAfter = addDaysYmd(sorted[i].sampai, 1)
    if (dayAfter < sorted[i + 1].dari) {
      gaps.push({
        dari: dayAfter,
        sampai: addDaysYmd(sorted[i + 1].dari, -1),
        label: `${formatIdDate(dayAfter)} s/d ${formatIdDate(addDaysYmd(sorted[i + 1].dari, -1))}`
      })
    }
  }

  let activeTahunAjaran = null
  if (activeMatches.length === 1) {
    activeTahunAjaran = activeMatches[0].tahun_ajaran
  } else if (activeMatches.length > 1) {
    const pool = [...activeMatches].sort((a, b) => b.dari.localeCompare(a.dari))
    activeTahunAjaran = pool[0]?.tahun_ajaran ?? null
  } else if (withRentang.length > 0) {
    const pool = [...withRentang].sort((a, b) => b.dari.localeCompare(a.dari))
    activeTahunAjaran = pool[0]?.tahun_ajaran ?? null
  }

  const todayInOverlap = activeMatches.length > 1
  const todayUncovered = withRentang.length > 0 && activeMatches.length === 0

  return {
    today,
    normalized,
    withRentang,
    missingRentang,
    activeMatches: activeMatches.map((r) => r.tahun_ajaran),
    activeTahunAjaran,
    overlappingTahunAjaran: [...overlappingTahunAjaran],
    todayInOverlap,
    todayUncovered,
    gaps
  }
}

export function analyzeTahunAjaranMaster(items, masehiYmd) {
  const list = Array.isArray(items) ? items : []
  const hijriyah = list.filter((r) => r.kategori === 'hijriyah')
  const masehi = list.filter((r) => r.kategori === 'masehi')
  return {
    hijriyah: analyzeTahunAjaranKategori(hijriyah, masehiYmd),
    masehi: analyzeTahunAjaranKategori(masehi, masehiYmd)
  }
}

export function getCardRentangStatus(item, analysis) {
  const ta = item?.tahun_ajaran
  if (!ta) return 'neutral'
  if (analysis.missingRentang.includes(ta)) return 'incomplete'
  if (analysis.overlappingTahunAjaran.includes(ta)) return 'overlap'
  if (analysis.activeMatches.includes(ta)) {
    return analysis.todayInOverlap ? 'overlap' : 'active'
  }
  return 'neutral'
}

export { formatIdDate }
