import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { mapelAPI } from '../../../../services/api'

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200'
const selectClass = `${inputClass} appearance-none bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9`
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

/** Label rombel di dalam konteks lembaga sudah dipilih: cukup kelas / kel */
function rombelLabelDalamLembaga(r) {
  if (!r) return ''
  const parts = [r.kelas, r.kel].filter((x) => x != null && String(x).trim() !== '')
  return parts.length ? parts.join(' · ') : `Rombel #${r.id}`
}

function isRombelAktif(r) {
  const s = String(r?.status ?? '').toLowerCase().trim()
  return s === 'aktif' || s === 'active'
}

function MapelFormOffcanvas({ isOpen, onClose, record, lembagaList, rombelList, kitabList, onSuccess }) {
  const isEdit = Boolean(record?.id)
  const [idLembaga, setIdLembaga] = useState('')
  const [idRombel, setIdRombel] = useState('')
  const [idKitab, setIdKitab] = useState('')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [status, setStatus] = useState('aktif')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const lembagaSorted = useMemo(() => {
    const arr = Array.isArray(lembagaList) ? [...lembagaList] : []
    return arr.sort((a, b) => String(a.nama || a.id || '').localeCompare(String(b.nama || b.id || ''), 'id'))
  }, [lembagaList])

  /**
   * Rombel di lembaga terpilih: default hanya yang aktif.
   * Rombel yang sedang dipilih (edit) tetap ditampilkan walau sudah nonaktif agar bisa disimpan ulang.
   */
  const rombelFiltered = useMemo(() => {
    if (!idLembaga) return []
    const arr = Array.isArray(rombelList) ? rombelList.filter((r) => String(r.lembaga_id) === String(idLembaga)) : []
    const filtered = arr.filter((r) => {
      if (isRombelAktif(r)) return true
      if (idRombel && String(r.id) === String(idRombel)) return true
      return false
    })
    return [...filtered].sort((a, b) => rombelLabelDalamLembaga(a).localeCompare(rombelLabelDalamLembaga(b), 'id'))
  }, [rombelList, idLembaga, idRombel])

  const kitabSorted = useMemo(() => {
    const arr = Array.isArray(kitabList) ? [...kitabList] : []
    return arr.sort((a, b) => String(a.nama_indo || '').localeCompare(String(b.nama_indo || ''), 'id'))
  }, [kitabList])

  useEffect(() => {
    if (!isOpen) return
    setError('')
    if (record?.id) {
      const lid = record.lembaga_id != null && record.lembaga_id !== '' ? String(record.lembaga_id) : ''
      setIdLembaga(lid)
      setIdRombel(record.id_rombel != null ? String(record.id_rombel) : '')
      setIdKitab(record.id_kitab != null ? String(record.id_kitab) : '')
      setDari(record.dari ?? '')
      setSampai(record.sampai ?? '')
      setKeterangan(record.keterangan ?? '')
      setStatus(record.status === 'nonaktif' ? 'nonaktif' : 'aktif')
    } else {
      setIdLembaga('')
      setIdRombel('')
      setIdKitab('')
      setDari('')
      setSampai('')
      setKeterangan('')
      setStatus('aktif')
    }
  }, [isOpen, record])

  /** Jika rombel terpilih tidak termasuk lembaga saat ini, kosongkan rombel */
  useEffect(() => {
    if (!isOpen || !idLembaga || !idRombel) return
    const ok = rombelFiltered.some((r) => String(r.id) === String(idRombel))
    if (!ok) setIdRombel('')
  }, [isOpen, idLembaga, rombelFiltered, idRombel])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!idLembaga) {
      setError('Pilih lembaga')
      return
    }
    const rid = parseInt(idRombel, 10)
    const kid = parseInt(idKitab, 10)
    if (!rid || !kid) {
      setError('Pilih rombel dan kitab')
      return
    }

    const payload = {
      id_rombel: rid,
      id_kitab: kid,
      dari: dari?.trim() || null,
      sampai: sampai?.trim() || null,
      keterangan: keterangan?.trim() || null,
      status: status || 'aktif'
    }

    setLoading(true)
    try {
      let res
      if (isEdit) {
        res = await mapelAPI.update(record.id, payload)
      } else {
        res = await mapelAPI.create(payload)
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
            key="mapel-oc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10210]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="mapel-oc-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-[10211] flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mapel-form-title"
          >
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 id="mapel-form-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEdit ? 'Edit Mapel' : 'Tambah Mapel'}
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
                  <label htmlFor="mapel-lembaga" className={labelClass}>
                    Lembaga <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="mapel-lembaga"
                    value={idLembaga}
                    onChange={(e) => {
                      setIdLembaga(e.target.value)
                      setIdRombel('')
                    }}
                    className={selectClass}
                    required
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
                    }}
                  >
                    <option value="">— Pilih lembaga —</option>
                    {lembagaSorted.map((l) => (
                      <option key={l.id} value={String(l.id)}>
                        {l.nama || l.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="mapel-rombel" className={labelClass}>
                    Rombel <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="mapel-rombel"
                    value={idRombel}
                    onChange={(e) => setIdRombel(e.target.value)}
                    className={selectClass}
                    required
                    disabled={!idLembaga}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
                    }}
                  >
                    <option value="">{idLembaga ? '— Pilih rombel —' : '— Pilih lembaga terlebih dahulu —'}</option>
                    {rombelFiltered.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {rombelLabelDalamLembaga(r)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Daftar rombel: <span className="font-medium">aktif saja</span>
                    {isEdit ? '; rombel yang dipilih tetap tampil jika sudah nonaktif.' : '.'} Yang disimpan hanya{' '}
                    <span className="font-medium">id rombel</span>.
                  </p>
                </div>

                <div>
                  <label htmlFor="mapel-kitab" className={labelClass}>
                    Kitab <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="mapel-kitab"
                    value={idKitab}
                    onChange={(e) => setIdKitab(e.target.value)}
                    className={selectClass}
                    required
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
                    }}
                  >
                    <option value="">— Pilih kitab —</option>
                    {kitabSorted.map((k) => (
                      <option key={k.id} value={String(k.id)}>
                        {k.fan ? `${k.nama_indo} (${k.fan})` : k.nama_indo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mapel-dari" className={labelClass}>
                      Dari
                    </label>
                    <input
                      id="mapel-dari"
                      value={dari}
                      onChange={(e) => setDari(e.target.value)}
                      className={inputClass}
                      placeholder="Batas awal"
                    />
                  </div>
                  <div>
                    <label htmlFor="mapel-sampai" className={labelClass}>
                      Sampai
                    </label>
                    <input
                      id="mapel-sampai"
                      value={sampai}
                      onChange={(e) => setSampai(e.target.value)}
                      className={inputClass}
                      placeholder="Batas akhir"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="mapel-status" className={labelClass}>
                    Status
                  </label>
                  <select
                    id="mapel-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={selectClass}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`
                    }}
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="mapel-keterangan" className={labelClass}>
                    Keterangan
                  </label>
                  <textarea
                    id="mapel-keterangan"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
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

export default MapelFormOffcanvas
