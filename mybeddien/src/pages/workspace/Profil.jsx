import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ACCESS_MODE, getHomePathForAccess, listAvailableAccessModes } from '../../config/accessMode'
import { profilAPI, authAPI } from '../../services/api'
import { useSantriIds, useSantriProfilCache } from '../../hooks/useSantriCachedResources'
import { syncSantriProfil } from '../../services/santriDataService'
import { useActiveAccessDisplayName } from '../../hooks/useActiveAccessDisplayName'
import ProfilFotoCropModal from '../../components/ProfilFotoCropModal'
import TambahAksesOffcanvas from '../../components/Profil/TambahAksesOffcanvas'
import { useMybeddienToast } from '../../hooks/useMybeddienToast'
import { PageEnter, PageEnterBlock, PageEnterLoading } from '../../components/motion/PageEnter'
import { browserSupportsWebAuthn, registerPasskey } from '../../utils/webauthnRegister'
import {
  addLocalPasskeyRowId,
  removeLocalPasskeyRowId,
  syncLocalPasskeyRowIdsWithServer,
  clearLocalPasskeyRowIdsForUsername,
  getLocalPasskeyRowIds,
} from '../../utils/passkeyLoginPrefs'
import { BiodataIcon, TokoIcon, MadrasahProfilIcon, WaliIcon } from '../../navigation/navIcons'

function formatTransportLabel(t) {
  const k = String(t || '').toLowerCase()
  if (k === 'internal') return 'Perangkat (platform)'
  if (k === 'hybrid') return 'Hybrid'
  if (k === 'usb') return 'USB'
  if (k === 'nfc') return 'NFC'
  if (k === 'ble') return 'Bluetooth'
  return t ? String(t) : ''
}

function formatPasskeyDeviceLabel(deviceType) {
  const k = String(deviceType || '').toLowerCase()
  if (k === 'mobile') return 'HP'
  if (k === 'tablet') return 'Tablet'
  if (k === 'desktop') return 'Laptop/PC'
  return null
}

function formatPasskeyClientApp(app) {
  const k = String(app || '').toLowerCase()
  if (k === 'mybeddien') return 'myBeddien'
  if (k === 'ebeddien') return 'eBeddien'
  return null
}

function withTimeout(promise, ms = 12000) {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), ms)
    Promise.resolve(promise).then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      }
    )
  })
}

function AksesModeIcon({ modeKey, className = 'h-5 w-5' }) {
  if (modeKey === ACCESS_MODE.toko) return <TokoIcon className={className} />
  if (modeKey === ACCESS_MODE.pjgt) return <MadrasahProfilIcon className={className} />
  if (modeKey === ACCESS_MODE.wali) return <WaliIcon className={className} />
  return <BiodataIcon className={className} />
}

function aksesModeAccent(modeKey) {
  if (modeKey === ACCESS_MODE.toko) {
    return {
      wrap: 'bg-amber-100 dark:bg-amber-900/35 text-amber-800 dark:text-amber-300',
      activeBorder: 'border-amber-400 dark:border-amber-600 bg-amber-50/90 dark:bg-amber-900/25',
      badge: 'bg-amber-600 dark:bg-amber-500',
    }
  }
  if (modeKey === ACCESS_MODE.pjgt) {
    return {
      wrap: 'bg-teal-100 dark:bg-teal-900/35 text-teal-800 dark:text-teal-300',
      activeBorder: 'border-teal-400 dark:border-teal-600 bg-teal-50/90 dark:bg-teal-900/25',
      badge: 'bg-teal-600 dark:bg-teal-500',
    }
  }
  if (modeKey === ACCESS_MODE.wali) {
    return {
      wrap: 'bg-violet-100 dark:bg-violet-900/35 text-violet-800 dark:text-violet-300',
      activeBorder: 'border-violet-400 dark:border-violet-600 bg-violet-50/90 dark:bg-violet-900/25',
      badge: 'bg-violet-600 dark:bg-violet-500',
    }
  }
  return {
    wrap: 'bg-sky-100 dark:bg-sky-900/35 text-sky-800 dark:text-sky-300',
    activeBorder: 'border-sky-400 dark:border-sky-600 bg-sky-50/90 dark:bg-sky-900/25',
    badge: 'bg-sky-600 dark:bg-sky-500',
  }
}

