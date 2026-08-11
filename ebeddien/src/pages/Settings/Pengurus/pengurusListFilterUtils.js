/** Filter daftar pengurus — dipakai halaman list, ekspor, dan Excel editor. */

export const normalizePengurusStatus = (s) => {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'active' || t === 'aktif') return 'active'
  if (t === 'inactive' || t === 'tidak aktif') return 'inactive'
  if (t === 'pending') return 'pending'
  return t
}

export const matchPengurusByStatus = (p, statusVal) => {
  if (!statusVal) return true
  return normalizePengurusStatus(p.status) === normalizePengurusStatus(statusVal)
}

export const matchPengurusByKategori = (p, kategoriVal) => {
  if (!kategoriVal) return true
  const lemb = p.lembaga || []
  return lemb.some((l) => String(l.kategori || '').trim() === String(kategoriVal).trim())
}

export const matchPengurusByLembaga = (p, lembagaVal) => {
  if (!lembagaVal) return true
  const ids = p.lembaga_ids || (p.lembaga || []).map((l) => String(l.id))
  return ids.includes(String(lembagaVal))
}

export const matchPengurusByJabatan = (p, jabatanVal) => {
  if (!jabatanVal) return true
  const v = String(jabatanVal).trim()
  const jabs = p.jabatan || []
  const byId = /^\d+$/.test(v)
  return jabs.some((j) =>
    byId ? String(j.jabatan_id || '') === v : String(j.jabatan_nama || '').trim() === v
  )
}

/**
 * @param {object[]} users
 * @param {{ status?: string, kategori_lembaga?: string, lembaga?: string, jabatan?: string, q?: string }} filters
 */
export const filterPengurusList = (users, filters = {}) => {
  const list = Array.isArray(users) ? users : []
  const {
    status = '',
    kategori_lembaga: kategoriVal = '',
    lembaga: lembagaVal = '',
    jabatan: jabatanVal = '',
    q = '',
  } = filters

  let result = list.filter(
    (p) =>
      matchPengurusByStatus(p, status) &&
      matchPengurusByKategori(p, kategoriVal) &&
      matchPengurusByLembaga(p, lembagaVal) &&
      matchPengurusByJabatan(p, jabatanVal)
  )

  const search = String(q || '').trim().toLowerCase()
  if (!search) return result

  return result.filter(
    (p) =>
      (p.nama && p.nama.toLowerCase().includes(search)) ||
      (p.email && p.email.toLowerCase().includes(search)) ||
      (p.nip && String(p.nip).includes(search)) ||
      (p.id && p.id.toString().includes(search))
  )
}

/** Kunci sort daftar pengurus (localStorage + menu). */
export const PENGURUS_SORT_NAMA = 'nama'
export const PENGURUS_SORT_JABATAN_URUTAN = 'jabatan_urutan'
export const PENGURUS_SORT_STORAGE_KEY = 'pengurus_list_sort'

const NO_JABATAN_URUTAN = 999999

const parseJabatanUrutan = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : NO_JABATAN_URUTAN
}

/** @param {object[]} jabatanMasterList */
export const buildJabatanUrutanLookup = (jabatanMasterList) => {
  const byId = new Map()
  for (const j of jabatanMasterList || []) {
    if (j?.id == null || j.id === '') continue
    byId.set(Number(j.id), parseJabatanUrutan(j.urutan))
  }
  return { byId }
}

/**
 * Urutan sort pengurus: urutan terendah jabatan yang relevan (hormati filter lembaga/jabatan).
 * @param {object} p
 * @param {{ byId: Map<number, number> }} lookup
 * @param {{ lembaga?: string, jabatan?: string }} scopeFilters
 */
export const resolvePengurusJabatanUrutanSortKey = (p, lookup, scopeFilters = {}) => {
  let candidates = p.jabatan || []
  if (scopeFilters.lembaga) {
    candidates = candidates.filter((j) => String(j.lembaga_id || '') === String(scopeFilters.lembaga))
  }
  if (scopeFilters.jabatan) {
    const v = String(scopeFilters.jabatan).trim()
    const byId = /^\d+$/.test(v)
    candidates = candidates.filter((j) =>
      byId ? String(j.jabatan_id || '') === v : String(j.jabatan_nama || '').trim() === v
    )
  }
  if (candidates.length === 0) return NO_JABATAN_URUTAN

  let min = NO_JABATAN_URUTAN
  for (const j of candidates) {
    if (j.jabatan_id == null) continue
    const u = lookup.byId.get(Number(j.jabatan_id))
    if (u != null) min = Math.min(min, u)
  }
  return min
}

export const comparePengurusByNama = (a, b) =>
  String(a?.nama || '').trim().localeCompare(String(b?.nama || '').trim(), 'id', { sensitivity: 'base' })

/**
 * @param {object[]} users
 * @param {string} sortKey
 * @param {{ lookup?: { byId: Map<number, number> }, scopeFilters?: { lembaga?: string, jabatan?: string } }} [options]
 */
export const sortPengurusList = (users, sortKey = PENGURUS_SORT_NAMA, options = {}) => {
  const list = Array.isArray(users) ? [...users] : []
  if (sortKey === PENGURUS_SORT_JABATAN_URUTAN) {
    const lookup = options.lookup || buildJabatanUrutanLookup([])
    const scopeFilters = options.scopeFilters || {}
    list.sort((a, b) => {
      const ua = resolvePengurusJabatanUrutanSortKey(a, lookup, scopeFilters)
      const ub = resolvePengurusJabatanUrutanSortKey(b, lookup, scopeFilters)
      if (ua !== ub) return ua - ub
      return comparePengurusByNama(a, b)
    })
    return list
  }
  list.sort(comparePengurusByNama)
  return list
}

export const readPengurusListFiltersFromSearch = (search) => {
  const query = new URLSearchParams(search || '')
  const filters = {}
  const status = query.get('status')
  if (status != null && String(status).trim() !== '') filters.status = String(status).trim()
  const kategori = query.get('kategori_lembaga')
  if (kategori != null && String(kategori).trim() !== '') filters.kategori_lembaga = String(kategori).trim()
  const lembaga = query.get('lembaga')
  if (lembaga != null && String(lembaga).trim() !== '') filters.lembaga = String(lembaga).trim()
  const jabatan = query.get('jabatan')
  if (jabatan != null && String(jabatan).trim() !== '') filters.jabatan = String(jabatan).trim()
  const q = query.get('q')
  if (q != null && String(q).trim() !== '') filters.q = String(q).trim()
  return filters
}

export const buildPengurusListFilterQueryString = (filters = {}) => {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.kategori_lembaga) params.set('kategori_lembaga', filters.kategori_lembaga)
  if (filters.lembaga) params.set('lembaga', filters.lembaga)
  if (filters.jabatan) params.set('jabatan', filters.jabatan)
  const q = String(filters.q || '').trim()
  if (q) params.set('q', q)
  return params.toString()
}