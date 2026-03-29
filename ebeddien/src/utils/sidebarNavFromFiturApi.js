import { GROUP_ORDER } from '../config/menuConfig'
import { getIcon } from '../config/menuIcons.jsx'
import { extractMenuIconKey, pickMenuRowsForSidebar } from './menuCatalogNav'

function groupRank(label) {
  const i = GROUP_ORDER.indexOf(label)
  return i >= 0 ? i : 999
}

function sortFiturItems(apiItems) {
  return [...apiItems].sort((a, b) => {
    const ga = groupRank(a.group_label || '')
    const gb = groupRank(b.group_label || '')
    if (ga !== gb) return ga - gb
    return (a.sort_order || 0) - (b.sort_order || 0)
  })
}

/**
 * Bentuk item sidebar dari response GET /v2/me/fitur-menu (items[]).
 * @param {unknown} apiItems
 * @returns {Array<Record<string, unknown>>|null}
 */
export function buildSidebarNavFromFiturItems(apiItems) {
  if (!apiItems || !Array.isArray(apiItems) || apiItems.length === 0) return []
  const menusOnly = apiItems.filter((it) => (it.type || 'menu') === 'menu')
  const sorted = sortFiturItems(menusOnly)
  const n = sorted.length
  return sorted.map((item, i) => {
    const g = item.group_label || 'Lainnya'
    const nextG = i + 1 < n ? sorted[i + 1].group_label || 'Lainnya' : null
    const showSeparatorAfter = nextG === null || g !== nextG
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    return {
      path: item.path || '/',
      label: item.label || '',
      icon: getIcon(extractMenuIconKey(item) || 'home', 'w-6 h-6'),
      showSeparatorAfter,
      requiresRole: meta.requiresRole,
      requiresSuperAdmin: meta.requiresSuperAdmin,
      requiresPermission: meta.requiresPermission,
      group: g,
      fiturCode: item.code,
      _fromApi: true
    }
  })
}

/**
 * Bentuk menu expanded (offcanvas); struktur selaras item sidebar (showSeparator, groupLabel).
 * @param {unknown} apiItems
 * @returns {Array<Record<string, unknown>>|null}
 */
/**
 * Sidebar: prioritas my-menu → katalog DB + kode (array kosong jika belum ada data).
 */
export function buildUnifiedSidebarNavFromFitur(params) {
  const { rows } = pickMenuRowsForSidebar(params)
  return buildSidebarNavFromFiturItems(rows)
}

/**
 * Expanded nav (offcanvas): sama prioritas.
 */
export function buildUnifiedExpandedMenuFromFitur(params) {
  const { rows } = pickMenuRowsForSidebar(params)
  return buildExpandedMenuFromFiturItems(rows)
}

export function buildExpandedMenuFromFiturItems(apiItems) {
  if (!apiItems || !Array.isArray(apiItems) || apiItems.length === 0) return []
  const menusOnly = apiItems.filter((it) => (it.type || 'menu') === 'menu')
  const sorted = sortFiturItems(menusOnly)
  const n = sorted.length
  return sorted.map((item, i) => {
    const g = item.group_label || 'Lainnya'
    const nextG = i + 1 < n ? sorted[i + 1].group_label || 'Lainnya' : null
    const showSeparator = nextG === null || g !== nextG
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    return {
      path: item.path || '/',
      label: item.label || '',
      icon: getIcon(extractMenuIconKey(item) || 'home', 'w-5 h-5'),
      showSeparator,
      groupLabel: showSeparator ? g : undefined,
      requiresRole: meta.requiresRole,
      requiresSuperAdmin: meta.requiresSuperAdmin,
      requiresPermission: meta.requiresPermission,
      _fromApi: true
    }
  })
}
