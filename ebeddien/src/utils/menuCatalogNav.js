import { STATIC_FALLBACK_MENU_CATALOG_ROWS } from '../config/menuConfig'
import { codesSetHasMenuOrHalamanAksi } from '../config/lembagaHalamanFiturCodes'

/** Urutan grup di dropdown header (selaras backend / grup_label) */
export const HEADER_NAV_GROUP_ORDER = [
  'Super Admin',
  'Pendaftaran',
  'UWABA',
  'UGT',
  'Keuangan',
  'Ijin',
  'Kalender',
  'Cashless',
  'Setting',
  'Tentang'
]

/**
 * @param {unknown} catalogItems
 * @param {unknown} fiturMenuCodes
 * @param {boolean} isSuperAdmin
 * @returns {Array<Record<string, unknown>>}
 */
/** Ikon menu dari baris DB: kolom icon_key / alias camelCase / meta_json. */
export function extractMenuIconKey(row) {
  if (!row || typeof row !== 'object') return null
  const direct = row.icon_key ?? row.iconKey
  if (direct != null && String(direct).trim() !== '') return String(direct).trim()
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {}
  const mk = meta.icon_key ?? meta.iconKey
  if (mk != null && String(mk).trim() !== '') return String(mk).trim()
  return null
}

export function filterCatalogMenuByUserCodes(catalogItems, fiturMenuCodes, isSuperAdmin) {
  if (!Array.isArray(catalogItems) || catalogItems.length === 0) return []
  const menus = catalogItems.filter((it) => (it.type || 'menu') === 'menu')
  if (isSuperAdmin) return menus
  const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
  const set = new Set(codes.map((c) => String(c)))
  return menus.filter((it) => it.code && codesSetHasMenuOrHalamanAksi(String(it.code), set))
}

/**
 * Bentuk selaras navMenuItems / MENU_ITEMS (path, label, group, akses dari meta).
 * @param {Array<Record<string, unknown>>} catalogMenus
 */
export function catalogMenusToNavFlat(catalogMenus) {
  if (!Array.isArray(catalogMenus)) return []
  return catalogMenus.map((item) => {
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const row = {
      path: item.path || '/',
      label: item.label || '',
      group: item.group_label || 'Lainnya',
      fiturCode: item.code,
      ...(meta.requiresRole && { requiresRole: meta.requiresRole }),
      ...(meta.requiresSuperAdmin && { requiresSuperAdmin: true }),
      ...(meta.requiresPermission && { requiresPermission: meta.requiresPermission })
    }
    return row
  })
}

/**
 * Dropdown header — sama logika menuConfig.getHeaderGroups, input dari flat menu DB.
 * @param {Array<{ path: string, label: string, group: string }>} flatItems
 */
export function getHeaderGroupsFromMenuFlat(flatItems) {
  if (!Array.isArray(flatItems) || flatItems.length === 0) return []
  const byGroup = new Map()
  flatItems.forEach((item) => {
    const g = item.group || 'Lainnya'
    if (g === 'My Workspace' || g === 'Kalender Pesantren') return
    const target = g === 'Domisili' || g === 'Lembaga' ? 'Setting' : g
    if (!byGroup.has(target)) byGroup.set(target, [])
    byGroup.get(target).push({ path: item.path, label: item.label })
  })
  return HEADER_NAV_GROUP_ORDER.map((name) => {
    const routes = byGroup.get(name) || []
    const withPrefix = routes.map((r) => {
      const prefix = routes.some((o) => o.path !== r.path && o.path.startsWith(r.path + '/'))
      let p = prefix
      if (r.path === '/ugt/laporan') p = true
      return { ...r, prefix: p || undefined }
    })
    return { name, routes: withPrefix }
  })
}

function normalizeNavPath(pathname) {
  const s = pathname == null ? '/' : String(pathname).replace(/\/$/, '') || '/'
  return s
}

/**
 * Satu baris katalog menu yang cocok dengan path (exact atau prefix terpanjang).
 * @param {unknown} catalog
 * @param {string} pathname
 * @returns {Record<string, unknown>|null}
 */
