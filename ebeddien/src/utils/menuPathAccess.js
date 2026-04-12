import { UGT_LAPORAN_ACTION_CODES } from '../config/ugtLaporanFiturCodes'

const UGT_LAPORAN_PATH_TO_TAB = {
  '/ugt/laporan/koordinator': UGT_LAPORAN_ACTION_CODES.tabKoordinator,
  '/ugt/laporan/gt': UGT_LAPORAN_ACTION_CODES.tabGt,
  '/ugt/laporan/pjgt': UGT_LAPORAN_ACTION_CODES.tabPjgt
}

/**
 * Hilangkan segmen path yang seluruhnya angka (mis. id) agar kode menu selaras AppFiturMenuSeed.
 */
export function normalizePathnameForMenu(pathname) {
  let p = pathname.split('?')[0].replace(/\/+/g, '/')
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  const parts = p.split('/').filter(Boolean)
  const filtered = parts.filter((seg) => !/^\d+$/.test(seg))
  return filtered.length ? `/${filtered.join('/')}` : '/'
}

/**
 * Kandidat kode menu dari path (paling spesifik dulu), selaras pathToCode di AppFiturMenuSeed.
 */
export function pathnameToPossibleMenuCodes(pathname) {
  const norm = normalizePathnameForMenu(pathname)
  const raw = norm.replace(/^\/+|\/+$/g, '')
  if (raw === '') return ['menu.beranda']
  const segments = raw.split('/')
  const out = []
  for (let i = segments.length; i >= 1; i--) {
    const sub = segments
      .slice(0, i)
      .join('/')
      .replace(/-/g, '_')
      .replace(/\//g, '.')
    out.push(`menu.${sub}`)
  }
  return out
}

function codesMatchAnyMenuCandidate(pathname, fiturMenuCodes) {
  const candidates = pathnameToPossibleMenuCodes(pathname)
  return candidates.some((c) => fiturMenuCodes.includes(c))
}

/**
 * Izin akses path berdasarkan JWT fiturMenuCodes (menu.* & action.* dari role___fitur).
 * Super admin bypass di luar fungsi ini (DatabaseMenuOutlet).
 */
export function canAccessPathByFitur(pathname, fiturMenuCodes) {
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  const p = pathname.split('?')[0]
  const norm = normalizePathnameForMenu(p)

  if (norm.match(/^\/(uwaba|tunggakan|khusus)\/?$/)) {
    const mode = norm.replace(/^\//, '').split('/')[0]
    return codes.includes(`menu.${mode}`)
  }

  if (norm.startsWith('/pembayaran/')) {
    if (codes.some((c) => String(c).startsWith('menu.pembayaran.'))) return true
  }

  if (norm === '/pengeluaran' || norm.startsWith('/pengeluaran/')) {
    if (codes.some((c) => String(c).startsWith('action.pengeluaran.'))) return true
    if (codesMatchAnyMenuCandidate(p, codes)) return true
    return false
  }

  if (norm === '/absen' || norm.startsWith('/absen/')) {
    if (codes.some((c) => String(c).startsWith('action.absen.'))) return true
    if (codesMatchAnyMenuCandidate(p, codes)) return true
    return false
  }

  const tabKey = (norm.endsWith('/') ? norm.slice(0, -1) : norm) || norm
  const tabCode = UGT_LAPORAN_PATH_TO_TAB[tabKey]
  if (tabCode) {
    const apiHasTabs = codes.some((c) => String(c).startsWith('action.ugt.laporan.tab.'))
    if (apiHasTabs) return codes.includes(tabCode)
    return codesMatchAnyMenuCandidate(p, codes)
  }

  return codesMatchAnyMenuCandidate(p, codes)
}
