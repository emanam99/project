import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ugtLaporanKoordinatorAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { useUgtLaporanFormKonteks } from '../../../hooks/useUgtLaporanFormKonteks'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import UgtLaporanFormCoreFields from './UgtLaporanFormCoreFields'
import UgtLaporanMasalahFields from './UgtLaporanMasalahFields'
import LaporanKoordinatorFotoGallery from './LaporanKoordinatorFotoGallery'
import LaporanReadonlyOffcanvas from './LaporanReadonlyOffcanvas'
import {
  emptyMasalahRow,
  mapApiMasalahToItems,
  buildMasalahListPayload
} from '../../../utils/ugtLaporanMasalah'

function emptyForm() {
  return {
    id_madrasah: '',
    id_santri: '',
    santriSearch: '',
    santriLabel: '',
    id_tahun_ajaran: '',
    bulan: 0,
    usulan: ''
  }
}

function rowToForm(row) {
  return {
    id_madrasah: String(row.id_madrasah ?? ''),
    id_santri: String(row.id_santri ?? ''),
    santriSearch: '',
    santriLabel: [row.santri_nama, row.santri_nis].filter(Boolean).join(' — ') || `ID ${row.id_santri}`,
    id_tahun_ajaran: row.id_tahun_ajaran ?? '',
    bulan: Number(row.bulan) || 1,
    usulan: row.usulan ?? ''
  }
}

/**
 * Offcanvas kanan: tambah/edit laporan koordinator UGT (foto + kompresi, mirip form madrasah).
 */
export default function LaporanKoordinatorOffcanvas({
  isOpen,
  onClose,
  initialData,
  madrasahList,
  onSuccess,
  readOnly = false
}) {
  const { showNotification } = useNotification()
  const taOptions = useTahunAjaranStore((s) => s.options)

  const handleClose = useOffcanvasBackClose(isOpen, onClose, { urlManaged: true })

  const [form, setForm] = useState(() => emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [fotoList, setFotoList] = useState([])
  const [masalahItems, setMasalahItems] = useState(() => [emptyMasalahRow()])

  const isEdit = Boolean(initialData?.id)

  const konteks = useUgtLaporanFormKonteks({
    isOpen,
    isEdit,
    idMadrasah: form.id_madrasah,
    idTahunAjaran: form.id_tahun_ajaran,
    setForm,
    showNotification,
    getSantriOptions: ugtLaporanKoordinatorAPI.getSantriOptions
  })

  const selectCls =
    'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm'
  const clearSantriState = konteks.clearSantriState

  useEffect(() => {
    if (!isOpen) return
    if (initialData?.id) {
      setForm(rowToForm(initialData))
    } else {
      setForm(emptyForm())
      clearSantriState()
      setFotoList([])
    }
  }, [isOpen, initialData, clearSantriState])

  useEffect(() => {
    if (!isOpen) return
    if (!initialData?.id) {
      setMasalahItems([emptyMasalahRow()])
      return
    }
    if (Array.isArray(initialData.masalah)) {
      setMasalahItems(mapApiMasalahToItems(initialData.masalah))
      return
    }
    let cancelled = false
    ugtLaporanKoordinatorAPI.getById(initialData.id)
      .then((res) => {
        if (cancelled || !res?.success || !res.data) return
        setMasalahItems(mapApiMasalahToItems(res.data.masalah))
      })
      .catch(() => {
        if (!cancelled) setMasalahItems([emptyMasalahRow()])
      })
    return () => { cancelled = true }
  }, [isOpen, initialData?.id, initialData?.masalah])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
  }, [isOpen])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const idM = parseInt(form.id_madrasah, 10)
    const idS = parseInt(form.id_santri, 10)
    const ta = (form.id_tahun_ajaran || '').trim()
    const bulan = Number(form.bulan)
    if (!idM || !idS || !ta || bulan < 1 || bulan > 12) {
      showNotification('Lengkapi madrasah, santri, tahun ajaran, dan bulan (1–12).', 'error')
      return
    }
    setSaving(true)
    try {
      const masalah_list = buildMasalahListPayload(masalahItems)

      const payload = {
        id_madrasah: idM,
        id_santri: idS,
        id_tahun_ajaran: ta,
        bulan,
        usulan: (form.usulan || '').trim() || null,
        foto_list: fotoList,
        masalah_list
      }
      let res
      if (isEdit) {
        res = await ugtLaporanKoordinatorAPI.update(initialData.id, payload)
      } else {
        res = await ugtLaporanKoordinatorAPI.create(payload)
      }
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        onSuccess?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit || !initialData?.id) return
    if (!window.confirm('Hapus laporan ini? Tindakan tidak dapat dibatalkan.')) return
    setDeleting(true)
    try {
      const res = await ugtLaporanKoordinatorAPI.remove(initialData.id)
      if (res?.success) {
        showNotification(res.message || 'Terhapus', 'success')
        onSuccess?.()
        handleClose()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menghapus', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (readOnly && isEdit) {
    return (
      <LaporanReadonlyOffcanvas
        isOpen={isOpen}
        onClose={onClose}
        initialData={initialData}
        jenis="koordinator"
      />
    )
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="lap-koord-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="lap-koord-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
          >
            <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Kembali"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">
                {isEdit ? 'Edit Laporan Koordinator' : 'Tambah Laporan Koordinator'}
              </h3>
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
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isEdit && (initialData?.pembuat_nama || initialData?.id_pembuat) ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                    Dibuat oleh:{' '}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {(initialData.pembuat_nama || '').trim() || `Pengurus #${initialData.id_pembuat}`}
                    </span>
                  </p>
                ) : null}

                <UgtLaporanFormCoreFields
                  isEdit={isEdit}
                  form={form}
                  setForm={setForm}
                  madrasahList={madrasahList}
                  konteks={konteks}
                  selectCls={selectCls}
                  taOptions={taOptions}
                />


                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usulan</label>
                  <textarea
                    value={form.usulan}
                    onChange={(e) => setForm((p) => ({ ...p, usulan: e.target.value }))}
                    rows={4}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Catatan / usulan koordinator..."
                  />
                </div>

                <UgtLaporanMasalahFields items={masalahItems} onChange={setMasalahItems} />

                <LaporanKoordinatorFotoGallery
                  isOpen={isOpen}
                  initialData={initialData}
                  onChange={setFotoList}
                  onNotify={showNotification}
                />
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 flex-shrink-0">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving || deleting}
                    className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                  >
                    {saving ? 'Menyimpan...' : isEdit ? 'Simpan' : 'Simpan'}
                  </button>
                </div>
                {isEdit && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving || deleting}
                    className="w-full px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    {deleting ? 'Menghapus...' : 'Hapus laporan'}
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
