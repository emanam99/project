import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { aiTrainingAdminAPI } from '../../services/api'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'

const defaultForm = {
  id: null,
  question: '',
  answer: '',
  category: 'Tentang Al-Utsmani',
  admin: ''
}

const CATEGORY_NEW = '__new__'
const DEFAULT_CATEGORY_SUGGESTIONS = ['Tentang Al-Utsmani', 'Lainnya', 'Umum']

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/25'

const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400'

const hintClass = 'text-[11px] leading-snug text-gray-500 dark:text-gray-400'

const offcanvasPanelClass =
  'fixed inset-y-0 right-0 z-[10211] flex w-full max-w-lg flex-col bg-white shadow-2xl dark:bg-gray-900 dark:shadow-black/40 border-l border-gray-200 dark:border-gray-700'

export default function AiTrainingBank() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [offcanvasMode, setOffcanvasMode] = useState('add')

  const [categorySelect, setCategorySelect] = useState(defaultForm.category)
  const [newCategoryName, setNewCategoryName] = useState('')

  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const closeOffcanvas = useCallback(() => {
    setOffcanvasOpen(false)
    setForm(defaultForm)
    setCategorySelect(defaultForm.category)
    setNewCategoryName('')
  }, [])

  const closeOffcanvasBack = useOffcanvasBackClose(offcanvasOpen, closeOffcanvas)

  const categoryOptions = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORY_SUGGESTIONS)
    rows.forEach((r) => {
      const c = (r.category || '').trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [rows])

  const resetCategoryUi = useCallback(() => {
    setCategorySelect(defaultForm.category)
    setNewCategoryName('')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await aiTrainingAdminAPI.listBank()
      if (!res?.success) {
        setError(res?.message || 'Gagal memuat data')
        setRows([])
        return
      }
      setRows(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Gagal memuat data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredRows = useMemo(() => {
    let list = rows
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const question = (r.question || '').toLowerCase()
        const answer = (r.answer || '').toLowerCase()
        return question.includes(q) || answer.includes(q)
      })
    }
    if (categoryFilter) {
      list = list.filter((r) => (r.category || '').trim() === categoryFilter)
    }
    return list
  }, [rows, searchQuery, categoryFilter])

  const openAdd = () => {
    setError(null)
    setForm(defaultForm)
    resetCategoryUi()
    setOffcanvasMode('add')
    setOffcanvasOpen(true)
  }

  const openEdit = (row) => {
    setError(null)
    const cat = (row.category || '').trim() || defaultForm.category
    const fromData = new Set(categoryOptions)
    if (fromData.has(cat)) {
      setCategorySelect(cat)
      setNewCategoryName('')
    } else {
      setCategorySelect(CATEGORY_NEW)
      setNewCategoryName(cat)
    }
    setForm({
      id: row.id,
      question: row.question || '',
      answer: row.answer || '',
      category: cat,
      admin: row.admin || ''
    })
    setOffcanvasMode('edit')
    setOffcanvasOpen(true)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      let finalCategory
      if (categorySelect === CATEGORY_NEW) {
        const t = newCategoryName.trim()
        if (!t) {
          setError('Masukkan nama kategori baru, atau pilih kategori yang sudah ada.')
          setSaving(false)
          return
        }
        finalCategory = t
      } else {
        finalCategory = categorySelect
      }

      const payload = {
        id: form.id || undefined,
        question: form.question.trim(),
        answer: form.answer.trim(),
        category: finalCategory,
        admin: form.admin.trim() || undefined
      }
      const res = await aiTrainingAdminAPI.saveBank(payload)
      if (!res?.success) {
        setError(res?.message || 'Gagal menyimpan')
        return
      }
      await load()
      closeOffcanvasBack()
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!form.id) return
    if (!window.confirm('Hapus pasangan Q&A ini?')) return
    try {
      const res = await aiTrainingAdminAPI.deleteBank(form.id)
      if (!res?.success) {
        alert(res?.message || 'Gagal menghapus')
        return
      }
      await load()
      closeOffcanvasBack()
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Gagal menghapus')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 sm:px-3">
      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {/* Toolbar — meniru pola Pengurus: sticky, search + filter + tambah */}
      <div className="sticky top-0 z-10 mb-3 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="relative px-3 pb-2 pt-3 sm:px-4">
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full bg-transparent py-2 pl-1 pr-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-400"
                placeholder="Cari pertanyaan atau jawaban…"
              />
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-600" />
              <div
                className={`pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsFilterOpen((v) => !v)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              title={isFilterOpen ? 'Sembunyikan filter' : 'Filter kategori'}
              aria-label={isFilterOpen ? 'Sembunyikan filter kategori' : 'Filter kategori'}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-r from-teal-600 to-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:shadow-teal-900/30"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Tambah
            </button>
          </div>

          <AnimatePresence initial={false}>
            {isFilterOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-gray-100 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/80"
              >
                <div className="flex flex-wrap items-center gap-2 px-1 py-3">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Filter:</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="min-w-[10rem] rounded-lg border border-gray-200 bg-white py-1.5 pl-2 pr-8 text-xs text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="">Semua kategori</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setCategoryFilter('')
                    }}
                    className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-teal-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-teal-400"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Muat ulang
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Daftar */}
      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {loading ? (
          <p className="py-16 text-center text-sm text-gray-500">Memuat bank Q&A…</p>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {rows.length === 0 ? 'Belum ada pasangan Q&A.' : 'Tidak ada data yang cocok dengan pencarian / filter.'}
            </p>
            {rows.length > 0 && (
              <button type="button" onClick={() => { setSearchQuery(''); setCategoryFilter('') }} className="mt-2 text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">
                Kosongkan filter
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
            {filteredRows.map((row, index) => (
              <motion.li
                key={row.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.3) }}
              >
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="group flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-teal-50/80 dark:hover:bg-teal-950/20 sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                        {row.category || '—'}
                      </span>
                      <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">#{row.id}</span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">{row.question}</p>
                    <p className="line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{row.answer}</p>
                  </div>
                  <svg
                    className="mt-1 h-5 w-5 shrink-0 text-gray-300 transition group-hover:text-teal-500 dark:text-gray-600 dark:group-hover:text-teal-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-2 shrink-0 text-center text-[11px] text-gray-400 dark:text-gray-500">
        {filteredRows.length} dari {rows.length} entri
        {categoryFilter || searchQuery.trim() ? ' (difilter)' : ''}
      </p>

      {/* Offcanvas kanan: form */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {offcanvasOpen && (
              <>
                <motion.button
                  type="button"
                  aria-label="Tutup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[10210] bg-black/40 backdrop-blur-[1px]"
                  onClick={() => !saving && closeOffcanvasBack()}
                />
                <motion.aside
                  role="dialog"
                  aria-modal="true"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'tween', duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                  className={offcanvasPanelClass}
                >
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:px-5">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-50">
                        {offcanvasMode === 'add' ? 'Tambah Q&A' : `Edit Q&A #${form.id}`}
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Bank pengetahuan {ASSISTANT_NAME}</p>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => closeOffcanvasBack()}
                      className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                      aria-label="Tutup panel"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <form id="ai-training-bank-offcanvas-form" onSubmit={onSubmit} className="chat-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-4 sm:px-5">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label htmlFor="ai-train-category" className={labelClass}>
                          Kategori
                        </label>
                        <p className={hintClass}>Pilih yang ada atau buat kategori baru.</p>
                        <select
                          id="ai-train-category"
                          value={categorySelect}
                          onChange={(e) => {
                            const v = e.target.value
                            setCategorySelect(v)
                            if (v === CATEGORY_NEW) {
                              setNewCategoryName('')
                            } else {
                              setNewCategoryName('')
                              setForm((f) => ({ ...f, category: v }))
                            }
                          }}
                          className={`${fieldClass} cursor-pointer py-2.5 pl-3 pr-9 font-medium`}
                        >
                          {categoryOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          <option value={CATEGORY_NEW}>+ Kategori baru…</option>
                        </select>
                        {categorySelect === CATEGORY_NEW ? (
                          <div className="space-y-2 border-l-2 border-teal-500/70 pl-3 dark:border-teal-500/50">
                            <label htmlFor="ai-train-category-new" className={labelClass}>
                              Nama kategori baru
                            </label>
                            <input
                              id="ai-train-category-new"
                              type="text"
                              required
                              value={newCategoryName}
                              onChange={(e) => {
                                const v = e.target.value
                                setNewCategoryName(v)
                                setForm((f) => ({ ...f, category: v.trim() || f.category }))
                              }}
                              placeholder="Contoh: Akademik, Keuangan"
                              className={fieldClass}
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="h-px bg-gray-100 dark:bg-gray-800" />

                      <div className="space-y-2">
                        <label htmlFor="ai-train-q" className={labelClass}>
                          Pertanyaan
                        </label>
                        <textarea
                          id="ai-train-q"
                          required
                          rows={4}
                          value={form.question}
                          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                          placeholder="Kalimat seperti yang akan ditanyakan pengguna…"
                          className={`${fieldClass} min-h-[5.5rem] resize-y leading-relaxed`}
                        />
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="ai-train-a" className={labelClass}>
                          Jawaban
                        </label>
                        <textarea
                          id="ai-train-a"
                          required
                          rows={10}
                          value={form.answer}
                          onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                          placeholder="Jawaban untuk bank training — jelas dan konsisten."
                          className={`${fieldClass} min-h-[12rem] resize-y leading-relaxed`}
                        />
                      </div>
                    </div>
                  </form>

                  <div className="shrink-0 border-t border-gray-100 bg-gray-50/90 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/90 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      {form.id ? (
                        <button
                          type="button"
                          onClick={onDelete}
                          disabled={saving}
                          className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          Hapus
                        </button>
                      ) : null}
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => closeOffcanvasBack()}
                          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          form="ai-training-bank-offcanvas-form"
                          disabled={saving}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:opacity-50"
                        >
                          {saving ? (
                            <>
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Menyimpan…
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Simpan
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}
