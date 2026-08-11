import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { manageUsersAPI, jabatanAPI } from '../../services/api'
import api from '../../services/api'
import Modal from '../../components/Modal/Modal'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import CariTokoOffcanvas from '../../components/CariTokoOffcanvas'
import CariPengurusOffcanvas from '../../components/CariPengurusOffcanvas'

const PICKER_OFFCANVAS_Z = 220

/**
 * @param {object} props
 * @param {string} props.userId — users.id (v2) atau pengurus.id (fallback)
 * @param {'page'|'offcanvas'} [props.variant]
 * @param {() => void} [props.onClose] — tutup panel (offcanvas)
 * @param {() => void} [props.onUserSaved] — refresh daftar di parent
 */
export function EditUserContent({ userId: id, variant = 'page', onClose, onUserSaved }) {
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    nama: '',
    whatsapp: '',
    status: 'active'
  })
  const [userRoles, setUserRoles] = useState([]) // Roles yang sudah dimiliki user
  const [availableRoles, setAvailableRoles] = useState([]) // Semua role yang tersedia
  const [userJabatan, setUserJabatan] = useState([]) // Jabatan yang sudah dimiliki user
  const [availableJabatan, setAvailableJabatan] = useState([]) // Semua jabatan yang tersedia
  const [lembaga, setLembaga] = useState([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [showAddJabatanModal, setShowAddJabatanModal] = useState(false)
  const [newRole, setNewRole] = useState({ role_id: '', lembaga_id: '' })
  const [newJabatan, setNewJabatan] = useState({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
  const [resettingPassword, setResettingPassword] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState('')
  /** Data user dari tabel users (v2) - hanya dipakai bila user TIDAK punya pengurus (tampilan ringkas) */
  const [userFromUsers, setUserFromUsers] = useState(null)
  /** ID pengurus untuk API (update/role/reset/delete). Saat buka dengan users.id dan user punya pengurus, isi pengurus_id. */
  const [effectiveEditId, setEffectiveEditId] = useState(null)
  /** Info akun (username, no_wa, email) dari tabel users - untuk tampil sebagai label read-only ketika load via v2 */
  const [displayUserInfo, setDisplayUserInfo] = useState(null)
  /** Edit no_wa & email (untuk form simpan) - hanya dipakai ketika displayUserInfo ada */
  const [userProfileEdit, setUserProfileEdit] = useState({ no_wa: '', email: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  /** Device aktif (sessions) - hanya ketika id = users.id (displayUserInfo ada) */
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [showSessionOffcanvas, setShowSessionOffcanvas] = useState(false)
  const closeSessionOffcanvas = useOffcanvasBackClose(showSessionOffcanvas, () => { setShowSessionOffcanvas(false); setSelectedSession(null) })
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  /** Aktivitas user (audit log) - untuk user yang sedang diedit */
  const [aktivitasList, setAktivitasList] = useState([])
  const [aktivitasLoading, setAktivitasLoading] = useState(false)
  /** Akses Mybeddian: santri yang terhubung ke user ini (bisa login Mybeddian). Hanya dipakai ketika edit by users.id */
  const [mybeddianSantriList, setMybeddianSantriList] = useState([])
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  const closeSantriPicker = useOffcanvasBackClose(santriPickerOpen, () => setSantriPickerOpen(false))
  /** Akses Toko (Mybeddian): daftar toko yang id_users = user ini */
  const [userTokoList, setUserTokoList] = useState([])
  const [showTokoCreateModal, setShowTokoCreateModal] = useState(false)
  const [tokoLinkPickerOpen, setTokoLinkPickerOpen] = useState(false)
  const closeTokoLinkPicker = useOffcanvasBackClose(tokoLinkPickerOpen, () => setTokoLinkPickerOpen(false))
  const [tokoForm, setTokoForm] = useState({ nama_toko: '', kode_toko: '' })
  const [tokoSaving, setTokoSaving] = useState(false)
  const [mybeddianAccessSaving, setMybeddianAccessSaving] = useState(false)
  const [portalAccess, setPortalAccess] = useState({
    access_ebeddien: 1,
    access_mybeddian_santri: 1,
    access_mybeddian_toko: 1,
    access_mybeddian_pjgt: 1
  })
  const [pjgtMadrasah, setPjgtMadrasah] = useState(null)
  const [showPjgtModal, setShowPjgtModal] = useState(false)
  const [pjgtSearch, setPjgtSearch] = useState('')
  const [pjgtOptions, setPjgtOptions] = useState([])
  const [pjgtOptionsLoading, setPjgtOptionsLoading] = useState(false)
  const [pjgtLinkSaving, setPjgtLinkSaving] = useState(false)
  const [portalSaving, setPortalSaving] = useState(false)
  const [pengurusLinkPickerOpen, setPengurusLinkPickerOpen] = useState(false)
  const closePengurusLinkPicker = useOffcanvasBackClose(pengurusLinkPickerOpen, () => setPengurusLinkPickerOpen(false))
  const [pengurusLinkSaving, setPengurusLinkSaving] = useState(false)

  useEffect(() => {
    if (id) {
      loadUserData()
      loadRolesAndLembaga()
    }
  }, [id])

  /** Load sessions user (hanya ketika id = users.id, yaitu displayUserInfo ada) */
  const loadSessions = async () => {
    if (!id || !displayUserInfo) return
    setSessionsLoading(true)
    try {
      const res = await manageUsersAPI.getSessionsForUser(id)
      if (res.success && Array.isArray(res.data)) {
        setSessions(res.data)
      } else {
        setSessions([])
      }
    } catch (err) {
      console.error('Error loading sessions:', err)
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }

  useEffect(() => {
    if (displayUserInfo && effectiveEditId && id) {
      loadSessions()
    }
  }, [displayUserInfo, effectiveEditId, id])

  const loadAktivitas = async () => {
    const hasPengurus = effectiveEditId != null && effectiveEditId > 0
    const hasUserId = id != null && (userFromUsers || displayUserInfo)
    if (!hasPengurus && !hasUserId) return
    setAktivitasLoading(true)
    try {
      const params = { limit: 5 }
      if (hasPengurus) params.pengurus_id = effectiveEditId
      else params.user_id = id
      const res = await manageUsersAPI.getAktivitasForUser(params)
      if (res.success && Array.isArray(res.data)) {
        setAktivitasList(res.data)
      } else {
        setAktivitasList([])
      }
    } catch (err) {
      console.error('Error loading aktivitas:', err)
      setAktivitasList([])
    } finally {
      setAktivitasLoading(false)
    }
  }

  useEffect(() => {
    if (effectiveEditId || (id && (userFromUsers || displayUserInfo))) {
      loadAktivitas()
    }
  }, [effectiveEditId, id, userFromUsers, displayUserInfo])

  useEffect(() => {
    if (displayUserInfo) {
      setUserProfileEdit({
        no_wa: displayUserInfo.no_wa || '',
        email: displayUserInfo.email || ''
      })
    }
  }, [displayUserInfo])

  const handleSantriPick = useCallback(async (santri) => {
    const santriId = santri?.id != null ? Number(santri.id) : 0
    if (!id || !santriId) return
    if (mybeddianSantriList.some((x) => x.id === santriId)) {
      showNotification('Santri ini sudah tertaut ke akun ini', 'warning')
      setSantriPickerOpen(false)
      return
    }
    setMybeddianAccessSaving(true)
    try {
      const res = await manageUsersAPI.setMybeddianAccess(id, santriId)
      if (res.success) {
        showNotification(res.message || 'Akses Mybeddian diaktifkan', 'success')
        const added = res.data?.santri || {
          id: santriId,
          nis: santri.nis ?? null,
          nama: santri.nama || santri.nama_santri || '',
        }
        setMybeddianSantriList((prev) => {
          if (prev.some((x) => x.id === added.id)) return prev
          return [...prev, added].sort((a, b) => a.id - b.id)
        })
        setUserFromUsers((prev) => {
          if (!prev) return prev
          const cur = Array.isArray(prev.santri_list) ? [...prev.santri_list] : []
          if (!cur.some((x) => x.id === added.id)) {
            cur.push(added)
            cur.sort((a, b) => a.id - b.id)
          }
          const first = cur[0]
          return { ...prev, santri_list: cur, santri: first || null, santri_id: first?.id ?? null }
        })
        setSantriPickerOpen(false)
      } else {
        showNotification(res.message || 'Gagal mengaktifkan akses', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal mengaktifkan akses', 'error')
    } finally {
      setMybeddianAccessSaving(false)
    }
  }, [id, mybeddianSantriList, showNotification])

  const handleTokoPick = useCallback(async (toko) => {
    const pedagangId = toko?.id != null ? Number(toko.id) : 0
    if (!id || !pedagangId) return
    setTokoSaving(true)
    try {
      const res = await manageUsersAPI.addTokoToUser(id, { pedagang_id: pedagangId })
      if (res.success) {
        showNotification(res.message || 'Akses toko ditambahkan', 'success')
        const listRes = await manageUsersAPI.getTokoForUser(id)
        if (listRes.success && Array.isArray(listRes.data)) setUserTokoList(listRes.data)
        setTokoLinkPickerOpen(false)
      } else {
        showNotification(res.message || 'Gagal menautkan toko', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menautkan toko', 'error')
    } finally {
      setTokoSaving(false)
    }
  }, [id, showNotification])

  /** Opsi madrasah tanpa PJGT untuk modal hubungkan PJGT */
  useEffect(() => {
    if (!showPjgtModal) return
    const t = setTimeout(() => {
      setPjgtOptionsLoading(true)
      manageUsersAPI.getMadrasahPjgtOptions({ search: pjgtSearch.trim() || undefined, limit: 40 })
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setPjgtOptions(res.data)
          } else {
            setPjgtOptions([])
          }
        })
        .catch(() => setPjgtOptions([]))
        .finally(() => setPjgtOptionsLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [showPjgtModal, pjgtSearch])

  const handlePengurusPick = useCallback(async (pengurus) => {
    const pengurusId = pengurus?.id != null ? Number(pengurus.id) : 0
    if (!id || !pengurusId) return
    const alreadyId = effectiveEditId
      ? Number(effectiveEditId)
      : (userFromUsers?.pengurus?.id != null ? Number(userFromUsers.pengurus.id) : null)
    if (alreadyId != null && alreadyId === pengurusId) {
      showNotification('Pengurus ini sudah tertaut ke akun ini', 'warning')
      setPengurusLinkPickerOpen(false)
      return
    }
    setPengurusLinkSaving(true)
    try {
      const res = await manageUsersAPI.setPengurusLink(id, pengurusId)
      if (res.success) {
        showNotification(res.message || 'Pengurus ditautkan', 'success')
        setPengurusLinkPickerOpen(false)
        await loadUserData()
        onUserSaved?.()
      } else {
        showNotification(res.message || 'Gagal menautkan', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menautkan', 'error')
    } finally {
      setPengurusLinkSaving(false)
    }
  }, [id, effectiveEditId, userFromUsers, showNotification, onUserSaved])

  const handleSaveNoWaEmail = async () => {
    if (!id || !displayUserInfo) return
    setSavingProfile(true)
    try {
      const res = await manageUsersAPI.updateUserProfileV2(id, {
        no_wa: userProfileEdit.no_wa.trim() || null,
        email: userProfileEdit.email.trim() || null
      })
      if (res.success) {
        showNotification(res.message || 'No WA dan email berhasil diperbarui', 'success')
        const v2Res = await manageUsersAPI.getByIdV2(id)
        if (v2Res.success && v2Res.data?.user) {
          setDisplayUserInfo(prev => prev ? { ...prev, ...v2Res.data.user } : null)
        }
      } else {
        showNotification(res.message || 'Gagal memperbarui', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal memperbarui', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleRevokeSession = async (session) => {
    if (!window.confirm('Log out perangkat ini? Session akan dicabut.')) return
    setRevokeLoading(true)
    try {
      const res = await manageUsersAPI.revokeUserSession(id, session.id)
      if (res.success) {
        showNotification(res.message || 'Session telah logout', 'success')
        setShowSessionOffcanvas(false)
        setSelectedSession(null)
        loadSessions()
      } else {
        showNotification(res.message || 'Gagal logout session', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal logout session', 'error')
    } finally {
      setRevokeLoading(false)
    }
  }
  
  const loadRolesAndLembaga = async () => {
    try {
      setLoadingRoles(true)
      
      // Load available roles
      const rolesResponse = await manageUsersAPI.getRolesList()
      if (rolesResponse.success) {
        setAvailableRoles(rolesResponse.data || [])
      }
      
      // Load available jabatan (semua jabatan aktif, akan difilter di modal berdasarkan lembaga)
      const jabatanResponse = await jabatanAPI.getList({ status: 'aktif' })
      if (jabatanResponse.success) {
        setAvailableJabatan(jabatanResponse.data || [])
      }
      
      // Load lembaga
      const lembagaResponse = await api.get('/lembaga')
      if (lembagaResponse.data.success) {
        setLembaga(lembagaResponse.data.data || [])
      }
    } catch (err) {
      console.error('Error loading roles/jabatan/lembaga:', err)
    } finally {
      setLoadingRoles(false)
    }
  }

  const loadUserData = async () => {
    try {
      setLoading(true)
      setError('')
      setUserFromUsers(null)
      setEffectiveEditId(null)
      setDisplayUserInfo(null)
      setMybeddianSantriList([])
      setPjgtMadrasah(null)
      setPortalAccess({
        access_ebeddien: 1,
        access_mybeddian_santri: 1,
        access_mybeddian_toko: 1,
        access_mybeddian_pjgt: 1
      })
      
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Anda belum login. Silakan login terlebih dahulu.')
        return
      }
      
      // Coba load dari v2 (users.id) dulu
      try {
        const v2Response = await manageUsersAPI.getByIdV2(id)
        if (v2Response.success && v2Response.data?.user) {
          const user = v2Response.data.user
          setPortalAccess({
            access_ebeddien: Number(user.access_ebeddien) === 1 ? 1 : 0,
            access_mybeddian_santri: Number(user.access_mybeddian_santri) === 1 ? 1 : 0,
            access_mybeddian_toko: Number(user.access_mybeddian_toko) === 1 ? 1 : 0,
            access_mybeddian_pjgt: Number(user.access_mybeddian_pjgt) === 1 ? 1 : 0
          })
          setPjgtMadrasah(user.pjgt_madrasah && user.pjgt_madrasah.id ? user.pjgt_madrasah : null)
          {
            const sl = Array.isArray(user.santri_list) ? user.santri_list : []
            setMybeddianSantriList(
              sl.length > 0
                ? sl.map((x) => ({ id: x.id, nis: x.nis ?? null, nama: x.nama ?? '' }))
                : user.santri?.id
                  ? [{ id: user.santri.id, nis: user.santri.nis ?? null, nama: user.santri.nama ?? '' }]
                  : []
            )
          }
          setUserTokoList(Array.isArray(user.toko) ? user.toko : [])
          if (user.pengurus_id) {
            // User punya pengurus: simpan data users untuk label read-only (username, email, verifikasi), lalu load data pengurus
            setDisplayUserInfo({
              username: user.username || '',
              no_wa: user.no_wa || '',
              email: user.email || '',
              email_verified_at: user.email_verified_at || null,
              no_wa_verified_at: user.no_wa_verified_at || null
            })
            const pengurusResponse = await manageUsersAPI.getById(user.pengurus_id)
            if (pengurusResponse.success && pengurusResponse.data?.user) {
              const p = pengurusResponse.data.user
              let displayStatus = p.status || 'active'
              if (displayStatus.toLowerCase() === 'aktif') displayStatus = 'active'
              else if (displayStatus.toLowerCase() === 'tidak aktif') displayStatus = 'inactive'
              setFormData({ nama: p.nama || '', whatsapp: p.whatsapp || '', status: displayStatus })
              setUserRoles(p.roles || [])
              setUserJabatan(p.jabatan || [])
              setEffectiveEditId(user.pengurus_id)
              setUserFromUsers(user)
              setLoading(false)
              return
            }
          }
          setUserFromUsers(user)
          setUserTokoList(Array.isArray(user.toko) ? user.toko : [])
          setLoading(false)
          return
        }
      } catch (v2Err) {
        if (v2Err.response?.status !== 404) {
          setError(v2Err.response?.data?.message || 'Gagal memuat data user')
          setLoading(false)
          return
        }
      }
      
      // Fallback: id = pengurus.id (buka langsung edit pengurus)
      const response = await manageUsersAPI.getById(id)
      if (response.success && response.data?.user) {
        const user = response.data.user
        let displayStatus = user.status || 'active'
        if (displayStatus.toLowerCase() === 'aktif') displayStatus = 'active'
        else if (displayStatus.toLowerCase() === 'tidak aktif') displayStatus = 'inactive'
        setFormData({
          nama: user.nama || '',
          whatsapp: user.whatsapp || '',
          status: displayStatus
        })
        setUserRoles(user.roles || [])
        setUserJabatan(user.jabatan || [])
        setEffectiveEditId(id)
      } else {
        setError(response.message || 'User tidak ditemukan')
      }
    } catch (err) {
      console.error('Error loading user:', err)
      if (err.response?.status === 401) {
        setError('Sesi Anda telah berakhir. Silakan login kembali.')
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else if (err.response?.status === 403) {
        setError('Anda tidak memiliki izin untuk mengakses halaman ini.')
      } else if (err.response?.status === 404) {
        setError('User tidak ditemukan')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data user')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      // Validate form data
      if (!formData.nama || formData.nama.trim() === '') {
        showNotification('Nama tidak boleh kosong', 'error')
        setSaving(false)
        return
      }

      if (!formData.status) {
        showNotification('Status harus dipilih', 'error')
        setSaving(false)
        return
      }

      // Normalize status
      let normalizedStatus = formData.status.toLowerCase()
      if (normalizedStatus === 'aktif') {
        normalizedStatus = 'active'
      } else if (normalizedStatus === 'tidak aktif') {
        normalizedStatus = 'inactive'
      }

      // Prepare update data
      const updateData = {
        nama: formData.nama.trim(),
        whatsapp: formData.whatsapp.trim(),
        status: normalizedStatus,
        roles: userRoles // Send array of roles
      }

      console.log('Updating user with data:', updateData)

      const response = await manageUsersAPI.update(effectiveEditId, updateData)

      if (response.success) {
        showNotification('User berhasil diperbarui', 'success')
        onUserSaved?.()
        setTimeout(() => {
          if (onClose) onClose()
          else navigate('/manage-users')
        }, 1500)
      } else {
        showNotification(response.message || 'Gagal memperbarui user', 'error')
      }
    } catch (err) {
      console.error('Error updating user:', err)
      console.error('Error response:', err.response?.data)
      if (err.response?.status === 400) {
        const errorMessage = err.response?.data?.message || 'Data tidak valid. Pastikan semua field terisi dengan benar.'
        showNotification(errorMessage, 'error')
      } else if (err.response?.status === 401) {
        showNotification('Sesi Anda telah berakhir. Silakan login kembali.', 'error')
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else if (err.response?.status === 403) {
        showNotification('Anda tidak memiliki izin untuk melakukan operasi ini.', 'error')
      } else {
        showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memperbarui user', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  /** Ubah status lewat togel — simpan langsung ke backend */
  const handleStatusChange = async (newStatus) => {
    if (!effectiveEditId || statusSaving) return
    let normalized = newStatus.toLowerCase()
    if (normalized === 'aktif') normalized = 'active'
    else if (normalized === 'tidak aktif') normalized = 'inactive'
    setFormData(prev => ({ ...prev, status: normalized }))
    setStatusSaving(true)
    try {
      const updateData = {
        nama: formData.nama.trim(),
        whatsapp: formData.whatsapp.trim(),
        status: normalized,
        roles: userRoles
      }
      const response = await manageUsersAPI.update(effectiveEditId, updateData)
      if (response.success) {
        showNotification('Status berhasil diperbarui', 'success')
      } else {
        showNotification(response.message || 'Gagal memperbarui status', 'error')
        setFormData(prev => ({ ...prev, status: formData.status }))
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal memperbarui status', 'error')
      setFormData(prev => ({ ...prev, status: formData.status }))
    } finally {
      setStatusSaving(false)
    }
  }

  const handleResetPassword = async () => {
    if (!window.confirm('Kirim link buat password baru ke WhatsApp user ini?')) {
      return
    }

    setResettingPassword(true)
    setError('')

    try {
      const response = await manageUsersAPI.sendResetPasswordLink(effectiveEditId)
      if (response.success) {
        showNotification(response.message || 'Link reset password telah dikirim ke WhatsApp user.', 'success')
      } else {
        showNotification(response.message || 'Gagal mengirim link', 'error')
      }
    } catch (err) {
      console.error('Error sending reset password link:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat mengirim link', 'error')
    } finally {
      setResettingPassword(false)
    }
  }

  const handleAddRole = async () => {
    if (!newRole.role_id) {
      showNotification('Pilih role terlebih dahulu', 'error')
      return
    }
    
    try {
      const response = await manageUsersAPI.addUserRole(effectiveEditId, newRole)
      if (response.success) {
        await loadUserData()
        setShowAddRoleModal(false)
        setNewRole({ role_id: '', lembaga_id: '' })
        showNotification('Role berhasil ditambahkan', 'success')
      } else {
        showNotification(response.message || 'Gagal menambahkan role', 'error')
      }
    } catch (err) {
      console.error('Error adding role:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat menambahkan role', 'error')
    }
  }
  
  const handleRemoveRole = async (pengurusRoleId) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus role ini?')) {
      return
    }
    try {
      const response = await manageUsersAPI.removeUserRole(effectiveEditId, pengurusRoleId)
      if (response.success) {
        await loadUserData()
        showNotification('Role berhasil dihapus', 'success')
      } else {
        showNotification(response.message || 'Gagal menghapus role', 'error')
      }
    } catch (err) {
      console.error('Error removing role:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat menghapus role', 'error')
    }
  }

  const handleAddJabatan = async () => {
    if (!newJabatan.lembaga_id) {
      showNotification('Pilih lembaga terlebih dahulu', 'error')
      return
    }
    if (!newJabatan.jabatan_id) {
      showNotification('Pilih jabatan terlebih dahulu', 'error')
      return
    }
    try {
      const response = await manageUsersAPI.addUserJabatan(effectiveEditId, newJabatan)
      if (response.success) {
        await loadUserData()
        setShowAddJabatanModal(false)
        setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
        showNotification('Jabatan berhasil ditambahkan', 'success')
      } else {
        showNotification(response.message || 'Gagal menambahkan jabatan', 'error')
      }
    } catch (err) {
      console.error('Error adding jabatan:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat menambahkan jabatan', 'error')
    }
  }
  
  const handleRemoveJabatan = async (pengurusJabatanId) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus jabatan ini?')) {
      return
    }
    try {
      const response = await manageUsersAPI.removeUserJabatan(effectiveEditId, pengurusJabatanId)
      if (response.success) {
        await loadUserData()
        showNotification('Jabatan berhasil dihapus', 'success')
      } else {
        showNotification(response.message || 'Gagal menghapus jabatan', 'error')
      }
    } catch (err) {
      console.error('Error removing jabatan:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat menghapus jabatan', 'error')
    }
  }

  const handleDeleteUser = () => {
    setShowDeleteModal(true)
    setConfirmDeleteId('')
    setError('')
  }

  const handleCloseDeleteModal = () => {
    if (!deleting) {
      setShowDeleteModal(false)
      setConfirmDeleteId('')
      setError('')
    }
  }

  const handleConfirmDelete = async () => {
    const idToDelete = effectiveEditId ?? id
    if (confirmDeleteId.trim() !== String(idToDelete)) {
      showNotification('ID yang dimasukkan tidak sesuai. Masukkan ID yang benar untuk menghapus.', 'error')
      return
    }

    setDeleting(true)
    setError('')

    try {
      const response = effectiveEditId
        ? await manageUsersAPI.delete(effectiveEditId)
        : await manageUsersAPI.deleteByUsersId(id)
      if (response.success) {
        showNotification(response.message || 'User berhasil dihapus. Mengalihkan ke halaman Kelola User...', 'success')
        onUserSaved?.()
        setTimeout(() => {
          if (onClose) onClose()
          else navigate('/manage-users')
        }, 1500)
      } else {
        showNotification(response.message || 'Gagal menghapus user', 'error')
        setDeleting(false)
      }
    } catch (err) {
      console.error('Error deleting user:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat menghapus user', 'error')
      setDeleting(false)
    }
  }

  /** Nama untuk ditampilkan di modal hapus (pengurus = formData.nama, santri/user = userFromUsers.nama atau username) */
  const deleteModalDisplayName = effectiveEditId ? (formData.nama || '') : (userFromUsers?.nama || userFromUsers?.username || id)
  const deleteModalConfirmId = effectiveEditId ?? id

  const updatePortalFlag = async (key, nextOn) => {
    if (!id || !(displayUserInfo || userFromUsers)) return
    setPortalSaving(true)
    try {
      const res = await manageUsersAPI.updateUserPortalAccessV2(id, { [key]: nextOn ? 1 : 0 })
      if (res.success) {
        setPortalAccess((prev) => ({ ...prev, [key]: nextOn ? 1 : 0 }))
        showNotification(res.message || 'Pengaturan akses diperbarui', 'success')
      } else {
        showNotification(res.message || 'Gagal memperbarui', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal memperbarui', 'error')
    } finally {
      setPortalSaving(false)
    }
  }

  const portalSwitchClass = (on) =>
    `relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed ${on ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`

  const showPortalControls = !!(id && (displayUserInfo || userFromUsers))
  /** Tampilan switch: aktif hanya jika ada data + flag DB; tanpa tautan selalu tampil mati (bukan aktif + disabled). */
  const mybeddianSantriSwitchOn = mybeddianSantriList.length > 0 && portalAccess.access_mybeddian_santri === 1
  const mybeddianTokoSwitchOn = userTokoList.length > 0 && portalAccess.access_mybeddian_toko === 1
  const mybeddianPjgtSwitchOn = !!pjgtMadrasah && portalAccess.access_mybeddian_pjgt === 1
  const linkedPengurusForPortal = effectiveEditId
    ? {
        id: Number(effectiveEditId),
        nama: formData.nama || userFromUsers?.pengurus?.nama || '',
        nip: userFromUsers?.pengurus?.nip ?? null,
      }
    : (userFromUsers?.pengurus?.id
      ? {
          id: Number(userFromUsers.pengurus.id),
          nama: userFromUsers.pengurus.nama || '',
          nip: userFromUsers.pengurus.nip ?? null,
        }
      : null)
  const isCompactLayout = variant === 'offcanvas'

  if (loading) {
    if (variant === 'offcanvas') {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 px-4">
          <div className="animate-spin rounded-full h-11 w-11 border-2 border-primary-600 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data...</p>
        </div>
      )
    }
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

  const portalControlsEl = showPortalControls ? (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/40 ${isCompactLayout ? 'p-3' : 'p-4'} space-y-3`}>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Aplikasi &amp; akses Mybeddian</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">Izinkan login per aplikasi / peran. Matikan toggle untuk memblokir tanpa menghapus tautan data.</p>

      <div className="flex items-start justify-between gap-2 py-2 border-b border-gray-200/80 dark:border-gray-600/80">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">eBeddien</p>
          {linkedPengurusForPortal ? (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 truncate" title={linkedPengurusForPortal.nama}>
              Tertaut pengurus: <span className="font-medium">{linkedPengurusForPortal.nama || '—'}</span>
              {linkedPengurusForPortal.nip != null && linkedPengurusForPortal.nip !== ''
                ? ` · NIP ${linkedPengurusForPortal.nip}`
                : ` · ID ${linkedPengurusForPortal.id}`}
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Login eBeddien (butuh tautan ke data pengurus + role)
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPengurusLinkPickerOpen(true)}
              disabled={pengurusLinkSaving}
              className="px-2.5 py-1 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50"
            >
              {linkedPengurusForPortal ? 'Ganti tautan pengurus' : 'Tautkan ke pengurus'}
            </button>
            {linkedPengurusForPortal && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Lepas tautan pengurus "${linkedPengurusForPortal.nama || linkedPengurusForPortal.id}" dari akun ini?`)) return
                  setPengurusLinkSaving(true)
                  try {
                    const res = await manageUsersAPI.setPengurusLink(id, null)
                    if (res.success) {
                      showNotification(res.message || 'Tautan pengurus dilepas', 'success')
                      await loadUserData()
                      onUserSaved?.()
                    } else {
                      showNotification(res.message || 'Gagal', 'error')
                    }
                  } catch (err) {
                    showNotification(err.response?.data?.message || 'Gagal', 'error')
                  } finally {
                    setPengurusLinkSaving(false)
                  }
                }}
                disabled={pengurusLinkSaving}
                className="px-2.5 py-1 text-xs text-red-700 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                Lepas tautan
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={portalAccess.access_ebeddien === 1}
          disabled={portalSaving}
          onClick={() => updatePortalFlag('access_ebeddien', portalAccess.access_ebeddien !== 1)}
          className={portalSwitchClass(portalAccess.access_ebeddien === 1)}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${portalAccess.access_ebeddien === 1 ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="flex items-start justify-between gap-2 py-2 border-b border-gray-200/80 dark:border-gray-600/80">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mybeddian · Santri</p>
          {mybeddianSantriList.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {mybeddianSantriList.map((s) => (
                <li
                  key={s.id}
                  className="text-xs text-gray-600 dark:text-gray-300 flex items-start justify-between gap-2"
                  title={`${s.nama} (NIS ${s.nis ?? '—'})`}
                >
                  <span className="min-w-0 truncate font-medium">{s.nama || '—'}</span>
                  <span className="shrink-0 text-gray-500">NIS {s.nis ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Belum tertaut ke data santri</p>
          )}
          {mybeddianSantriList.length > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
              Untuk memotong hasil Bisyaroh ke pembayaran UWABA santri yang tertaut: Lembaga → Bisyaroh → tab Aturan → blok «Potong
              kewajiban» — isi ID pengguna ini: <span className="font-mono text-gray-700 dark:text-gray-300">{id}</span>.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSantriPickerOpen(true)}
              className="px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
            >
              {mybeddianSantriList.length > 0 ? 'Tambah tautan santri' : 'Tautkan santri'}
            </button>
            {mybeddianSantriList.length > 0 && (
              <>
                {mybeddianSantriList.map((s) => (
                  <button
                    key={`lepas-${s.id}`}
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Lepas tautan santri "${s.nama || s.id}" dari akun ini?`)) return
                      setMybeddianAccessSaving(true)
                      try {
                        const res = await manageUsersAPI.removeOneMybeddianSantri(id, s.id)
                        if (res.success) {
                          showNotification(res.message || 'Tautan dilepas', 'success')
                          setMybeddianSantriList((prev) => prev.filter((x) => x.id !== s.id))
                          setUserFromUsers((prev) => {
                            if (!prev) return prev
                            const nextList = (Array.isArray(prev.santri_list) ? prev.santri_list : []).filter((x) => x.id !== s.id)
                            const first = nextList[0]
                            return {
                              ...prev,
                              santri_list: nextList,
                              santri: first || null,
                              santri_id: first?.id ?? null
                            }
                          })
                        } else {
                          showNotification(res.message || 'Gagal', 'error')
                        }
                      } catch (err) {
                        showNotification(err.response?.data?.message || 'Gagal', 'error')
                      } finally {
                        setMybeddianAccessSaving(false)
                      }
                    }}
                    disabled={mybeddianAccessSaving}
                    className="px-2 py-0.5 text-[11px] text-red-600 rounded border border-red-200 dark:border-red-800 disabled:opacity-50"
                  >
                    Lepas {s.nis ?? s.id}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Lepas semua tautan santri dari akun ini?')) return
                    setMybeddianAccessSaving(true)
                    try {
                      const res = await manageUsersAPI.setMybeddianAccess(id, null)
                      if (res.success) {
                        showNotification(res.message || 'Semua tautan santri dihapus', 'success')
                        setMybeddianSantriList([])
                        setUserFromUsers((prev) =>
                          prev
                            ? { ...prev, santri_list: [], santri: null, santri_id: null }
                            : prev
                        )
                      } else {
                        showNotification(res.message || 'Gagal', 'error')
                      }
                    } catch (err) {
                      showNotification(err.response?.data?.message || 'Gagal', 'error')
                    } finally {
                      setMybeddianAccessSaving(false)
                    }
                  }}
                  disabled={mybeddianAccessSaving}
                  className="px-2.5 py-1 text-xs text-red-700 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Lepas semua
                </button>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mybeddianSantriSwitchOn}
          disabled={portalSaving || mybeddianSantriList.length === 0}
          title={mybeddianSantriList.length === 0 ? 'Tautkan santri dulu untuk mengaktifkan' : undefined}
          onClick={() => updatePortalFlag('access_mybeddian_santri', portalAccess.access_mybeddian_santri !== 1)}
          className={portalSwitchClass(mybeddianSantriSwitchOn)}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${mybeddianSantriSwitchOn ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="flex items-start justify-between gap-2 py-2 border-b border-gray-200/80 dark:border-gray-600/80">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mybeddian · Toko</p>
          {userTokoList.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {userTokoList.map((t) => (
                <li key={t.id} className="text-xs text-gray-600 dark:text-gray-300 flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{t.nama_toko}</span>
                  <span className="shrink-0 text-gray-500">{t.kode_toko}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Belum ada toko</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTokoLinkPickerOpen(true)}
              className="px-2.5 py-1 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
            >
              Tautkan toko
            </button>
            <button
              type="button"
              onClick={() => { setShowTokoCreateModal(true); setTokoForm({ nama_toko: '', kode_toko: '' }) }}
              className="px-2.5 py-1 text-xs border border-teal-600 text-teal-700 dark:text-teal-300 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30"
            >
              Buat toko baru
            </button>
          </div>
          {userTokoList.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {userTokoList.map((t) => (
                <button
                  key={`cabut-${t.id}`}
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Cabut toko "${t.nama_toko}"?`)) return
                    setTokoSaving(true)
                    try {
                      const res = await manageUsersAPI.removeTokoFromUser(id, t.id)
                      if (res.success) {
                        showNotification(res.message || 'Dicabut', 'success')
                        setUserTokoList((prev) => prev.filter((x) => x.id !== t.id))
                      } else {
                        showNotification(res.message || 'Gagal', 'error')
                      }
                    } catch (err) {
                      showNotification(err.response?.data?.message || 'Gagal', 'error')
                    } finally {
                      setTokoSaving(false)
                    }
                  }}
                  disabled={tokoSaving}
                  className="px-2 py-0.5 text-[11px] text-red-600 rounded border border-red-200 dark:border-red-800 disabled:opacity-50"
                >
                  Cabut {t.kode_toko}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mybeddianTokoSwitchOn}
          disabled={portalSaving || userTokoList.length === 0}
          title={userTokoList.length === 0 ? 'Hubungkan toko dulu untuk mengaktifkan' : undefined}
          onClick={() => updatePortalFlag('access_mybeddian_toko', portalAccess.access_mybeddian_toko !== 1)}
          className={portalSwitchClass(mybeddianTokoSwitchOn)}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${mybeddianTokoSwitchOn ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="flex items-start justify-between gap-2 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mybeddian · PJGT</p>
          {pjgtMadrasah ? (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 truncate" title={pjgtMadrasah.identitas || ''}>
              <span className="font-medium">{pjgtMadrasah.nama || '—'}</span>
              {pjgtMadrasah.identitas ? <span className="text-gray-500"> · ID {pjgtMadrasah.identitas}</span> : null}
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Belum terdaftar sebagai PJGT madrasah</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {!pjgtMadrasah ? (
              <button
                type="button"
                onClick={() => { setShowPjgtModal(true); setPjgtSearch(''); setPjgtOptions([]) }}
                className="px-2.5 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
              >
                Hubungkan madrasah (PJGT)
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Lepas user ini sebagai PJGT dari madrasah?')) return
                  setPjgtLinkSaving(true)
                  try {
                    const res = await manageUsersAPI.unlinkUserPjgt(id)
                    if (res.success) {
                      showNotification(res.message || 'Hubungan PJGT dilepas', 'success')
                      setPjgtMadrasah(null)
                    } else {
                      showNotification(res.message || 'Gagal', 'error')
                    }
                  } catch (err) {
                    showNotification(err.response?.data?.message || 'Gagal', 'error')
                  } finally {
                    setPjgtLinkSaving(false)
                  }
                }}
                disabled={pjgtLinkSaving}
                className="px-2.5 py-1 text-xs text-red-600 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                Lepas PJGT
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mybeddianPjgtSwitchOn}
          disabled={portalSaving || !pjgtMadrasah}
          title={!pjgtMadrasah ? 'Hubungkan madrasah dulu untuk mengaktifkan' : undefined}
          onClick={() => updatePortalFlag('access_mybeddian_pjgt', portalAccess.access_mybeddian_pjgt !== 1)}
          className={portalSwitchClass(mybeddianPjgtSwitchOn)}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${mybeddianPjgtSwitchOn ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>
    </div>
  ) : null

  const mainBlocks = (
    <>
        {variant === 'page' && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate('/manage-users')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali ke Daftar User
          </button>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Edit User</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {effectiveEditId ? `Pengurus ID: ${effectiveEditId}` : `ID: ${id}`}
          </p>
        </div>
        )}
        {variant === 'offcanvas' && (
        <div className="mb-4 px-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {effectiveEditId ? `Pengurus ID: ${effectiveEditId}` : `User ID: ${id}`}
          </p>
        </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Tampilan ringkas ketika id = users.id dan user TIDAK punya pengurus (hanya info akun) */}
        {userFromUsers && !effectiveEditId && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Akun (tabel users)</h2>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <div><dt className="text-gray-500 dark:text-gray-400">Username</dt><dd className="font-medium">{userFromUsers.username || '-'}</dd></div>
              <div><dt className="text-gray-500 dark:text-gray-400">No. WA</dt><dd>{userFromUsers.no_wa || '-'}</dd></div>
              <div><dt className="text-gray-500 dark:text-gray-400">Email</dt><dd>{userFromUsers.email || '-'}</dd></div>
            </dl>
            {(Array.isArray(userFromUsers.santri_list) && userFromUsers.santri_list.length > 0) || userFromUsers.santri_id ? (
              <span className="inline-block px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg text-sm">
                {Array.isArray(userFromUsers.santri_list) && userFromUsers.santri_list.length > 1
                  ? `Terhubung ${userFromUsers.santri_list.length} santri`
                  : `Terhubung santri (ID: ${userFromUsers.santri_id ?? userFromUsers.santri_list?.[0]?.id ?? '—'})`}
              </span>
            ) : null}
            {!userFromUsers.pengurus_id && !userFromUsers.santri_id && !(Array.isArray(userFromUsers.santri_list) && userFromUsers.santri_list.length) && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Belum terhubung ke data pengurus atau santri.</p>
            )}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              {portalControlsEl}
            </div>
            {/* Tombol Hapus User untuk user santri-only (tanpa pengurus) */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleting}
                className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Hapus User</span>
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                Hapus akun ini secara permanen. Data santri tetap tersimpan dan dapat ditautkan ke akun lain.
              </p>
            </div>
          </div>
        )}

        {/* Satu form: role, status, reset password (saat ada effectiveEditId = pengurus) */}
        {effectiveEditId && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          {/* Nama, WA, Username, Email, verifikasi — Nama & Username read-only; No WA & Email bisa diedit */}
          <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-600">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Data user</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm mb-4">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Nama</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{formData.nama || '-'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Username</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">{displayUserInfo?.username ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Terakhir verifikasi email</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                  {displayUserInfo?.email_verified_at
                    ? new Date(displayUserInfo.email_verified_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Terakhir verifikasi WA</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                  {displayUserInfo?.no_wa_verified_at
                    ? new Date(displayUserInfo.no_wa_verified_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                    : '-'}
                </dd>
              </div>
            </dl>
            {displayUserInfo && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <label htmlFor="edit-no-wa" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">No. WA (bisa diedit)</label>
                  <input
                    id="edit-no-wa"
                    type="text"
                    value={userProfileEdit.no_wa}
                    onChange={(e) => setUserProfileEdit(prev => ({ ...prev, no_wa: e.target.value }))}
                    placeholder="08..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="edit-email" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Email (bisa diedit)</label>
                  <input
                    id="edit-email"
                    type="email"
                    value={userProfileEdit.email}
                    onChange={(e) => setUserProfileEdit(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="email@example.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleSaveNoWaEmail}
                    disabled={savingProfile}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50"
                  >
                    {savingProfile ? 'Menyimpan...' : 'Simpan No WA & Email'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {displayUserInfo && id && (
            <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-600">
              {portalControlsEl}
            </div>
          )}

          <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Role / Akses
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setNewRole({ role_id: '', lembaga_id: '' })
                    setShowAddRoleModal(true)
                  }}
                  className="text-sm px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  + Tambah Role
                </button>
              </div>
              
              {userRoles.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center border border-gray-300 dark:border-gray-600 rounded-lg">
                  Belum ada role. Klik "Tambah Role" untuk menambahkan.
                </div>
              ) : (
                <div className="space-y-2">
                  {userRoles.map((userRole) => {
                    const roleInfo = availableRoles.find(r => r.id === userRole.role_id)
                    const lembagaInfo = lembaga.find(l => l.id === userRole.lembaga_id)
                    
                    return (
                      <div
                        key={userRole.pengurus_role_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 dark:text-gray-200">
                            {roleInfo ? roleInfo.label : `Role ID: ${userRole.role_id}`}
                            {roleInfo && (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                ({roleInfo.key})
                              </span>
                            )}
                          </div>
                          {userRole.lembaga_id && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              Lembaga: {lembagaInfo ? (lembagaInfo.nama || lembagaInfo.id) : userRole.lembaga_id}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRole(userRole.pengurus_role_id)}
                          className="ml-3 px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                User dapat memiliki lebih dari satu role. Setiap role dapat dikaitkan dengan lembaga tertentu.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Jabatan
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
                    setShowAddJabatanModal(true)
                  }}
                  className="text-sm px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  + Tambah Jabatan
                </button>
              </div>
              
              {userJabatan.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center border border-gray-300 dark:border-gray-600 rounded-lg">
                  Belum ada jabatan. Klik "Tambah Jabatan" untuk menambahkan.
                </div>
              ) : (
                <div className="space-y-2">
                  {userJabatan.map((userJab) => {
                    const jabatanInfo = availableJabatan.find(j => j.id === userJab.jabatan_id)
                    const lembagaInfo = lembaga.find(l => l.id === userJab.lembaga_id)
                    
                    return (
                      <div
                        key={userJab.pengurus_jabatan_id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 dark:text-gray-200">
                            {jabatanInfo ? jabatanInfo.nama : `Jabatan ID: ${userJab.jabatan_id}`}
                            {jabatanInfo && (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                ({jabatanInfo.kategori})
                              </span>
                            )}
                          </div>
                          {userJab.lembaga_id && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              Lembaga: {lembagaInfo ? (lembagaInfo.nama || lembagaInfo.id) : userJab.lembaga_id}
                            </div>
                          )}
                          {(userJab.tanggal_mulai || userJab.tanggal_selesai) && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {userJab.tanggal_mulai && `Mulai: ${userJab.tanggal_mulai}`}
                              {userJab.tanggal_mulai && userJab.tanggal_selesai && ' | '}
                              {userJab.tanggal_selesai && `Selesai: ${userJab.tanggal_selesai}`}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Status: {userJab.jabatan_status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveJabatan(userJab.pengurus_jabatan_id)}
                          className="ml-3 px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                User dapat memiliki lebih dari satu jabatan. Setiap jabatan dapat dikaitkan dengan lembaga tertentu dan memiliki periode waktu tertentu.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status (langsung tersimpan)
              </label>
              <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 p-1">
                {[
                  { value: 'active', label: 'Aktif' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'inactive', label: 'Tidak Aktif' }
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={statusSaving}
                    onClick={() => handleStatusChange(value)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      formData.status === value
                        ? 'bg-primary-600 text-white shadow'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    } ${statusSaving ? 'opacity-70' : ''}`}
                  >
                    {statusSaving && formData.status === value ? 'Menyimpan...' : label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="mb-4">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resettingPassword}
                  className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {resettingPassword ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Mereset Password...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Reset Password</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Link buat password baru akan dikirim ke WhatsApp user. User membuka link dan memasukkan password baru.
                </p>
              </div>

              <div className="mb-4">
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Menghapus...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Hapus User</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Hapus user ini secara permanen dari sistem. Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>

            </div>
          </form>

          {/* Aktivitas user (audit log) - tampil ketika ada effectiveEditId atau id user */}
          {(effectiveEditId || (id && (userFromUsers || displayUserInfo))) && (
            <section className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Aktivitas user</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">5 entri terbaru (create, update, delete, rollback).</p>
              {aktivitasLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
              ) : aktivitasList.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada aktivitas tercatat.</p>
              ) : (
                <ul className="space-y-2">
                  {aktivitasList.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{a.action}</span>
                        <span className="text-gray-500 dark:text-gray-400"> · {a.entity_type}</span>
                        {a.entity_id && <span className="text-gray-400 dark:text-gray-500"> #{a.entity_id}</span>}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        {a.created_at ? new Date(a.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '–'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Device aktif (hanya ketika id = users.id, yaitu displayUserInfo ada) */}
          {displayUserInfo && (
            <section className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Device aktif</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Ketuk untuk detail &amp; logout perangkat.</p>
              {sessionsLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat...</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada session aktif.</p>
              ) : (
                <ul className={isCompactLayout ? 'space-y-1.5' : 'space-y-2'}>
                  {sessions.map((s) => (
                    <li
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedSession(s); setShowSessionOffcanvas(true) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedSession(s); setShowSessionOffcanvas(true) } }}
                      className={`w-full text-left rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50 ${isCompactLayout ? 'p-2' : 'p-3'}`}
                    >
                      <div className={`flex items-start gap-2 ${isCompactLayout ? '' : 'min-w-0'}`}>
                        <span className="shrink-0 text-gray-500 dark:text-gray-400 mt-0.5" aria-hidden>
                          {s.device_type === 'mobile' && (
                            <svg className={isCompactLayout ? 'w-4 h-4' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          )}
                          {s.device_type === 'tablet' && (
                            <svg className={isCompactLayout ? 'w-4 h-4' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          )}
                          {(s.device_type === 'desktop' || s.device_type === 'bot' || !s.device_type) && (
                            <svg className={isCompactLayout ? 'w-4 h-4' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium text-gray-800 dark:text-gray-200 leading-snug ${isCompactLayout ? 'text-xs' : 'text-sm'} truncate`}>
                            {s.browser_name || 'Browser'}{s.browser_version ? ` ${s.browser_version}` : ''}
                            <span className="font-normal text-gray-500 dark:text-gray-400"> · {s.os_name || 'OS'}{s.os_version ? ` ${s.os_version}` : ''}</span>
                          </p>
                          <p className={`text-gray-500 dark:text-gray-400 mt-0.5 ${isCompactLayout ? 'text-[11px] leading-tight' : 'text-xs'} truncate`}>
                            {s.device_type || 'perangkat'}
                            {s.ip_address ? ` · ${s.ip_address}` : ''}
                            {s.last_activity_at ? ` · ${new Date(s.last_activity_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
        )}
    </>
  )

  const pageShell = (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {mainBlocks}
          </motion.div>
        </div>
      </div>
    </div>
  )

  const offcanvasShell = (
    <div className="p-4 sm:p-5 space-y-4 pb-10">
      {mainBlocks}
    </div>
  )

  return (
    <>
      {variant === 'page' ? pageShell : offcanvasShell}

      {/* Add Jabatan Modal */}
      <Modal
        isOpen={showAddJabatanModal}
        onClose={() => {
          setShowAddJabatanModal(false)
          setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
          setError('')
        }}
        title="Tambah Jabatan"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <label htmlFor="new_jabatan_lembaga_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Lembaga *
            </label>
            <select
              id="new_jabatan_lembaga_id"
              value={newJabatan.lembaga_id}
              onChange={(e) => {
                // Reset jabatan_id ketika lembaga berubah
                setNewJabatan({ ...newJabatan, lembaga_id: e.target.value, jabatan_id: '' })
              }}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="">-- Pilih Lembaga --</option>
              {lembaga.map((lem) => (
                <option key={lem.id} value={lem.id}>
                  {lem.nama || lem.id}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Pilih lembaga terlebih dahulu untuk melihat daftar jabatan
            </p>
          </div>

          <div className="mb-4">
            <label htmlFor="new_jabatan_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Jabatan *
            </label>
            <select
              id="new_jabatan_id"
              value={newJabatan.jabatan_id}
              onChange={(e) => setNewJabatan({ ...newJabatan, jabatan_id: e.target.value })}
              disabled={!newJabatan.lembaga_id}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {newJabatan.lembaga_id ? '-- Pilih Jabatan --' : '-- Pilih Lembaga terlebih dahulu --'}
              </option>
              {availableJabatan
                .filter(jabatan => {
                  // Filter berdasarkan lembaga yang dipilih
                  if (newJabatan.lembaga_id) {
                    // Jika lembaga dipilih, hanya tampilkan jabatan untuk lembaga tersebut atau jabatan tanpa lembaga (global)
                    return jabatan.lembaga_id === newJabatan.lembaga_id || !jabatan.lembaga_id
                  }
                  return false
                })
                .filter(jabatan => !userJabatan.some(uj => uj.jabatan_id === jabatan.id && uj.jabatan_status === 'aktif'))
                .map((jabatan) => (
                  <option key={jabatan.id} value={jabatan.id}>
                    {jabatan.nama} ({jabatan.kategori})
                    {!jabatan.lembaga_id && ' - Global'}
                  </option>
                ))}
            </select>
            {newJabatan.lembaga_id && availableJabatan.filter(j => 
              (j.lembaga_id === newJabatan.lembaga_id || !j.lembaga_id) &&
              !userJabatan.some(uj => uj.jabatan_id === j.id && uj.jabatan_status === 'aktif')
            ).length === 0 && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                Tidak ada jabatan tersedia untuk lembaga ini
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="new_jabatan_tanggal_mulai" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tanggal Mulai
              </label>
              <input
                type="date"
                id="new_jabatan_tanggal_mulai"
                value={newJabatan.tanggal_mulai}
                onChange={(e) => setNewJabatan({ ...newJabatan, tanggal_mulai: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
              />
            </div>
            <div>
              <label htmlFor="new_jabatan_tanggal_selesai" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tanggal Selesai
              </label>
              <input
                type="date"
                id="new_jabatan_tanggal_selesai"
                value={newJabatan.tanggal_selesai}
                onChange={(e) => setNewJabatan({ ...newJabatan, tanggal_selesai: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="new_jabatan_status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              id="new_jabatan_status"
              value={newJabatan.status}
              onChange={(e) => setNewJabatan({ ...newJabatan, status: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>
          
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setShowAddJabatanModal(false)
                setNewJabatan({ jabatan_id: '', lembaga_id: '', tanggal_mulai: '', tanggal_selesai: '', status: 'aktif' })
                setError('')
              }}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleAddJabatan}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Tambah
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Role Modal */}
      <Modal
        isOpen={showAddRoleModal}
        onClose={() => {
          setShowAddRoleModal(false)
          setNewRole({ role_id: '', lembaga_id: '' })
          setError('')
        }}
        title="Tambah Role"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <label htmlFor="new_role_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Role
            </label>
            <select
              id="new_role_id"
              value={newRole.role_id}
              onChange={(e) => setNewRole({ ...newRole, role_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="">-- Pilih Role --</option>
              {availableRoles
                .filter(role => !userRoles.some(ur => ur.role_id === role.id))
                .map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label} ({role.key})
                  </option>
                ))}
            </select>
          </div>
          
          <div className="mb-4">
            <label htmlFor="new_lembaga_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Lembaga (Opsional)
            </label>
            <select
              id="new_lembaga_id"
              value={newRole.lembaga_id}
              onChange={(e) => setNewRole({ ...newRole, lembaga_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="">-- Pilih Lembaga (Opsional) --</option>
              {lembaga.map((lem) => (
                <option key={lem.id} value={lem.id}>
                  {lem.nama || lem.id}
                </option>
              ))}
            </select>
          </div>
          
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setShowAddRoleModal(false)
                setNewRole({ role_id: '', lembaga_id: '' })
                setError('')
              }}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleAddRole}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Tambah
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal konfirmasi hapus user — modern */}
      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        title=""
        maxWidth="max-w-md"
        closeOnBackdropClick={!deleting}
        showCloseButton={!deleting}
      >
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Hapus user?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Anda akan menghapus akun <strong className="text-gray-800 dark:text-gray-200">{deleteModalDisplayName || '—'}</strong> (ID: <strong>{deleteModalConfirmId}</strong>). Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ketik <strong>{deleteModalConfirmId}</strong> untuk konfirmasi
            </label>
            <input
              type="text"
              value={confirmDeleteId}
              onChange={(e) => {
                setConfirmDeleteId(e.target.value)
                setError('')
              }}
              placeholder={String(deleteModalConfirmId)}
              disabled={deleting}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 text-center font-mono"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCloseDeleteModal}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting || confirmDeleteId.trim() !== String(deleteModalConfirmId)}
              className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {deleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Hapus User</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal buat toko baru (Mybeddian) */}
      <Modal
        isOpen={showTokoCreateModal}
        onClose={() => { setShowTokoCreateModal(false); setTokoForm({ nama_toko: '', kode_toko: '' }) }}
        title="Buat Toko Baru (Mybeddian)"
        maxWidth="max-w-md"
      >
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Buat toko cashless baru dan langsung tautkan ke akun user ini.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama toko</label>
              <input
                type="text"
                value={tokoForm.nama_toko}
                onChange={(e) => setTokoForm((prev) => ({ ...prev, nama_toko: e.target.value }))}
                placeholder="Contoh: Warung Bu Ani"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kode toko</label>
              <input
                type="text"
                value={tokoForm.kode_toko}
                onChange={(e) => setTokoForm((prev) => ({ ...prev, kode_toko: e.target.value }))}
                placeholder="Contoh: 26030101"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-100 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => { setShowTokoCreateModal(false); setTokoForm({ nama_toko: '', kode_toko: '' }) }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={tokoSaving || !tokoForm.nama_toko?.trim() || !tokoForm.kode_toko?.trim()}
              onClick={async () => {
                if (!id) return
                setTokoSaving(true)
                try {
                  const res = await manageUsersAPI.addTokoToUser(id, {
                    nama_toko: tokoForm.nama_toko.trim(),
                    kode_toko: tokoForm.kode_toko.trim(),
                  })
                  if (res.success) {
                    showNotification(res.message || 'Akses toko ditambahkan', 'success')
                    const listRes = await manageUsersAPI.getTokoForUser(id)
                    if (listRes.success && Array.isArray(listRes.data)) setUserTokoList(listRes.data)
                    setShowTokoCreateModal(false)
                    setTokoForm({ nama_toko: '', kode_toko: '' })
                  } else {
                    showNotification(res.message || 'Gagal menambahkan akses toko', 'error')
                  }
                } catch (err) {
                  showNotification(err.response?.data?.message || 'Gagal menambahkan akses toko', 'error')
                } finally {
                  setTokoSaving(false)
                }
              }}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tokoSaving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </Modal>

      {createPortal(
        <>
          <SearchOffcanvas
            isOpen={santriPickerOpen}
            onClose={closeSantriPicker}
            onSelectSantriRecord={handleSantriPick}
            zIndex={PICKER_OFFCANVAS_Z}
          />
          <CariTokoOffcanvas
            isOpen={tokoLinkPickerOpen}
            onClose={closeTokoLinkPicker}
            onSelect={handleTokoPick}
            title="Tautkan Toko"
            excludeIds={userTokoList.map((t) => t.id)}
          />
          <CariPengurusOffcanvas
            isOpen={pengurusLinkPickerOpen}
            onClose={closePengurusLinkPicker}
            onSelect={handlePengurusPick}
            title="Tautkan ke Pengurus"
            onlyWithoutUser
            allowUserId={id}
          />
        </>,
        document.body
      )}

      {/* Modal hubungkan madrasah sebagai PJGT */}
      <Modal
        isOpen={showPjgtModal}
        onClose={() => { setShowPjgtModal(false); setPjgtSearch(''); setPjgtOptions([]) }}
        title="Hubungkan sebagai PJGT madrasah"
        maxWidth="max-w-lg"
      >
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Pilih madrasah yang belum memiliki akun PJGT. User ini akan menjadi PJGT untuk madrasah tersebut (sinkron dengan kolom id_pjgt di data madrasah).
          </p>
          <input
            type="text"
            value={pjgtSearch}
            onChange={(e) => setPjgtSearch(e.target.value)}
            placeholder="Cari nama atau identitas madrasah..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100 text-sm mb-3"
          />
          <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg">
            {pjgtOptionsLoading ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat...</div>
            ) : pjgtOptions.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                {pjgtSearch.trim() ? 'Tidak ada madrasah yang cocok atau semua sudah punya PJGT.' : 'Tidak ada madrasah tanpa PJGT, atau ketik untuk mencari.'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                {pjgtOptions.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!id) return
                        setPjgtLinkSaving(true)
                        try {
                          const res = await manageUsersAPI.linkUserPjgt(id, { madrasah_id: m.id })
                          if (res.success) {
                            showNotification(res.message || 'PJGT terhubung', 'success')
                            const pm = res.data?.pjgt_madrasah
                            if (pm && pm.id) {
                              setPjgtMadrasah(pm)
                            } else {
                              setPjgtMadrasah({ id: m.id, nama: m.nama, identitas: m.identitas ?? null })
                            }
                            setShowPjgtModal(false)
                            setPjgtSearch('')
                            setPjgtOptions([])
                          } else {
                            showNotification(res.message || 'Gagal menghubungkan', 'error')
                          }
                        } catch (err) {
                          showNotification(err.response?.data?.message || 'Gagal menghubungkan', 'error')
                        } finally {
                          setPjgtLinkSaving(false)
                        }
                      }}
                      disabled={pjgtLinkSaving}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 flex justify-between items-center gap-2"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100 min-w-0 truncate">{m.nama || '—'}</span>
                      {m.identitas ? (
                        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">ID {m.identitas}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => { setShowPjgtModal(false); setPjgtSearch(''); setPjgtOptions([]) }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Batal
            </button>
          </div>
        </div>
      </Modal>

      {/* Offcanvas kanan: detail session + tombol Log Out (device aktif) */}
      {showSessionOffcanvas && selectedSession && createPortal(
        <AnimatePresence>
          <motion.div
            key="session-offcanvas-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSessionOffcanvas}
            className="fixed inset-0 bg-black/50 z-[260]"
          />
          <motion.div
            key="session-offcanvas-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[261] flex flex-col"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Detail Session</h3>
              <button
                type="button"
                onClick={closeSessionOffcanvas}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="flex justify-center py-4">
                {selectedSession.device_type === 'mobile' && (
                  <svg className="w-24 h-24 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                )}
                {selectedSession.device_type === 'tablet' && (
                  <svg className="w-28 h-24 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                )}
                {(selectedSession.device_type === 'desktop' || selectedSession.device_type === 'bot' || !selectedSession.device_type) && (
                  <svg className="w-28 h-24 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                )}
              </div>
              <div className="grid gap-2 text-sm">
                <div><span className="text-gray-500 dark:text-gray-400">Perangkat</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.device_type || '–'}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">Browser</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.browser_name || '–'}{selectedSession.browser_version ? ` ${selectedSession.browser_version}` : ''}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">OS</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.os_name || '–'}{selectedSession.os_version ? ` ${selectedSession.os_version}` : ''}</span></div>
                {selectedSession.device_id && (
                  <div><span className="text-gray-500 dark:text-gray-400">Device ID</span><br /><span className="text-gray-800 dark:text-gray-200 font-mono text-xs break-all" title={selectedSession.device_id}>{selectedSession.device_id}</span></div>
                )}
                {selectedSession.platform && (
                  <div><span className="text-gray-500 dark:text-gray-400">Platform</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.platform}</span></div>
                )}
                {selectedSession.timezone && (
                  <div><span className="text-gray-500 dark:text-gray-400">Zona waktu</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.timezone}</span></div>
                )}
                {selectedSession.language && (
                  <div><span className="text-gray-500 dark:text-gray-400">Bahasa</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.language}</span></div>
                )}
                {selectedSession.screen && (
                  <div><span className="text-gray-500 dark:text-gray-400">Layar</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.screen}</span></div>
                )}
                <div><span className="text-gray-500 dark:text-gray-400">IP</span><br /><span className="text-gray-800 dark:text-gray-200 font-mono">{selectedSession.ip_address || '–'}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">Terakhir aktif</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.last_activity_at ? new Date(selectedSession.last_activity_at).toLocaleString('id-ID') : '–'}</span></div>
                <div><span className="text-gray-500 dark:text-gray-400">Login pada</span><br /><span className="text-gray-800 dark:text-gray-200">{selectedSession.created_at ? new Date(selectedSession.created_at).toLocaleString('id-ID') : '–'}</span></div>
                {selectedSession.user_agent && (
                  <div><span className="text-gray-500 dark:text-gray-400">User-Agent</span><br /><span className="text-gray-700 dark:text-gray-300 text-xs break-all">{selectedSession.user_agent}</span></div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => handleRevokeSession(selectedSession)}
                disabled={revokeLoading}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-sm disabled:opacity-50"
              >
                {revokeLoading ? 'Memproses...' : 'Log Out'}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

export default function EditUser() {
  const { id } = useParams()
  const navigate = useNavigate()
  if (!id) {
    navigate('/manage-users', { replace: true })
    return null
  }
  return <EditUserContent userId={id} variant="page" />
}

