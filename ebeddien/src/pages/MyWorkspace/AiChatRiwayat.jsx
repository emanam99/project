import { useCallback, useEffect, useLayoutEffect, useMemo, useState, memo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { deepseekAPI, aiTrainingAdminAPI } from '../../services/api'
import { useChatAiHeaderSlot } from '../../contexts/ChatAiHeaderContext'
import { useNotification } from '../../contexts/NotificationContext'
import EbeddienChatHeaderTraining from './DeepseekChat/EbeddienChatHeaderTraining'

const ASSISTANT_NAME = 'eBeddien'

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/25'

const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400'

const DEFAULT_BANK_CATEGORIES = ['Tentang Al-Utsmani', 'Lainnya', 'Umum']

/** Sama dengan Bank Q&A: nilai khusus untuk opsi buat kategori baru. */
const CATEGORY_NEW = '__new__'

const hintClass = 'text-[11px] leading-snug text-gray-500 dark:text-gray-400'

const filterSelectClass =
  'border rounded-lg p-1.5 h-8 min-w-0 max-w-full text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 focus:outline-none'

function previewText(s, max = 120) {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t || '—'
  return t.slice(0, max) + '…'
}

function formatTs(ts) {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ts
    return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ts
  }
}

/** Kategori unik dari bank + default + kategori chat saat ini. */
function buildBankCategoryOptions(bankRows, chatCategory) {
  const set = new Set(DEFAULT_BANK_CATEGORIES)
  ;(bankRows || []).forEach((r) => {
    const c = (r?.category || '').trim()
    if (c) set.add(c)
  })
  const cc = (chatCategory || '').trim()
  if (cc) set.add(cc)
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
}

function displayInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Toolbar mirip Pengurus: Cari + tombol Filter + panel filter. */
const RiwayatToolbar = memo(
  ({
    searchInput,
    onSearchInputChange,
    onSearchInputFocus,
    onSearchInputBlur,
    onSearchKeyDown,
    isInputFocused,
    isFilterOpen,
    onFilterToggle,
    categoryFilter,
    onCategoryFilterChange,
    categoryOptions,
    usersIdFilter,
    onUsersIdFilterChange,
    userOptions,
    days,
    onDaysChange,
    itemsPerPage,
    onItemsPerPageChange,
    onRefresh,
    onResetFilter,
    total,
    loading
  }) => (
    <div className="sticky top-0 z-10 mb-3 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="relative px-4 pb-2 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            onKeyDown={onSearchKeyDown}
            className="w-full bg-transparent p-2 pr-24 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-400"
            placeholder="Cari pertanyaan atau jawaban…"
          />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
          <div
            className={`pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1">
            <button
              type="button"
              onClick={onFilterToggle}
              className="pointer-events-auto flex items-center gap-1 rounded-md bg-gray-100 p-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              title={isFilterOpen ? 'Sembunyikan filter' : 'Tampilkan filter'}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              Filter
              {isFilterOpen ? (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-gray-100 bg-gray-50/95 dark:border-gray-600 dark:bg-gray-700/40"
          >
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={onCategoryFilterChange}
                  className={filterSelectClass}
                  style={{ minWidth: '9rem' }}
                >
                  {(categoryOptions || []).map((o) => (
                    <option key={o.value !== '' ? o.value : 'cat-all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={usersIdFilter}
                  onChange={onUsersIdFilterChange}
                  className={filterSelectClass}
                  style={{ minWidth: '11rem', maxWidth: 'min(22rem, 100%)' }}
                >
                  {(userOptions || []).map((o) => (
                    <option key={o.value !== '' ? o.value : 'user-all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select value={days} onChange={onDaysChange} className={filterSelectClass} style={{ minWidth: '7.5rem' }}>
                  <option value={0}>Semua waktu</option>
                  <option value={7}>7 hari</option>
                  <option value={30}>30 hari</option>
                  <option value={90}>90 hari</option>
                  <option value={180}>180 hari</option>
                  <option value={365}>1 tahun</option>
                </select>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-600">
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={onResetFilter}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                    />
                  </svg>
                  Reset filter
                </button>
                <select
                  value={itemsPerPage}
                  onChange={onItemsPerPageChange}
                  className={filterSelectClass}
                >
                  <option value={10}>10 / hal</option>
                  <option value={25}>25 / hal</option>
                  <option value={50}>50 / hal</option>
                  <option value={100}>100 / hal</option>
                </select>
                <span className="text-xs font-medium tabular-nums text-gray-700 dark:text-gray-200">
                  {total.toLocaleString('id-ID')} entri
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
)

RiwayatToolbar.displayName = 'RiwayatToolbar'

const ChatLogListItem = memo(({ row, index, onClick }) => {
  const q = previewText(row.user_message, 140)
  const cat = (row.category || '').trim() || '—'

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.24) }}
      onClick={() => onClick(row)}
      className="group flex w-full text-left transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-700/35"
    >
      <div className="flex w-full gap-3 border-b border-gray-100 p-4 dark:border-gray-700/80 sm:gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-100 to-primary-100 text-xs font-bold text-teal-800 shadow-inner dark:from-teal-900/40 dark:to-primary-900/30 dark:text-teal-200"
          aria-hidden
        >
          {displayInitials(row.display_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {row.display_name || '—'}
            </span>
            <span className="inline-flex max-w-full shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-900/35 dark:text-violet-300">
              {cat}
            </span>
          </div>
          <p className="mb-1 line-clamp-2 text-sm leading-snug text-gray-800 dark:text-gray-100">{q}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{formatTs(row.timestamp)}</p>
        </div>
        <div className="flex shrink-0 items-center self-center">
          <svg
            className="h-5 w-5 text-gray-300 transition-colors group-hover:text-teal-600 dark:text-gray-600 dark:group-hover:text-teal-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.button>
  )
})

ChatLogListItem.displayName = 'ChatLogListItem'

export default function AiChatRiwayat() {
  const { showNotification } = useNotification()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(25)

  const [searchInput, setSearchInput] = useState('')
  const [searchApplied, setSearchApplied] = useState('')
  const [days, setDays] = useState(30)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [usersIdFilter, setUsersIdFilter] = useState('')

  const [metaCategories, setMetaCategories] = useState([])
  const [metaUsers, setMetaUsers] = useState([])

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)

  const [selected, setSelected] = useState(null)
  const [editUser, setEditUser] = useState('')
  const [editReply, setEditReply] = useState('')
  const [editThinking, setEditThinking] = useState('')
  const [saving, setSaving] = useState(false)

  const [bankOpen, setBankOpen] = useState(false)
  const [bankCategorySelect, setBankCategorySelect] = useState(DEFAULT_BANK_CATEGORIES[0])
  const [bankNewCategoryName, setBankNewCategoryName] = useState('')
  const [bankModalCategoryOptions, setBankModalCategoryOptions] = useState(() => buildBankCategoryOptions([], ''))
  const [bankCategoriesLoading, setBankCategoriesLoading] = useState(false)
  const [bankSaving, setBankSaving] = useState(false)

  const setHeaderFromLayout = useChatAiHeaderSlot()
  useLayoutEffect(() => {
    if (!setHeaderFromLayout) return
    setHeaderFromLayout(
      <EbeddienChatHeaderTraining
        assistantName={ASSISTANT_NAME}
        variant="riwayat"
        accountLoading={false}
        chatHeaderMenuOpen={chatHeaderMenuOpen}
        setChatHeaderMenuOpen={setChatHeaderMenuOpen}
      />
    )
    return () => setHeaderFromLayout(null)
  }, [setHeaderFromLayout, chatHeaderMenuOpen])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await deepseekAPI.adminChatLogMeta()
        if (cancelled || !res?.success) return
        const d = res.data || {}
        setMetaCategories(Array.isArray(d.categories) ? d.categories : [])
        setMetaUsers(Array.isArray(d.users) ? d.users : [])
      } catch {
        if (!cancelled) {
          setMetaCategories([])
          setMetaUsers([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const categoryOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Semua kategori' }]
    metaCategories.forEach((c) => opts.push({ value: c, label: c }))
    return opts
  }, [metaCategories])

  const userOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Semua pengguna' }]
    metaUsers.forEach((u) => {
      const label =
        u.email && u.display_name ? `${u.display_name} (${u.email})` : u.display_name || `User #${u.users_id}`
      opts.push({ value: String(u.users_id), label })
    })
    return opts
  }, [metaUsers])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const uid = usersIdFilter ? parseInt(usersIdFilter, 10) : 0
      const res = await deepseekAPI.adminListChatLog({
        page,
        limit,
        search: searchApplied || undefined,
        days: days > 0 ? days : 0,
        category: categoryFilter || undefined,
        users_id: uid > 0 ? uid : undefined
      })
      if (!res?.success) {
        setError(res?.message || 'Gagal memuat riwayat')
        setRows([])
        setTotal(0)
        return
      }
      const data = res.data || {}
      const list = Array.isArray(data.rows) ? data.rows : []
      setRows(list)
      setTotal(typeof data.total === 'number' ? data.total : 0)
      setSelected((prev) => {
        if (!prev) return null
        const found = list.find((r) => r.id === prev.id)
        return found || null
      })
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Gagal memuat riwayat')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, limit, searchApplied, days, categoryFilter, usersIdFilter])

  useEffect(() => {
    load()
  }, [load])

  const commitSearchFromInput = useCallback(() => {
    setSearchApplied(searchInput.trim())
    setPage(1)
  }, [searchInput])

  const openRow = useCallback((row) => {
    setSelected(row)
    setEditUser(row.user_message || '')
    setEditReply(row.reply || '')
    setEditThinking(row.thinking || '')
  }, [])

  const closePanel = useCallback(() => {
    setSelected(null)
    setBankOpen(false)
  }, [])

  const openBankModal = useCallback(async () => {
    if (!selected) return
    setBankNewCategoryName('')
    const chatCat = (selected.category || '').trim()
    const prelim = buildBankCategoryOptions([], chatCat)
    setBankModalCategoryOptions(prelim)
    if (chatCat && prelim.includes(chatCat)) {
      setBankCategorySelect(chatCat)
    } else {
      setBankCategorySelect(prelim[0] ?? DEFAULT_BANK_CATEGORIES[0])
    }
    setBankOpen(true)
    setBankCategoriesLoading(true)
    try {
      const res = await aiTrainingAdminAPI.listBank()
      const rows = res?.success && Array.isArray(res.data) ? res.data : []
      const options = buildBankCategoryOptions(rows, chatCat)
      setBankModalCategoryOptions(options)
      if (chatCat && options.includes(chatCat)) {
        setBankCategorySelect(chatCat)
      } else {
        setBankCategorySelect(options[0] ?? DEFAULT_BANK_CATEGORIES[0])
      }
    } catch {
      const options = buildBankCategoryOptions([], chatCat)
      setBankModalCategoryOptions(options)
      setBankCategorySelect(chatCat && options.includes(chatCat) ? chatCat : options[0] ?? DEFAULT_BANK_CATEGORIES[0])
    } finally {
      setBankCategoriesLoading(false)
    }
  }, [selected])

  const onSaveLog = async () => {
    if (!selected) return
    const u = editUser.trim()
    const r = editReply.trim()
    if (!u || !r) {
      showNotification('Pertanyaan dan jawaban wajib diisi.', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await deepseekAPI.adminPatchChatLog(selected.id, {
        user_message: u,
        reply: r,
        thinking: editThinking.trim()
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
        return
      }
      showNotification('Jawaban di log diperbarui.', 'success')
      await load()
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onSaveBank = async () => {
    if (!selected) return
    const u = editUser.trim()
    const r = editReply.trim()
    if (!u || !r) {
      showNotification('Lengkapi pertanyaan dan jawaban sebelum menambah ke bank.', 'error')
      return
    }
    let finalCategory
    if (bankCategorySelect === CATEGORY_NEW) {
      const t = bankNewCategoryName.trim()
      if (!t) {
        showNotification('Masukkan nama kategori baru atau pilih kategori yang sudah ada.', 'error')
        return
      }
      finalCategory = t
    } else {
      finalCategory = bankCategorySelect
    }
    setBankSaving(true)
    try {
      const res = await aiTrainingAdminAPI.saveBank({
        question: u,
        answer: r,
        category: finalCategory
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan ke bank', 'error')
        return
      }
      showNotification('Pasangan Q&A ditambahkan ke Bank.', 'success')
      setBankOpen(false)
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menyimpan', 'error')
    } finally {
      setBankSaving(false)
    }
  }

  const resetFilters = useCallback(() => {
    setSearchInput('')
    setSearchApplied('')
    setDays(30)
    setCategoryFilter('')
    setUsersIdFilter('')
    setPage(1)
    setLimit(25)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 sm:px-3">
      <div className="mb-1 shrink-0 pt-2">
        <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">Riwayat chat AI</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Saring per kategori &amp; pengguna; perbaiki jawaban lalu tambahkan ke Bank Q&amp;A bila perlu.
        </p>
      </div>

      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <RiwayatToolbar
        searchInput={searchInput}
        onSearchInputChange={(e) => setSearchInput(e.target.value)}
        onSearchInputFocus={() => setIsInputFocused(true)}
        onSearchInputBlur={() => {
          setIsInputFocused(false)
          commitSearchFromInput()
        }}
        onSearchKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitSearchFromInput()
          }
        }}
        isInputFocused={isInputFocused}
        isFilterOpen={isFilterOpen}
        onFilterToggle={() => setIsFilterOpen((v) => !v)}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={(e) => {
          setCategoryFilter(e.target.value)
          setPage(1)
        }}
        categoryOptions={categoryOptions}
        usersIdFilter={usersIdFilter}
        onUsersIdFilterChange={(e) => {
          setUsersIdFilter(e.target.value)
          setPage(1)
        }}
        userOptions={userOptions}
        days={days}
        onDaysChange={(e) => {
          setDays(Number(e.target.value))
          setPage(1)
        }}
        itemsPerPage={limit}
        onItemsPerPageChange={(e) => {
          setLimit(Number(e.target.value))
          setPage(1)
        }}
        onRefresh={() => load()}
        onResetFilter={resetFilters}
        total={total}
        loading={loading}
      />

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800/80">
        {loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-gray-500">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            Memuat…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-700">
              <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Tidak ada percakapan</p>
            <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">
              Ubah filter, rentang waktu, atau kata kunci pencarian.
            </p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto overscroll-contain">
            {rows.map((row, index) => (
              <ChatLogListItem key={row.id} row={row} index={index} onClick={openRow} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Halaman {page} / {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            Sebelumnya
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            Berikutnya
          </button>
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {selected ? (
            <motion.div
              className="fixed inset-0 z-[10220] flex items-stretch justify-end bg-black/40 p-0 sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
            >
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.22 }}
                className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-gray-900 sm:max-h-[calc(100vh-2rem)] sm:rounded-l-2xl sm:rounded-r-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">ID #{selected.id}</p>
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{selected.display_name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {formatTs(selected.timestamp)}
                      {selected.session_id ? ` · ${selected.session_id}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePanel}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label="Tutup"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  <div>
                    <label className={labelClass} htmlFor="edit-user">
                      Pertanyaan pengguna
                    </label>
                    <textarea
                      id="edit-user"
                      rows={4}
                      value={editUser}
                      onChange={(e) => setEditUser(e.target.value)}
                      className={`${fieldClass} mt-1 font-mono text-[13px]`}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="edit-reply">
                      Jawaban (tampilan AI)
                    </label>
                    <textarea
                      id="edit-reply"
                      rows={8}
                      value={editReply}
                      onChange={(e) => setEditReply(e.target.value)}
                      className={`${fieldClass} mt-1 font-mono text-[13px]`}
                    />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Mengubah ini memperbarui log; kategori kolom mengikuti pola [kategori] pada teks bila ada.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="edit-thinking">
                      Thinking (opsional)
                    </label>
                    <textarea
                      id="edit-thinking"
                      rows={4}
                      value={editThinking}
                      onChange={(e) => setEditThinking(e.target.value)}
                      placeholder="Kosongkan jika tidak perlu disimpan"
                      className={`${fieldClass} mt-1 font-mono text-[13px]`}
                    />
                  </div>
                </div>

                <div className="shrink-0 space-y-2 border-t border-gray-200 bg-gray-50/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-950/80">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={onSaveLog}
                      className="flex-1 rounded-xl border border-teal-600 bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
                    >
                      {saving ? 'Menyimpan…' : 'Simpan perubahan log'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openBankModal()}
                      className="flex-1 rounded-xl border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      Tambah ke Bank Q&amp;A
                    </button>
                  </div>
                </div>
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {bankOpen && selected ? (
            <motion.div
              className="fixed inset-0 z-[10230] flex items-center justify-center bg-black/50 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBankOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Simpan ke Bank Q&amp;A</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Pasangan ini akan dipakai pelatihan / pencarian bank. Kategori diambil dari Bank Q&amp;A; bisa menambah yang baru.
                </p>
                <div className="mt-4 space-y-2">
                  <label className={labelClass} htmlFor="bank-cat">
                    Kategori
                  </label>
                  <p className={hintClass}>Pilih dari data Bank atau buat kategori baru.</p>
                  {bankCategoriesLoading ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-gray-500 dark:text-gray-400">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                      Memuat daftar kategori…
                    </div>
                  ) : (
                    <>
                      <select
                        id="bank-cat"
                        value={bankCategorySelect}
                        onChange={(e) => {
                          const v = e.target.value
                          setBankCategorySelect(v)
                          if (v !== CATEGORY_NEW) setBankNewCategoryName('')
                        }}
                        className={`${fieldClass} cursor-pointer py-2.5 pl-3 pr-9 font-medium`}
                      >
                        {bankModalCategoryOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value={CATEGORY_NEW}>+ Kategori baru…</option>
                      </select>
                      {bankCategorySelect === CATEGORY_NEW ? (
                        <div className="space-y-2 border-l-2 border-teal-500/70 pl-3 dark:border-teal-500/50">
                          <label htmlFor="bank-cat-new" className={labelClass}>
                            Nama kategori baru
                          </label>
                          <input
                            id="bank-cat-new"
                            type="text"
                            value={bankNewCategoryName}
                            onChange={(e) => setBankNewCategoryName(e.target.value)}
                            placeholder="Contoh: Akademik, Keuangan"
                            className={fieldClass}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBankOpen(false)}
                    className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={bankSaving}
                    onClick={onSaveBank}
                    className="flex-1 rounded-xl border border-teal-600 bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {bankSaving ? 'Menyimpan…' : 'Simpan ke bank'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
