import { useState, useEffect, useMemo, useCallback, memo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { settingsAPI } from '../../services/api'
import { GROUP_ORDER } from '../../config/menuConfig'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import FiturMenuRoleOffcanvas from '../../components/FiturMenuRoleOffcanvas'

/** Hanya grup yang tidak ada di GROUP_ORDER (urutan akhir). Jangan duplikat nama dari menuConfig. */
const EXTRA_GROUP_ORDER = ['Lainnya']

function uniqueSortedGroups(items) {
  const set = new Set()
  items.forEach((it) => set.add(it.group_label || 'Lainnya'))
  const merged = [...GROUP_ORDER, ...EXTRA_GROUP_ORDER]
  const order = []
  const seen = new Set()
  merged.forEach((g) => {
    if (!seen.has(g)) {
      seen.add(g)
      order.push(g)
    }
  })
  const out = []
  order.forEach((g) => {
    if (set.has(g)) out.push(g)
  })
  set.forEach((g) => {
    if (!out.includes(g)) out.push(g)
  })
  return out
}

/** Pohon: parent_id null = akar; anak diurutkan sort_order. */
function buildFiturForest(flat) {
  const nodes = new Map()
  flat.forEach((it) => nodes.set(it.id, { ...it, children: [] }))
  const roots = []
  flat.forEach((it) => {
    const n = nodes.get(it.id)
    const pid = it.parent_id ?? null
    if (pid == null || !nodes.has(pid)) {
      roots.push(n)
    } else {
      nodes.get(pid).children.push(n)
    }
  })
  const sortFn = (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id
  roots.sort(sortFn)
  roots.forEach((r) => r.children.sort(sortFn))
  return roots
}

function filterFiturForest(roots, groupFilter, q) {
  const ql = q.trim().toLowerCase()
  const textMatch = (it) =>
    !ql ||
    (it.label || '').toLowerCase().includes(ql) ||
    (it.path || '').toLowerCase().includes(ql) ||
    (it.code || '').toLowerCase().includes(ql)
  const groupOk = (it) => !groupFilter || (it.group_label || 'Lainnya') === groupFilter

  return roots
    .filter((r) => groupOk(r))
    .map((r) => {
      const childList = r.children || []
      if (!ql) return { ...r, children: [...childList] }
      const rootOk = textMatch(r)
      const fc = childList.filter((c) => textMatch(c))
      if (!rootOk && fc.length === 0) return null
      return { ...r, children: rootOk ? [...childList] : fc }
    })
    .filter(Boolean)
}

function countForestNodes(roots) {
  let n = 0
  roots.forEach((r) => {
    n += 1
    n += (r.children || []).length
  })
  return n
}

/** Naik parent_id sampai baris type `menu` (untuk membatasi daftar role pada aksi anak). */
function findAncestorMenuItem(allItems, directParentId) {
  if (directParentId == null) return null
  const byId = new Map(allItems.map((it) => [it.id, it]))
  let pid = directParentId
  const seen = new Set()
  while (pid != null && !seen.has(pid)) {
    seen.add(pid)
    const row = byId.get(pid)
    if (!row) return null
    if (row.type === 'menu') return row
    pid = row.parent_id ?? null
  }
  return null
}

/** Urutan grup untuk akar pohon. */
function buildGroupSectionsFromRoots(roots) {
  const byGroup = new Map()
  roots.forEach((it) => {
    const g = it.group_label || 'Lainnya'
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g).push(it)
  })
  return uniqueSortedGroups(roots)
    .map((g) => ({ groupLabel: g, items: byGroup.get(g) || [] }))
    .filter((s) => s.items.length > 0)
}

const FiturTreeRow = memo(
  ({
    node,
    index,
    depth,
    expanded,
    onToggleExpand,
    onSelect,
    showGroupLabel = true,
    hasChildRows
  }) => {
    const roleCount = (node.role_ids || []).length
    const isChild = depth > 0
    const pathLine = node.path && String(node.path).trim() !== '' ? node.path : '—'

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.25) }}
        onClick={() => onSelect(node.id)}
        className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-all duration-200 group ${
          isChild ? 'pl-8 bg-gray-50/60 dark:bg-gray-900/25' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0 pr-2">
            {node.type === 'action' && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 block mb-0.5">
                Aksi
              </span>
            )}
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              {node.label}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{pathLine}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">{node.code}</p>
            {showGroupLabel && !isChild && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                Grup: <span className="font-medium text-gray-700 dark:text-gray-300">{node.group_label || 'Lainnya'}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasChildRows && !isChild ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? 'Ciutkan sub-fitur' : 'Bentangkan sub-fitur'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand(node.id)
                }}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ) : null}
            <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 tabular-nums">
              {roleCount} role
            </span>
            <svg
              className="w-5 h-5 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </motion.div>
    )
  }
)

