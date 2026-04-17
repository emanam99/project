import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { settingsAPI } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { useAuthStore } from '../store/authStore'
import { useOffcanvasBackClose } from '../hooks/useOffcanvasBackClose'
import { GROUP_ORDER } from '../config/menuConfig'
import { PENGELUARAN_MENU_CODE } from '../config/pengeluaranFiturCodes'
import { KALENDER_PENGATURAN_MENU_CODE } from '../config/kalenderFiturCodes'
import { ABSEN_MENU_CODE } from '../config/absenFiturCodes'
import PengeluaranFiturTabAccordions from './PengeluaranFiturTabAccordions'
import KalenderPengaturanFiturTabAccordions from './KalenderPengaturanFiturTabAccordions'
import AbsenFiturTabAccordions from './AbsenFiturTabAccordions'

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

/**
 * Satu panel: tab (1) aplikasi + izin modul API, (2) menu & aksi eBeddien — dua lapisan akses untuk role yang sama.
 */
export default function RoleAccessOffcanvas({ isOpen, onClose, roleKey, role, onReload }) {
  const { showNotification } = useNotification()
  const [showPortal, setShowPortal] = useState(false)
  const [tab, setTab] = useState('api')

  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogErr, setCatalogErr] = useState(null)
  const [appRows, setAppRows] = useState([])
  const [permRows, setPermRows] = useState([])
  const [policyPatching, setPolicyPatching] = useState(false)

  const [fiturLoading, setFiturLoading] = useState(false)
  const [fiturError, setFiturError] = useState(null)
  const [items, setItems] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  /** Accordion tab Rencana / Pengeluaran / Draft di bawah menu Pengeluaran (Pengaturan → Fitur). */
  const [pengeluaranAccordionOpen, setPengeluaranAccordionOpen] = useState(
    () => new Set(['rencana', 'pengeluaran', 'draft'])
  )
  const [kalenderPengaturanAccordionOpen, setKalenderPengaturanAccordionOpen] = useState(
    () => new Set(['bulan', 'hari_penting'])
  )
  const [absenAccordionOpen, setAbsenAccordionOpen] = useState(
    () => new Set(['riwayat', 'absen', 'pengaturan', 'ngabsen'])
  )
  const [patchingId, setPatchingId] = useState(null)

  const rk = roleKey != null && String(roleKey).trim() !== '' ? String(roleKey).trim() : ''
  const roleId = role?.id != null ? Number(role.id) : 0

  const close = useCallback(() => {
    onClose()
    setCatalogErr(null)
    setFiturError(null)
    setSearchQuery('')
    setGroupFilter('')
    setTab('api')
    setPengeluaranAccordionOpen(new Set(['rencana', 'pengeluaran', 'draft']))
    setKalenderPengaturanAccordionOpen(new Set(['bulan', 'hari_penting']))
    setAbsenAccordionOpen(new Set(['riwayat', 'absen', 'ngabsen']))
  }, [onClose])

  useOffcanvasBackClose(isOpen, close)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) setTab('api')
  }, [isOpen, rk])

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogErr(null)
    try {
      const res = await settingsAPI.getRolePolicyCatalog()
      if (!res?.success) {
        setCatalogErr(res?.message || 'Gagal memuat katalog')
        setAppRows([])
        setPermRows([])
        return
      }
      const d = res.data || {}
      setAppRows(Array.isArray(d.apps) ? d.apps : [])
      setPermRows(Array.isArray(d.permissions) ? d.permissions : [])
    } catch (err) {
      setCatalogErr(err.response?.data?.message || err.message || 'Gagal memuat katalog')
      setAppRows([])
      setPermRows([])
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  const loadFitur = useCallback(async () => {
    setFiturLoading(true)
    setFiturError(null)
    try {
      const res = await settingsAPI.getEbeddienMenuFitur()
      if (!res?.success) {
        setFiturError(res?.message || 'Gagal memuat menu')
        setItems([])
        return
      }
      setItems(Array.isArray(res.data?.items) ? res.data.items : [])
    } catch (err) {
      setFiturError(err.response?.data?.message || err.message || 'Gagal memuat menu')
      setItems([])
    } finally {
      setFiturLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !rk) return
    loadCatalog()
    if (roleId >= 1) loadFitur()
  }, [isOpen, rk, roleId, loadCatalog, loadFitur])

  const allowedSet = new Set((role?.allowed_apps || []).map((x) => String(x).toLowerCase()))
  const permSet = new Set((role?.permissions || []).map((x) => String(x).toLowerCase()))
  const roleMissing = !role

  const appsSrc = role?.allowed_apps_policy_source || 'php'
  const permSrc = role?.permissions_policy_source || 'php'

  const patchApps = async (nextKeys) => {
    if (!rk || policyPatching) return
    const norm = [...new Set(nextKeys.map((x) => String(x).toLowerCase().trim()).filter(Boolean))].sort()
    setPolicyPatching(true)
    try {
      const res = await settingsAPI.patchRolePolicy(rk, { allowed_apps: norm })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan aplikasi', 'error')
        return
      }
      showNotification(res.message || 'Aplikasi disimpan', 'success')
      await onReload?.()
    } catch (err) {
      showNotification(err.response?.data?.message || err.message || 'Gagal menyimpan', 'error')
    } finally {
      setPolicyPatching(false)
    }
  }

  const patchPerms = async (nextKeys) => {
    if (!rk || policyPatching) return
    const norm = [...new Set(nextKeys.map((x) => String(x).toLowerCase().trim()).filter(Boolean))].sort()
    setPolicyPatching(true)
    try {
      const res = await settingsAPI.patchRolePolicy(rk, { permissions: norm })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
        return
      }
      showNotification(res.message || 'Izin modul disimpan', 'success')
      await onReload?.()
    } catch (err) {
      showNotification(err.response?.data?.message || err.message || 'Gagal menyimpan', 'error')
    } finally {
      setPolicyPatching(false)
    }
  }

  const toggleApp = (appKey, checked) => {
    const k = String(appKey).toLowerCase()
    const next = new Set(allowedSet)
    if (checked) next.add(k)
    else next.delete(k)
    patchApps([...next])
  }

  const togglePerm = (permKey, checked) => {
    const k = String(permKey).toLowerCase()
    const next = new Set(permSet)
    if (checked) next.add(k)
    else next.delete(k)
    patchPerms([...next])
  }

  const revertPolicyToPhp = async () => {
    if (!rk || policyPatching) return
    if (
      !window.confirm(
        'Hapus penyimpanan di database untuk aplikasi & izin modul API role ini? Nilai kembali mengikuti RoleConfig.php.'
      )
    ) {
      return
    }
    setPolicyPatching(true)
    try {
      const res = await settingsAPI.patchRolePolicy(rk, { permissions: null, allowed_apps: null })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal', 'error')
        return
      }
      showNotification(res.message || 'Mengikuti RoleConfig.php', 'success')
      await onReload?.()
    } catch (err) {
      showNotification(err.response?.data?.message || err.message || 'Gagal', 'error')
    } finally {
      setPolicyPatching(false)
    }
  }

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
    setPengeluaranAccordionOpen(new Set(['rencana', 'pengeluaran', 'draft']))
    setKalenderPengaturanAccordionOpen(new Set(['bulan', 'hari_penting']))
  }, [searchQuery, filteredForest])

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const roleHasFitur = useCallback(
    (node) => (Array.isArray(node.role_ids) ? node.role_ids.includes(roleId) : false),
    [roleId]
  )

  const actionToggleDisabled = useCallback(
    (node) => {
      if (node.type !== 'action') return false
      const ancestor = findAncestorMenuItem(items, node.parent_id)
      if (!ancestor) return false
      return !roleHasFitur(ancestor)
    },
    [items, roleHasFitur]
  )

  const handleToggleFitur = async (node, nextChecked) => {
    if (!node?.id || roleId < 1 || patchingId != null) return
    if (node.type === 'action' && actionToggleDisabled(node)) {
      showNotification('Centang menu induk terlebih dahulu untuk role ini.', 'warning')
      return
    }

    const cur = Array.isArray(node.role_ids) ? [...node.role_ids] : []
    const setIds = new Set(cur)
    if (nextChecked) setIds.add(roleId)
    else setIds.delete(roleId)
    const newIds = [...setIds].sort((a, b) => a - b)

    setPatchingId(node.id)
    try {
      const res = await settingsAPI.patchEbeddienMenuFiturItem(node.id, { role_ids: newIds })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
        return
      }
      const data = res.data
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== node.id) return it
          const next = { ...it }
          if (data && typeof data === 'object' && Array.isArray(data.role_ids)) {
            next.role_ids = [...data.role_ids].sort((a, b) => a - b)
          } else {
            next.role_ids = newIds
          }
          return next
        })
      )
      showNotification(nextChecked ? 'Akses menu ditambahkan' : 'Akses menu dihapus', 'success')
      useAuthStore.getState().fetchFiturMenu().catch(() => {})
    } catch (err) {
      showNotification(err.response?.data?.message || err.message || 'Gagal menyimpan', 'error')
    } finally {
      setPatchingId(null)
    }
  }

  if (!isOpen && !showPortal) return null

  const content = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && rk && (
        <Fragment key="role-access-offcanvas">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-gray-50 dark:bg-gray-900 shadow-2xl z-[201] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="p-2 -ml-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
                    aria-label="Kembali"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white leading-snug">Kelola akses role</h2>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-1">{role?.label ?? rk}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{rk}</p>
                    {!role && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                        Data role tidak ditemukan. Tutup lalu buka lagi.
                      </p>
                    )}
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                      Dua lapisan untuk role yang sama: (1) izin di server &amp; token — (2) menu &amp; aksi di aplikasi eBeddien. Keduanya
                      melengkapi; bukan duplikat.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="p-2.5 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex gap-1 mt-4 p-1 rounded-xl bg-gray-100 dark:bg-gray-700/80">
                <button
                  type="button"
                  onClick={() => setTab('api')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    tab === 'api'
                      ? 'bg-white dark:bg-gray-800 text-teal-800 dark:text-teal-200 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Aplikasi &amp; modul API
                </button>
                <button
                  type="button"
                  onClick={() => setTab('menu')}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    tab === 'menu'
                      ? 'bg-white dark:bg-gray-800 text-teal-800 dark:text-teal-200 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Menu &amp; aksi eBeddien
                </button>
              </div>
            </div>

            {tab === 'api' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                {catalogLoading ? (
                  <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                  </div>
                ) : catalogErr ? (
                  <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
                    {catalogErr}
                    <button
                      type="button"
                      onClick={loadCatalog}
                      className="mt-3 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-xs font-medium"
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : roleMissing ? null : (
                  <>
                    <div className="flex flex-wrap gap-1.5 px-0.5">
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          appsSrc === 'database'
                            ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200'
                            : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        App: {appsSrc === 'database' ? 'DB' : 'PHP'}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          permSrc === 'database'
                            ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200'
                            : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Modul API: {permSrc === 'database' ? 'DB' : 'PHP'}
                      </span>
                    </div>

                    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Aplikasi (token / multi-app)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Aplikasi mana saja yang boleh dibuka dengan JWT role ini.
                        </p>
                      </div>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {appRows.map((row) => {
                          const k = String(row.key || '').toLowerCase()
                          const checked = allowedSet.has(k)
                          return (
                            <li key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.label || k}</p>
                                <p className="text-[10px] font-mono text-gray-400 truncate">{k}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={policyPatching || roleMissing}
                                onChange={(e) => toggleApp(k, e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 shrink-0"
                              />
                            </li>
                          )
                        })}
                      </ul>
                    </section>

                    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Izin modul (API backend)</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Otorisasi di server (laporan, keuangan, pengaturan, dll.). Ini bukan daftar menu sidebar — menu di tab berikut.
                        </p>
                      </div>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {permRows.map((row) => {
                          const k = String(row.key || '').toLowerCase()
                          const checked = permSet.has(k)
                          return (
                            <li key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.label || k}</p>
                                <p className="text-[10px] font-mono text-gray-400 truncate">{k}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={policyPatching || roleMissing}
                                onChange={(e) => togglePerm(k, e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 shrink-0"
                              />
                            </li>
                          )
                        })}
                      </ul>
                    </section>

                    <div className="pt-1 pb-4">
                      <button
                        type="button"
                        disabled={policyPatching || roleMissing}
                        onClick={revertPolicyToPhp}
                        className="w-full px-4 py-3 text-sm font-medium rounded-xl border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 bg-amber-50/80 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50"
                      >
                        Kembalikan aplikasi &amp; modul API ke RoleConfig.php
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex-shrink-0 px-4 py-3 space-y-2 border-b border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Menu &amp; aksi yang tampil di sidebar eBeddien (tabel <span className="font-mono">role___fitur</span>). Melengkapi izin
                    modul API di tab sebelumnya.
                  </p>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari menu, aksi, path, kode…"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                  />
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">Semua grup</option>
                    {groupOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                  {roleId < 1 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Role tidak valid.</p>
                  ) : fiturLoading ? (
                    <div className="flex justify-center py-16">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                    </div>
                  ) : fiturError ? (
                    <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
                      {fiturError}
                      <button
                        type="button"
                        onClick={loadFitur}
                        className="mt-3 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-xs font-medium"
                      >
                        Coba lagi
                      </button>
                    </div>
                  ) : items.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Belum ada data menu.</p>
                  ) : groupSections.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Tidak ada yang cocok filter.</p>
                  ) : (
                    <div className="space-y-4">
                      {groupSections.map((section) => (
                        <div
                          key={section.groupLabel}
                          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm"
                        >
                          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-600">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{section.groupLabel}</span>
                          </div>
                          <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {section.items.map((node) => {
                              const kids = node.children || []
                              const hasKids = kids.length > 0
                              const isOpenRow = expandedIds.has(node.id)
                              const checked = roleHasFitur(node)
                              const busy = patchingId === node.id

                              return (
                                <Fragment key={node.id}>
                                  <div className="flex items-stretch gap-2 px-3 py-3 hover:bg-gray-50/80 dark:hover:bg-gray-700/20">
                                    <div className="flex items-center shrink-0 w-9 justify-center">
                                      {hasKids ? (
                                        <button
                                          type="button"
                                          aria-expanded={isOpenRow}
                                          onClick={() => toggleExpand(node.id)}
                                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                                        >
                                          <svg
                                            className={`w-4 h-4 transition-transform ${isOpenRow ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                          </svg>
                                        </button>
                                      ) : (
                                        <span className="w-8" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {node.type === 'action' && (
                                        <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">Aksi</span>
                                      )}
                                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{node.label}</p>
                                      <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate">{node.code}</p>
                                    </div>
                                    <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={busy || actionToggleDisabled(node)}
                                        title={
                                          actionToggleDisabled(node)
                                            ? 'Aktifkan menu induk untuk role ini terlebih dahulu'
                                            : undefined
                                        }
                                        onChange={(e) => handleToggleFitur(node, e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                                      />
                                    </label>
                                  </div>
                                  {hasKids && isOpenRow ? (
                                    node.code === PENGELUARAN_MENU_CODE ? (
                                      <PengeluaranFiturTabAccordions
                                        children={kids}
                                        openKeys={pengeluaranAccordionOpen}
                                        onToggleKey={(key) => {
                                          setPengeluaranAccordionOpen((prev) => {
                                            const next = new Set(prev)
                                            if (next.has(key)) next.delete(key)
                                            else next.add(key)
                                            return next
                                          })
                                        }}
                                        renderRow={(child) => {
                                          const cChecked = roleHasFitur(child)
                                          const cBusy = patchingId === child.id
                                          const cDis = actionToggleDisabled(child)
                                          return (
                                            <div
                                              key={child.id}
                                              className="flex items-stretch gap-2 pl-14 pr-3 py-2.5 bg-gray-50/60 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                                                  Aksi
                                                </span>
                                                <p className="text-sm text-gray-800 dark:text-gray-200">{child.label}</p>
                                                <p className="text-[10px] font-mono text-gray-400 truncate">{child.code}</p>
                                              </div>
                                              <label className="flex items-center shrink-0 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={cChecked}
                                                  disabled={cBusy || cDis}
                                                  title={cDis ? 'Aktifkan menu induk untuk role ini terlebih dahulu' : undefined}
                                                  onChange={(e) => handleToggleFitur(child, e.target.checked)}
                                                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                                                />
                                              </label>
                                            </div>
                                          )
                                        }}
                                      />
                                    ) : node.code === ABSEN_MENU_CODE ? (
                                      <AbsenFiturTabAccordions
                                        children={kids}
                                        openKeys={absenAccordionOpen}
                                        onToggleKey={(key) => {
                                          setAbsenAccordionOpen((prev) => {
                                            const next = new Set(prev)
                                            if (next.has(key)) next.delete(key)
                                            else next.add(key)
                                            return next
                                          })
                                        }}
                                        renderRow={(child) => {
                                          const cChecked = roleHasFitur(child)
                                          const cBusy = patchingId === child.id
                                          const cDis = actionToggleDisabled(child)
                                          return (
                                            <div
                                              key={child.id}
                                              className="flex items-stretch gap-2 pl-14 pr-3 py-2.5 bg-gray-50/60 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                                                  Aksi
                                                </span>
                                                <p className="text-sm text-gray-800 dark:text-gray-200">{child.label}</p>
                                                <p className="text-[10px] font-mono text-gray-400 truncate">{child.code}</p>
                                              </div>
                                              <label className="flex items-center shrink-0 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={cChecked}
                                                  disabled={cBusy || cDis}
                                                  title={cDis ? 'Aktifkan menu induk untuk role ini terlebih dahulu' : undefined}
                                                  onChange={(e) => handleToggleFitur(child, e.target.checked)}
                                                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                                                />
                                              </label>
                                            </div>
                                          )
                                        }}
                                      />
                                    ) : node.code === KALENDER_PENGATURAN_MENU_CODE ? (
                                      <KalenderPengaturanFiturTabAccordions
                                        children={kids}
                                        openKeys={kalenderPengaturanAccordionOpen}
                                        onToggleKey={(key) => {
                                          setKalenderPengaturanAccordionOpen((prev) => {
                                            const next = new Set(prev)
                                            if (next.has(key)) next.delete(key)
                                            else next.add(key)
                                            return next
                                          })
                                        }}
                                        renderRow={(child) => {
                                          const cChecked = roleHasFitur(child)
                                          const cBusy = patchingId === child.id
                                          const cDis = actionToggleDisabled(child)
                                          return (
                                            <div
                                              key={child.id}
                                              className="flex items-stretch gap-2 pl-14 pr-3 py-2.5 bg-gray-50/60 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                                                  Aksi
                                                </span>
                                                <p className="text-sm text-gray-800 dark:text-gray-200">{child.label}</p>
                                                <p className="text-[10px] font-mono text-gray-400 truncate">{child.code}</p>
                                              </div>
                                              <label className="flex items-center shrink-0 cursor-pointer">
                                                <input
                                                  type="checkbox"
                                                  checked={cChecked}
                                                  disabled={cBusy || cDis}
                                                  title={cDis ? 'Aktifkan menu induk untuk role ini terlebih dahulu' : undefined}
                                                  onChange={(e) => handleToggleFitur(child, e.target.checked)}
                                                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                                                />
                                              </label>
                                            </div>
                                          )
                                        }}
                                      />
                                    ) : (
                                      kids.map((child) => {
                                        const cChecked = roleHasFitur(child)
                                        const cBusy = patchingId === child.id
                                        const cDis = actionToggleDisabled(child)
                                        return (
                                          <div
                                            key={child.id}
                                            className="flex items-stretch gap-2 pl-12 pr-3 py-2.5 bg-gray-50/60 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50"
                                          >
                                            <div className="flex-1 min-w-0">
                                              <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                                                Aksi
                                              </span>
                                              <p className="text-sm text-gray-800 dark:text-gray-200">{child.label}</p>
                                              <p className="text-[10px] font-mono text-gray-400 truncate">{child.code}</p>
                                            </div>
                                            <label className="flex items-center shrink-0 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={cChecked}
                                                disabled={cBusy || cDis}
                                                title={cDis ? 'Aktifkan menu induk untuk role ini terlebih dahulu' : undefined}
                                                onChange={(e) => handleToggleFitur(child, e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                                              />
                                            </label>
                                          </div>
                                        )
                                      })
                                    )
                                  ) : null}
                                </Fragment>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
