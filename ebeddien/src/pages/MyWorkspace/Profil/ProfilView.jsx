import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { useNotification } from '../../../contexts/NotificationContext'
import { profilAPI, authAPI } from '../../../services/api'
import { browserSupportsWebAuthn, registerPasskey } from '../../../utils/webauthnRegister'
import { setStoredLoginUsername } from '../../../utils/passkeyLoginPrefs'
import ProfilFotoCropModal from './ProfilFotoCropModal'

const Card = ({ title, children, icon }) => (
  <motion.section
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden"
  >
    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50 flex items-center gap-3">
      {icon && <span className="text-gray-400 dark:text-gray-500">{icon}</span>}
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
        {title}
      </h2>
    </div>
    <div className="p-5">{children}</div>
  </motion.section>
)

const Row = ({ label, value }) => {
  if (value == null || value === '') return null
  return (
    <div className="py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 last:pb-0">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  )
}

/** Pesan error dari response API (axios); jaringan putus pun dapat pesan yang jelas. */
function extractApiErrorMessage(err) {
  const d = err?.response?.data
  if (d && typeof d.message === 'string' && d.message.trim() !== '') return d.message
  if (d?.data && typeof d.data.message === 'string' && d.data.message.trim() !== '') return d.data.message
  if (!err?.response && typeof err?.message === 'string' && err.message.trim() !== '') return err.message
  return 'Terjadi kesalahan'
}

