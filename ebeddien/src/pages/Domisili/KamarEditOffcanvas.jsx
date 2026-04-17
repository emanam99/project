import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { daerahKamarAPI, daerahKetuaKamarAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'

const normalizeStatus = (s) => {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

const Z = {
  /** Tailwind untuk panel kamar; angka untuk SearchOffcanvas (inline z-index) */
  kamar: {
    mainBd: 'z-[200]',
    mainPn: 'z-[201]',
    ketuaBd: 'z-[202]',
    ketuaPn: 'z-[203]',
    santriPicker: 230
  },
  daerah: {
    mainBd: 'z-[204]',
    mainPn: 'z-[205]',
    ketuaBd: 'z-[206]',
    ketuaPn: 'z-[207]',
    /** Di atas panel ketua + offcanvas daerah terkait (s/d z-[203]) */
    santriPicker: 260
  }
}

/**
 * Offcanvas tambah/edit kamar + nested ketua — dipakai halaman Kamar & Daerah.
 */
export function KamarEditOffcanvas({
  host = 'kamar',
  open,
  onClose,
  editingKamar,
  defaultDaerahId = '',
  daerahList = [],
  tahunAjaranOptions = [],
  onSaved
}) {
  const { showNotification } = useNotification()
  const z = Z[host] || Z.kamar

  const [formData, setFormData] = useState({
    id_daerah: '',
    kamar: '',
    keterangan: '',
    status: 'aktif'
  })
  const [saving, setSaving] = useState(false)
  const [ketuaList, setKetuaList] = useState([])
  const [ketuaOffcanvasOpen, setKetuaOffcanvasOpen] = useState(false)
  const [editingKetua, setEditingKetua] = useState(null)
  const [ketuaFormData, setKetuaFormData] = useState({
    id_ketua_kamar: '',
    tahun_ajaran: '',
    status: 'aktif',
    keterangan: ''
  })
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  /** Ringkasan santri terpilih untuk label (sinkron dengan id_ketua_kamar) */
  const [ketuaSantriPick, setKetuaSantriPick] = useState(null)
  const [savingKetua, setSavingKetua] = useState(false)

  const loadKetuaKamar = useCallback(async (idDaerahKamar) => {
    if (!idDaerahKamar) return
    try {
      const res = await daerahKetuaKamarAPI.getAll({ id_daerah_kamar: idDaerahKamar })
      if (res.success && res.data) setKetuaList(res.data)
    } catch (err) {
      console.error('Error loading ketua kamar:', err)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (editingKamar) {
      setFormData({
        id_daerah: String(editingKamar.id_daerah || ''),
        kamar: editingKamar.kamar || '',
        keterangan: editingKamar.keterangan || '',
        status: editingKamar.status || 'aktif'
      })
    } else {
      setFormData({
        id_daerah: defaultDaerahId || '',
        kamar: '',
        keterangan: '',
        status: 'aktif'
      })
    }
    setKetuaOffcanvasOpen(false)
    setEditingKetua(null)
  }, [open, editingKamar, defaultDaerahId])

  useEffect(() => {
    if (open && editingKamar?.id) {
      loadKetuaKamar(editingKamar.id)
    } else {
      setKetuaList([])
    }
  }, [open, editingKamar?.id, loadKetuaKamar])

  useEffect(() => {
    if (!open) {
      setSantriPickerOpen(false)
      setKetuaSantriPick(null)
    }
  }, [open])

  const handleCloseAll = () => {
    setSantriPickerOpen(false)
    setKetuaSantriPick(null)
    setKetuaOffcanvasOpen(false)
    setEditingKetua(null)
    setKetuaList([])
    setFormData({ id_daerah: '', kamar: '', keterangan: '', status: 'aktif' })
    onClose()
  }

  const handleCloseKetuaOffcanvas = () => {
    setSantriPickerOpen(false)
    setKetuaOffcanvasOpen(false)
    setEditingKetua(null)
    if (editingKamar?.id) loadKetuaKamar(editingKamar.id)
  }

  const handleOpenKetuaOffcanvas = () => {
    setEditingKetua(null)
    setKetuaSantriPick(null)
    setKetuaFormData({
      id_ketua_kamar: '',
      tahun_ajaran: '',
      status: 'aktif',
      keterangan: ''
    })
    setKetuaOffcanvasOpen(true)
  }

  const handleEditKetuaOffcanvas = (row) => {
    setEditingKetua(row)
    setKetuaFormData({
      id_ketua_kamar: String(row.id_ketua_kamar || ''),
      tahun_ajaran: row.tahun_ajaran || '',
      status: row.status || 'aktif',
      keterangan: row.keterangan || ''
    })
    setKetuaSantriPick({
      id: row.id_ketua_kamar,
      nama: row.ketua_nama,
      nis: row.nis
    })
    setKetuaOffcanvasOpen(true)
  }

  const handlePickKetuaSantri = useCallback((santri) => {
    const id = santri?.id
    if (id == null || id === '') return
    setKetuaFormData((prev) => ({ ...prev, id_ketua_kamar: String(id) }))
    setKetuaSantriPick({
      id,
      nama: santri.nama,
      nis: santri.nis
    })
    setSantriPickerOpen(false)
  }, [])

  const handleSubmitKetua = async (e) => {
    e.preventDefault()
    if (!editingKamar?.id) return
    if (!ketuaFormData.id_ketua_kamar) {
      showNotification('Santri (ketua kamar) wajib dipilih', 'error')
      return
    }
    setSavingKetua(true)
    try {
      const payload = {
        id_daerah_kamar: editingKamar.id,
        id_ketua_kamar: Number(ketuaFormData.id_ketua_kamar),
        tahun_ajaran: ketuaFormData.tahun_ajaran || null,
        status: ketuaFormData.status || 'aktif',
        keterangan: ketuaFormData.keterangan || null
      }
      if (editingKetua?.id) {
        const res = await daerahKetuaKamarAPI.update(editingKetua.id, payload)
        if (res.success) {
          showNotification('Ketua kamar berhasil diupdate', 'success')
          handleCloseKetuaOffcanvas()
          loadKetuaKamar(editingKamar.id)
        } else {
          showNotification(res.message || 'Gagal mengupdate ketua kamar', 'error')
        }
      } else {
        const res = await daerahKetuaKamarAPI.create(payload)
        if (res.success) {
          showNotification('Ketua kamar berhasil ditambahkan', 'success')
          handleCloseKetuaOffcanvas()
          loadKetuaKamar(editingKamar.id)
        } else {
          showNotification(res.message || 'Gagal menambahkan ketua kamar', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving ketua kamar:', err)
      showNotification('Terjadi kesalahan saat menyimpan', 'error')
    } finally {
      setSavingKetua(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.id_daerah) {
      showNotification('Daerah wajib diisi', 'error')
      return
    }
    if (!formData.kamar?.trim()) {
      showNotification('Nama kamar wajib diisi', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id_daerah: Number(formData.id_daerah),
        kamar: formData.kamar.trim(),
        keterangan: formData.keterangan || null,
        status: formData.status || 'aktif'
      }
      if (editingKamar) {
        const response = await daerahKamarAPI.update(editingKamar.id, payload)
        if (response.success) {
          showNotification('Kamar berhasil diupdate', 'success')
          handleCloseAll()
          onSaved?.()
        } else {
          showNotification(response.message || 'Gagal mengupdate kamar', 'error')
        }
      } else {
        const response = await daerahKamarAPI.create(payload)
        if (response.success) {
          showNotification('Kamar berhasil ditambahkan', 'success')
          handleCloseAll()
          onSaved?.()
        } else {
          showNotification(response.message || 'Gagal menambahkan kamar', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving kamar:', err)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSetStatusKetua = async (id, status) => {
    try {
      const res = await daerahKetuaKamarAPI.setStatus(id, status)
      if (res.success) {
        showNotification(res.message || 'Status diubah', 'success')
        if (editingKamar?.id) loadKetuaKamar(editingKamar.id)
      } else {
        showNotification(res.message || 'Gagal mengubah status', 'error')
      }
    } catch (err) {
      showNotification('Gagal mengubah status', 'error')
    }
  }

  const ketuaAktif = useMemo(() => ketuaList.filter((k) => normalizeStatus(k.status) === 'aktif'), [ketuaList])
  const ketuaLain = useMemo(() => ketuaList.filter((k) => normalizeStatus(k.status) !== 'aktif'), [ketuaList])
  const ketuaSorted = useMemo(() => [...ketuaAktif, ...ketuaLain], [ketuaAktif, ketuaLain])

  const ketuaSantriLabel = useMemo(() => {
    const id = ketuaFormData.id_ketua_kamar
    if (!id) return ''
    if (ketuaSantriPick != null && String(ketuaSantriPick.id) === String(id)) {
      const n = ketuaSantriPick.nama || '—'
      const nis = ketuaSantriPick.nis != null && ketuaSantriPick.nis !== '' ? ` — NIS ${ketuaSantriPick.nis}` : ''
      return `${n}${nis}`
    }
    return `Santri #${id}`
  }, [ketuaFormData.id_ketua_kamar, ketuaSantriPick])

  return (
    <>
      {createPortal(
        <AnimatePresence>
      {open && (
        <>
          <motion.div
            key={`kamar-edit-bd-${host}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseAll}
            className={`fixed inset-0 bg-black/50 ${z.mainBd}`}
          />
          <motion.div
            key={`kamar-edit-pn-${host}`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className={`fixed right-0 top-0 bottom-0 flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-800 ${z.mainPn}`}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{editingKamar ? 'Edit Kamar' : 'Tambah Kamar'}</h3>
              <button
                type="button"
                onClick={handleCloseAll}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Tutup"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Daerah <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.id_daerah}
                    onChange={(e) => setFormData({ ...formData, id_daerah: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="">Pilih Daerah</option>
                    {daerahList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.kategori} — {d.daerah}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Kamar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.kamar}
                    onChange={(e) => setFormData({ ...formData, kamar: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    placeholder="Nama kamar"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Keterangan</label>
                  <textarea
                    value={formData.keterangan}
                    onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                    placeholder="Opsional"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{formData.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.status === 'aktif'}
                      onClick={() => setFormData({ ...formData, status: formData.status === 'aktif' ? 'nonaktif' : 'aktif' })}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${formData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${formData.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                </div>

                {editingKamar?.id && (
                  <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ketua Kamar</h4>
                      <button
                        type="button"
                        onClick={handleOpenKetuaOffcanvas}
                        className="flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1.5 text-xs text-white transition-colors hover:bg-teal-700"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah
                      </button>
                    </div>
                    <ul className="space-y-0">
                      {ketuaSorted.map((kk) => {
                        const isAktif = kk.status === 'aktif'
                        const bgClass = isAktif ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-gray-100 dark:bg-gray-700'
                        return (
                          <li
                            key={kk.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleEditKetuaOffcanvas(kk)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                handleEditKetuaOffcanvas(kk)
                              }
                            }}
                            className={`relative -ml-px flex cursor-pointer items-start gap-3 rounded py-2 pl-2 hover:ring-1 hover:ring-teal-500/50 ${bgClass}`}
                          >
                            <span
                              className="relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-teal-500 dark:border-gray-800 dark:bg-teal-400"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 pt-0.5">
                              <p className="text-xs text-gray-500 dark:text-gray-400">{kk.tahun_ajaran || '–'}</p>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{kk.ketua_nama || '(Belum diisi)'}</p>
                              {isAktif && (
                                <span className="mt-0.5 inline-block rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                  Aktif
                                </span>
                              )}
                              {!isAktif && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation()
                                    handleSetStatusKetua(kk.id, 'aktif')
                                  }}
                                  className="mt-0.5 text-xs text-teal-600 hover:underline"
                                >
                                  Aktifkan
                                </button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                    {ketuaList.length === 0 && (
                      <p className="py-2 text-xs text-gray-500 dark:text-gray-400">Belum ada ketua kamar.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleCloseAll}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : editingKamar ? 'Simpan Perubahan' : 'Tambah'}
                </button>
              </div>
            </form>
          </motion.div>

          <AnimatePresence>
            {ketuaOffcanvasOpen && (
              <>
                <motion.div
                  key={`ketua-bd-${host}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleCloseKetuaOffcanvas}
                  className={`fixed inset-0 bg-black/50 ${z.ketuaBd}`}
                />
                <motion.div
                  key={`ketua-pn-${host}`}
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'tween', duration: 0.2 }}
                  className={`fixed right-0 top-0 bottom-0 flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-800 ${z.ketuaPn}`}
                >
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                      {editingKetua ? 'Edit Ketua Kamar' : 'Tambah Ketua Kamar'}
                    </h3>
                    <button
                      type="button"
                      onClick={handleCloseKetuaOffcanvas}
                      className="rounded-lg p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                      aria-label="Tutup"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <form onSubmit={handleSubmitKetua} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex-1 space-y-4 overflow-y-auto p-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tahun Ajaran</label>
                        <select
                          value={ketuaFormData.tahun_ajaran}
                          onChange={(e) => setKetuaFormData({ ...ketuaFormData, tahun_ajaran: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                        >
                          <option value="">-- Pilih Tahun Ajaran --</option>
                          {tahunAjaranOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Ketua Kamar (Santri) <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap items-stretch gap-2">
                          <div className="min-h-[42px] min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700">
                            {ketuaFormData.id_ketua_kamar ? (
                              <span className="text-gray-900 dark:text-gray-100">{ketuaSantriLabel}</span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">Belum dipilih — buka Cari santri</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSantriPickerOpen(true)}
                            className="shrink-0 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-500 dark:bg-teal-900/30 dark:text-teal-200 dark:hover:bg-teal-900/50"
                          >
                            Cari santri
                          </button>
                          {ketuaFormData.id_ketua_kamar ? (
                            <button
                              type="button"
                              onClick={() => {
                                setKetuaFormData({ ...ketuaFormData, id_ketua_kamar: '' })
                                setKetuaSantriPick(null)
                              }}
                              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                              title="Hapus pilihan"
                            >
                              Hapus
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {ketuaFormData.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setKetuaFormData({
                                ...ketuaFormData,
                                status: ketuaFormData.status === 'aktif' ? 'nonaktif' : 'aktif'
                              })
                            }
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${ketuaFormData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${ketuaFormData.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'}`}
                            />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Keterangan</label>
                        <textarea
                          value={ketuaFormData.keterangan}
                          onChange={(e) => setKetuaFormData({ ...ketuaFormData, keterangan: e.target.value })}
                          rows={2}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          placeholder="Opsional"
                        />
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={handleCloseKetuaOffcanvas}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={savingKetua}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {savingKetua ? 'Menyimpan...' : editingKetua ? 'Simpan Perubahan' : 'Simpan'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
        </AnimatePresence>,
        document.body
      )}
      {createPortal(
        <SearchOffcanvas
          isOpen={santriPickerOpen}
          onClose={() => setSantriPickerOpen(false)}
          onSelectSantriRecord={handlePickKetuaSantri}
          zIndex={z.santriPicker ?? 260}
        />,
        document.body
      )}
    </>
  )
}
