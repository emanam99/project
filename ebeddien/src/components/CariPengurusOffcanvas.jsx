import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pengurusAPI } from '../services/api'
import {
  buildPengurusCacheKey,
  getCachedPengurusList,
  saveCachedPengurusList,
} from '../services/offcanvasSearchCache'

/**
 * Offcanvas Cari Pengurus (umum) — bisa dipakai dari mana saja.
 * Tampilan rapi seperti Cari Santri: header, search, filter expandable, daftar hasil.
 * Props:
 * - isOpen, onClose: kontrol tampil/tutup
 * - onSelect: (pengurus) => void — dipanggil saat pengurus dipilih
 * - title: string (default "Cari Pengurus")
 * - roleKeys: string (opsional) — filter role, contoh "admin_ugt,koordinator_ugt"
 * - lembagaId: string (opsional) — filter pengurus by lembaga
 */
function formatAlamat(p) {
  if (!p) return ''
  const parts = [
    p.dusun,
    p.rt ? `RT ${p.rt}` : '',
    p.rw ? `RW ${p.rw}` : '',
    p.desa,
    p.kecamatan,
    p.kabupaten,
    p.provinsi,
    p.kode_pos
  ].filter(Boolean)
  return parts.join(', ')
}

const RESULT_LIMIT = 80
const zIndexBackdrop = 100000
const zIndexPanel = 100001

