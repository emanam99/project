import { useState, useEffect, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI, jabatanAPI, profilAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import EditPengurusForm, { initialProfilForm, profilFormFromUser } from './EditPengurusForm'

const offcanvasBottomTransition = { type: 'tween', duration: 0.25, ease: [0.2, 0, 0.2, 1] }
/**
 * Rata kanan di semua breakpoint (tanpa `sm:left-1/2` — itu yang membuat panel “ke tengah” di tablet & memotong kanan).
 * `w-full max-w-md` + `right-0` (bukan `100vw`) agar lebar mengikuti area tampil.
 */
const offcanvasBottomPanelClass =
  'fixed bottom-0 right-0 left-auto z-[10211] flex min-h-0 w-full max-w-md flex-col overflow-hidden max-h-[85vh] box-border rounded-t-2xl bg-white dark:bg-gray-800 shadow-xl border-t border-l border-gray-200 dark:border-gray-700 pr-[env(safe-area-inset-right,0px)]'

function DetailPengurusOffcanvas({ isOpen, onClose, pengurusId, lembagaList = [], onPengurusPatch, showEditPanel = false, onOpenEdit, onCloseEdit }) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const isSuperAdmin = userHasSuperAdminAccess(user)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [userJabatan, setUserJabatan] = useState([])
  const [availableJabatan, setAvailableJabatan] = useState([])
  const [statusSaving, setStatusSaving] = useState(false)
  const [jabatanStatusSavingId, setJabatanStatusSavingId] = useState(null)
  const [availableRoles, setAvailableRoles] = useState([])
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [newRole, setNewRole] = useState({ role_id: '', lembaga_id: '' })
  const [roleSaving, setRoleSaving] = useState(false)
  const [showAddJabatanModal, setShowAddJabatanModal] = useState(false)
  const [editingJabatanId, setEditingJabatanId] = useState(null)
  const [newJabatan, setNewJabatan] = useState({
    jabatan_id: '',
    lembaga_id: '',
    tanggal_mulai: '',
    tanggal_selesai: '',
    status: 'aktif'
  })
  const [editForm, setEditForm] = useState(initialProfilForm)
  const [editSaving, setEditSaving] = useState(false)
  const [editFormLoading, setEditFormLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setShowAddRoleModal(false)
      setShowAddJabatanModal(false)
      setEditingJabatanId(null)
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
        const isEmptyDate = (v) => {
          if (v == null || v === '') return true
          const s = String(v).trim()
          return s === '' || s.startsWith('0000-00-00')
        }
        const normalized = rawJabatan.map((j) => {
          const s = (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? '').toString().trim().toLowerCase()
          let jabatanStatus = (s === 'aktif' || s === 'active') ? 'aktif' : 'nonaktif'
          const tanggalSelesaiEmpty = isEmptyDate(j.tanggal_selesai)
          const tanggalMulaiEmpty = isEmptyDate(j.tanggal_mulai)
          if (tanggalSelesaiEmpty || tanggalMulaiEmpty) jabatanStatus = 'aktif'
          return { ...j, jabatan_status: jabatanStatus }
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

  useEffect(() => {
    if (!isOpen) return
    manageUsersAPI.getRolesList().then((res) => {
      if (res.success && Array.isArray(res.data)) setAvailableRoles(res.data)
      else setAvailableRoles([])
    }).catch(() => setAvailableRoles([]))
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
        onPengurusPatch?.(pengurusId, { status: newStatus })
      } else {
        showNotification(res.message || 'Gagal memperbarui status', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal memperbarui status', 'error')
    } finally {
      setStatusSaving(false)
    }
  }

  const formatDateForInput = (v) => {
    if (v == null || v === '' || String(v).trim().startsWith('0000-00-00')) return ''
    const s = String(v).trim().slice(0, 10)
    return s || ''
  }

  const openEditOffcanvas = () => {
    if (!pengurusId) return
    onOpenEdit?.()
    setEditFormLoading(true)
    profilAPI.getUser(pengurusId).then((res) => {
      if (res.success && res.user) {
        setEditForm(profilFormFromUser(res.user))
      } else {
        setEditForm(profilFormFromUser(detail))
        if (!res.success) showNotification(res.message || 'Gagal memuat data profil', 'error')
      }
    }).catch(() => {
      setEditForm(profilFormFromUser(detail))
      showNotification('Gagal memuat data profil', 'error')
    }).finally(() => setEditFormLoading(false))
  }

  const handleSaveEdit = async () => {
    if (!pengurusId || !detail || editSaving) return
    const nama = (editForm.nama || '').trim()
    if (!nama) {
      showNotification('Nama tidak boleh kosong', 'error')
      return
    }
    setEditSaving(true)
    try {
      const { status, ...profilPayload } = editForm
      const resProfil = await profilAPI.updateProfile({ user_id: pengurusId, ...profilPayload })
      if (!resProfil.success) {
        showNotification(resProfil.message || 'Gagal menyimpan profil', 'error')
        setEditSaving(false)
        return
      }
      const updateData = {
        nama,
        whatsapp: (editForm.whatsapp || '').trim(),
        status: editForm.status,
        roles: detail.roles || []
      }
      if (detail.id_user != null) updateData.email = (editForm.email || '').trim()
      const resManage = await manageUsersAPI.update(pengurusId, updateData)
      if (resManage.success) {
        showNotification('Data pengurus berhasil diperbarui', 'success')
        onCloseEdit?.()
        const again = await manageUsersAPI.getById(pengurusId)
        if (again.success && again.data?.user) {
          const u = again.data.user
          setDetail(u)
          const rawJabatan = Array.isArray(u.jabatan) ? u.jabatan : []
          const isEmptyDate = (v) => { if (v == null || v === '') return true; const s = String(v).trim(); return s === '' || s.startsWith('0000-00-00') }
          const normalized = rawJabatan.map((j) => {
            const s = (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? '').toString().trim().toLowerCase()
            let jabatanStatus = (s === 'aktif' || s === 'active') ? 'aktif' : 'nonaktif'
            if (isEmptyDate(j.tanggal_selesai) || isEmptyDate(j.tanggal_mulai)) jabatanStatus = 'aktif'
            return { ...j, jabatan_status: jabatanStatus }
          })
          setUserJabatan(normalized)
          onPengurusPatch?.(pengurusId, { ...u, jabatan: u.jabatan })
        }
      } else {
        showNotification(resManage.message || 'Gagal memperbarui status/WA', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal memperbarui data', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  const handleSaveWhatsapp = async (newNumber) => {
    if (!pengurusId || !detail) return
    try {
      const updateData = {
        nama: (detail.nama || '').trim(),
        whatsapp: (newNumber || '').trim(),
        status: detail.status || 'active',
        roles: detail.roles || []
      }
      if (detail.id_user != null) updateData.email = (detail.email ?? detail.email_user ?? '').trim()
      const res = await manageUsersAPI.update(pengurusId, updateData)
      if (res.success) {
        showNotification('Nomor WhatsApp berhasil diubah', 'success')
        const resProfil = await profilAPI.getUser(pengurusId)
        if (resProfil.success && resProfil.user) setEditForm(profilFormFromUser(resProfil.user))
        const again = await manageUsersAPI.getById(pengurusId)
        if (again.success && again.data?.user) {
          setDetail(again.data.user)
          onPengurusPatch?.(pengurusId, { whatsapp: again.data.user.whatsapp ?? again.data.user.no_wa })
        }
      } else {
        showNotification(res.message || 'Gagal mengubah nomor', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal mengubah nomor', 'error')
    }
  }

  const openEditJabatan = (j) => {
    setNewJabatan({
      jabatan_id: String(j.jabatan_id ?? ''),
      lembaga_id: String(j.lembaga_id ?? ''),
      tanggal_mulai: formatDateForInput(j.tanggal_mulai),
      tanggal_selesai: formatDateForInput(j.tanggal_selesai),
      status: (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? 'aktif').toString().trim().toLowerCase() === 'nonaktif' ? 'nonaktif' : 'aktif'
    })
    setEditingJabatanId(j.pengurus_jabatan_id)
    setShowAddJabatanModal(true)
  }

  const openTambahJabatan = () => {
    setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
    setEditingJabatanId(null)
    setShowAddJabatanModal(true)
  }

  const handleSaveJabatan = async () => {
    if (editingJabatanId != null) {
      try {
        const res = await manageUsersAPI.updateJabatanStatus(pengurusId, editingJabatanId, {
          status: newJabatan.status,
          tanggal_mulai: newJabatan.tanggal_mulai ? newJabatan.tanggal_mulai.trim() : null,
          tanggal_selesai: newJabatan.tanggal_selesai ? newJabatan.tanggal_selesai.trim() : null
        })
        if (res.success) {
          const again = await manageUsersAPI.getById(pengurusId)
          if (again.success && again.data?.user?.jabatan) {
            const rawJabatan = again.data.user.jabatan
            const isEmptyDate = (v) => { if (v == null || v === '') return true; const s = String(v).trim(); return s === '' || s.startsWith('0000-00-00') }
            const normalized = rawJabatan.map((j) => {
              const s = (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? '').toString().trim().toLowerCase()
              let st = (s === 'aktif' || s === 'active') ? 'aktif' : 'nonaktif'
              if (isEmptyDate(j.tanggal_selesai) || isEmptyDate(j.tanggal_mulai)) st = 'aktif'
              return { ...j, jabatan_status: st }
            })
            setUserJabatan(normalized)
            onPengurusPatch?.(pengurusId, { jabatan: again.data.user.jabatan })
          }
          setShowAddJabatanModal(false)
          setEditingJabatanId(null)
          setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
          showNotification('Jabatan berhasil diperbarui', 'success')
        } else {
          showNotification(res.message || 'Gagal memperbarui jabatan', 'error')
        }
      } catch (err) {
        showNotification(err?.response?.data?.message || err?.message || 'Gagal memperbarui jabatan', 'error')
      }
      return
    }
    if (!pengurusId || !newJabatan.lembaga_id || !newJabatan.jabatan_id) {
      showNotification('Pilih lembaga dan jabatan', 'error')
      return
    }
    try {
      const res = await manageUsersAPI.addUserJabatan(pengurusId, newJabatan)
      if (res.success) {
        const again = await manageUsersAPI.getById(pengurusId)
        if (again.success && again.data?.user?.jabatan) {
          const rawJabatan = again.data.user.jabatan
          const isEmptyDate = (v) => { if (v == null || v === '') return true; const s = String(v).trim(); return s === '' || s.startsWith('0000-00-00') }
          const normalized = rawJabatan.map((j) => {
            const s = (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? '').toString().trim().toLowerCase()
            let st = (s === 'aktif' || s === 'active') ? 'aktif' : 'nonaktif'
            if (isEmptyDate(j.tanggal_selesai) || isEmptyDate(j.tanggal_mulai)) st = 'aktif'
            return { ...j, jabatan_status: st }
          })
          setUserJabatan(normalized)
          onPengurusPatch?.(pengurusId, { jabatan: again.data.user.jabatan })
        }
        setShowAddJabatanModal(false)
        setEditingJabatanId(null)
        setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
        showNotification('Jabatan berhasil ditambahkan', 'success')
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
        const nextJabatan = userJabatan.map((j) =>
          Number(j.pengurus_jabatan_id) === idKey ? { ...j, jabatan_status: newStatus } : j
        )
        setUserJabatan(nextJabatan)
        showNotification('Status jabatan berhasil diperbarui', 'success')
        onPengurusPatch?.(pengurusId, { jabatan: nextJabatan })
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
        const nextJabatan = userJabatan.filter((j) => Number(j.pengurus_jabatan_id) !== idKey)
        setUserJabatan(nextJabatan)
        showNotification('Jabatan berhasil dihapus', 'success')
        onPengurusPatch?.(pengurusId, { jabatan: nextJabatan })
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

  const formatAlamat = (d) => {
    if (!d) return '-'
    const parts = [d.dusun, d.rt && d.rw ? `RT ${d.rt}/RW ${d.rw}` : d.rt || d.rw, d.desa, d.kecamatan, d.kabupaten, d.provinsi].filter(Boolean)
    return parts.length ? parts.join(', ') : '-'
  }
  const displayNip = (d) => (d && (d.nip || d.npk || d.nuptk || d.niy)) ? (d.nip || d.npk || d.nuptk || d.niy) : '-'

  const userRoles = Array.isArray(detail?.roles) ? detail.roles : []

  const handleAddRole = async () => {
    if (!pengurusId || !newRole.role_id) {
      showNotification('Pilih role terlebih dahulu', 'warning')
      return
    }
    setRoleSaving(true)
    try {
      const res = await manageUsersAPI.addUserRole(pengurusId, { role_id: newRole.role_id, lembaga_id: newRole.lembaga_id || undefined })
      if (res.success) {
        const again = await manageUsersAPI.getById(pengurusId)
        if (again.success && again.data?.user) {
          setDetail(again.data.user)
          onPengurusPatch?.(pengurusId, { roles: again.data.user.roles })
        }
        setShowAddRoleModal(false)
        setNewRole({ role_id: '', lembaga_id: '' })
        showNotification('Role berhasil ditambahkan', 'success')
      } else {
        showNotification(res.message || 'Gagal menambahkan role', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menambahkan role', 'error')
    } finally {
      setRoleSaving(false)
    }
  }

  const handleRemoveRole = async (pengurusRoleId) => {
    if (!window.confirm('Hapus role ini dari pengurus?')) return
    if (!pengurusId) return
    try {
      const res = await manageUsersAPI.removeUserRole(pengurusId, pengurusRoleId)
      if (res.success) {
        const again = await manageUsersAPI.getById(pengurusId)
        if (again.success && again.data?.user) {
          setDetail(again.data.user)
          onPengurusPatch?.(pengurusId, { roles: again.data.user.roles })
        }
        showNotification('Role berhasil dihapus', 'success')
      } else {
        showNotification(res.message || 'Gagal menghapus role', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal menghapus role', 'error')
    }
  }

  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  if (!isOpen && !showPortal) return null

  const content = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && (
        <Fragment key="detail-pengurus-offcanvas">
      <motion.div
        key="detail-pengurus-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
      />
      <motion.div
        key="detail-pengurus-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[201] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Detail Pengurus</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Profil dan wewenang</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {pengurusId != null && detail && (
                <button
                  type="button"
                  onClick={openEditOffcanvas}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="animate-spin rounded-full h-11 w-11 border-2 border-teal-500 border-t-transparent" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : !detail ? (
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-8 text-center shadow-sm border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Data tidak ditemukan.</p>
            </div>
          ) : (
            <>
              {/* Kartu profil */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-5">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                      {(detail.nama || 'P').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{detail.nama || '-'}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">NIP {displayNip(detail)}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{formatAlamat(detail)}</p>
                    </div>
                  </div>
                </div>
                {/* Status strip */}
                <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}>
                      {statusSaving ? 'Menyimpan...' : (isActive ? 'Aktif' : 'Tidak Aktif')}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      disabled={statusSaving}
                      onClick={handleStatusToggle}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${isActive ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Jabatan */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </span>
                    Jabatan
                  </h4>
                  <button
                    type="button"
                    onClick={openTambahJabatan}
                    className="text-xs font-medium px-3 py-2 rounded-xl bg-teal-500 text-white hover:bg-teal-600 transition-colors inline-flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Tambah
                  </button>
                </div>
                <div className="p-4 pt-3">
                  {userJabatan.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Belum ada jabatan</p>
                  ) : (
                    <ul className="space-y-2">
                      {userJabatan.map((j, idx) => {
                        const jabatanInfo = availableJabatan.find((x) => x.id === j.jabatan_id)
                        const rawStatus = (j.jabatan_status ?? j.jabatanStatus ?? j.status ?? '').toString().trim().toLowerCase()
                        const isJabatanAktif = rawStatus === 'aktif' || rawStatus === 'active'
                        const saving = Number(jabatanStatusSavingId) === Number(j.pengurus_jabatan_id)
                        const listKey = j.pengurus_jabatan_id != null && j.pengurus_jabatan_id !== '' ? j.pengurus_jabatan_id : `jabatan-${j.jabatan_id ?? idx}-${idx}`
                        return (
                          <li
                            key={listKey}
                            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-600/50 hover:border-teal-200 dark:hover:border-teal-800 transition-colors"
                          >
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={() => openEditJabatan(j)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditJabatan(j) } }}
                              className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 flex-1 cursor-pointer hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                            >
                              {jabatanInfo ? jabatanInfo.nama : j.jabatan_nama || `Jabatan #${j.jabatan_id}`}
                              {j.lembaga_id && (
                                <span className="text-gray-500 dark:text-gray-400 font-normal ml-1">
                                  · {getLembagaNama(j.lembaga_id)}
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${isJabatanAktif ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}>
                                {saving ? '...' : (isJabatanAktif ? 'Aktif' : 'Nonaktif')}
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={isJabatanAktif}
                                disabled={saving}
                                onClick={() => handleJabatanStatusToggle(j.pengurus_jabatan_id, j.jabatan_status || '')}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 disabled:opacity-50 ${isJabatanAktif ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                              >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${isJabatanAktif ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </button>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveJabatan(j.pengurus_jabatan_id)}
                                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
              </div>

              {/* Role */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </span>
                    Role
                  </h4>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => { setNewRole({ role_id: '', lembaga_id: '' }); setShowAddRoleModal(true) }}
                      className="text-xs font-medium px-3 py-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Tambah
                    </button>
                  )}
                </div>
                <div className="p-4 pt-3">
                  {userRoles.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Belum ada role</p>
                  ) : (
                    <ul className="space-y-2">
                      {userRoles.map((r) => {
                        const roleInfo = availableRoles.find((x) => String(x.id) === String(r.role_id))
                        const lembagaNama = r.lembaga_id ? getLembagaNama(r.lembaga_id) : null
                        return (
                          <li
                            key={r.pengurus_role_id ?? `${r.role_id}-${r.lembaga_id ?? 'x'}`}
                            className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-600/50"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {roleInfo ? roleInfo.label : `Role #${r.role_id}`}
                                {roleInfo?.key && <span className="text-gray-500 dark:text-gray-400 ml-1 text-xs">({roleInfo.key})</span>}
                              </span>
                              {lembagaNama && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Lembaga: {lembagaNama}</p>}
                            </div>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRole(r.pengurus_role_id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                aria-label="Hapus role"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Kontak & Verifikasi */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </span>
                    Kontak & Verifikasi
                  </h4>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">Username</span>
                    <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{detail.username ?? '-'}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">Email</span>
                    <p className="text-sm text-gray-900 dark:text-gray-100 break-all">{detail.email ?? detail.email_user ?? '-'}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">WhatsApp</span>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{detail.whatsapp ?? detail.no_wa ?? '-'}</p>
                  </div>
                  <div className="flex items-start gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">Verifikasi</span>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{verifikasiTerakhirStr}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {showEditPanel && (
        <motion.div
          key="detail-pengurus-edit-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[202] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
        >
          <div className="flex-shrink-0 px-5 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Edit Pengurus</h3>
            <button
              type="button"
              onClick={() => onCloseEdit?.()}
              className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label="Tutup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
            {editFormLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="animate-spin rounded-full h-11 w-11 border-2 border-teal-500 border-t-transparent" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat formulir...</p>
              </div>
            ) : (
              <EditPengurusForm
                formData={editForm}
                setFormData={setEditForm}
                onCancel={() => onCloseEdit?.()}
                onSubmit={handleSaveEdit}
                saving={editSaving}
                onSaveWhatsapp={handleSaveWhatsapp}
                formId="edit-pengurus-form"
                hideFooter
              />
            )}
          </div>
          {!editFormLoading && (
            <div className="flex-shrink-0 p-4 pt-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl flex justify-end gap-3">
              <button
                type="button"
                onClick={() => onCloseEdit?.()}
                className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="submit"
                form="edit-pengurus-form"
                disabled={editSaving}
                className="px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSaving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          )}
        </motion.div>
      )}
        </Fragment>
      )}

      {/* Offcanvas bawah: Tambah/Edit Jabatan */}
      <AnimatePresence key="offcanvas-jabatan">
        {showAddJabatanModal && (
          <>
            <motion.div
              key="offcanvas-jabatan-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[10210]"
              onClick={() => {
                setShowAddJabatanModal(false)
                setEditingJabatanId(null)
                setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
              }}
              aria-hidden="true"
            />
            <motion.div
              key="offcanvas-jabatan-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={offcanvasBottomTransition}
              className={offcanvasBottomPanelClass}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="offcanvas-jabatan-title"
            >
              <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
                <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
              </div>
              <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
                <h2 id="offcanvas-jabatan-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingJabatanId != null ? 'Edit Jabatan' : 'Tambah Jabatan'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddJabatanModal(false)
                    setEditingJabatanId(null)
                    setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
                  }}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 pb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Lembaga *</label>
                  <select
                    value={newJabatan.lembaga_id}
                    onChange={(e) => setNewJabatan({ ...newJabatan, lembaga_id: e.target.value, jabatan_id: '' })}
                    required
                    disabled={editingJabatanId != null}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option key="lembaga-placeholder" value="">— Pilih Lembaga —</option>
                    {(lembagaList || []).map((lem, i) => (
                      <option key={lem.id != null && lem.id !== '' ? lem.id : `lembaga-${i}`} value={lem.id}>{lem.nama || lem.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jabatan *</label>
                  <select
                    value={newJabatan.jabatan_id}
                    onChange={(e) => setNewJabatan({ ...newJabatan, jabatan_id: e.target.value })}
                    disabled={editingJabatanId != null || !newJabatan.lembaga_id}
                    required
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option key="jabatan-placeholder" value="">
                      {newJabatan.lembaga_id ? '— Pilih Jabatan —' : '— Pilih Lembaga dulu —'}
                    </option>
                    {availableJabatan
                      .filter(
                        (j) =>
                          (j.lembaga_id === newJabatan.lembaga_id || !j.lembaga_id) &&
                          (editingJabatanId != null ? true : !userJabatan.some((uj) => uj.jabatan_id === j.id && uj.jabatan_status === 'aktif'))
                      )
                      .map((j, i) => (
                        <option key={j.id != null && j.id !== '' ? j.id : `jabatan-opt-${i}`} value={j.id}>
                          {j.nama} {j.kategori ? `(${j.kategori})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Mulai</label>
                    <input
                      type="date"
                      value={newJabatan.tanggal_mulai}
                      onChange={(e) => setNewJabatan({ ...newJabatan, tanggal_mulai: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tanggal Selesai</label>
                    <input
                      type="date"
                      value={newJabatan.tanggal_selesai}
                      onChange={(e) => setNewJabatan({ ...newJabatan, tanggal_selesai: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-gray-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Status</label>
                  <select
                    value={newJabatan.status}
                    onChange={(e) => setNewJabatan({ ...newJabatan, status: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white p-3 pt-3 dark:border-gray-700 dark:bg-gray-800 sm:gap-3 sm:p-4 sm:pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddJabatanModal(false)
                    setEditingJabatanId(null)
                    setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
                  }}
                  className="min-w-0 shrink-0 px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveJabatan}
                  className="min-w-0 shrink-0 px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-700"
                >
                  {editingJabatanId != null ? 'Simpan' : 'Tambah'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Offcanvas bawah: Tambah Role */}
      <AnimatePresence key="offcanvas-role">
        {showAddRoleModal && (
          <>
            <motion.div
              key="offcanvas-role-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[10210]"
              onClick={() => { setShowAddRoleModal(false); setNewRole({ role_id: '', lembaga_id: '' }) }}
              aria-hidden="true"
            />
            <motion.div
              key="offcanvas-role-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={offcanvasBottomTransition}
              className={offcanvasBottomPanelClass}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="offcanvas-role-title"
            >
              <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
                <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
              </div>
              <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
                <h2 id="offcanvas-role-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                  Tambah Role
                </h2>
                <button
                  type="button"
                  onClick={() => { setShowAddRoleModal(false); setNewRole({ role_id: '', lembaga_id: '' }) }}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 pb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role *</label>
                  <select
                    value={newRole.role_id}
                    onChange={(e) => setNewRole((prev) => ({ ...prev, role_id: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option key="role-placeholder" value="">— Pilih Role —</option>
                    {availableRoles
                      .filter((role) => !userRoles.some((ur) => String(ur.role_id) === String(role.id)))
                      .map((role, idx) => (
                        <option key={role.id != null && role.id !== '' ? role.id : `role-${idx}`} value={role.id}>
                          {role.label} {role.key ? `(${role.key})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Lembaga (Opsional)</label>
                  <select
                    value={newRole.lembaga_id}
                    onChange={(e) => setNewRole((prev) => ({ ...prev, lembaga_id: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option key="lembaga-opsional-placeholder" value="">— Pilih Lembaga (Opsional) —</option>
                    {(lembagaList || []).map((lem, idx) => (
                      <option key={lem.id != null && lem.id !== '' ? lem.id : `lem-ops-${idx}`} value={lem.id}>{lem.nama || lem.id}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white p-3 pt-3 dark:border-gray-700 dark:bg-gray-800 sm:gap-3 sm:p-4 sm:pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => { setShowAddRoleModal(false); setNewRole({ role_id: '', lembaga_id: '' }) }}
                  className="min-w-0 shrink-0 px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAddRole}
                  disabled={roleSaving || !newRole.role_id}
                  className="min-w-0 shrink-0 px-4 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {roleSaving ? 'Menambah...' : 'Tambah'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}

export default DetailPengurusOffcanvas
