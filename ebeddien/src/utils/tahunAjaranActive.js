import { getMasehiKeyHariIni } from '../services/hijriPenanggalanStorage'

/** Normalisasi nilai tanggal ke Y-m-d untuk perbandingan rentang. */
export function toTahunAjaranYmd(val) {
  if (val == null || val === '') return null
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Tanggal masehi hari ini (Y-m-d), selaras penanggalan aplikasi. */
export function getMasehiHariIniYmd() {
  if (typeof window === 'undefined') {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return getMasehiKeyHariIni() || toTahunAjaranYmd(new Date().toISOString()) || ''
}

/**
 * Tahun ajaran yang rentang dari–sampai (masehi) mencakup tanggal referensi.
 * Selaras TahunAjaranActiveHelper (PHP): cocok aktif, lalu terbaru yang punya rentang.
 *
 * @param {Array<{ tahun_ajaran?: string, dari?: string, sampai?: string }>} rows
 * @param {string} [masehiYmd]
 * @returns {string|null}
 */
export function resolveActiveTahunAjaranFromRows(rows, masehiYmd) {
  const today = toTahunAjaranYmd(masehiYmd) || getMasehiHariIniYmd()
  if (!today) return null

  const list = Array.isArray(rows) ? rows : []
  const withRentang = list
    .map((row) => {
      const ta = row?.tahun_ajaran != null ? String(row.tahun_ajaran).trim() : ''
      const dari = toTahunAjaranYmd(row?.dari)
      const sampai = toTahunAjaranYmd(row?.sampai)
      if (!ta || !dari || !sampai) return null
      return { tahun_ajaran: ta, dari, sampai }
    })
    .filter(Boolean)

  if (withRentang.length === 0) return null

  const active = withRentang.filter((r) => r.dari <= today && r.sampai >= today)
  if (active.length === 1) return active[0].tahun_ajaran

  const pool = active.length > 0 ? active : withRentang
  pool.sort((a, b) => b.dari.localeCompare(a.dari) || b.tahun_ajaran.localeCompare(a.tahun_ajaran))

  return pool[0]?.tahun_ajaran ?? null
}

/** Hanya dari rentang master — tidak memakai pilihan header/profil. */
export function resolveActiveHijriyahTahunAjaranFromRows(rows, masehiYmd) {
  const list = Array.isArray(rows) ? rows : []
  return resolveActiveTahunAjaranFromRows(list, masehiYmd)
}

export function hasSavedTahunAjaranHijriyah() {
  if (typeof window === 'undefined') return false
  const v = localStorage.getItem('tahun_ajaran') || localStorage.getItem('tahunAjaran')
  return v != null && String(v).trim() !== ''
}

export function hasSavedTahunAjaranMasehi() {
  if (typeof window === 'undefined') return false
  const v = localStorage.getItem('tahun_ajaran_masehi')
  return v != null && String(v).trim() !== ''
}

/** Baris master hijriyah dengan rentang masehi terisi. */
export function normalizeHijriyahRentangRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list
    .map((row) => {
      const tahun_ajaran = row?.tahun_ajaran != null ? String(row.tahun_ajaran).trim() : ''
      const dari = toTahunAjaranYmd(row?.dari)
      const sampai = toTahunAjaranYmd(row?.sampai)
      if (!tahun_ajaran || !dari || !sampai) return null
      return { tahun_ajaran, dari, sampai }
    })
    .filter(Boolean)
}

export function getSortedHijriyahRentangRows(rows) {
  const normalized = normalizeHijriyahRentangRows(rows)
  return [...normalized].sort(
    (a, b) => b.dari.localeCompare(a.dari) || b.tahun_ajaran.localeCompare(a.tahun_ajaran)
  )
}

export function getHijriyahRowByTahunAjaran(rows, tahunAjaran) {
  const ta = String(tahunAjaran || '').trim()
  if (!ta) return null
  return normalizeHijriyahRentangRows(rows).find((r) => r.tahun_ajaran === ta) ?? null
}

/** Transaksi masuk TA jika tanggal_dibuat (masehi) dalam rentang dari–sampai master. */
export function isTransaksiInTahunAjaranRentang(tanggalDibuat, rentangRow) {
  if (!rentangRow) return false
  const ymd = toTahunAjaranYmd(tanggalDibuat)
  if (!ymd) return false
  return ymd >= rentangRow.dari && ymd <= rentangRow.sampai
}

export function filterTransaksiByTahunAjaranRentang(items, rows, tahunAjaran) {
  const list = Array.isArray(items) ? items : []
  const rentang = getHijriyahRowByTahunAjaran(rows, tahunAjaran)
  if (!rentang) {
    const ta = String(tahunAjaran || '').trim()
    return list.filter((p) => String(p?.tahun_ajaran || '').trim() === ta)
  }
  return list.filter((p) => isTransaksiInTahunAjaranRentang(p?.tanggal_dibuat, rentang))
}

/** Saldo awal = neto semua transaksi sebelum tanggal «dari» TA terpilih. */
export function computeSaldoAwalBeforeRentang(pemasukanList, pengeluaranList, dariYmd) {
  const dari = toTahunAjaranYmd(dariYmd)
  if (!dari) return 0
  let pemasukan = 0
  let pengeluaran = 0
  for (const p of pemasukanList || []) {
    const ymd = toTahunAjaranYmd(p?.tanggal_dibuat)
    if (ymd && ymd < dari) pemasukan += parseFloat(p?.nominal || 0)
  }
  for (const p of pengeluaranList || []) {
    const ymd = toTahunAjaranYmd(p?.tanggal_dibuat)
    if (ymd && ymd < dari) pengeluaran += parseFloat(p?.nominal || 0)
  }
  return pemasukan - pengeluaran
}
