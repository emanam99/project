import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI, jabatanAPI } from '../../services/api'
import api from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import ExportPengurusOffcanvas from '../Settings/Pengurus/components/ExportPengurusOffcanvas'
import CariPengurusOffcanvas from '../../components/CariPengurusOffcanvas'
import Modal from '../../components/Modal/Modal'

// Koordinator: role key yang dianggap "koordinator" (case-insensitive)
const KOORDINATOR_ROLE_KEYS = ['koordinator_ugt', 'koordinator']

function isCoordinatorRole(role) {
  const key = (role?.role_key || role?.key || role?.role_label || role?.label || '').toLowerCase()
  return KOORDINATOR_ROLE_KEYS.some((k) => key.includes(k))
}

function formatAlamat(p) {
  if (!p) return ''
  const parts = [
    p.dusun,
    p.rt ? `RT ${p.rt}` : '',
    p.rw ? `RW ${p.rw}` : '',
    p.desa,
    p.kecamatan,
    p.kabupaten,
    p.provinsi,
    p.kode_pos
  ].filter(Boolean)
  return parts.join(', ') || '-'
}

// Offcanvas edit cepat: nama, alamat, WA & username, jabatan (tambah/status/hapus), reset password, login aktif, nonaktifkan
function EditKoordinatorOffcanvas({
  isOpen,
  onClose,
  pengurus,
  userInfo,
  userInfoLoading,
  onNonaktifkan,
  removing,
  onResetPassword,
  resettingPassword,
  sessions = [],
  sessionsLoading,
  lembagaList = [],
  onSuccess
}) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const isSuperAdmin = user && (user?.role_key || user?.level || '').toLowerCase() === 'super_admin'

  const [userJabatan, setUserJabatan] = useState([])
  const [availableJabatan, setAvailableJabatan] = useState([])
  const [showAddJabatanModal, setShowAddJabatanModal] = useState(false)
  const [newJabatan, setNewJabatan] = useState({
    jabatan_id: '',
    lembaga_id: '',
    tanggal_mulai: '',
    tanggal_selesai: '',
    status: 'aktif'
  })
  const [jabatanStatusSavingId, setJabatanStatusSavingId] = useState(null)

  useEffect(() => {
    if (!isOpen) setShowAddJabatanModal(false)
    if (!isOpen || !pengurus?.id) {
      setUserJabatan([])
      return
    }
    let cancelled = false
    manageUsersAPI.getById(pengurus.id).then((res) => {
      if (cancelled) return
      if (res.success && res.data?.user?.jabatan) {
        setUserJabatan(Array.isArray(res.data.user.jabatan) ? res.data.user.jabatan : [])
      } else {
        setUserJabatan(Array.isArray(pengurus.jabatan) ? pengurus.jabatan : [])
      }
    }).catch(() => {
      if (!cancelled) setUserJabatan(Array.isArray(pengurus.jabatan) ? pengurus.jabatan : [])
    })
    return () => { cancelled = true }
  }, [isOpen, pengurus?.id, pengurus?.jabatan])

  useEffect(() => {
    if (!isOpen) return
    jabatanAPI.getList({ status: 'aktif' }).then((res) => {
      if (res.success && Array.isArray(res.data)) setAvailableJabatan(res.data)
      else setAvailableJabatan([])
    }).catch(() => setAvailableJabatan([]))
  }, [isOpen])

  const handleAddJabatan = useCallback(async () => {
    if (!pengurus?.id || !newJabatan.lembaga_id || !newJabatan.jabatan_id) {
      showNotification('Pilih lembaga dan jabatan', 'error')
      return
    }
    try {
      const res = await manageUsersAPI.addUserJabatan(pengurus.id, newJabatan)
      if (res.success) {
        const again = await manageUsersAPI.getById(pengurus.id)
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
  }, [pengurus?.id, newJabatan, showNotification, onSuccess])

  const handleJabatanStatusToggle = useCallback(async (pengurusJabatanId, currentStatus) => {
    if (!pengurus?.id || jabatanStatusSavingId !== null) return
    const newStatus = (currentStatus || '').toLowerCase() === 'aktif' ? 'nonaktif' : 'aktif'
    setJabatanStatusSavingId(pengurusJabatanId)
    try {
      const res = await manageUsersAPI.updateJabatanStatus(pengurus.id, pengurusJabatanId, newStatus)
      if (res.success) {
        setUserJabatan((prev) =>
          prev.map((j) =>
            j.pengurus_jabatan_id === pengurusJabatanId ? { ...j, jabatan_status: newStatus } : j
          )
        )
        showNotification('Status jabatan berhasil diperbarui', 'success')
        onSuccess?.()
      } else {
        showNotification(res.message || 'Gagal memperbarui status jabatan', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal memperbarui status jabatan', 'error')
    } finally {
      setJabatanStatusSavingId(null)
    }
  }, [pengurus?.id, jabatanStatusSavingId, showNotification, onSuccess])

  const handleRemoveJabatan = useCallback(async (pengurusJabatanId) => {
    if (!window.confirm('Hapus jabatan ini?')) return
    try {
      const res = await manageUsersAPI.removeUserJabatan(pengurus.id, pengurusJabatanId)
      if (res.success) {
        setUserJabatan((prev) => prev.filter((j) => j.pengurus_jabatan_id !== pengurusJabatanId))
        showNotification('Jabatan berhasil dihapus', 'success')
        onSuccess?.()
      } else {
        showNotification(res.message || 'Gagal menghapus jabatan', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menghapus jabatan', 'error')
    }
  }, [pengurus?.id, showNotification, onSuccess])

  const getLembagaNama = (id) => (lembagaList || []).find((l) => String(l.id) === String(id))?.nama || id

  if (!isOpen) return null
  const nama = pengurus?.nama || '-'
  const alamat = formatAlamat(pengurus)
  const usernameFromUsers = userInfo?.username != null ? String(userInfo.username).trim() : ''
  const noWaFromUsers = userInfo?.no_wa != null ? String(userInfo.no_wa).trim() : ''
  const hasUsername = usernameFromUsers !== ''
  const usernameDisplay = hasUsername ? `@${usernameFromUsers}` : '–'
  const waDisplay = noWaFromUsers || pengurus?.whatsapp || '–'

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-[100000]"
        aria-hidden="true"
      />
      <motion.div
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="fixed inset-y-0 right-0 w-full sm:w-96 max-w-full bg-white dark:bg-gray-800 shadow-xl flex flex-col z-[100001]"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-teal-600 dark:text-teal-400">Edit Cepat</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Tutup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nama</label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{nama}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Username (tabel users)</label>
            {userInfoLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
            ) : (
              <>
                <p className="text-sm text-gray-900 dark:text-gray-100">{usernameDisplay}</p>
                {!hasUsername && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Belum mengaktifkan aplikasi.</p>
                )}
              </>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">WhatsApp (tabel users)</label>
            {userInfoLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
            ) : (
              <p className="text-sm text-gray-900 dark:text-gray-100">{waDisplay}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Alamat</label>
            <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{alamat}</p>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Jabatan</label>
              <button
                type="button"
                onClick={() => {
                  setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
                  setShowAddJabatanModal(true)
                }}
                className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
              >
                + Tambah Jabatan
              </button>
            </div>
            {userJabatan.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 py-1">Belum ada jabatan.</p>
            ) : (
              <ul className="space-y-2">
                {userJabatan.map((j) => {
                  const jabatanInfo = availableJabatan.find((x) => x.id === j.jabatan_id)
                  const isJabatanAktif = (j.jabatan_status || '').toLowerCase() === 'aktif'
                  const saving = jabatanStatusSavingId === j.pengurus_jabatan_id
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
                          onClick={() => handleJabatanStatusToggle(j.pengurus_jabatan_id, j.jabatan_status)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                            isJabatanAktif ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
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

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Reset password (jika lupa)</label>
            {hasUsername ? (
              <button
                type="button"
                onClick={() => onResetPassword?.(pengurus)}
                disabled={resettingPassword}
                className="w-full py-2 px-4 rounded-lg text-sm font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {resettingPassword ? 'Mengirim...' : 'Kirim link reset password via WA'}
              </button>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Aktifkan akun terlebih dahulu (admin mengaktifkan aplikasi untuk pengurus ini).</p>
            )}
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Login aktif</label>
            {!hasUsername ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada (akun belum diaktifkan).</p>
            ) : sessionsLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada session aktif.</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 text-sm"
                  >
                    <span className="min-w-0 truncate text-gray-800 dark:text-gray-200">
                      {s.current && <span className="text-teal-600 dark:text-teal-400 font-medium mr-2">Perangkat ini</span>}
                      {s.device_type || '–'} · {s.browser_name || '–'}
                      {s.os_name ? ` · ${s.os_name}` : ''}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                      {s.last_activity_at ? new Date(s.last_activity_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '–'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => onNonaktifkan?.(pengurus)}
            disabled={removing}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {removing ? 'Memproses...' : 'Nonaktifkan (hapus role koordinator)'}
          </button>
        </div>
      </motion.div>

      <Modal
        isOpen={showAddJabatanModal}
        onClose={() => {
          setShowAddJabatanModal(false)
          setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
        }}
        title="Tambah Jabatan"
        maxWidth="max-w-md"
        zIndex={100002}
      >
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Lembaga *</label>
            <select
              value={newJabatan.lembaga_id}
              onChange={(e) => setNewJabatan({ ...newJabatan, lembaga_id: e.target.value, jabatan_id: '' })}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
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
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              <option value="">
                {newJabatan.lembaga_id ? '-- Pilih Jabatan --' : '-- Pilih Lembaga dulu --'}
              </option>
              {availableJabatan
                .filter(
                  (j) =>
                    (j.lembaga_id === newJabatan.lembaga_id || !j.lembaga_id) &&
                    !userJabatan.some((uj) => uj.jabatan_id === j.id && (uj.jabatan_status || '').toLowerCase() === 'aktif')
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
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              Tambah
            </button>
          </div>
        </div>
      </Modal>
    </AnimatePresence>
  )
}

// Section: Cari + Menu (Tambah, Export) + Filter
const SearchAndFilterSection = memo(({
  searchInput,
  onSearchInputChange,
  onSearchInputFocus,
  onSearchInputBlur,
  isInputFocused,
  isFilterOpen,
  onFilterToggle,
  onTambahClick,
  onExportClick,
  statusFilter,
  onStatusFilterChange
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            className="w-full p-2 pr-28 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari ID, nama, atau email..."
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <div ref={menuRef} className="relative pointer-events-auto">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors"
                title="Menu"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Menu
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 py-1 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-50"
                  >
                    <button
                      onClick={() => { onTambahClick?.(); setMenuOpen(false) }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Tambah
                    </button>
                    <button
                      onClick={() => { onExportClick(); setMenuOpen(false) }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={onFilterToggle}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
              title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
              </svg>
              {isFilterOpen ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
        <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="px-4 py-2">
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Status:</span>
                <select
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak Aktif</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

SearchAndFilterSection.displayName = 'SearchAndFilterSection'

const KoordinatorListItem = memo(({ pengurus, index, onClick, getStatusBadgeColor, getStatusDisplayName, lembagaList }) => {
  const roles = pengurus.roles || []
  const jabatanList = pengurus.jabatan || []
  const getLembagaNama = (id) => (lembagaList || []).find((l) => String(l.id) === String(id))?.nama || id

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      onClick={() => onClick(pengurus)}
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-all duration-200 group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {pengurus.nama || '-'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            NIP: {pengurus.nip ?? pengurus.id} {pengurus.email ? ` · ${pengurus.email}` : ''} {pengurus.whatsapp ? ` · ${pengurus.whatsapp}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {roles.length > 0 ? (
              roles.map((r) => (
                <span key={r.role_id || r.role_label} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {r.role_label || r.role_key || r.role_id}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">Belum memiliki role</span>
            )}
          </div>
          {jabatanList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {jabatanList.map((j, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                  {j.lembaga_id ? `${j.jabatan_nama || '-'} (${getLembagaNama(j.lembaga_id)})` : (j.jabatan_nama || '-')}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pengurus.status && (
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeColor(pengurus.status)}`}>
              {getStatusDisplayName(pengurus.status)}
            </span>
          )}
          <svg className="w-5 h-5 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.div>
  )
})

KoordinatorListItem.displayName = 'KoordinatorListItem'

function Koordinator() {
  const [allKoordinator, setAllKoordinator] = useState([])
  const [filteredKoordinator, setFilteredKoordinator] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [lembagaList, setLembagaList] = useState([])
  const [coordinatorRoleId, setCoordinatorRoleId] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [showExportOffcanvas, setShowExportOffcanvas] = useState(false)
  const [showCariPengurusOffcanvas, setShowCariPengurusOffcanvas] = useState(false)
  const [addingRole, setAddingRole] = useState(false)
  const [selectedKoordinator, setSelectedKoordinator] = useState(null)
  const [removingRole, setRemovingRole] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [sessionsList, setSessionsList] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  /** Username & no_wa dari tabel users (di-fetch saat offcanvas dibuka via getById) */
  const [selectedKoordinatorUserInfo, setSelectedKoordinatorUserInfo] = useState(null)
  /** users.id (id_user) untuk panggilan getSessionsForUser - endpoint pakai users.id bukan pengurus.id */
  const [selectedKoordinatorUserId, setSelectedKoordinatorUserId] = useState(null)
  const [userInfoLoading, setUserInfoLoading] = useState(false)
  const navigate = useNavigate()
  const { showNotification } = useNotification()

  useEffect(() => {
    const loadLembaga = async () => {
      try {
        const lembagaResponse = await api.get('/lembaga')
        if (lembagaResponse.data?.success) {
          setLembagaList(lembagaResponse.data.data || [])
        }
      } catch (err) {
        console.error('Error loading lembaga:', err)
      }
    }
    loadLembaga()
  }, [])

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const rolesResponse = await manageUsersAPI.getRolesList()
        if (rolesResponse?.success && Array.isArray(rolesResponse.data)) {
          const coord = rolesResponse.data.find((r) => isCoordinatorRole(r))
          if (coord?.id != null) setCoordinatorRoleId(coord.id)
        }
      } catch (err) {
        console.error('Error loading roles:', err)
      }
    }
    loadRoles()
  }, [])

  const loadKoordinator = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Anda belum login. Silakan login terlebih dahulu.')
        return
      }
      const filterParams = { limit: 10000 }
      if (coordinatorRoleId) filterParams.role_id = coordinatorRoleId
      if (statusFilter) filterParams.status = statusFilter
      const response = await manageUsersAPI.getAll(filterParams)
      if (response.success) {
        let users = response.data?.users || []
        if (!coordinatorRoleId) {
          users = users.filter((u) => (u.roles || []).some(isCoordinatorRole))
        }
        setAllKoordinator(users)
      } else {
        setError(response.message || 'Gagal memuat data koordinator')
      }
    } catch (err) {
      console.error('Error loading koordinator:', err)
      if (err.response?.status === 401) {
        setError('Sesi Anda telah berakhir. Silakan login kembali.')
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else if (err.response?.status === 403) {
        setError('Anda tidak memiliki izin untuk mengakses halaman ini.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data koordinator')
      }
    } finally {
      setLoading(false)
    }
  }, [coordinatorRoleId, statusFilter])

  useEffect(() => {
    loadKoordinator()
  }, [loadKoordinator])

  // Fetch username & no_wa dari tabel users: pakai user_id dari list atau getById -> getByIdV2(users.id)
  useEffect(() => {
    if (!selectedKoordinator?.id) {
      setSelectedKoordinatorUserInfo(null)
      setSelectedKoordinatorUserId(null)
      setUserInfoLoading(false)
      return
    }
    let cancelled = false
    setUserInfoLoading(true)
    setSelectedKoordinatorUserInfo(null)
    setSelectedKoordinatorUserId(null)

    const fetchUserInfo = (userId) => {
      if (userId == null) return Promise.resolve(null)
      if (!cancelled) setSelectedKoordinatorUserId(userId)
      return manageUsersAPI.getByIdV2(userId).then((v2Res) => {
        if (cancelled) return null
        const u = v2Res?.data?.user
        if (u) return { username: (u.username ?? '').trim(), no_wa: (u.no_wa ?? '').trim() }
        return { username: '', no_wa: '' }
      })
    }

    const user_id_from_list = selectedKoordinator.user_id ?? selectedKoordinator.users_id ?? selectedKoordinator.id_user
    if (user_id_from_list != null) {
      fetchUserInfo(user_id_from_list)
        .then((info) => { if (!cancelled && info) setSelectedKoordinatorUserInfo(info) })
        .catch(() => { if (!cancelled) setSelectedKoordinatorUserInfo({ username: '', no_wa: '' }) })
        .finally(() => { if (!cancelled) setUserInfoLoading(false) })
    } else {
      manageUsersAPI.getById(selectedKoordinator.id)
        .then((res) => {
          if (cancelled) return
          const d = res?.data ?? {}
          const pengurusRow = d.user ?? d
          const user_id = pengurusRow?.id_user ?? pengurusRow?.user_id ?? d?.id_user ?? d?.user_id ?? pengurusRow?.users_id ?? d?.users_id
          if (user_id != null) {
            return fetchUserInfo(user_id).then((info) => {
              if (!cancelled && info) setSelectedKoordinatorUserInfo(info)
            })
          }
          const usersRow = d.users ?? d.account ?? d.user_account ?? pengurusRow
          const username = (usersRow?.username ?? usersRow?.user_username ?? pengurusRow?.username ?? '').trim()
          const no_wa = (usersRow?.no_wa ?? usersRow?.user_no_wa ?? pengurusRow?.no_wa ?? pengurusRow?.whatsapp ?? '').trim()
          setSelectedKoordinatorUserInfo({ username, no_wa })
        })
        .catch(() => {
          if (!cancelled) setSelectedKoordinatorUserInfo({ username: '', no_wa: '' })
        })
        .finally(() => {
          if (!cancelled) setUserInfoLoading(false)
        })
    }
    return () => { cancelled = true }
  }, [selectedKoordinator?.id, selectedKoordinator?.id_user, selectedKoordinator?.user_id, selectedKoordinator?.users_id])

  useEffect(() => {
    if (!selectedKoordinator?.id) {
      setSessionsList([])
      setSessionsLoading(false)
      return
    }
    const username = selectedKoordinatorUserInfo?.username ?? selectedKoordinator?.username
    const hasUsername = username != null && String(username).trim() !== ''
    const userIdForSessions = selectedKoordinatorUserId ?? selectedKoordinator?.id_user ?? selectedKoordinator?.user_id ?? selectedKoordinator?.users_id
    if (!hasUsername || userIdForSessions == null) {
      setSessionsList([])
      setSessionsLoading(false)
      return
    }
    let cancelled = false
    setSessionsLoading(true)
    manageUsersAPI.getSessionsForUser(userIdForSessions)
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res.data)) setSessionsList(res.data)
        else setSessionsList([])
      })
      .catch(() => {
        if (!cancelled) setSessionsList([])
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedKoordinator?.id, selectedKoordinator?.id_user, selectedKoordinatorUserId, selectedKoordinatorUserInfo?.username, selectedKoordinator?.username])

  useEffect(() => {
    if (allKoordinator.length === 0) {
      setFilteredKoordinator([])
      setCurrentPage(1)
      return
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      setFilteredKoordinator([...allKoordinator])
      setCurrentPage(1)
      return
    }
    const filtered = allKoordinator.filter(
      (p) =>
        (p.nama && p.nama.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.id && p.id.toString().includes(q))
    )
    setFilteredKoordinator(filtered)
    setCurrentPage(1)
  }, [allKoordinator, searchQuery])

  const totalKoordinator = filteredKoordinator.length
  const totalPages = Math.ceil(totalKoordinator / itemsPerPage)
  const paginatedKoordinator = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredKoordinator.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredKoordinator, currentPage, itemsPerPage])

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [totalPages])

  const handleItemsPerPageChange = useCallback((newLimit) => {
    setItemsPerPage(parseInt(newLimit))
    setCurrentPage(1)
  }, [])

  const getStatusBadgeColor = useCallback((status) => {
    const s = status?.toLowerCase()
    if (s === 'active' || s === 'aktif') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    if (s === 'inactive' || s === 'tidak aktif') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    if (s === 'pending') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }, [])

  const getStatusDisplayName = useCallback((status) => {
    const s = status?.toLowerCase()
    const map = { 'active': 'Aktif', 'aktif': 'Aktif', 'inactive': 'Tidak Aktif', 'tidak aktif': 'Tidak Aktif', 'pending': 'Pending' }
    return map[s] || status
  }, [])

  const handleItemClick = useCallback((pengurus) => {
    if (pengurus) setSelectedKoordinator(pengurus)
  }, [])

  const handleNonaktifkan = useCallback(async (pengurus) => {
    if (!pengurus?.id) return
    const coordinatorRole = (pengurus.roles || []).find((r) => isCoordinatorRole(r) || r.role_id === coordinatorRoleId)
    const pengurusRoleId = coordinatorRole?.pengurus_role_id
    if (!pengurusRoleId) {
      showNotification('Role koordinator tidak ditemukan pada pengurus ini.', 'error')
      return
    }
    if (!window.confirm(`Nonaktifkan koordinator "${pengurus.nama || pengurus.id}"? Role koordinator akan dihapus.`)) {
      return
    }
    setRemovingRole(true)
    try {
      const response = await manageUsersAPI.removeUserRole(pengurus.id, pengurusRoleId)
      if (response?.success) {
        showNotification('Role koordinator berhasil dihapus.', 'success')
        setSelectedKoordinator(null)
        loadKoordinator()
      } else {
        showNotification(response?.message || 'Gagal menghapus role koordinator', 'error')
      }
    } catch (err) {
      console.error('Error removing coordinator role:', err)
      const msg = err.response?.data?.message || 'Terjadi kesalahan saat menghapus role koordinator'
      showNotification(msg, 'error')
    } finally {
      setRemovingRole(false)
    }
  }, [coordinatorRoleId, showNotification, loadKoordinator])

  const handleSelectPengurus = useCallback(async (pengurus) => {
    if (pengurus?.id == null) return
    if (!coordinatorRoleId) {
      showNotification('Role koordinator tidak ditemukan. Silakan muat ulang halaman.', 'error')
      return
    }
    setAddingRole(true)
    try {
      const response = await manageUsersAPI.addUserRole(pengurus.id, { role_id: coordinatorRoleId })
      if (response?.success) {
        showNotification(`Role koordinator berhasil ditambahkan ke ${pengurus.nama || 'pengurus'}.`, 'success')
        setShowCariPengurusOffcanvas(false)
        loadKoordinator()
      } else {
        showNotification(response?.message || 'Gagal menambahkan role koordinator', 'error')
      }
    } catch (err) {
      console.error('Error adding coordinator role:', err)
      const msg = err.response?.data?.message || 'Terjadi kesalahan saat menambahkan role koordinator'
      showNotification(msg, 'error')
    } finally {
      setAddingRole(false)
    }
  }, [coordinatorRoleId, showNotification, loadKoordinator])

  const handleResetPassword = useCallback(async (pengurus) => {
    if (!pengurus?.id) return
    setResettingPassword(true)
    try {
      const response = await manageUsersAPI.sendResetPasswordLink(pengurus.id)
      if (response?.success) {
        showNotification(response.message || 'Link reset password telah dikirim ke WhatsApp.', 'success')
      } else {
        showNotification(response?.message || 'Gagal mengirim link reset password', 'error')
      }
    } catch (err) {
      console.error('Error sending reset password link:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat mengirim link', 'error')
    } finally {
      setResettingPassword(false)
    }
  }, [showNotification])

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <SearchAndFilterSection
              searchInput={searchQuery}
              onSearchInputChange={(e) => setSearchQuery(e.target.value)}
              onSearchInputFocus={() => setIsInputFocused(true)}
              onSearchInputBlur={() => setIsInputFocused(false)}
              isInputFocused={isInputFocused}
              isFilterOpen={isFilterOpen}
              onFilterToggle={() => setIsFilterOpen((p) => !p)}
              onTambahClick={() => setShowCariPengurusOffcanvas(true)}
              onExportClick={() => setShowExportOffcanvas(true)}
              statusFilter={statusFilter}
              onStatusFilterChange={(e) => setStatusFilter(e.target.value)}
            />

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {paginatedKoordinator.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {filteredKoordinator.length === 0 && allKoordinator.length > 0
                    ? 'Tidak ada koordinator yang sesuai dengan filter'
                    : 'Tidak ada koordinator ditemukan'}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {paginatedKoordinator.map((pengurus, index) => (
                      <KoordinatorListItem
                        key={pengurus.id}
                        pengurus={pengurus}
                        index={index}
                        onClick={handleItemClick}
                        getStatusBadgeColor={getStatusBadgeColor}
                        getStatusDisplayName={getStatusDisplayName}
                        lembagaList={lembagaList}
                      />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">Tampilkan:</label>
                          <select
                            value={itemsPerPage}
                            onChange={(e) => handleItemsPerPageChange(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                          </select>
                          <span className="text-sm text-gray-500 dark:text-gray-400">per halaman</span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          Menampilkan {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalKoordinator)} dari {totalKoordinator} koordinator
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            Sebelumnya
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              const pageNum = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => handlePageChange(pageNum)}
                                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${currentPage === pageNum ? 'bg-primary-600 text-white' : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                                >
                                  {pageNum}
                                </button>
                              )
                            })}
                          </div>
                          <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            Selanjutnya
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
      {createPortal(
        <ExportPengurusOffcanvas
          isOpen={showExportOffcanvas}
          onClose={() => setShowExportOffcanvas(false)}
          filteredData={filteredKoordinator}
          lembagaList={lembagaList}
        />,
        document.body
      )}
      {createPortal(
        <CariPengurusOffcanvas
          isOpen={showCariPengurusOffcanvas}
          onClose={() => setShowCariPengurusOffcanvas(false)}
          onSelect={handleSelectPengurus}
          title="Cari Pengurus"
        />,
        document.body
      )}
      {createPortal(
        <EditKoordinatorOffcanvas
          isOpen={selectedKoordinator != null}
          onClose={() => { setSelectedKoordinator(null); setSelectedKoordinatorUserInfo(null) }}
          pengurus={selectedKoordinator}
          userInfo={selectedKoordinatorUserInfo}
          userInfoLoading={userInfoLoading}
          onNonaktifkan={handleNonaktifkan}
          removing={removingRole}
          onResetPassword={handleResetPassword}
          resettingPassword={resettingPassword}
          sessions={sessionsList}
          sessionsLoading={sessionsLoading}
          lembagaList={lembagaList}
          onSuccess={loadKoordinator}
        />,
        document.body
      )}
    </div>
  )
}

export default Koordinator