export default function ProfilView() {
  const { user } = useAuthStore()
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [noWaMask, setNoWaMask] = useState('')
  const [noWaKonfirmasi, setNoWaKonfirmasi] = useState('')
  const [loadingNoWa, setLoadingNoWa] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)
  const [showUsernameForm, setShowUsernameForm] = useState(false)
  const [usernameBaru, setUsernameBaru] = useState('')
  const [passwordUsername, setPasswordUsername] = useState('')
  const [sendingUsernameLink, setSendingUsernameLink] = useState(false)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [showFotoMenu, setShowFotoMenu] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [passkeyRegistered, setPasskeyRegistered] = useState(null)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const fileInputRef = useRef(null)
  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    profilAPI
      .getUser(user.id)
      .then((res) => {
        if (!cancelled && res.success && res.user) setData(res.user)
        else if (!cancelled) showNotification('Gagal memuat data profil', 'error')
      })
      .catch(() => {
        if (!cancelled) showNotification('Terjadi kesalahan saat memuat profil', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.id, showNotification])

  useEffect(() => {
    const u = user?.username
    if (!u) {
      setPasskeyRegistered(null)
      return
    }
    let cancelled = false
    authAPI
      .webauthnStatus(u)
      .then((res) => {
        if (!cancelled && res.success && res.data) setPasskeyRegistered(!!res.data.webauthn_registered)
      })
      .catch(() => {
        if (!cancelled) setPasskeyRegistered(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.username])

  const photoUrlRef = useRef(null)
  useEffect(() => {
    if (!data?.foto_profil || !user?.id) {
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = null
      }
      setPhotoUrl(null)
      return
    }
    let cancelled = false
    setLoadingPhoto(true)
    profilAPI.getProfilFotoBlob().then((blob) => {
      if (!cancelled && blob instanceof Blob) {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
        const url = URL.createObjectURL(blob)
        photoUrlRef.current = url
        setPhotoUrl(url)
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
    }
  }, [data?.foto_profil, user?.id])

  useEffect(() => {
    if (!showPasswordForm) return
    let cancelled = false
    setLoadingNoWa(true)
    authAPI.getNoWaMask().then((res) => {
      if (!cancelled && res.success && res.no_wa_mask) setNoWaMask(res.no_wa_mask)
    }).catch(() => {}).finally(() => { if (!cancelled) setLoadingNoWa(false) })
    return () => { cancelled = true }
  }, [showPasswordForm])

  const handleRequestUbahPassword = async () => {
    const trimmed = (noWaKonfirmasi || '').trim().replace(/\D/g, '')
    if (!trimmed) {
      showNotification('Masukkan nomor WA untuk konfirmasi', 'error')
      return
    }
    setSendingLink(true)
    try {
      const res = await authAPI.requestUbahPassword(noWaKonfirmasi.trim())
      if (res.success) {
        showNotification(
          res.message || 'Link ubah password telah dikirim ke WhatsApp Anda.',
          'success',
          6000
        )
        setShowPasswordForm(false)
        setNoWaKonfirmasi('')
      } else {
        showNotification(res.message || 'Gagal mengirim link', 'error', 8000)
      }
    } catch (err) {
      showNotification(extractApiErrorMessage(err), 'error', 8000)
    } finally {
      setSendingLink(false)
    }
  }

  const handleUbahUsername = async () => {
    const u = (usernameBaru || '').trim()
    if (u.length < 5) {
      showNotification('Username baru minimal 5 karakter', 'error')
      return
    }
    if (/\s/.test(u)) {
      showNotification('Username tidak boleh mengandung spasi', 'error')
      return
    }
    if (!passwordUsername) {
      showNotification('Masukkan password saat ini untuk verifikasi', 'error')
      return
    }
    setSendingUsernameLink(true)
    try {
      const res = await authAPI.ubahUsernameLangsung(u, passwordUsername)
      if (res.success) {
        showNotification(res.message || 'Username berhasil diubah.', 'success')
        setShowUsernameForm(false)
        setUsernameBaru('')
        setPasswordUsername('')
        useAuthStore.getState().checkAuth()
      } else showNotification(res.message || 'Gagal mengubah username', 'error')
    } catch (err) {
      showNotification(extractApiErrorMessage(err), 'error', 8000)
    } finally {
      setSendingUsernameLink(false)
    }
  }

  const handleUploadFoto = async (blob) => {
    if (!blob || blob.size > 500 * 1024) {
      showNotification('Ukuran foto maksimal 500 KB', 'error')
      return
    }
    setUploadingFoto(true)
    try {
      const file = new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' })
      const res = await profilAPI.uploadProfilFoto(file)
      if (res.success) {
        showNotification(res.message || 'Foto profil berhasil diperbarui.', 'success')
        window.dispatchEvent(new Event('profil-foto-updated'))
        profilAPI.getUser(user.id).then((r) => {
          if (r.success && r.user) setData(r.user)
        }).catch(() => {})
      } else showNotification(res.message || 'Gagal mengunggah foto', 'error')
    } catch (err) {
      showNotification(extractApiErrorMessage(err) || 'Gagal mengunggah foto', 'error', 8000)
    } finally {
      setUploadingFoto(false)
    }
  }

  const handleRegisterPasskey = async () => {
    if (!browserSupportsWebAuthn()) {
      showNotification('Browser tidak mendukung passkey / WebAuthn.', 'error')
      return
    }
    setPasskeyLoading(true)
    try {
      await registerPasskey()
      setStoredLoginUsername(user?.username)
      showNotification('Passkey berhasil didaftarkan. Anda bisa login tanpa password di perangkat ini.', 'success', 6000)
      setPasskeyRegistered(true)
    } catch (err) {
      const msg = err?.message && typeof err.message === 'string' ? err.message : extractApiErrorMessage(err)
      showNotification(msg || 'Gagal mendaftarkan passkey', 'error', 8000)
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleDeleteFoto = async () => {
    setUploadingFoto(true)
    try {
      const res = await profilAPI.deleteProfilFoto()
      if (res.success) {
        showNotification(res.message || 'Foto profil telah dihapus.', 'success')
        window.dispatchEvent(new Event('profil-foto-updated'))
        if (photoUrlRef.current) {
          URL.revokeObjectURL(photoUrlRef.current)
          photoUrlRef.current = null
        }
        setPhotoUrl(null)
        profilAPI.getUser(user.id).then((r) => {
          if (r.success && r.user) setData(r.user)
        }).catch(() => {})
      } else showNotification(res.message || 'Gagal menghapus foto', 'error')
    } catch (err) {
      showNotification(extractApiErrorMessage(err) || 'Gagal menghapus foto', 'error', 8000)
    } finally {
      setUploadingFoto(false)
    }
  }

  const displayName = data
    ? [data.gelar_awal, data.nama, data.gelar_akhir].filter(Boolean).join(' ') || 'Profil'
    : ''

  const initial = displayName
    ? displayName.trim().charAt(0).toUpperCase()
    : (user?.username?.charAt(0) || '?').toUpperCase()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-teal-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat profil...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-8">
      {/* Header: foto profil (PC vs HP) + nama + CTA */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        {/* Layout: HP = stacked center; PC = row */}
        <div className="flex flex-col items-center sm:flex-row sm:items-center sm:gap-6 gap-5">
          <div className="relative group shrink-0">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center text-3xl sm:text-4xl font-semibold text-teal-600 dark:text-teal-400 ring-2 ring-gray-200 dark:ring-gray-600"
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
            <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            </div>
            {showFotoMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFotoMenu(false)} aria-hidden="true" />
                <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 z-20 min-w-[160px] py-1 rounded-xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f && f.type.startsWith('image/')) {
                        setCropFile(f)
                        setShowCropModal(true)
                        setShowFotoMenu(false)
                      }
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    onClick={() => { fileInputRef.current?.click(); }}
                  >
                    {data?.foto_profil ? 'Ganti foto' : 'Tambah foto'}
                  </button>
                  {data?.foto_profil && (
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      onClick={() => {
                        setShowFotoMenu(false)
                        if (window.confirm('Hapus foto profil?')) handleDeleteFoto()
                      }}
                    >
                      Hapus foto
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left flex-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">
              {displayName || 'Profil'}
            </h1>
            {user?.username && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">@{user.username}</p>
            )}
            <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
              <button
                type="button"
                onClick={() => navigate('/profil/edit')}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-colors"
              >
                Edit Profil
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {showCropModal && cropFile && (
        <ProfilFotoCropModal
          file={cropFile}
          onConfirm={(blob) => {
            setShowCropModal(false)
            setCropFile(null)
            handleUploadFoto(blob)
          }}
          onCancel={() => { setShowCropModal(false); setCropFile(null); }}
        />
      )}

      <div className="space-y-5">
        <Card
          title="Data Diri"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        >
          <Row label="NIK" value={data?.nik} />
          <Row label="Jenis Kelamin" value={data?.gender} />
          <Row
            label="Alamat"
            value={[
              data?.dusun,
              (data?.rt || data?.rw) ? [data?.rt, data?.rw].filter(Boolean).join('/') : null,
              data?.desa,
              data?.kecamatan,
              data?.kabupaten,
              data?.provinsi,
              data?.kode_pos
            ].filter(Boolean).join(', ') || null}
          />
          {!data?.nama && !data?.nik && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Belum ada data. Isi di Edit Profil.</p>
          )}
        </Card>

        <Card
          title="Kontak"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
        >
          <Row label="Email" value={data?.email} />
          <div className="py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 last:pb-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">WhatsApp</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-gray-900 dark:text-gray-100 font-mono">{data?.whatsapp || '—'}</p>
              {data?.no_wa_verified_at ? (
                <>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Terverifikasi
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Terakhir verifikasi: {new Date(data.no_wa_verified_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </>
              ) : data?.whatsapp ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">Belum verifikasi</span>
              ) : null}
            </div>
          </div>
          {!data?.email && !data?.whatsapp && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Belum ada kontak.</p>
          )}
        </Card>

        <Card
          title="Lembaga & Jabatan"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        >
          {data?.jabatan?.length > 0 ? (
            <ul className="space-y-5">
              {data.jabatan.map((item, idx) => (
                <li key={idx} className="py-3 border-b border-gray-100 dark:border-gray-700/60 last:border-0 last:pb-0 last:mb-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.jabatan_nama}</p>
                  {(item.lembaga_nama || item.lembaga_kategori) && (
                    <div className="mt-1.5">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {[item.lembaga_nama, item.lembaga_kategori].filter(Boolean).join(' · ')}
                      </p>
                      {item.lembaga_deskripsi && (
                        <div
                          className="deskripsi-rich-text text-xs text-gray-600 dark:text-gray-400 mt-1.5 prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: item.lembaga_deskripsi }}
                        />
                      )}
                    </div>
                  )}
                  {(item.tanggal_mulai || item.tanggal_selesai) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {[
                        item.tanggal_mulai ? new Date(item.tanggal_mulai).toLocaleDateString('id-ID', { year: 'numeric', month: 'short' }) : null,
                        item.tanggal_selesai ? new Date(item.tanggal_selesai).toLocaleDateString('id-ID', { year: 'numeric', month: 'short' }) : null
                      ].filter(Boolean).join(' – ')}
                    </p>
                  )}
                  {item.jabatan_deskripsi && (
                    <div
                      className="deskripsi-rich-text text-xs text-gray-600 dark:text-gray-400 mt-2 prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: item.jabatan_deskripsi }}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Belum ada jabatan.</p>
          )}
        </Card>

        {/* Keamanan */}
        <Card
          title="Keamanan"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        >
          <div className="space-y-5">
            {/* Passkey / WebAuthn */}
            <div className="pb-1 border-b border-gray-100 dark:border-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Login cepat tanpa mengetik password</p>
              {passkeyRegistered === null ? (
                <p className="text-sm text-gray-500">Memuat status passkey…</p>
              ) : passkeyRegistered ? (
                <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Passkey sudah aktif untuk akun ini.
                </p>
              ) : browserSupportsWebAuthn() ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Daftarkan passkey (sidik jari, wajah, atau PIN perangkat) agar login lebih aman dan praktis.
                  </p>
                  <button
                    type="button"
                    onClick={handleRegisterPasskey}
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
                  className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline"
                >
                  Ubah password (kirim link ke WA)
                </button>
              ) : (
                <div className="space-y-3">
                  {loadingNoWa ? (
                    <p className="text-sm text-gray-500">Memuat nomor WA...</p>
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
                          className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50"
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

            {/* Ubah username: langsung di halaman profil, verifikasi dengan password saat ini */}
            <div className="border-t border-gray-100 dark:border-gray-700/50 pt-4">
              {!showUsernameForm ? (
                <button
                  type="button"
                  onClick={() => setShowUsernameForm(true)}
                  className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline"
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
                      className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50"
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
        </Card>
      </div>
    </div>
  )
}
