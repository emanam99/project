import { GROUP_ORDER } from '../config/menuConfig'
import { getIcon } from '../config/menuIcons.jsx'

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
  if (!apiItems || !Array.isArray(apiItems) || apiItems.length === 0) return null
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
      icon: getIcon(item.icon_key || 'home', 'w-6 h-6'),
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
 * Bentuk menu expanded (offcanvas) selaras getExpandedMenuItemsMeta().
 * @param {unknown} apiItems
 * @returns {Array<Record<string, unknown>>|null}
 */
export function buildExpandedMenuFromFiturItems(apiItems) {
  if (!apiItems || !Array.isArray(apiItems) || apiItems.length === 0) return null
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
      icon: getIcon(item.icon_key || 'home', 'w-5 h-5'),
      showSeparator,
      groupLabel: showSeparator ? g : undefined,
      requiresRole: meta.requiresRole,
      requiresSuperAdmin: meta.requiresSuperAdmin,
      requiresPermission: meta.requiresPermission,
      _fromApi: true
    }
  })
}
