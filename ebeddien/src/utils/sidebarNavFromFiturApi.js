import { GROUP_ORDER } from '../config/menuConfig'
import { getIcon } from '../config/menuIcons.jsx'
import { extractMenuIconKey, isMenuHiddenFromNav, pickMenuRowsForSidebar } from './menuCatalogNav'

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
 * Menu dengan parent_id ke menu lain digabung sebagai children (mis. WhatsApp → Evo / WhatsApp / WatZap).
 * @param {unknown} apiItems
 * @returns {Array<Record<string, unknown>>}
 */
export function buildSidebarNavFromFiturItems(apiItems) {
  if (!apiItems || !Array.isArray(apiItems) || apiItems.length === 0) return []
  const menusOnly = apiItems.filter((it) => (it.type || 'menu') === 'menu' && !isMenuHiddenFromNav(it))
  const sorted = sortFiturItems(menusOnly)
  const flat = sorted.map((item) => {
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    const id = item.id != null ? Number(item.id) : null
    const parentId =
      item.parent_id != null && item.parent_id !== '' ? Number(item.parent_id) : null
    return {
      id: Number.isFinite(id) && id > 0 ? id : null,
      parentId: Number.isFinite(parentId) && parentId > 0 ? parentId : null,
      path: item.path || '/',
      label: item.label || '',
      icon: getIcon(extractMenuIconKey(item) || 'home', 'w-6 h-6'),
      requiresRole: meta.requiresRole,
      requiresSuperAdmin: meta.requiresSuperAdmin,
      requiresPermission: meta.requiresPermission,
      group: item.group_label || 'Lainnya',
      fiturCode: item.code,
      sortOrder: item.sort_order || 0,
      children: [],
      _fromApi: true
    }
  })

  const byId = new Map()
  for (const row of flat) {
    if (row.id != null) byId.set(row.id, row)
  }

  const roots = []
  for (const row of flat) {
    if (row.parentId != null && byId.has(row.parentId)) {
      byId.get(row.parentId).children.push(row)
    } else {
      roots.push(row)
    }
  }

  const n = roots.length
  return roots.map((item, i) => {
    const g = item.group || 'Lainnya'
    const nextG = i + 1 < n ? roots[i + 1].group || 'Lainnya' : null
    const showSeparatorAfter = nextG === null || g !== nextG
    if (Array.isArray(item.children) && item.children.length > 0) {
      item.children.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    } else {
      delete item.children
    }
    return { ...item, showSeparatorAfter }
  })
}

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
  const menusOnly = apiItems.filter((it) => (it.type || 'menu') === 'menu' && !isMenuHiddenFromNav(it))
  const sorted = sortFiturItems(menusOnly)

  const menuIds = new Set()
  for (const it of sorted) {
    const id = it.id != null ? Number(it.id) : NaN
    if (Number.isFinite(id) && id > 0) menuIds.add(id)
  }
  // Expanded nav: tampilkan induk; anak nested di-skip agar tidak duplikat
  const topLevel = sorted.filter((it) => {
    const pid = it.parent_id != null && it.parent_id !== '' ? Number(it.parent_id) : null
    if (pid == null || !Number.isFinite(pid)) return true
    return !menuIds.has(pid)
  })

  const n = topLevel.length
  return topLevel.map((item, i) => {
    const g = item.group_label || 'Lainnya'
    const prevG = i > 0 ? topLevel[i - 1].group_label || 'Lainnya' : null
    const nextG = i + 1 < n ? topLevel[i + 1].group_label || 'Lainnya' : null
    const showSeparator = nextG === null || g !== nextG
    const isFirstOfGroup = prevG === null || g !== prevG
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {}
    return {
      path: item.path || '/',
      label: item.label || '',
      icon: getIcon(extractMenuIconKey(item) || 'home', 'w-5 h-5'),
      showSeparator,
      group: g,
      groupLabel: isFirstOfGroup ? g : undefined,
      requiresRole: meta.requiresRole,
      requiresSuperAdmin: meta.requiresSuperAdmin,
      requiresPermission: meta.requiresPermission,
      _fromApi: true
    }
  })
}