function Row({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 last:pb-0">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}

export default function Profil() {
  const navigate = useNavigate()
  const { user, patchUser, activeAccess, setActiveAccess, setAuth } = useAuthStore()
  const { showToast } = useMybeddienToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [showFotoMenu, setShowFotoMenu] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const fileInputRef = useRef(null)
  const photoUrlRef = useRef(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [noWaKonfirmasi, setNoWaKonfirmasi] = useState('')
  const [usernameBaru, setUsernameBaru] = useState('')
  const [passwordUsername, setPasswordUsername] = useState('')
  const [sendingLink, setSendingLink] = useState(false)
  const [sendingUsernameLink, setSendingUsernameLink] = useState(false)
  const [loadingNoWa, setLoadingNoWa] = useState(false)
  const [noWaMask, setNoWaMask] = useState('')

  const [passkeyRegistered, setPasskeyRegistered] = useState(false)
  const [passkeyStatusLoading, setPasskeyStatusLoading] = useState(true)
  const [passkeyStatusError, setPasskeyStatusError] = useState('')
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyCredentials, setPasskeyCredentials] = useState([])
  const [passkeyListLoading, setPasskeyListLoading] = useState(false)
  const [passkeyReloadTick, setPasskeyReloadTick] = useState(0)

  const { santriId, userId } = useSantriIds()
  const { profil: profilCached, loading: profilCacheLoading } = useSantriProfilCache()
  const { displayName: namaAksesAktif } = useActiveAccessDisplayName()

  const applyProfilData = (profileData) => {
    if (!profileData) return
    setData(profileData)
    patchUser({ foto_profil: profileData.foto_profil ?? null })
  }

  const refreshProfilFromServer = async () => {
    if (userId) {
      const fresh = await syncSantriProfil(santriId, userId)
      applyProfilData(fresh)
      return
    }
    const prefer =
      activeAccess === ACCESS_MODE.toko
        ? 'toko'
        : activeAccess === ACCESS_MODE.pjgt
          ? 'pjgt'
          : activeAccess === ACCESS_MODE.santri
            ? 'santri'
            : undefined
    const profileRes = await profilAPI.getProfil(prefer)
    if (profileRes.success) {
      applyProfilData({
        user: profileRes.user,
        nama: profileRes.nama,
        foto_profil: profileRes.foto_profil,
        madrasah: profileRes.madrasah ?? null,
      })
    }
  }

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    if (profilCached) {
      setData(profilCached)
      patchUser({ foto_profil: profilCached.foto_profil ?? null })
      setLoading(false)
      return
    }
    if (!profilCacheLoading) {
      setLoading(false)
    } else {
      setLoading(true)
    }
  }, [user?.id, profilCached, profilCacheLoading, patchUser])

  useEffect(() => {
    if (!user?.id) {
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = null
      }
      setPhotoUrl(null)
      return
    }
    let cancelled = false
    setLoadingPhoto(true)
    const fotoPath = data?.foto_profil ?? user?.foto_profil
    if (!fotoPath) {
      setPhotoUrl(null)
      setLoadingPhoto(false)
      return () => { cancelled = true }
    }
    profilAPI.getProfilFotoBlob(fotoPath).then((blob) => {
      if (cancelled) return
      if (blob instanceof Blob) {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
        const url = URL.createObjectURL(blob)
        photoUrlRef.current = url
        setPhotoUrl(url)
      } else {
        setPhotoUrl(null)
      }
    }).catch(() => {
      if (!cancelled) setPhotoUrl(null)
    }).finally(() => {
      if (!cancelled) setLoadingPhoto(false)
    })
    return () => {
      cancelled = true
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = null
      }
      setPhotoUrl(null)
    }
  }, [user?.id, user?.foto_profil, data?.foto_profil])

  useEffect(() => {
    const u = user?.username
    if (!u) {
      setPasskeyRegistered(false)
      setPasskeyCredentials([])
      setPasskeyStatusLoading(false)
      setPasskeyListLoading(false)
      setPasskeyStatusError('')
      return undefined
    }
    let cancelled = false
    setPasskeyStatusLoading(true)
    setPasskeyListLoading(true)
    setPasskeyStatusError('')

    const load = async () => {
      let statusOk = false
      let registered = false
      let list = null

      try {
        const listRes = await withTimeout(authAPI.webauthnListCredentials(), 12000)
        if (cancelled) return
        if (listRes?.success && Array.isArray(listRes.data?.credentials)) {
          list = listRes.data.credentials
          setPasskeyCredentials(list)
          syncLocalPasskeyRowIdsWithServer(
            u,
            list.map((c) => c.id)
          )
          if (list.length > 0) {
            registered = true
            statusOk = true
          }
        } else {
          setPasskeyCredentials([])
        }
      } catch {
        if (!cancelled) setPasskeyCredentials([])
      } finally {
        if (!cancelled) setPasskeyListLoading(false)
      }

      try {
        const statusRes = await withTimeout(authAPI.webauthnStatus(u), 10000)
        if (cancelled) return
        if (statusRes?.success && statusRes.data) {
          registered = !!statusRes.data.webauthn_registered || registered
          statusOk = true
          if (!statusRes.data.webauthn_registered && (!list || list.length === 0)) {
            clearLocalPasskeyRowIdsForUsername(u)
          }
        }
      } catch {
        /* daftar JWT sudah cukup; status publik opsional */
      }

      if (cancelled) return
      setPasskeyRegistered(registered)
      setPasskeyStatusLoading(false)
      if (!statusOk && (!list || list.length === 0)) {
        setPasskeyStatusError('Gagal memuat status passkey. Periksa koneksi lalu coba lagi.')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user?.username, passkeyReloadTick])

  useEffect(() => {
    if (!showPasswordForm) return
    setLoadingNoWa(true)
    let cancelled = false
    authAPI.getNoWaMask().then((res) => {
      if (!cancelled && res.success && res.no_wa_mask) setNoWaMask(res.no_wa_mask)
    }).catch(() => {}).finally(() => { if (!cancelled) setLoadingNoWa(false) })
    return () => { cancelled = true }
  }, [showPasswordForm])

  const handleRequestUbahPassword = async () => {
    const trimmed = (noWaKonfirmasi || '').trim().replace(/\D/g, '')
    if (!trimmed) {
      showToast('Masukkan nomor WA untuk konfirmasi', 'error')
      return
    }
    setSendingLink(true)
    try {
      const res = await authAPI.requestUbahPassword(noWaKonfirmasi.trim())
      if (res.success) {
        showToast(res.message || 'Link ubah password telah dikirim ke WhatsApp Anda.', 'success')
        setShowPasswordForm(false)
        setNoWaKonfirmasi('')
      } else showToast(res.message || 'Gagal mengirim link', 'error')
    } catch (err) {
      showToast(err.response?.data?.message || 'Terjadi kesalahan', 'error')
    } finally {
      setSendingLink(false)
    }
  }

  const handleUbahUsername = async () => {
    const u = (usernameBaru || '').trim()
    if (u.length < 5) {
      showToast('Username baru minimal 5 karakter', 'error')
      return
    }
    if (/\s/.test(u)) {
      showToast('Username tidak boleh mengandung spasi', 'error')
      return
    }
    if (!passwordUsername) {
      showToast('Masukkan password saat ini untuk verifikasi', 'error')
      return
    }
    setSendingUsernameLink(true)
    try {
      const res = await authAPI.ubahUsernameLangsung(u, passwordUsername)
      if (res.success) {
        showToast(res.message || 'Username berhasil diubah.', 'success')
        setShowUsernameForm(false)
        setUsernameBaru('')
        setPasswordUsername('')
        useAuthStore.getState().checkAuth()
        await refreshProfilFromServer()
      } else showToast(res.message || 'Gagal mengubah username', 'error')
    } catch (err) {
      showToast(err.response?.data?.message || 'Terjadi kesalahan', 'error')
    } finally {
      setSendingUsernameLink(false)
    }
  }

  /** Dipanggil dari crop modal: upload blob yang sudah di-crop & kompresi (maks 500 KB seperti uwaba) */
  const handleUploadFoto = async (blob) => {
    if (!blob || blob.size > 500 * 1024) {
      showToast('Ukuran foto maksimal 500 KB', 'error')
      return
    }
    setUploadingFoto(true)
    try {
      const file = new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' })
      const res = await profilAPI.uploadProfilFoto(file)
      if (res.success) {
        showToast(res.message || 'Foto profil berhasil diperbarui.', 'success')
        await refreshProfilFromServer()
      } else showToast(res.message || 'Gagal mengunggah foto', 'error')
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal mengunggah foto', 'error')
    } finally {
      setUploadingFoto(false)
    }
  }

  const handleDeleteFoto = async () => {
    if (!window.confirm('Hapus foto profil?')) return
    setUploadingFoto(true)
    try {
      const res = await profilAPI.deleteProfilFoto()
      if (res.success) {
        showToast(res.message || 'Foto profil telah dihapus.', 'success')
        if (photoUrlRef.current) {
          URL.revokeObjectURL(photoUrlRef.current)
          photoUrlRef.current = null
        }
        setPhotoUrl(null)
        await refreshProfilFromServer()
      } else showToast(res.message || 'Gagal menghapus foto', 'error')
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal menghapus foto', 'error')
    } finally {
      setUploadingFoto(false)
    }
  }

  const handleRegisterPasskey = async () => {
    if (!browserSupportsWebAuthn()) {
      showToast('Browser tidak mendukung passkey / WebAuthn.', 'error')
      return
    }
    setPasskeyLoading(true)
    try {
      const out = await registerPasskey()
      const u = user?.username
      if (out?.credential_db_id != null && u) {
        addLocalPasskeyRowId(u, out.credential_db_id)
      }
      showToast('Passkey berhasil didaftarkan. Anda bisa login tanpa password di perangkat ini.', 'success')
      setPasskeyRegistered(true)
      const listRes = await authAPI.webauthnListCredentials()
      if (listRes.success && Array.isArray(listRes.data?.credentials) && u) {
        setPasskeyCredentials(listRes.data.credentials)
        syncLocalPasskeyRowIdsWithServer(u, listRes.data.credentials.map((c) => c.id))
      }
    } catch (e) {
      showToast(e?.message || 'Gagal mendaftarkan passkey', 'error')
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleDeletePasskeyCredential = async (rowId) => {
    if (!window.confirm('Hapus passkey ini? Perangkat yang memakainya tidak bisa login dengan passkey sampai didaftarkan ulang.')) return
    try {
      const res = await authAPI.webauthnDeleteCredential(rowId)
      if (res.success) {
        const u = user?.username
        if (u) removeLocalPasskeyRowId(u, rowId)
        showToast(res.message || 'Passkey dihapus.', 'success')
        if (u) {
          const statusRes = await authAPI.webauthnStatus(u)
          if (statusRes.success && statusRes.data) {
            setPasskeyRegistered(!!statusRes.data.webauthn_registered)
            if (!statusRes.data.webauthn_registered) clearLocalPasskeyRowIdsForUsername(u)
          }
          const listRes = await authAPI.webauthnListCredentials()
          if (listRes.success && Array.isArray(listRes.data?.credentials)) {
            setPasskeyCredentials(listRes.data.credentials)
            syncLocalPasskeyRowIdsWithServer(u, listRes.data.credentials.map((c) => c.id))
          } else {
            setPasskeyCredentials([])
          }
        }
      } else showToast(res.message || 'Gagal menghapus passkey', 'error')
    } catch (err) {
      showToast(err.response?.data?.message || 'Gagal menghapus passkey', 'error')
    }
  }

  const namaTampil = (namaAksesAktif || data?.nama || '').trim()
  const usernameTampil = (data?.user?.username || user?.username || '').trim()
  const initial = (namaTampil || usernameTampil || '?').charAt(0).toUpperCase()
  const aksesItems = useMemo(
    () =>
      listAvailableAccessModes(
        user,
        '',
        data?.madrasah ?? null
      ),
    [user, data?.madrasah]
  )
  const [switchingAkses, setSwitchingAkses] = useState(false)
  const [tambahAksesOpen, setTambahAksesOpen] = useState(false)
  const consumingTambahAksesRef = useRef(false)

  // Link dari WA: /profil#tambah-akses=<64 hex>
  useEffect(() => {
    const applyHash = async () => {
      const hash = (window.location.hash || '').replace(/^#/, '')
      const m = hash.match(/^tambah-akses=([a-fA-F0-9]{64})$/)
      if (!m || consumingTambahAksesRef.current) return
      consumingTambahAksesRef.current = true
      const plain = m[1].toLowerCase()
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search)
        showToast('Memproses akses baru…', 'success')
        const res = await authAPI.tambahAksesConsume(plain)
        if (!res.success || !res.data?.token) {
          showToast(res.message || 'Token akses tidak valid', 'error')
          return
        }
        const userPayload = res.data.user || res.data
        setAuth(res.data.token, userPayload)
        const preferred = res.data.preferred_access
        const preferredSantriId = res.data.preferred_santri_id
        if (preferredSantriId != null && Number(preferredSantriId) !== Number(userPayload?.santri_id ?? 0)) {
          try {
            const sw = await authAPI.switchMybeddianSantri(preferredSantriId)
            if (sw.success && sw.data?.token) {
              localStorage.setItem('auth_token', sw.data.token)
              await useAuthStore.getState().checkAuth()
            }
          } catch {
            /* tetap lanjut set mode */
          }
        }
        if (preferred) {
          setActiveAccess(preferred, preferredSantriId ?? undefined)
        }
        await refreshProfilFromServer()
        showToast('Akses baru siap. Mode di Profil sudah diperbarui.', 'success')
      } catch (err) {
        showToast(err.response?.data?.message || 'Gagal memproses link akses', 'error')
      } finally {
        consumingTambahAksesRef.current = false
      }
    }
    applyHash()
    const onHash = () => {
      void applyHash()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sekali saat mount + hashchange
  }, [])

  const handlePilihAkses = async (item) => {
    const modeKey = item.key
    if (!modeKey || switchingAkses) return
    try {
      if (item.santriId != null && Number(item.santriId) !== Number(user?.santri_id ?? 0)) {
        setSwitchingAkses(true)
        const res = await authAPI.switchMybeddianSantri(item.santriId)
        if (!res.success || !res.data?.token) {
          showToast(res.message || 'Gagal mengganti identitas santri', 'error')
          return
        }
        localStorage.setItem('auth_token', res.data.token)
        await useAuthStore.getState().checkAuth()
      }
      setActiveAccess(modeKey, item.santriId ?? undefined)
      navigate(getHomePathForAccess(modeKey))
      showToast('Tampilan aplikasi kini mengikuti akses yang Anda pilih.', 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Terjadi kesalahan', 'error')
    } finally {
      setSwitchingAkses(false)
    }
  }

  const localPasskeyRowIds = getLocalPasskeyRowIds(user?.username)
  const hasPasskeyOnThisDevice = passkeyCredentials.some((c) => localPasskeyRowIds.includes(c.id))

  if (loading) {
    return (
      <PageEnterLoading className="flex min-h-full w-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat profil...</p>
        </div>
      </PageEnterLoading>
    )
  }

  return (
    <PageEnter className="min-h-full w-full max-w-2xl mx-auto px-4 py-6 pb-8">
      {/* Header: foto + nama */}
      <PageEnterBlock index={0} className="mb-8">
        <div className="flex flex-col items-center sm:flex-row sm:items-center sm:gap-6 gap-5">
          <div className="relative group shrink-0">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-primary-500/10 dark:bg-primary-400/10 flex items-center justify-center text-3xl sm:text-4xl font-semibold text-primary-600 dark:text-primary-400 ring-2 ring-gray-200 dark:ring-gray-600 cursor-pointer"
              onClick={() => setShowFotoMenu((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setShowFotoMenu((v) => !v)}
              aria-label="Foto profil"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{initial}</span>
              )}
              {(loadingPhoto || uploadingFoto) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
                </div>
              )}
            </div>
            {showFotoMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFotoMenu(false)} aria-hidden="true" />
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 min-w-[160px] py-1 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f && f.type.startsWith('image/')) {
                        setCropFile(f)
                        setShowFotoMenu(false)
                      }
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {data?.foto_profil ? 'Ganti foto' : 'Tambah foto'}
                  </button>
                  {data?.foto_profil && (
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      onClick={() => { setShowFotoMenu(false); handleDeleteFoto(); }}
                    >
                      Hapus foto
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left flex-1">
            {namaTampil ? (
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">
                {namaTampil}
              </h1>
            ) : null}
            {usernameTampil ? (
              <p className={`text-sm text-gray-500 dark:text-gray-400 font-mono ${namaTampil ? 'mt-0.5' : ''}`}>
                @{usernameTampil}
              </p>
            ) : !namaTampil ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Username belum tersedia</p>
            ) : null}
          </div>
        </div>
      </PageEnterBlock>

      {cropFile && (
        <ProfilFotoCropModal
          file={cropFile}
          onConfirm={(blob) => {
            setCropFile(null)
            handleUploadFoto(blob)
          }}
          onCancel={() => setCropFile(null)}
        />
      )}

      {/* Data akun (dari tabel user) */}
      <PageEnterBlock index={1}>
      <div className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
            Data Akun
          </h2>
        </div>
        <div className="p-5">
          <Row label="Username" value={data?.user?.username} />
          <Row label="Email" value={data?.user?.email} />
          <div className="py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 last:pb-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">No. WA</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-gray-900 dark:text-gray-100">{data?.user?.no_wa || '—'}</p>
              {data?.user?.no_wa_verified_at ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300">
                  Terverifikasi
                </span>
              ) : (
                data?.user?.no_wa && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    Belum verifikasi
                  </span>
                )
              )}
            </div>
          </div>
          {data?.user?.no_wa_verified_at && (
            <Row
              label="Tanggal verifikasi WA"
              value={new Date(data.user.no_wa_verified_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
            />
          )}
          {!data?.user?.username && !data?.user?.email && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Belum ada data.</p>
          )}
        </div>
      </div>
      </PageEnterBlock>

      {/* Akses fitur — ringkasan peran */}
      <PageEnterBlock index={2} className="mt-6">
      <div className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
              Akses di aplikasi
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Pilih akses untuk menyesuaikan menu dan beranda. Anda bisa mengganti kapan saja.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTambahAksesOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tambah akses
          </button>
        </div>
        <div className="p-5">
          {aksesItems.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Belum ada mode akses. Ketuk «Tambah akses» untuk menambahkan Santri, PJGT, atau Toko.
            </p>
          ) : (
            <ul className="space-y-3">
              {aksesItems.map((item, idx) => {
                const modeKey = item.key
                const rowKey = item.santriId != null ? `${item.key}-${item.santriId}` : `${item.key}-${idx}`
                const isActive =
                  modeKey != null &&
                  activeAccess === modeKey &&
                  (item.santriId == null ||
                    user?.santri_id == null ||
                    Number(item.santriId) === Number(user.santri_id))
                const accent = aksesModeAccent(modeKey)
                return (
                  <li key={rowKey}>
                    <button
                      type="button"
                      onClick={() => void handlePilihAkses(item)}
                      disabled={isActive || !modeKey || switchingAkses}
                      className={`w-full flex gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? accent.activeBorder
                          : 'border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/30 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/15 disabled:opacity-60 disabled:cursor-default'
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent.wrap}`}
                        aria-hidden
                      >
                        <AksesModeIcon modeKey={modeKey} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
                          {isActive ? (
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${accent.badge}`}
                            >
                              Aktif
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-snug whitespace-pre-line">
                          {item.description}
                        </p>
                        {!isActive && modeKey ? (
                          <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mt-2">
                            Ketuk untuk menggunakan akses ini →
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {aksesItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setTambahAksesOpen(true)}
              className="mt-4 w-full rounded-xl border border-dashed border-primary-300 dark:border-primary-700 px-4 py-3 text-sm font-medium text-primary-700 dark:text-primary-300 hover:bg-primary-50/80 dark:hover:bg-primary-900/20 transition-colors"
            >
              + Tambah mode akses lain
            </button>
          ) : null}
        </div>
      </div>
      </PageEnterBlock>

      <TambahAksesOffcanvas
        isOpen={tambahAksesOpen}
        onClose={() => setTambahAksesOpen(false)}
        defaultNoWa={data?.user?.no_wa || ''}
        hidePjgt={
          Boolean(user?.madrasah_id) ||
          aksesItems.some((item) => item.key === ACCESS_MODE.pjgt)
        }
        hideToko={user?.has_toko === true}
      />

      {/* Keamanan: ubah password & ubah username (sama seperti uwaba) */}
      <PageEnterBlock index={3} className="mt-6">
      <div className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Keamanan
          </h2>
        </div>
        <div className="p-5 space-y-5">
          {/* Passkey / WebAuthn — selaras eBeddien */}
          <div className="pb-1 border-b border-gray-100 dark:border-gray-700/50">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Login cepat tanpa mengetik password</p>
            {passkeyStatusLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat status passkey…</p>
            ) : passkeyStatusError && !passkeyRegistered ? (
              <div className="space-y-2">
                <p className="text-sm text-amber-700 dark:text-amber-400">{passkeyStatusError}</p>
                <button
                  type="button"
                  onClick={() => setPasskeyReloadTick((n) => n + 1)}
                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Coba lagi
                </button>
              </div>
            ) : passkeyRegistered ? (
              <div className="space-y-3">
                <p className="text-sm text-teal-700 dark:text-teal-400 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Passkey aktif — satu akun bersama eBeddien & myBeddien. Anda bisa menambah passkey di perangkat lain.
                </p>
                {passkeyListLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memuat daftar passkey…</p>
                ) : passkeyCredentials.length > 0 ? (
                  <ul className="space-y-2 rounded-xl border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                    {passkeyCredentials.map((c) => {
                      const ts = (c.transports || []).map(formatTransportLabel).filter(Boolean)
                      const created = c.created_at
                        ? new Date(c.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
                        : '—'
                      const onThisDevice = localPasskeyRowIds.includes(c.id)
                      const deviceLabel = formatPasskeyDeviceLabel(c.device_type)
                      const appLabel = formatPasskeyClientApp(c.client_app)
                      const metaBits = [
                        deviceLabel,
                        c.browser_name || null,
                        c.os_name || null,
                        appLabel,
                      ].filter(Boolean)
                      return (
                        <li key={c.id} className="px-3 py-2.5 bg-gray-50/80 dark:bg-gray-900/20 flex flex-wrap items-center gap-2 justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Passkey</span>
                              {onThisDevice && (
                                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">
                                  Perangkat ini
                                </span>
                              )}
                            </div>
                            {metaBits.length > 0 ? (
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                                {metaBits.join(' · ')}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                Detail perangkat belum tercatat (didaftar sebelum pembaruan)
                              </p>
                            )}
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Terdaftar: {created}</p>
                            {ts.length > 0 && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                Saluran: {ts.join(', ')}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleDeletePasskeyCredential(c.id)}
                            className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400 hover:underline px-2 py-1"
                          >
                            Hapus
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Belum ada entri passkey di server (muat ulang jika baru saja mendaftar).
                  </p>
                )}
                {browserSupportsWebAuthn() && !hasPasskeyOnThisDevice && (
                    <button
                      type="button"
                      onClick={() => void handleRegisterPasskey()}
                      disabled={passkeyLoading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 hover:bg-teal-100 dark:hover:bg-teal-900/50 disabled:opacity-60"
                    >
                      {passkeyLoading ? 'Memproses…' : 'Tambah passkey di perangkat ini'}
                    </button>
                  )}
              </div>
            ) : browserSupportsWebAuthn() ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Daftarkan passkey (sidik jari, wajah, atau PIN perangkat) agar login lebih aman dan praktis.
                </p>
                <button
                  type="button"
                  onClick={() => void handleRegisterPasskey()}
                  disabled={passkeyLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60"
                >
                  {passkeyLoading ? 'Memproses…' : 'Daftarkan passkey'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Browser ini tidak mendukung passkey. Gunakan Chrome, Edge, atau Safari terbaru.
              </p>
            )}
          </div>

          {/* Ubah password */}
          <div>
            {!showPasswordForm ? (
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                Ubah password (kirim link ke WA)
              </button>
            ) : (
              <div className="space-y-3">
                {loadingNoWa ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Memuat nomor WA...</p>
                ) : noWaMask ? (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Nomor WA terdaftar: <span className="font-mono font-semibold">{noWaMask}</span>
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={noWaKonfirmasi}
                      onChange={(e) => setNoWaKonfirmasi(e.target.value)}
                      placeholder="08xxx atau 62xxx"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleRequestUbahPassword}
                        disabled={sendingLink}
                        className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {sendingLink ? 'Mengirim...' : 'Kirim link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowPasswordForm(false); setNoWaKonfirmasi(''); }}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm"
                      >
                        Batal
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-amber-600 dark:text-amber-400">Nomor WA tidak tersedia.</p>
                )}
              </div>
            )}
          </div>

          {/* Ubah username */}
          <div className="border-t border-gray-100 dark:border-gray-700/50 pt-4">
            {!showUsernameForm ? (
              <button
                type="button"
                onClick={() => setShowUsernameForm(true)}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                Ubah username
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Masukkan username baru dan password saat ini. Username akan diubah langsung.
                </p>
                <input
                  type="text"
                  value={usernameBaru}
                  onChange={(e) => setUsernameBaru(e.target.value)}
                  placeholder="Username baru (min 5 karakter, tanpa spasi)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  autoComplete="username"
                />
                <input
                  type="password"
                  value={passwordUsername}
                  onChange={(e) => setPasswordUsername(e.target.value)}
                  placeholder="Password saat ini (untuk verifikasi)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  autoComplete="current-password"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUbahUsername}
                    disabled={sendingUsernameLink}
                    className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {sendingUsernameLink ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowUsernameForm(false); setUsernameBaru(''); setPasswordUsername(''); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </PageEnterBlock>
    </PageEnter>
  )
}
