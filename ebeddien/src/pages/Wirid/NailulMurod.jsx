import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { wiridNailulMurodAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { sanitizeHtml } from '../../utils/safeHtml'
import {
  EBEDDien_NAILUL_TITLE_LANG_KEY,
  readEbeddienTitleLang,
  resolveBabLabel,
  resolveWiridTitle,
  wiridTitleSearchText,
} from './utils/wiridTitle'
import NailulMurodWiridReorderList from './components/NailulMurodWiridReorderList'
import NailulMurodBabOffcanvas from './components/NailulMurodBabOffcanvas'
import './NailulMurod.css'

/** State history stabil untuk useOffcanvasBackClose (hindari pushState berulang). */
const WIRID_PREVIEW_OFFCANVAS_STATE = Object.freeze({ ebOffcanvas: 'wirid_nailul_murod_preview' })

/** Tombol panel bawah offcanvas — ringkas, selaras tema teal / abu / merah. */
const ocBtnBase =
  'inline-flex items-center justify-center gap-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50'
const ocBtnGhost = `${ocBtnBase} px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white/80 dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-700/80`
const ocBtnDanger = `${ocBtnBase} px-2.5 py-1.5 border border-red-200/90 dark:border-red-800/80 text-red-600 dark:text-red-400 bg-white/80 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-900/25`
const ocBtnPrimary = `${ocBtnBase} px-2.5 py-1.5 bg-teal-600 text-white shadow-sm hover:bg-teal-700`

function stripTags(html) {
  if (!html) return ''
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim()
}

function groupByBab(rows, babList = []) {
  const m = new Map()
  for (const r of rows) {
    const b = (r.bab && String(r.bab).trim()) || '(Tanpa bab)'
    if (!m.has(b)) m.set(b, [])
    m.get(b).push(r)
  }
  const babOrder = new Map()
  babList.forEach((b) => babOrder.set(b.nama, b.urutan))
  const sortItems = (list) =>
    [...list].sort((a, b) => (a.urutan - b.urutan) || (a.id - b.id))
  const entries = Array.from(m.entries()).map(([bab, list]) => [bab, sortItems(list)])
  entries.sort((a, b) => {
    const keyA = a[0] === '(Tanpa bab)' ? 10000 : babOrder.get(a[0]) ?? 9999
    const keyB = b[0] === '(Tanpa bab)' ? 10000 : babOrder.get(b[0]) ?? 9999
    if (keyA !== keyB) return keyA - keyB
    return a[0].localeCompare(b[0], 'id')
  })
  return entries
}

/** Bar cari + tambah + filter bab — pola mirip halaman Fitur / ManageUsers. */
const NailulMurodSearchBar = memo(function NailulMurodSearchBar({
  searchInput,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  isInputFocused,
  isFilterOpen,
  onFilterToggle,
  babFilter,
  onBabFilterChange,
  babOptions,
  onTambahClick,
  onEditBabClick,
  totalShown,
}) {
  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchChange}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            className="w-full p-2 pr-40 sm:pr-44 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
            placeholder="Cari judul, isi, atau arti…"
            autoComplete="off"
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <button
              type="button"
              onClick={onTambahClick}
              className="inline-flex items-center gap-1 pointer-events-auto px-2.5 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm"
              title="Tambah entri"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah
            </button>
            <button
              type="button"
              onClick={onFilterToggle}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
              title={isFilterOpen ? 'Sembunyikan filter' : 'Filter bab'}
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
          className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${
            isInputFocused ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-gray-200/80 dark:border-gray-600/80 bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">Bab:</span>
              <select
                value={babFilter}
                onChange={onBabFilterChange}
                className="border rounded-lg pl-2 pr-7 py-1.5 min-w-0 max-w-full sm:max-w-xs text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-500 focus:outline-none"
              >
                <option value="">Semua bab</option>
                {babOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onEditBabClick}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
                title="Kelola bab"
                aria-label="Kelola bab"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              {typeof totalShown === 'number' && (
                <span className="text-xs text-gray-500 dark:text-gray-500 ml-auto">
                  {totalShown} entri
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

NailulMurodSearchBar.displayName = 'NailulMurodSearchBar'

/** Pratinjau penuh — klik item daftar. Edit & hapus hanya di sini. */
function PreviewOffcanvas({ isOpen, row, onClose, onEdit, onDeleteRequest, onExitComplete, titleLang, babList }) {
  const closeWithBack = useOffcanvasBackClose(isOpen, onClose, { state: WIRID_PREVIEW_OFFCANVAS_STATE })
  if (typeof document === 'undefined' || !row) return null

  const t = { type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }

  return createPortal(
    <AnimatePresence mode="sync" onExitComplete={onExitComplete}>
      {isOpen && (
        <motion.div
          key={`wirid-preview-layer-${row.id}`}
          className="fixed inset-0 z-[10220] flex pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <button
            type="button"
            aria-label="Tutup"
            className="absolute inset-0 z-0 w-full h-full border-0 cursor-default bg-black/50 dark:bg-black/60 pointer-events-auto"
            onClick={closeWithBack}
          />
          <motion.aside
            className="relative z-10 flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-white dark:bg-gray-900 shadow-2xl pointer-events-auto sm:ml-auto"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={t}
            role="dialog"
            aria-modal="true"
            aria-label="Pratinjau"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-200/80 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-900/30 px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-teal-600 dark:text-teal-400 font-medium uppercase tracking-wide">
                  {resolveBabLabel(
                    row.bab && String(row.bab).trim() ? String(row.bab).trim() : '(Tanpa bab)',
                    babList,
                    titleLang
                  )}
                </p>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {resolveWiridTitle(row, titleLang)}
                </h2>
                {row.urutan != null && row.urutan > 0 && (
                  <p className="text-[11px] text-gray-500">Urutan: {row.urutan}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeWithBack}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200/80 dark:hover:bg-gray-800 shrink-0"
                aria-label="Tutup"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
              <section>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Isi (wirid / Arab)</h3>
                {row.isi ? (
                  <div
                    className="nm-preview-isi ql-editor text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-800/40"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.isi) }}
                  />
                ) : (
                  <p className="text-sm text-gray-500 italic">—</p>
                )}
              </section>
              <section>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Arti / terjemahan</h3>
                {row.arti ? (
                  <div
                    className="nm-preview-arti ql-editor text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-800/40"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.arti) }}
                  />
                ) : (
                  <p className="text-sm text-gray-500 italic">—</p>
                )}
              </section>
            </div>
            <div className="shrink-0 border-t border-gray-200/80 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-2.5 flex flex-wrap gap-1.5 justify-end">
              <button type="button" onClick={closeWithBack} className={ocBtnGhost}>
                Tutup
              </button>
              <button type="button" onClick={() => onDeleteRequest(row)} className={ocBtnDanger}>
                Hapus
              </button>
              <button type="button" onClick={() => onEdit(row)} className={ocBtnPrimary}>
                Edit
              </button>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function DeleteModal({ open, row, onClose, onConfirm, busy, titleLang }) {
  if (!open || !row) return null
  return createPortal(
    <div className="fixed inset-0 z-[10230] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Tutup" />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1.5">Hapus entri?</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
          {resolveWiridTitle(row, titleLang)}
        </p>
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={onClose} className={ocBtnGhost}>
            Batal
          </button>
          <button
            type="button"
            onClick={() => onConfirm(row)}
            disabled={busy}
            className={`${ocBtnBase} px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50`}
          >
            {busy ? '…' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function NailulMurod() {
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [babOptions, setBabOptions] = useState([])
  const [babList, setBabList] = useState([])
  const [filterBab, setFilterBab] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [titleLang, setTitleLang] = useState(() =>
    typeof window !== 'undefined' ? readEbeddienTitleLang() : 'id'
  )

  const handleTitleLang = useCallback((lang) => {
    setTitleLang(lang)
    try {
      localStorage.setItem(EBEDDien_NAILUL_TITLE_LANG_KEY, lang)
    } catch {
      // ignore
    }
  }, [])

  /** `open: false` = sedang animasi tutup; `row` tetap ada sampai onExitComplete. */
  const [preview, setPreview] = useState(null) // { open, row } | null
  const editAfterPreviewExitRef = useRef(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [reorderBusy, setReorderBusy] = useState(false)
  const [babOffcanvasOpen, setBabOffcanvasOpen] = useState(false)
  const stripCacheRef = useRef(new Map())

  const requestClosePreview = useCallback(
    () => setPreview((p) => (p && p.open ? { ...p, open: false } : p)),
    []
  )

  const onPreviewExitComplete = useCallback(() => {
    const editRow = editAfterPreviewExitRef.current
    editAfterPreviewExitRef.current = null
    setPreview(null)
    if (editRow?.id != null) {
      navigate(`/wirid/nailul-murod/${editRow.id}/edit`)
    }
  }, [navigate])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await wiridNailulMurodAPI.getList(
        filterBab.trim() ? { bab: filterBab.trim() } : {}
      )
      if (res?.success) {
        setList(Array.isArray(res.data) ? res.data : [])
      } else {
        setErr(res?.message || 'Gagal memuat data')
        setList([])
      }
      const o = await wiridNailulMurodAPI.getBabOptions()
      if (o?.success && Array.isArray(o.data)) {
        setBabOptions(o.data)
      }
      const babRes = await wiridNailulMurodAPI.getBabList()
      if (babRes?.success && Array.isArray(babRes.data)) {
        setBabList(babRes.data)
      }
    } catch (e) {
      setErr('Terjadi kesalahan saat memuat data')
      setList([])
    } finally {
      setLoading(false)
    }
  }, [filterBab])

  useEffect(() => {
    load()
  }, [load])

  const filteredList = useMemo(() => {
    const cache = stripCacheRef.current
    const q = searchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) => {
      const qtext = wiridTitleSearchText(r)
      const isiKey = `isi:${r.id}:${r.isi || ''}`
      const artiKey = `arti:${r.id}:${r.arti || ''}`
      let isi = cache.get(isiKey)
      let arti = cache.get(artiKey)
      if (!isi) {
        isi = stripTags(r.isi)
        cache.set(isiKey, isi)
      }
      if (!arti) {
        arti = stripTags(r.arti)
        cache.set(artiKey, arti)
      }
      return qtext.includes(q) || isi.includes(q) || arti.includes(q)
    })
  }, [list, searchQuery])

  const grouped = useMemo(() => groupByBab(filteredList, babList), [filteredList, babList])

  const reorderDisabled = Boolean(searchQuery.trim()) || reorderBusy

  const handlePersistWiridOrder = useCallback(
    async (babName, ordered) => {
      setReorderBusy(true)
      try {
        const res = await wiridNailulMurodAPI.reorder({
          bab: babName,
          order: ordered.map((r) => r.id),
        })
        if (res?.success && Array.isArray(res.data)) {
          setList((prev) => {
            const map = new Map(prev.map((r) => [r.id, r]))
            for (const row of res.data) map.set(row.id, row)
            return Array.from(map.values())
          })
        } else {
          showNotification(res?.message || 'Gagal mengubah urutan', 'error')
          load()
        }
      } catch (e) {
        showNotification(e?.response?.data?.message || 'Gagal mengubah urutan', 'error')
        load()
      } finally {
        setReorderBusy(false)
      }
    },
    [load, showNotification]
  )

  const filterBabOptions = useMemo(() => {
    if (babList.length > 0) {
      return babList.map((b) => b.nama)
    }
    return babOptions
  }, [babList, babOptions])

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nailul Murod</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Wirid dan amaliyah sehari-hari. Di editor, tandai teks dengan gaya{' '}
              <strong>Judul</strong>, <strong>Wirid</strong>, <strong>Ayat</strong>, dll. — font
              tampilan diatur di aplikasi Nailul Murod.
            </p>
          </div>

          <div className="rounded-xl border border-teal-200/60 dark:border-teal-800/50 bg-teal-50/50 dark:bg-teal-950/20 p-4 mb-6 text-sm text-gray-700 dark:text-gray-300">
            <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">Panduan gaya di editor</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Judul / Sub judul</strong> — judul bagian dalam isi entri
              </li>
              <li>
                <strong>Wirid</strong> — teks wirid / doa Arab
              </li>
              <li>
                <strong>Nadhom</strong> — bait nadhom / syair Arab
              </li>
              <li>
                <strong>Ayat</strong> — kutipan ayat Al-Qur’an
              </li>
              <li>
                <strong>Normal</strong> — teks biasa / terjemahan tanpa peran khusus
              </li>
            </ul>
          </div>

          {err && (
            <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-200">
              {err}
            </div>
          )}

          <NailulMurodSearchBar
            searchInput={searchQuery}
            onSearchChange={(e) => setSearchQuery(e.target.value)}
            onSearchFocus={() => setIsSearchFocused(true)}
            onSearchBlur={() => setIsSearchFocused(false)}
            isInputFocused={isSearchFocused}
            isFilterOpen={isFilterOpen}
            onFilterToggle={() => setIsFilterOpen((v) => !v)}
            babFilter={filterBab}
            onBabFilterChange={(e) => setFilterBab(e.target.value)}
            babOptions={filterBabOptions}
            onTambahClick={() => navigate('/wirid/nailul-murod/create')}
            onEditBabClick={() => setBabOffcanvasOpen(true)}
            totalShown={filteredList.length}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 -mt-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600 dark:text-gray-400">Bahasa tampilan:</span>
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleTitleLang('id')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    titleLang === 'id'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  aria-pressed={titleLang === 'id'}
                >
                  Indonesia
                </button>
                <button
                  type="button"
                  onClick={() => handleTitleLang('ar')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    titleLang === 'ar'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  aria-pressed={titleLang === 'ar'}
                >
                  Arab
                </button>
              </div>
            </div>
            {searchQuery.trim() ? (
              <p className="text-xs text-amber-700 dark:text-amber-300/90">
                Urutan dinonaktifkan saat pencarian aktif.
              </p>
            ) : null}
          </div>

          {loading && list.length === 0 ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-12">
              {list.length > 0 && searchQuery.trim()
                ? 'Tidak ada entri yang cocok dengan pencarian.'
                : 'Belum ada entri.'}
            </p>
          ) : (
            <div className="space-y-8">
              {grouped.map(([babName, items]) => (
                <section key={babName} className="nm-wirid-bab-section">
                  <header className="nm-wirid-bab-section__head">
                    <h2
                      className={`nm-wirid-bab-section__title${
                        titleLang === 'ar' ? ' nm-wirid-bab-section__title--ar' : ''
                      }`}
                      dir={titleLang === 'ar' ? 'rtl' : undefined}
                      lang={titleLang === 'ar' ? 'ar' : 'id'}
                    >
                      {resolveBabLabel(babName, babList, titleLang)}
                    </h2>
                    <span className="nm-wirid-bab-section__meta">{items.length} judul</span>
                  </header>
                  <NailulMurodWiridReorderList
                    babName={babName}
                    rows={items}
                    disabled={reorderDisabled}
                    titleLang={titleLang}
                    onPersistOrder={handlePersistWiridOrder}
                    onOpen={(r) => setPreview({ row: r, open: true })}
                  />
                </section>
              ))}
            </div>
          )}

          {preview && (
            <PreviewOffcanvas
              isOpen={preview.open}
              row={preview.row}
              titleLang={titleLang}
              babList={babList}
              onClose={requestClosePreview}
              onExitComplete={onPreviewExitComplete}
              onEdit={(r) => {
                editAfterPreviewExitRef.current = r
                requestClosePreview()
              }}
              onDeleteRequest={(r) => {
                setDeleting(r)
                setDeleteOpen(true)
                requestClosePreview()
              }}
            />
          )}
          <DeleteModal
            open={deleteOpen}
            row={deleting}
            titleLang={titleLang}
            busy={deletingBusy}
            onClose={() => {
              setDeleteOpen(false)
              setDeleting(null)
            }}
            onConfirm={async (row) => {
              if (!row?.id) return
              setDeletingBusy(true)
              try {
                const res = await wiridNailulMurodAPI.delete(row.id)
                if (res?.success) {
                  showNotification('Entri dihapus', 'success')
                  setDeleteOpen(false)
                  setDeleting(null)
                  load()
                } else {
                  showNotification(res?.message || 'Gagal menghapus', 'error')
                }
              } catch (e) {
                showNotification(e?.response?.data?.message || 'Gagal menghapus', 'error')
              } finally {
                setDeletingBusy(false)
              }
            }}
          />
          <NailulMurodBabOffcanvas
            isOpen={babOffcanvasOpen}
            onClose={() => setBabOffcanvasOpen(false)}
            onChanged={load}
            titleLang={titleLang}
          />
        </div>
      </div>
    </div>
  )
}
