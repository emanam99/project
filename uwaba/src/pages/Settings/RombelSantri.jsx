import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Navigate } from 'react-router-dom'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { santriAPI, lembagaAPI, rombelAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'

const TAB_DINIYAH = 'diniyah'
const TAB_FORMAL = 'formal'

function RombelSantri() {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const roleKey = (user?.role_key || user?.level || '').toLowerCase()
  const isSuperAdmin = roleKey === 'super_admin'

  const [activeTab, setActiveTab] = useState(TAB_DINIYAH)
  const [selectedLembaga, setSelectedLembaga] = useState('')
  const [listDiniyah, setListDiniyah] = useState([])
  const [listFormal, setListFormal] = useState([])
  const [lembagaList, setLembagaList] = useState([])
  const [rombelList, setRombelList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showOffcanvas, setShowOffcanvas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCekOffcanvas, setShowCekOffcanvas] = useState(false)
  const [cekRow, setCekRow] = useState(null)
  const [cekMode, setCekMode] = useState(TAB_DINIYAH)
  const [cekSantriList, setCekSantriList] = useState([])
  const [cekLoading, setCekLoading] = useState(false)
  const [formData, setFormData] = useState({
    lembaga_id: '',
    kelas: '',
    kel: '',
    keterangan: '',
    status: 'aktif'
  })

  const fetchDistinct = useCallback(async (mode) => {
    try {
      const res = await santriAPI.getDistinctKelas(mode)
      if (res?.success && Array.isArray(res.data)) return res.data
    } catch (e) {
      console.error('fetchDistinct', e)
    }
    return []
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [diniyah, formal, lembaga, rombel] = await Promise.all([
        fetchDistinct(TAB_DINIYAH),
        fetchDistinct(TAB_FORMAL),
        lembagaAPI.getAll().then((r) => (r?.success && r?.data ? r.data : [])),
        rombelAPI.getAll().then((r) => (r?.success && r?.data ? r.data : []))
      ])
      setListDiniyah(diniyah)
      setListFormal(formal)
      setLembagaList(lembaga)
      setRombelList(rombel)
    } catch (e) {
      showNotification('Gagal memuat data kelas santri', 'error')
    } finally {
      setLoading(false)
    }
  }, [fetchDistinct, showNotification])

  const rombelExists = useCallback(
    (lembagaId, kelas, kel) => {
      if (!lembagaId) return false
      const k = String(kelas ?? '').trim()
      const kl = String(kel ?? '').trim()
      return rombelList.some(
        (r) =>
          String(r.lembaga_id ?? '') === String(lembagaId) &&
          String(r.kelas ?? '').trim() === k &&
          String(r.kel ?? '').trim() === kl
      )
    },
    [rombelList]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (showOffcanvas || showCekOffcanvas) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [showOffcanvas, showCekOffcanvas])

  const handleCek = useCallback(
    async (row) => {
      const mode = activeTab === TAB_DINIYAH ? TAB_DINIYAH : TAB_FORMAL
      setCekRow(row)
      setCekMode(mode)
      setShowCekOffcanvas(true)
      setCekSantriList([])
      setCekLoading(true)
      try {
        const params =
          mode === TAB_DINIYAH
            ? {
                diniyah: (row?.diniyah ?? '').trim(),
                kelas_diniyah: (row?.kelas_diniyah ?? '').trim(),
                kel_diniyah: (row?.kel_diniyah ?? '').trim()
              }
            : {
                formal: (row?.formal ?? '').trim(),
                kelas_formal: (row?.kelas_formal ?? '').trim(),
                kel_formal: (row?.kel_formal ?? '').trim()
              }
        const res = await santriAPI.getByKelas(mode, params)
        if (res?.success && Array.isArray(res.data)) {
          setCekSantriList(res.data)
        } else {
          setCekSantriList([])
        }
      } catch (e) {
        console.error('getByKelas', e)
        showNotification('Gagal memuat data santri', 'error')
        setCekSantriList([])
      } finally {
        setCekLoading(false)
      }
    },
    [activeTab, showNotification]
  )

  const handleCloseCekOffcanvas = useCallback(() => {
    setShowCekOffcanvas(false)
    setCekRow(null)
    setCekSantriList([])
  }, [])

  const closeFormOffcanvas = useOffcanvasBackClose(showOffcanvas, handleCloseOffcanvas)
  const closeCekOffcanvas = useOffcanvasBackClose(showCekOffcanvas, handleCloseCekOffcanvas)

  const cekTitle =
    cekRow && cekMode === TAB_DINIYAH
      ? [cekRow.diniyah, cekRow.kelas_diniyah, cekRow.kel_diniyah].filter(Boolean).join(' / ') || '–'
      : cekRow && cekMode === TAB_FORMAL
        ? [cekRow.formal, cekRow.kelas_formal, cekRow.kel_formal].filter(Boolean).join(' / ') || '–'
        : '–'

  const list = activeTab === TAB_DINIYAH ? listDiniyah : listFormal

  const handleTambah = (row) => {
    if (activeTab === TAB_DINIYAH) {
      setFormData({
        lembaga_id: selectedLembaga || '',
        kelas: (row?.kelas_diniyah ?? '').trim(),
        kel: (row?.kel_diniyah ?? '').trim(),
        keterangan: (row?.diniyah ?? '').trim(),
        status: 'aktif'
      })
    } else {
      setFormData({
        lembaga_id: selectedLembaga || '',
        kelas: (row?.kelas_formal ?? '').trim(),
        kel: (row?.kel_formal ?? '').trim(),
        keterangan: (row?.formal ?? '').trim(),
        status: 'aktif'
      })
    }
    setShowOffcanvas(true)
  }

  const handleCloseOffcanvas = () => {
    setShowOffcanvas(false)
    setFormData({
      lembaga_id: '',
      kelas: '',
      kel: '',
      keterangan: '',
      status: 'aktif'
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.lembaga_id?.trim()) {
      showNotification('Lembaga wajib dipilih', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        lembaga_id: formData.lembaga_id.trim(),
        kelas: (formData.kelas ?? '').trim(),
        kel: (formData.kel ?? '').trim(),
        keterangan: (formData.keterangan ?? '').trim(),
        status: formData.status || 'aktif'
      }
      const res = await rombelAPI.create(payload)
      if (res?.success) {
        showNotification('Rombel berhasil ditambahkan', 'success')
        handleCloseOffcanvas()
        loadData()
      } else {
        showNotification(res?.message || 'Gagal menambahkan rombel', 'error')
      }
    } catch (err) {
      console.error(err)
      showNotification('Gagal menambahkan rombel', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isSuperAdmin) return <Navigate to="/" replace />

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="p-3 sm:p-4 flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Rombel Santri</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Daftar kelas dari data santri (Diniyah & Formal)</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab(TAB_DINIYAH)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === TAB_DINIYAH
            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
        >
          Diniyah
        </button>
        <button
          type="button"
          onClick={() => setActiveTab(TAB_FORMAL)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === TAB_FORMAL
            ? 'border-teal-500 text-teal-600 dark:text-teal-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
        >
          Formal
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Lembaga:</label>
          <select
            value={selectedLembaga}
            onChange={(e) => setSelectedLembaga(e.target.value)}
            className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="">-- Semua Lembaga --</option>
            {lembagaList.map((l) => (
              <option key={l.id} value={l.id}>{l.nama || l.id}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.length === 0 ? (
              <p className="col-span-full text-gray-500 dark:text-gray-400 text-sm py-6">Belum ada data kelas.</p>
            ) : (
              list.map((row, idx) => {
                const lembagaVal = activeTab === TAB_DINIYAH ? (row.diniyah ?? '').trim() : (row.formal ?? '').trim()
                const kelasVal = activeTab === TAB_DINIYAH ? row.kelas_diniyah : row.kelas_formal
                const kelVal = activeTab === TAB_DINIYAH ? row.kel_diniyah : row.kel_formal
                const exists = rombelExists(lembagaVal, kelasVal, kelVal)
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.02 }}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm flex flex-col"
                  >
                    {activeTab === TAB_DINIYAH ? (
                      <>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {[row.diniyah, row.kelas_diniyah, row.kel_diniyah].filter(Boolean).join(' / ') || '–'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {row.jumlah ?? 0} santri
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {[row.formal, row.kelas_formal, row.kel_formal].filter(Boolean).join(' / ') || '–'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {row.jumlah ?? 0} santri
                        </div>
                      </>
                    )}
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-600 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCek(row)}
                        className="text-xs px-2 py-1 border border-teal-600 dark:border-teal-500 text-teal-600 dark:text-teal-400 rounded font-medium hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                      >
                        Cek
                      </button>
                      {exists ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Sudah ada</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleTambah(row)}
                          className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded font-medium transition-colors"
                        >
                          Tambah
                        </button>
                      )}
                    </div>
                  </motion.div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Offcanvas Tambah Rombel — sama persis dengan halaman Rombel */}
      {createPortal(
        <AnimatePresence>
          {showOffcanvas && (
            <>
              <motion.div
                key="rombel-santri-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeFormOffcanvas}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="rombel-santri-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Tambah Rombel</h3>
                  <button
                    type="button"
                    onClick={closeFormOffcanvas}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Lembaga <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.lembaga_id}
                        onChange={(e) => setFormData({ ...formData, lembaga_id: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                      >
                        <option value="">Pilih Lembaga</option>
                        {lembagaList.map((l) => (
                          <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kelas</label>
                      <input
                        type="text"
                        value={formData.kelas}
                        onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Contoh: 1, 2, 3"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kel</label>
                      <input
                        type="text"
                        value={formData.kel}
                        onChange={(e) => setFormData({ ...formData, kel: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Contoh: A, B"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keterangan</label>
                      <textarea
                        value={formData.keterangan}
                        onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Opsional"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formData.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={formData.status === 'aktif'}
                          onClick={() => setFormData({ ...formData, status: formData.status === 'aktif' ? 'nonaktif' : 'aktif' })}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                            formData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                              formData.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={closeFormOffcanvas}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      {saving ? 'Menyimpan...' : 'Tambah'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Offcanvas Cek — data santri dengan kelas tersebut */}
      {createPortal(
        <AnimatePresence>
          {showCekOffcanvas && (
            <>
              <motion.div
                key="cek-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeCekOffcanvas}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="cek-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Santri — {cekTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={closeCekOffcanvas}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {cekLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                    </div>
                  ) : cekSantriList.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Tidak ada santri dengan kelas ini.</p>
                  ) : (
                    <ul className="space-y-1">
                      {cekSantriList.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center gap-3 py-2 px-3 rounded-lg border border-gray-100 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30"
                        >
                          <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-16 shrink-0">{s.nis ?? '–'}</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.nama || '–'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

export default RombelSantri
