import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { kitabAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import KitabFormOffcanvas from './components/KitabFormOffcanvas'

function kitabListTitle(row) {
  const arab = String(row?.nama_arab ?? '').trim()
  return arab || String(row?.nama_indo ?? '').trim() || '—'
}

function kitabTitleIsArab(row) {
  return String(row?.nama_arab ?? '').trim() !== ''
}

function kitabMatchesSearch(row, query) {
  if (!query) return true
  const hay = [
    row?.nama_indo,
    row?.nama_arab,
    row?.penulis,
    row?.penerbit,
    row?.isbn,
    row?.fan,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ')
  return hay.includes(query)
}

function Kitab() {
  const { showNotification } = useNotification()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fanFilter, setFanFilter] = useState('')
  const [penulisFilter, setPenulisFilter] = useState('')
  const [fanOptions, setFanOptions] = useState([])
  const [isInputFocused, setIsInputFocused] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editingKitab, setEditingKitab] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await kitabAPI.getList()
      if (res?.success) {
        setList(Array.isArray(res.data) ? res.data : [])
      } else {
        setError(res?.message || 'Gagal memuat daftar kitab')
        setList([])
      }
    } catch (err) {
      console.error(err)
      setError('Terjadi kesalahan saat memuat data')
      setList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    let cancelled = false
    kitabAPI.getFanOptions().then((r) => {
      if (cancelled) return
      if (r?.success && Array.isArray(r.data)) setFanOptions(r.data)
      else setFanOptions([])
    }).catch(() => {
      if (!cancelled) setFanOptions([])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const penulisOptions = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()
    const names = new Set()
    list.forEach((row) => {
      if (fanFilter && String(row?.fan ?? '').trim() !== fanFilter) return
      if (!kitabMatchesSearch(row, query)) return
      const name = String(row?.penulis ?? '').trim()
      if (name) names.add(name)
    })
    return [...names].sort((a, b) => a.localeCompare(b, 'id'))
  }, [list, fanFilter, debouncedSearch])

  useEffect(() => {
    if (penulisFilter && !penulisOptions.includes(penulisFilter)) {
      setPenulisFilter('')
    }
  }, [penulisOptions, penulisFilter])

  const displayedList = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase()
    return list.filter((row) => {
      if (fanFilter && String(row?.fan ?? '').trim() !== fanFilter) return false
      if (penulisFilter && String(row?.penulis ?? '').trim() !== penulisFilter) return false
      return kitabMatchesSearch(row, query)
    })
  }, [list, fanFilter, penulisFilter, debouncedSearch])

  const openTambah = () => {
    setEditingKitab(null)
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditingKitab(row)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingKitab(null)
  }

  const onFormSuccess = () => {
    showNotification(editingKitab ? 'Kitab diperbarui' : 'Kitab ditambahkan', 'success')
    loadList()
    kitabAPI.getFanOptions().then((r) => {
      if (r?.success && Array.isArray(r.data)) setFanOptions(r.data)
    })
  }

  if (loading && list.length === 0 && !error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="relative pb-2 px-4 pt-3">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-4 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari judul, penulis, penerbit, ISBN, fan…"
              />
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <div
                className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={fanFilter}
                  onChange={(e) => setFanFilter(e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-2 focus:ring-teal-500 min-w-[10rem]"
                >
                  <option value="">Semua fan</option>
                  {fanOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select
                  value={penulisFilter}
                  onChange={(e) => setPenulisFilter(e.target.value)}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-2 focus:ring-teal-500 min-w-[12rem]"
                >
                  <option value="">Semua penulis</option>
                  {penulisOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadList()}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={openTambah}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Kitab
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {displayedList.length === 0 ? (
              <div className="p-10 text-center text-gray-500 dark:text-gray-400">
                {loading
                  ? 'Memuat…'
                  : (debouncedSearch || fanFilter || penulisFilter
                    ? 'Tidak ada kitab yang cocok'
                    : 'Belum ada data kitab')}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                <AnimatePresence>
                  {displayedList.map((row, index) => {
                    const isArab = kitabTitleIsArab(row)
                    return (
                      <motion.button
                        key={row.id}
                        type="button"
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(index, 20) * 0.01 }}
                        onClick={() => openEdit(row)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                      >
                        <span
                          className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                          dir={isArab ? 'rtl' : 'ltr'}
                        >
                          {kitabListTitle(row)}
                        </span>
                        {row.fan ? (
                          <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-teal-50 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200">
                            {row.fan}
                          </span>
                        ) : null}
                      </motion.button>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="h-20 sm:h-0" aria-hidden="true" />
        </div>
      </div>

      <KitabFormOffcanvas
        isOpen={formOpen}
        onClose={closeForm}
        kitab={editingKitab}
        onSuccess={onFormSuccess}
      />
    </div>
  )
}

export default Kitab