export default function CariPengurusOffcanvas({ isOpen, onClose, onSelect, title = 'Cari Pengurus', roleKeys, lembagaId }) {
  const [pengurusList, setPengurusList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [filters, setFilters] = useState({
    provinsi: '',
    kabupaten: '',
    kecamatan: '',
    desa: '',
    lembaga_id: '',
    jabatan_id: ''
  })
  const [displayCount, setDisplayCount] = useState(RESULT_LIMIT)

  const cacheKey = useMemo(
    () => buildPengurusCacheKey(roleKeys, lembagaId),
    [roleKeys, lembagaId]
  )

  const loadListFromServer = useCallback(
    async (opts = {}) => {
      const { syncUi } = opts
      if (syncUi) setSyncing(true)
      else setLoading(true)
      try {
        const params = {}
        if (roleKeys) params.role_keys = roleKeys
        if (lembagaId) params.lembaga_id = lembagaId
        const res = await pengurusAPI.getList(params)
        const list = Array.isArray(res?.data) ? res.data : []
        setPengurusList(list)
        await saveCachedPengurusList(cacheKey, list)
      } catch {
        setPengurusList([])
      } finally {
        if (syncUi) setSyncing(false)
        else setLoading(false)
      }
    },
    [cacheKey, roleKeys, lembagaId]
  )

  const handleSyncFromServer = () => loadListFromServer({ syncUi: true })

  useEffect(() => {
    if (!isOpen) return
    setSearchQuery('')
    setFilters({ provinsi: '', kabupaten: '', kecamatan: '', desa: '', lembaga_id: '', jabatan_id: '' })

    let cancelled = false
    ;(async () => {
      const cached = await getCachedPengurusList(cacheKey)
      if (cancelled) return
      if (cached && cached.length > 0) {
        setPengurusList(cached)
        setLoading(false)
        return
      }
      await loadListFromServer()
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, cacheKey, loadListFromServer])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const getFilterOptions = (key) => {
    if (key === 'lembaga_id') {
      const seen = new Set()
      const out = []
      pengurusList.forEach((p) => {
        const arr = p.lembaga || []
        arr.forEach((l) => {
          const id = l?.id != null ? String(l.id) : ''
          if (id && !seen.has(id)) {
            seen.add(id)
            out.push({ value: id, label: l.nama || id })
          }
        })
      })
      return out.sort((a, b) => String(a.label).localeCompare(String(b.label), 'id'))
    }
    if (key === 'jabatan_id') {
      const seen = new Set()
      const out = []
      pengurusList.forEach((p) => {
        const arr = p.jabatan || []
        arr.forEach((j) => {
          const id = j?.jabatan_id != null ? String(j.jabatan_id) : (j?.jabatan_nama || '')
          const nama = j?.jabatan_nama || id || ''
          if (nama && !seen.has(id)) {
            seen.add(id)
            out.push({ value: id, label: nama })
          }
        })
      })
      return out.sort((a, b) => String(a.label).localeCompare(String(b.label), 'id'))
    }
    let list = [...pengurusList]
    const order = ['provinsi', 'kabupaten', 'kecamatan', 'desa']
    const keyIndex = order.indexOf(key)
    for (let i = 0; i < keyIndex; i++) {
      const k = order[i]
      if (filters[k]) list = list.filter((p) => p[k] === filters[k])
    }
    const values = list.map((p) => p[key]).filter((v) => v != null && v !== '')
    const uniq = [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'id'))
    return uniq.map((v) => ({ value: v, label: v }))
  }

  const filteredList = useMemo(() => {
    let list = [...pengurusList]
    const q = (searchQuery || '').trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          (p.id != null && String(p.id).toLowerCase().includes(q)) ||
          (p.nip != null && String(p.nip).toLowerCase().includes(q)) ||
          (p.nama && p.nama.toLowerCase().includes(q)) ||
          (p.whatsapp && p.whatsapp.toLowerCase().includes(q))
      )
    }
    if (filters.provinsi) list = list.filter((p) => p.provinsi === filters.provinsi)
    if (filters.kabupaten) list = list.filter((p) => p.kabupaten === filters.kabupaten)
    if (filters.kecamatan) list = list.filter((p) => p.kecamatan === filters.kecamatan)
    if (filters.desa) list = list.filter((p) => p.desa === filters.desa)
    if (filters.lembaga_id) list = list.filter((p) => (p.lembaga_ids || []).includes(filters.lembaga_id))
    if (filters.jabatan_id) list = list.filter((p) => (p.jabatan || []).some((j) => String(j.jabatan_id) === filters.jabatan_id || (j.jabatan_nama && !j.jabatan_id && String(j.jabatan_nama) === filters.jabatan_id)))
    return list
  }, [pengurusList, searchQuery, filters])

  useEffect(() => {
    if (isOpen) setDisplayCount(RESULT_LIMIT)
  }, [isOpen, searchQuery, filters])

  const visibleList = useMemo(
    () => filteredList.slice(0, displayCount),
    [filteredList, displayCount]
  )
  const hasMore = filteredList.length > displayCount
  const loadMore = () => setDisplayCount((c) => Math.min(c + RESULT_LIMIT, filteredList.length))

  const handleFilterChange = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value }
      const order = ['provinsi', 'kabupaten', 'kecamatan', 'desa', 'lembaga_id', 'jabatan_id']
      const keyIndex = order.indexOf(key)
      for (let i = keyIndex + 1; i < order.length; i++) next[order[i]] = ''
      return next
    })
  }

  const handleSelect = (p) => {
    onSelect?.({
      id: p.id,
      nip: p.nip != null ? String(p.nip) : (p.id != null ? String(p.id) : null),
      nama: p.nama,
      whatsapp: p.whatsapp,
      dusun: p.dusun,
      rt: p.rt,
      rw: p.rw,
      desa: p.desa,
      kecamatan: p.kecamatan,
      kabupaten: p.kabupaten,
      provinsi: p.provinsi,
      kode_pos: p.kode_pos
    })
    onClose?.()
  }

  const filterConfig = [
    { key: 'lembaga_id', label: 'Lembaga' },
    { key: 'jabatan_id', label: 'Jabatan' },
    { key: 'provinsi', label: 'Provinsi' },
    { key: 'kabupaten', label: 'Kabupaten' },
    { key: 'kecamatan', label: 'Kecamatan' },
    { key: 'desa', label: 'Desa/Kelurahan' }
  ]

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="cari-pengurus-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50"
            style={{ zIndex: zIndexBackdrop }}
            aria-hidden="true"
          />
          <motion.div
            key="cari-pengurus-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-y-0 left-4 right-4 sm:left-auto sm:right-0 w-full max-w-md sm:w-[28rem] mx-auto sm:mx-0 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-l-2xl overflow-hidden"
            style={{ zIndex: zIndexPanel }}
          >
            {/* Header */}
            <div className="flex-shrink-0 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-semibold text-teal-600 dark:text-teal-400">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                  aria-label="Tutup"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-1.5 pr-20 text-sm focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Cari ID, NIP, nama, atau WA"
                  autoFocus
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pr-0.5 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen((v) => !v)}
                    className="pointer-events-auto bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-1.5 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors"
                    title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {isFilterOpen ? (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    Filter
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncFromServer}
                    disabled={syncing}
                    className="pointer-events-auto bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white px-1.5 py-1 rounded-md text-[11px] flex items-center gap-0.5 transition-colors"
                    title="Ambil ulang dari server (perbarui cache lokal)"
                  >
                    {syncing ? (
                      <svg className="animate-spin w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            </div>

            {/* Filter */}
            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                >
                  <div className="px-3 sm:px-4 py-2 flex flex-wrap gap-1.5">
                    {filterConfig.map((f) => (
                      <select
                        key={f.key}
                        value={filters[f.key] || ''}
                        onChange={(e) => handleFilterChange(f.key, e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 h-7 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-teal-500 dark:focus:ring-teal-400 min-w-0 flex-1 sm:flex-none sm:min-w-[90px]"
                      >
                        <option value="">{f.label}</option>
                        {getFilterOptions(f.key).map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <div className="animate-spin rounded-full h-7 w-7 border-2 border-teal-600 border-t-transparent dark:border-teal-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Memuat data...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8 text-xs">Tidak ada pengurus yang sesuai.</p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {visibleList.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(p)}
                      className="w-full text-left px-3 sm:px-4 py-2 hover:bg-teal-50 dark:hover:bg-gray-700/50 focus:bg-teal-50 dark:focus:bg-gray-700/50 transition-colors focus:outline-none focus:ring-0"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            <span className="text-teal-600 dark:text-teal-400">{p.nip ?? p.id}</span>
                            {p.nama ? ` · ${p.nama}` : ''}
                          </p>
                          {(p.whatsapp || formatAlamat(p)) && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {p.whatsapp ? `WA: ${p.whatsapp}` : ''}
                              {p.whatsapp && formatAlamat(p) ? ' · ' : ''}
                              {formatAlamat(p) || ''}
                            </p>
                          )}
                        </div>
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                  {filteredList.length > 0 && (
                    <div className="border-t border-gray-100 dark:border-gray-700/50 px-3 py-2 flex flex-col items-center gap-2">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                        {hasMore
                          ? `Menampilkan ${displayCount} dari ${filteredList.length} hasil`
                          : `Menampilkan ${filteredList.length} hasil`}
                      </p>
                      {hasMore && (
                        <button
                          type="button"
                          onClick={loadMore}
                          className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline focus:outline-none"
                        >
                          Tampilkan lebih banyak
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
