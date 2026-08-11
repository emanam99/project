import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { tahunAjaranAPI } from '../../../services/api'
import PickDateHijri from '../../../components/PickDateHijri/PickDateHijri'
import { useNotification } from '../../../contexts/NotificationContext'
import { hijriYmdToMasehiYmd, masehiYmdToHijriYmd } from '../../../utils/hijriDate'

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/**
 * Offcanvas kanan — tambah / edit tahun ajaran.
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {object|null} item - null = tambah; objek baris = edit
 * @param {() => void} [onSaved] - dipanggil setelah simpan berhasil
 */
export default function TahunAjaranFormOffcanvas({ isOpen, onClose, item, onSaved }) {
  const { showNotification } = useNotification()
  const isEdit = Boolean(item?.tahun_ajaran)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    tahun_ajaran: '',
    kategori: 'hijriyah',
    dari: '',
    sampai: ''
  })
  const [hijriPeriode, setHijriPeriode] = useState({ dari: null, sampai: null })

  useEffect(() => {
    if (!isOpen) return

    const run = async () => {
      if (item) {
        const dari = item.dari ? String(item.dari).slice(0, 10) : ''
        const sampai = item.sampai ? String(item.sampai).slice(0, 10) : ''
        const kat = item.kategori || 'hijriyah'
        setFormData({
          tahun_ajaran: item.tahun_ajaran || '',
          kategori: kat,
          dari,
          sampai
        })
        if (kat === 'hijriyah' && (dari || sampai)) {
          const [hd, hs] = await Promise.all([
            dari ? masehiYmdToHijriYmd(dari) : null,
            sampai ? masehiYmdToHijriYmd(sampai) : null
          ])
          setHijriPeriode({ dari: hd, sampai: hs })
        } else {
          setHijriPeriode({ dari: null, sampai: null })
        }
      } else {
        setFormData({
          tahun_ajaran: '',
          kategori: 'hijriyah',
          dari: '',
          sampai: ''
        })
        setHijriPeriode({ dari: null, sampai: null })
      }
    }

    void run()
  }, [isOpen, item])

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  const onHijriDariChange = async (ymd) => {
    setHijriPeriode((p) => ({ ...p, dari: ymd }))
    if (!ymd) {
      setFormData((prev) => ({ ...prev, dari: '' }))
      return
    }
    const masehi = await hijriYmdToMasehiYmd(ymd)
    if (!masehi) {
      showNotification(
        'Tidak bisa mengonversi ke tanggal Masehi. Pastikan data kalender Hijriyah untuk tahun/bulan tersebut sudah diisi.',
        'error'
      )
      setHijriPeriode((p) => ({ ...p, dari: null }))
      return
    }
    setFormData((prev) => ({ ...prev, dari: masehi }))
  }

  const onHijriSampaiChange = async (ymd) => {
    setHijriPeriode((p) => ({ ...p, sampai: ymd }))
    if (!ymd) {
      setFormData((prev) => ({ ...prev, sampai: '' }))
      return
    }
    const masehi = await hijriYmdToMasehiYmd(ymd)
    if (!masehi) {
      showNotification(
        'Tidak bisa mengonversi ke tanggal Masehi. Pastikan data kalender Hijriyah untuk tahun/bulan tersebut sudah diisi.',
        'error'
      )
      setHijriPeriode((p) => ({ ...p, sampai: null }))
      return
    }
    setFormData((prev) => ({ ...prev, sampai: masehi }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.tahun_ajaran.trim()) {
      showNotification('Tahun ajaran wajib diisi', 'error')
      return
    }
    if (!['hijriyah', 'masehi'].includes(formData.kategori)) {
      showNotification('Kategori harus hijriyah atau masehi', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        tahun_ajaran: formData.tahun_ajaran.trim(),
        kategori: formData.kategori,
        dari: formData.dari || null,
        sampai: formData.sampai || null
      }

      if (isEdit) {
        const res = await tahunAjaranAPI.update(item.tahun_ajaran, payload)
        if (res.success) {
          showNotification('Tahun ajaran berhasil diupdate', 'success')
          onSaved?.()
          onClose()
        } else {
          showNotification(res.message || 'Gagal mengupdate tahun ajaran', 'error')
        }
      } else {
        const res = await tahunAjaranAPI.create(payload)
        if (res.success) {
          showNotification('Tahun ajaran berhasil ditambahkan', 'success')
          onSaved?.()
          onClose()
        } else {
          showNotification(res.message || 'Gagal menambahkan tahun ajaran', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving tahun ajaran:', err)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setSaving(false)
    }
  }

  const panel = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="ta-oc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10210]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="ta-oc-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-[10211] flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tahun-ajaran-form-title"
          >
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 id="tahun-ajaran-form-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEdit ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran'}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 disabled:opacity-50"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6">
                <div>
                  <label htmlFor="ta-nama" className={labelClass}>
                    Tahun Ajaran <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="ta-nama"
                    type="text"
                    value={formData.tahun_ajaran}
                    onChange={(e) => setFormData({ ...formData, tahun_ajaran: e.target.value })}
                    className={inputClass}
                    placeholder="Contoh: 1447-1448 atau 2025-2026"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label htmlFor="ta-kategori" className={labelClass}>
                    Kategori
                  </label>
                  <select
                    id="ta-kategori"
                    value={formData.kategori}
                    onChange={(e) => {
                      const kategori = e.target.value
                      setFormData((prev) => {
                        const next = { ...prev, kategori }
                        if (kategori === 'hijriyah') {
                          const d = next.dari ? String(next.dari).slice(0, 10) : ''
                          const s = next.sampai ? String(next.sampai).slice(0, 10) : ''
                          queueMicrotask(async () => {
                            if (d || s) {
                              const [hd, hs] = await Promise.all([
                                d ? masehiYmdToHijriYmd(d) : null,
                                s ? masehiYmdToHijriYmd(s) : null
                              ])
                              setHijriPeriode({ dari: hd, sampai: hs })
                            } else {
                              setHijriPeriode({ dari: null, sampai: null })
                            }
                          })
                        } else {
                          setHijriPeriode({ dari: null, sampai: null })
                        }
                        return next
                      })
                    }}
                    className={inputClass}
                  >
                    <option value="hijriyah">Hijriyah</option>
                    <option value="masehi">Masehi</option>
                  </select>
                </div>

                <div>
                  <p className={labelClass}>
                    {formData.kategori === 'hijriyah' ? 'Periode (pilih Hijriyah, simpan Masehi)' : 'Periode (Masehi)'}
                  </p>
                  {formData.kategori === 'hijriyah' ? (
                    <div className="space-y-3">
                      <div>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Dari (kalender Hijriyah)</span>
                        <PickDateHijri
                          value={hijriPeriode.dari}
                          onChange={onHijriDariChange}
                          placeholder="Mulai periode"
                          className="w-full"
                          inputClassName="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-left text-sm"
                        />
                      </div>
                      <div>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Sampai (kalender Hijriyah)</span>
                        <PickDateHijri
                          value={hijriPeriode.sampai}
                          onChange={onHijriSampaiChange}
                          min={hijriPeriode.dari || undefined}
                          placeholder="Akhir periode"
                          className="w-full"
                          inputClassName="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2.5 text-left text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      <input
                        type="date"
                        value={formData.dari || ''}
                        onChange={(e) => setFormData({ ...formData, dari: e.target.value })}
                        className={inputClass}
                      />
                      <input
                        type="date"
                        value={formData.sampai || ''}
                        onChange={(e) => setFormData({ ...formData, sampai: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  )}
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {formData.kategori === 'hijriyah'
                      ? 'Tanggal dipilih lewat kalender Hijriyah; nilai di database tetap tanggal Masehi (Y-m-d).'
                      : 'Tanggal mulai & selesai dalam kalender Masehi (contoh: 2025-07-01 s/d 2026-06-30).'}
                  </p>
                </div>
              </div>

              <div className="flex-shrink-0 p-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-white dark:bg-gray-800 rounded-bl-2xl">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Menyimpan...
                    </>
                  ) : isEdit ? (
                    'Simpan Perubahan'
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
