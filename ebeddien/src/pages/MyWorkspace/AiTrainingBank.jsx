import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react'
import { aiTrainingAdminAPI } from '../../services/api'
import { useChatAiHeaderSlot } from '../../contexts/ChatAiHeaderContext'
import EbeddienChatHeaderTraining from './DeepseekChat/EbeddienChatHeaderTraining'

const ASSISTANT_NAME = 'eBeddien'

const defaultForm = {
  id: null,
  question: '',
  answer: '',
  category: 'Tentang Al-Utsmani',
  admin: ''
}

/** Nilai khusus di &lt;select&gt; untuk mode input kategori baru */
const CATEGORY_NEW = '__new__'

const DEFAULT_CATEGORY_SUGGESTIONS = ['Tentang Al-Utsmani', 'Lainnya', 'Umum']

/** Kelas input/textarea form — satu gaya agar rapi & konsisten */
const fieldClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/25'

const labelClass = 'block text-xs font-semibold text-gray-700 dark:text-gray-300'

const hintClass = 'text-[11px] leading-snug text-gray-500 dark:text-gray-400'

export default function AiTrainingBank() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const [activeTab, setActiveTab] = useState('form') // 'form' | 'daftar' (mobile/tablet)
  const [isDesktop, setIsDesktop] = useState(false)
  const formRef = useRef(null)
  const listRef = useRef(null)
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)

  /** Pilihan kategori di select: default + unik dari data */
  const categoryOptions = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORY_SUGGESTIONS)
    rows.forEach((r) => {
      const c = (r.category || '').trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [rows])

  const [categorySelect, setCategorySelect] = useState(defaultForm.category)
  const [newCategoryName, setNewCategoryName] = useState('')

  const resetCategoryUi = useCallback(() => {
    setCategorySelect(defaultForm.category)
    setNewCategoryName('')
  }, [])

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024)
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  useEffect(() => {
    if (formRef.current) {
      formRef.current.style.display = isDesktop ? 'block' : activeTab === 'form' ? 'block' : 'none'
    }
    if (listRef.current) {
      listRef.current.style.display = isDesktop ? 'flex' : activeTab === 'daftar' ? 'flex' : 'none'
    }
  }, [activeTab, isDesktop])

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

  const setHeaderFromLayout = useChatAiHeaderSlot()
  useLayoutEffect(() => {
    if (!setHeaderFromLayout) return
    setHeaderFromLayout(
      <EbeddienChatHeaderTraining
        assistantName={ASSISTANT_NAME}
        variant="bank"
        accountLoading={false}
        chatHeaderMenuOpen={chatHeaderMenuOpen}
        setChatHeaderMenuOpen={setChatHeaderMenuOpen}
      />
    )
    return () => setHeaderFromLayout(null)
  }, [setHeaderFromLayout, chatHeaderMenuOpen])

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
      setForm(defaultForm)
      resetCategoryUi()
      await load()
      if (!isDesktop) setActiveTab('daftar')
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const onEdit = (row) => {
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
    setActiveTab('form')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const onDelete = async (id) => {
    if (!window.confirm('Hapus pasangan Q&A ini?')) return
    try {
      const res = await aiTrainingAdminAPI.deleteBank(id)
      if (!res?.success) {
        alert(res?.message || 'Gagal menghapus')
        return
      }
      if (form.id === id) {
        setForm(defaultForm)
        resetCategoryUi()
      }
      await load()
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Gagal menghapus')
    }
  }

  const tabBtnClass = (key) =>
    `flex-1 py-2.5 text-center border-b-2 font-semibold flex items-center justify-center gap-2 transition-colors text-sm sm:text-base ${
      activeTab === key
        ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="mb-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {/* Tab — sama pola UWABA (Biodata / Rincian): hanya &lt; lg */}
        <div className="mb-2 flex flex-shrink-0 overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-800 lg:hidden">
          <button type="button" onClick={() => setActiveTab('form')} className={tabBtnClass('form')}>
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            <span>Form Q&A</span>
          </button>
          <button type="button" onClick={() => setActiveTab('daftar')} className={tabBtnClass('daftar')}>
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
            <span>Daftar ({rows.length})</span>
          </button>
        </div>

        {/* Layout: desktop 2 kolom (lg+), mobile/tab tab-based — meniru Pembayaran/UWABA */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:grid lg:grid-cols-2">
          {/* Kolom kiri: form */}
          <div ref={formRef} className="col-span-1 flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-lg shadow-gray-200/40 ring-1 ring-black/[0.03] dark:border-gray-700 dark:bg-gray-800 dark:shadow-none dark:ring-white/[0.04]">
              <div className="shrink-0 border-b border-gray-100 px-4 py-2.5 dark:border-gray-700 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {form.id ? `Edit #${form.id}` : 'Form tambah'}
                  </h2>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {form.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setForm(defaultForm)
                          resetCategoryUi()
                        }}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80 sm:text-sm"
                      >
                        Batal edit
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      form="ai-training-bank-form"
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-teal-600/20 transition hover:from-teal-500 hover:to-emerald-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:opacity-50 dark:shadow-teal-900/30 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {saving ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent sm:h-4 sm:w-4" />
                          Menyimpan…
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Simpan
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <form
                id="ai-training-bank-form"
                onSubmit={onSubmit}
                className="chat-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5"
              >
                <div className="min-w-0 space-y-2">
                  <label htmlFor="ai-train-category" className={labelClass}>
                    Kategori
                  </label>
                  <p className={hintClass}>Dari data yang ada, atau pilih &quot;Kategori baru&quot; lalu isi nama.</p>
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
                    <div className="mt-2 space-y-2 border-l-2 border-teal-500/70 pl-3 dark:border-teal-500/50">
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

                <div className="my-4 h-px shrink-0 bg-gray-100 dark:bg-gray-700" aria-hidden />

                <div className="min-w-0 space-y-2">
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

                <div className="my-4 h-px shrink-0 bg-gray-100 dark:bg-gray-700" aria-hidden />

                <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-2">
                  <label htmlFor="ai-train-a" className={labelClass}>
                    Jawaban
                  </label>
                  <textarea
                    id="ai-train-a"
                    required
                    rows={8}
                    value={form.answer}
                    onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                    placeholder="Jawaban untuk bank training — jelas dan konsisten."
                    className={`${fieldClass} min-h-[10rem] flex-1 resize-y leading-relaxed lg:min-h-[12rem]`}
                  />
                </div>
              </form>
            </div>
          </div>

          {/* Kolom kanan: daftar */}
          <div
            ref={listRef}
            className="col-span-1 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800"
            style={{ minHeight: 0 }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700 sm:px-6">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Daftar Q&A</h2>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="text-xs font-semibold text-teal-600 hover:underline disabled:opacity-50 dark:text-teal-400"
              >
                Muat ulang
              </button>
            </div>
            <div className="chat-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-6">
              {loading ? (
                <p className="py-8 text-center text-sm text-gray-500">Memuat…</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">Belum ada data.</p>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-xl border border-gray-200 bg-gray-50/90 p-3 dark:border-gray-600 dark:bg-gray-900/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="inline-block rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                          {row.category || '—'}
                        </span>
                        <p className="mt-1 line-clamp-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {row.question}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setExpandedId((x) => (x === row.id ? null : row.id))}
                          className="rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          {expandedId === row.id ? 'Tutup' : 'Detail'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(row.id)}
                          className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                    {expandedId === row.id ? (
                      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-300">
                        {row.answer}
                      </pre>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
    </div>
  )
}