FiturTreeRow.displayName = 'FiturTreeRow'

const SearchFilterBar = memo(
  ({
    searchInput,
    onSearchChange,
    onSearchFocus,
    onSearchBlur,
    isInputFocused,
    isFilterOpen,
    onFilterToggle,
    groupFilter,
    onGroupFilterChange,
    groupOptions,
    onRefresh,
    onResetFilter,
    totalShown
  }) => (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchChange}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari menu, aksi, path, atau kode…"
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <button
              type="button"
              onClick={onFilterToggle}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
              title={isFilterOpen ? 'Sembunyikan filter' : 'Tampilkan filter'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {isFilterOpen ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
        <div
          className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="px-4 py-2">
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={groupFilter}
                  onChange={onGroupFilterChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua grup</option>
                  {groupOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Muat ulang
                </button>
                <button
                  type="button"
                  onClick={onResetFilter}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                    />
                  </svg>
                  Reset filter
                </button>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200 tabular-nums">
                  {totalShown} entri
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
)

SearchFilterBar.displayName = 'SearchFilterBar'

export default function Fitur() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [payload, setPayload] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [selectedFiturId, setSelectedFiturId] = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const closeOffcanvas = useOffcanvasBackClose(selectedFiturId != null, () => setSelectedFiturId(null))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await settingsAPI.getEbeddienMenuFitur()
      if (!res?.success) {
        setError(res?.message || 'Gagal memuat data')
        setPayload(null)
        return
      }
      setPayload(res.data)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Gagal memuat data')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const items = payload?.items || []
  const roles = payload?.roles || []

  const rootItemsForGroups = useMemo(
    () => items.filter((it) => it.parent_id == null || it.parent_id === ''),
    [items]
  )
  const groupOptions = useMemo(() => uniqueSortedGroups(rootItemsForGroups), [rootItemsForGroups])

  const fiturForest = useMemo(() => buildFiturForest(items), [items])
  const filteredForest = useMemo(
    () => filterFiturForest(fiturForest, groupFilter, searchQuery),
    [fiturForest, groupFilter, searchQuery]
  )
  const totalShown = useMemo(() => countForestNodes(filteredForest), [filteredForest])
  const groupSections = useMemo(() => buildGroupSectionsFromRoots(filteredForest), [filteredForest])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) return
    setExpandedIds((prev) => {
      const next = new Set(prev)
      filteredForest.forEach((r) => {
        if ((r.children || []).length > 0) next.add(r.id)
      })
      return next
    })
  }, [searchQuery, filteredForest])

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedItem = useMemo(
    () => (selectedFiturId != null ? items.find((it) => it.id === selectedFiturId) : null),
    [items, selectedFiturId]
  )

  const offcanvasAncestorMenu = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'action') return null
    return findAncestorMenuItem(items, selectedItem.parent_id)
  }, [selectedItem, items])

  /** Aksi: hanya role yang sudah dicentang pada menu induk (ancestor type menu). */
  const rolesForOffcanvas = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'action') return roles
    const ancestor = findAncestorMenuItem(items, selectedItem.parent_id)
    if (!ancestor) return roles
    const allowed = new Set(ancestor.role_ids || [])
    return roles.filter((r) => allowed.has(r.id))
  }, [selectedItem, items, roles])

  const handleAfterSave = useCallback((fiturId, roleIds) => {
    setPayload((prev) => {
      if (!prev?.items) return prev
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.id === fiturId ? { ...it, role_ids: [...roleIds].sort((a, b) => a - b) } : it
        )
      }
    })
  }, [])

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8 flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
          </div>
        </div>
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
              <p className="text-red-800 dark:text-red-200">{error}</p>
              <button
                type="button"
                onClick={load}
                className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-sm font-medium text-red-900 dark:text-red-100"
              >
                Coba lagi
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-900/20 px-4 py-3 text-sm text-teal-900 dark:text-teal-100 mb-4">
              <p className="font-medium">Menu, aksi &amp; akses role</p>
              <p className="mt-1 text-teal-800/90 dark:text-teal-200/90 text-xs leading-relaxed">
                Ketuk baris untuk membuka panel kanan. Menu yang punya sub-fitur (aksi di halaman) bisa dibentangkan lewat
                tombol di kiri jumlah role. Centang role yang boleh akses, lalu simpan.
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-100">
                {error}
              </div>
            )}

            <SearchFilterBar
              searchInput={searchQuery}
              onSearchChange={(e) => setSearchQuery(e.target.value)}
              onSearchFocus={() => setIsInputFocused(true)}
              onSearchBlur={() => setIsInputFocused(false)}
              isInputFocused={isInputFocused}
              isFilterOpen={isFilterOpen}
              onFilterToggle={() => setIsFilterOpen((v) => !v)}
              groupFilter={groupFilter}
              onGroupFilterChange={(e) => setGroupFilter(e.target.value)}
              groupOptions={groupOptions}
              onRefresh={load}
              onResetFilter={() => {
                setSearchQuery('')
                setGroupFilter('')
              }}
              totalShown={totalShown}
            />

            <div className="space-y-4">
              {items.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                  Belum ada menu di database. Jalankan seed AppFiturMenuSeed dan RoleFiturMenuSeed.
                </div>
              ) : groupSections.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                  Tidak ada menu yang cocok dengan pencarian atau filter.
                </div>
              ) : (
                groupSections.map((section) => (
                  <div
                    key={section.groupLabel}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                  >
                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{section.groupLabel}</h2>
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                        {section.items.length} baris
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {section.items.map((node, idx) => {
                        const kids = node.children || []
                        const hasChildRows = kids.length > 0
                        const isOpen = expandedIds.has(node.id)
                        return (
                          <Fragment key={node.id}>
                            <FiturTreeRow
                              node={node}
                              index={idx}
                              depth={0}
                              expanded={isOpen}
                              onToggleExpand={toggleExpand}
                              onSelect={(id) => setSelectedFiturId(id)}
                              showGroupLabel={false}
                              hasChildRows={hasChildRows}
                            />
                            <AnimatePresence initial={false}>
                              {isOpen && hasChildRows && (
                                <motion.div
                                  key={`sub-${node.id}`}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                                  className="overflow-hidden border-t border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800"
                                >
                                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                    {kids.map((child, cidx) => (
                                      <FiturTreeRow
                                        key={child.id}
                                        node={child}
                                        index={cidx}
                                        depth={1}
                                        expanded={false}
                                        onToggleExpand={toggleExpand}
                                        onSelect={(id) => setSelectedFiturId(id)}
                                        showGroupLabel={false}
                                        hasChildRows={false}
                                      />
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </Fragment>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="h-20 sm:h-0 flex-shrink-0" aria-hidden="true" />
          </motion.div>
        </div>
      </div>

      {createPortal(
        <FiturMenuRoleOffcanvas
          isOpen={selectedFiturId != null && selectedItem != null}
          onClose={closeOffcanvas}
          onAfterSave={handleAfterSave}
          fiturItem={selectedItem}
          roles={rolesForOffcanvas}
          parentMenuLabel={offcanvasAncestorMenu?.label ?? null}
        />,
        document.body
      )}
    </div>
  )
}
