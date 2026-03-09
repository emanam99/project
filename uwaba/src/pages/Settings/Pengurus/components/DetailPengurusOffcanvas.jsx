import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI, jabatanAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'
import { useAuthStore } from '../../../../store/authStore'
import Modal from '../../../../components/Modal/Modal'

function DetailPengurusOffcanvas({ isOpen, onClose, pengurusId, lembagaList = [], onSuccess }) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const isSuperAdmin = user && (user?.role_key || user?.level || '').toLowerCase() === 'super_admin'
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [userJabatan, setUserJabatan] = useState([])
  const [availableJabatan, setAvailableJabatan] = useState([])
  const [statusSaving, setStatusSaving] = useState(false)
  const [jabatanStatusSavingId, setJabatanStatusSavingId] = useState(null)
  const [showAddJabatanModal, setShowAddJabatanModal] = useState(false)
  const [newJabatan, setNewJabatan] = useState({
    jabatan_id: '',
    lembaga_id: '',
    tanggal_mulai: '',
    tanggal_selesai: '',
    status: 'aktif'
  })

  useEffect(() => {
    if (!isOpen) {
      setShowAddJabatanModal(false)
    }
    if (!isOpen || !pengurusId) {
      setDetail(null)
      setUserJabatan([])
      return
    }
    let cancelled = false
    setLoading(true)
    manageUsersAPI.getById(pengurusId).then((res) => {
      if (cancelled) return
      if (res.success && res.data?.user) {
        const u = res.data.user
        setDetail(u)
        const rawJabatan = Array.isArray(u.jabatan) ? u.jabatan : []
        const normalized = rawJabatan.map((j) => {
          const s = (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? '').toString().trim().toLowerCase()
          return { ...j, jabatan_status: (s === 'aktif' || s === 'active') ? 'aktif' : 'nonaktif' }
        })
        setUserJabatan(normalized)
      } else {
        setDetail(null)
        setUserJabatan([])
      }
    }).catch(() => {
      if (!cancelled) {
        setDetail(null)
        setUserJabatan([])
        showNotification('Gagal memuat data pengurus', 'error')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
    // Hanya load ulang saat buka/tutup atau ganti pengurus; tidak saat parent re-render
  }, [isOpen, pengurusId])

  useEffect(() => {
    if (!isOpen) return
    jabatanAPI.getList({ status: 'aktif' }).then((res) => {
      if (res.success && Array.isArray(res.data)) setAvailableJabatan(res.data)
      else setAvailableJabatan([])
    }).catch(() => setAvailableJabatan([]))
  }, [isOpen])

  const displayStatus = detail?.status?.toLowerCase()
  const isActive = displayStatus === 'active' || displayStatus === 'aktif'

  const handleStatusToggle = async () => {
    if (!pengurusId || statusSaving || !detail) return
    const newStatus = isActive ? 'inactive' : 'active'
    setStatusSaving(true)
    try {
      const updateData = {
        nama: (detail.nama || '').trim(),
        whatsapp: (detail.whatsapp || detail.no_wa || '').trim(),
        status: newStatus,
        roles: detail.roles || []
      }
      const res = await manageUsersAPI.update(pengurusId, updateData)
      if (res.success) {
        setDetail((prev) => (prev ? { ...prev, status: newStatus } : null))
        showNotification('Status berhasil diperbarui', 'success')
        onSuccess?.()
      } else {
        showNotification(res.message || 'Gagal memperbarui status', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal memperbarui status', 'error')
    } finally {
      setStatusSaving(false)
    }
  }

  const handleAddJabatan = async () => {
    if (!pengurusId || !newJabatan.lembaga_id || !newJabatan.jabatan_id) {
      showNotification('Pilih lembaga dan jabatan', 'error')
      return
    }
    try {
      const res = await manageUsersAPI.addUserJabatan(pengurusId, newJabatan)
      if (res.success) {
        const again = await manageUsersAPI.getById(pengurusId)
        if (again.success && again.data?.user?.jabatan) {
          setUserJabatan(again.data.user.jabatan)
        }
        setShowAddJabatanModal(false)
        setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
        showNotification('Jabatan berhasil ditambahkan', 'success')
        onSuccess?.()
      } else {
        showNotification(res.message || 'Gagal menambahkan jabatan', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menambahkan jabatan', 'error')
    }
  }

  const handleJabatanStatusToggle = async (pengurusJabatanId, currentStatus) => {
    if (!pengurusId || jabatanStatusSavingId !== null) return
    const statusNorm = (currentStatus || '').toString().trim().toLowerCase()
    const newStatus = (statusNorm === 'aktif' || statusNorm === 'active') ? 'nonaktif' : 'aktif'
    const idKey = Number(pengurusJabatanId)
    if (!idKey) return
    setJabatanStatusSavingId(pengurusJabatanId)
    try {
      const res = await manageUsersAPI.updateJabatanStatus(pengurusId, idKey, newStatus)
      if (res.success) {
        setUserJabatan((prev) =>
          prev.map((j) =>
            Number(j.pengurus_jabatan_id) === idKey ? { ...j, jabatan_status: newStatus } : j
          )
        )
        showNotification('Status jabatan berhasil diperbarui', 'success')
        // Tidak panggil onSuccess agar list tidak di-reload dan offcanvas tidak re-render/reload
      } else {
        showNotification(res.message || 'Gagal memperbarui status jabatan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal memperbarui status jabatan', 'error')
    } finally {
      setJabatanStatusSavingId(null)
    }
  }

  const handleRemoveJabatan = async (pengurusJabatanId) => {
    if (!window.confirm('Hapus jabatan ini?')) return
    const idKey = Number(pengurusJabatanId)
    if (!idKey) return
    try {
      const res = await manageUsersAPI.removeUserJabatan(pengurusId, idKey)
      if (res.success) {
        setUserJabatan((prev) => prev.filter((j) => Number(j.pengurus_jabatan_id) !== idKey))
        showNotification('Jabatan berhasil dihapus', 'success')
        onSuccess?.()
      } else {
        showNotification(res.message || 'Gagal menghapus jabatan', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menghapus jabatan', 'error')
    }
  }

  const verifikasiEmail = detail?.email_verified_at
  const verifikasiWa = detail?.no_wa_verified_at
  const verifikasiTerakhir = [verifikasiEmail, verifikasiWa]
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
  const verifikasiTerakhirStr =
    verifikasiTerakhir.length > 0
      ? new Date(Math.max(...verifikasiTerakhir)).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
      : '-'

  const getLembagaNama = (id) => (lembagaList || []).find((l) => String(l.id) === String(id))?.nama || id

  const [showPortal, setShowPortal] = useState(false)
  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  if (!isOpen && !showPortal) return null

  const content = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && (
        <>
      <motion.div
        key="detail-pengurus-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-[200]"
      />
      <motion.div
        key="detail-pengurus-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.2 }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Detail Pengurus</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
            </div>
          ) : !detail ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Data tidak ditemukan.</p>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Nama</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{detail.nama || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Username</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{detail.username ?? '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Email</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{detail.email ?? detail.email_user ?? '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">WA</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{detail.whatsapp ?? detail.no_wa ?? '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Verifikasi terakhir</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{verifikasiTerakhirStr}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Jabatan</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
                      setShowAddJabatanModal(true)
                    }}
                    className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    + Tambah Jabatan
                  </button>
                </div>
                {userJabatan.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Belum ada jabatan.</p>
                ) : (
                  <ul className="space-y-2">
                    {userJabatan.map((j) => {
                      const jabatanInfo = availableJabatan.find((x) => x.id === j.jabatan_id)
                      const rawStatus = (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? '').toString().trim().toLowerCase()
                      const isJabatanAktif = rawStatus === 'aktif' || rawStatus === 'active'
                      const saving = Number(jabatanStatusSavingId) === Number(j.pengurus_jabatan_id)
                      return (
                        <li
                          key={j.pengurus_jabatan_id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
                        >
                          <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0 flex-1">
                            {jabatanInfo ? jabatanInfo.nama : j.jabatan_nama || `Jabatan #${j.jabatan_id}`}
                            {j.lembaga_id && (
                              <span className="text-gray-500 dark:text-gray-400 ml-1">
                                ({getLembagaNama(j.lembaga_id)})
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {saving ? '...' : (isJabatanAktif ? 'Aktif' : 'Nonaktif')}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isJabatanAktif}
                              disabled={saving}
                              onClick={() => handleJabatanStatusToggle(j.pengurus_jabatan_id, j.jabatan_status || '')}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                                isJabatanAktif ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                                  isJabatanAktif ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleRemoveJabatan(j.pengurus_jabatan_id)}
                                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                aria-label="Hapus jabatan"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    disabled={statusSaving}
                    onClick={handleStatusToggle}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        isActive ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {isActive ? 'Aktif' : 'Tidak Aktif'}
                  {statusSaving && ' · Menyimpan...'}
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
        </>
      )}

      <Modal
        isOpen={showAddJabatanModal}
        onClose={() => {
          setShowAddJabatanModal(false)
          setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
        }}
        title="Tambah Jabatan"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Lembaga *</label>
            <select
              value={newJabatan.lembaga_id}
              onChange={(e) => setNewJabatan({ ...newJabatan, lembaga_id: e.target.value, jabatan_id: '' })}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="">-- Pilih Lembaga --</option>
              {(lembagaList || []).map((lem) => (
                <option key={lem.id} value={lem.id}>{lem.nama || lem.id}</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Jabatan *</label>
            <select
              value={newJabatan.jabatan_id}
              onChange={(e) => setNewJabatan({ ...newJabatan, jabatan_id: e.target.value })}
              disabled={!newJabatan.lembaga_id}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              <option value="">
                {newJabatan.lembaga_id ? '-- Pilih Jabatan --' : '-- Pilih Lembaga dulu --'}
              </option>
              {availableJabatan
                .filter(
                  (j) =>
                    (j.lembaga_id === newJabatan.lembaga_id || !j.lembaga_id) &&
                    !userJabatan.some((uj) => uj.jabatan_id === j.id && uj.jabatan_status === 'aktif')
                )
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama} {j.kategori ? `(${j.kategori})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tanggal Mulai</label>
              <input
                type="date"
                value={newJabatan.tanggal_mulai}
                onChange={(e) => setNewJabatan({ ...newJabatan, tanggal_mulai: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tanggal Selesai</label>
              <input
                type="date"
                value={newJabatan.tanggal_selesai}
                onChange={(e) => setNewJabatan({ ...newJabatan, tanggal_selesai: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-200"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setShowAddJabatanModal(false)
                setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleAddJabatan}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Tambah
            </button>
          </div>
        </div>
      </Modal>
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}

export default DetailPengurusOffcanvas