export function catalogMenuRowForPath(catalog, pathname) {
  const path = normalizeNavPath(pathname)
  if (!Array.isArray(catalog) || catalog.length === 0) return null
  const menus = catalog.filter((it) => (it.type || 'menu') === 'menu')
  const exact = menus.find((m) => (m.path || '') === path)
  if (exact) return exact
  let best = null
  let bestLen = -1
  for (const m of menus) {
    const p = m.path || ''
    if (p && path.startsWith(`${p}/`) && p.length > bestLen) {
      bestLen = p.length
      best = m
    }
  }
  return best
}

/** @param {unknown} catalog @param {string} pathname */
export function iconKeyForPathFromCatalog(catalog, pathname) {
  const row =
    catalogMenuRowForPath(catalog, pathname) ||
    catalogMenuRowForPath(STATIC_FALLBACK_MENU_CATALOG_ROWS, pathname)
  const k = extractMenuIconKey(row)
  return k || undefined
}

/** @param {unknown} catalog @param {string} pathname */
export function labelForPathFromMenuCatalog(catalog, pathname) {
  const row =
    catalogMenuRowForPath(catalog, pathname) ||
    catalogMenuRowForPath(STATIC_FALLBACK_MENU_CATALOG_ROWS, pathname)
  const lab = row?.label != null ? String(row.label).trim() : ''
  return lab || null
}

/**
 * Prioritas: GET /v2/me/fitur-menu → katalog DB + kode user → cadangan menu statis (inti).
 * @param {{ fiturMenuFromApi: unknown, fiturMenuCatalog: unknown, fiturMenuCodes: unknown, isSuperAdmin: boolean, fiturMenuFetchStatus?: string }} p
 * Jika `fiturMenuFetchStatus` diisi: non–super-admin tidak memakai katalog/kode sebelum fetch fitur selesai (hindari cadangan statis salah saat race).
 */
export function pickMenuRowsForSidebar(p) {
  const { fiturMenuFromApi, fiturMenuCatalog, fiturMenuCodes, isSuperAdmin, fiturMenuFetchStatus } = p
  if (Array.isArray(fiturMenuFromApi) && fiturMenuFromApi.length > 0) {
    return { rows: fiturMenuFromApi, source: 'my' }
  }
  const waitForFitur =
    fiturMenuFetchStatus !== undefined &&
    fiturMenuFetchStatus !== 'ok' &&
    !isSuperAdmin
  if (waitForFitur) {
    return { rows: null, source: 'loading' }
  }
  const filtered = filterCatalogMenuByUserCodes(fiturMenuCatalog, fiturMenuCodes, isSuperAdmin)
  if (filtered.length > 0) {
    return { rows: filtered, source: 'catalog' }
  }
  return { rows: STATIC_FALLBACK_MENU_CATALOG_ROWS, source: 'static-fallback' }
}

/**
 * Daftar flat menu untuk Beranda / Semua Menu — sama sumbernya dengan sidebar (hanya type=menu).
 * @param {{ fiturMenuFromApi: unknown, fiturMenuCatalog: unknown, fiturMenuCodes: unknown, isSuperAdmin: boolean, fiturMenuFetchStatus?: string }} p
 * @returns {{ menus: Array<Record<string, unknown>>, source: string }}
 */
export function buildFlatNavMenusFromFitur(p) {
  const { rows, source } = pickMenuRowsForSidebar(p)
  if (source === 'loading' || rows == null) {
    return { menus: [], source: 'loading' }
  }
  const menusOnly = rows.filter((it) => (it.type || 'menu') === 'menu')
  if (menusOnly.length === 0) {
    return { menus: [], source: 'empty' }
  }
  return { menus: catalogMenusToNavFlat(menusOnly), source }
}

/**
 * Cari route header yang cocok untuk path saat ini.
 * @param {string} pathname
 * @param {Array<{name: string, routes: Array<{path: string, label: string, prefix?: boolean}>}>} headerGroups
 * @returns {{group: string, label: string}|null}
 */
export function matchHeaderRoute(pathname, headerGroups) {
  const rawPath = pathname || '/'
  const path = rawPath === '/' || rawPath === '/dashboard' ? '/dashboard-pembayaran' : rawPath
  if (!Array.isArray(headerGroups)) return null
  for (const group of headerGroups) {
    for (const route of group.routes || []) {
      const match = route.prefix
        ? (path === route.path || path.startsWith(route.path + '/'))
        : path === route.path
      if (match) return { group: group.name, label: route.label }
    }
  }
  return null
}
