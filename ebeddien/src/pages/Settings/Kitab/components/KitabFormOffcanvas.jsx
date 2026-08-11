import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { kitabAPI } from '../../../../services/api'

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200'
const selectClass = `${inputClass} appearance-none bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9`
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

/** Nilai khusus di &lt;select&gt; untuk mode input fan baru */
const FAN_BARU = '__fan_baru__'

const emptyForm = {
  nama_indo: '',
  nama_arab: '',
  penulis: '',
  penerbit: '',
  tahun: '',
  isbn: '',
  keterangan: ''
}

function KitabFormOffcanvas({ isOpen, onClose, kitab, onSuccess }) {
  const isEdit = Boolean(kitab?.id)
  const [form, setForm] = useState(emptyForm)
  const [fanOptions, setFanOptions] = useState([])
  const [fanSelect, setFanSelect] = useState('')
  const [fanBaruText, setFanBaruText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setError('')
    let cancelled = false

    const applyFanState = (opts, row) => {
      if (!row?.id) {
        setFanSelect('')
        setFanBaruText('')
        return
      }
      const f = (row.fan ?? '').trim()
      if (!f) {
        setFanSelect('')
        setFanBaruText('')
      } else if (opts.includes(f)) {
        setFanSelect(f)
        setFanBaruText('')
      } else {
        setFanSelect(FAN_BARU)
        setFanBaruText(f)
      }
    }

    kitabAPI
      .getFanOptions()
      .then((r) => {
        if (cancelled) return
        const opts = r?.success && Array.isArray(r.data) ? [...r.data].sort((a, b) => String(a).localeCompare(String(b), 'id')) : []
        setFanOptions(opts)
        applyFanState(opts, kitab)
      })
      .catch(() => {
        if (cancelled) return
        setFanOptions([])
        applyFanState([], kitab)
      })

    if (kitab?.id) {
      setFanSelect('')
      setFanBaruText('')
      setForm({
        nama_indo: kitab.nama_indo ?? '',
        nama_arab: kitab.nama_arab ?? '',
        penulis: kitab.penulis ?? '',
        penerbit: kitab.penerbit ?? '',
        tahun: kitab.tahun != null && kitab.tahun !== '' ? String(kitab.tahun) : '',
        isbn: kitab.isbn ?? '',
        keterangan: kitab.keterangan ?? ''
      })
    } else {
      setForm(emptyForm)
      setFanSelect('')
      setFanBaruText('')
    }

    return () => {
      cancelled = true
    }
  }, [isOpen, kitab])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.nama_indo?.trim()) {
      setError('Nama (Indonesia) wajib diisi')
      return
    }

    let fanValue = null
    if (fanSelect === FAN_BARU) {
      fanValue = fanBaruText?.trim() || null
    } else if (fanSelect) {
      fanValue = fanSelect.trim()
    }

    const payload = {
      fan: fanValue,
      nama_indo: form.nama_indo.trim(),
      nama_arab: form.nama_arab?.trim() || null,
      penulis: form.penulis?.trim() || null,
      penerbit: form.penerbit?.trim() || null,
      isbn: form.isbn?.trim() || null,
      keterangan: form.keterangan?.trim() || null
    }

    if (form.tahun?.trim()) {
      const y = parseInt(form.tahun, 10)
      if (Number.isNaN(y) || y < 1000 || y > 2100) {
        setError('Tahun terbit harus antara 1000–2100 atau dikosongkan')
        return
      }
      payload.tahun = y
    } else {
      payload.tahun = null
    }

    setLoading(true)
    try {
      let res
      if (isEdit) {
        res = await kitabAPI.update(kitab.id, payload)
      } else {
        res = await kitabAPI.create(payload)
      }
      if (res?.success) {
        onSuccess?.(res.data)
        onClose()
      } else {
        setError(res?.message || 'Gagal menyimpan')
      }
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setError('')
    onClose()
  }

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="kitab-oc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10210]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="kitab-oc-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-[10211] flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kitab-form-title"
          >
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 id="kitab-form-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEdit ? 'Edit Kitab' : 'Tambah Kitab'}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6">
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="kitab-fan-select" className={labelClass}>
                    Fan / cabang ilmu
                  </label>
                  <select
                    id="kitab-fan-select"
                    value={fanSelect}
                    onChange={(e) => {
                      const v = e.target.value
                      setFanSelect(v)
                      if (v !== FAN_BARU) setFanBaruText('')
                    }}
                    className={selectClass}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
                    }}
                  >
                    <option value="">— Pilih fan —</option>
                    {fanOptions.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                    <option value={FAN_BARU}>+ Fan baru…</option>
                  </select>
                  {fanSelect === FAN_BARU && (
                    <div className="mt-2">
                      <label htmlFor="kitab-fan-baru" className="sr-only">
                        Nama fan baru
                      </label>
                      <input
                        id="kitab-fan-baru"
                        type="text"
                        value={fanBaruText}
                        onChange={(e) => setFanBaruText(e.target.value)}
                        className={inputClass}
                        placeholder="Ketik nama fan (mis. fiqh, nahwu, shorof)"
                        autoComplete="off"
                      />
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    Daftar diambil dari fan yang sudah dipakai di kitab. Pilih &quot;+ Fan baru…&quot; jika belum ada.
                  </p>
                </div>

                <div>
                  <label htmlFor="kitab-nama_indo" className={labelClass}>
                    Nama (Indonesia) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="kitab-nama_indo"
                    name="nama_indo"
                    value={form.nama_indo}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Judul kitab"
                    required
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label htmlFor="kitab-nama_arab" className={labelClass}>
                    Nama (Arab)
                  </label>
                  <input
                    id="kitab-nama_arab"
                    name="nama_arab"
                    dir="rtl"
                    value={form.nama_arab}
                    onChange={handleChange}
                    className={`${inputClass} text-right`}
                    placeholder="العنوان"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label htmlFor="kitab-penulis" className={labelClass}>
                    Penulis
                  </label>
                  <input
                    id="kitab-penulis"
                    name="penulis"
                    value={form.penulis}
                    onChange={handleChange}
                    className={inputClass}
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label htmlFor="kitab-penerbit" className={labelClass}>
                    Penerbit
                  </label>
                  <input
                    id="kitab-penerbit"
                    name="penerbit"
                    value={form.penerbit}
                    onChange={handleChange}
                    className={inputClass}
                    autoComplete="off"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="kitab-tahun" className={labelClass}>
                      Tahun terbit
                    </label>
                    <input
                      id="kitab-tahun"
                      name="tahun"
                      type="number"
                      min={1000}
                      max={2100}
                      value={form.tahun}
                      onChange={handleChange}
                      className={inputClass}
                      placeholder="Masehi"
                    />
                  </div>
                  <div>
                    <label htmlFor="kitab-isbn" className={labelClass}>
                      ISBN
                    </label>
                    <input
                      id="kitab-isbn"
                      name="isbn"
                      value={form.isbn}
                      onChange={handleChange}
                      className={inputClass}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="kitab-keterangan" className={labelClass}>
                    Keterangan
                  </label>
                  <textarea
                    id="kitab-keterangan"
                    name="keterangan"
                    value={form.keterangan}
                    onChange={handleChange}
                    rows={4}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex-shrink-0 p-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-white dark:bg-gray-800 rounded-bl-2xl">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(panel, document.body)
}

export default KitabFormOffcanvas
