import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { profilAPI, authAPI } from '../services/api'
import ProfilFotoCropModal from '../components/ProfilFotoCropModal'

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
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [loadingPhoto, setLoadingPhoto] = useState(false)
  const [showFotoMenu, setShowFotoMenu] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [success, setSuccess] = useState('')
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

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    profilAPI
      .getProfil()
      .then((res) => {
        if (!cancelled && res.success) setData({ user: res.user, nama: res.nama, foto_profil: res.foto_profil })
        else if (!cancelled) setError('Gagal memuat data profil')
      })
      .catch(() => {
        if (!cancelled) setError('Terjadi kesalahan saat memuat profil')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.id])

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
    profilAPI.getProfilFotoBlob().then((blob) => {
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
    }
  }, [user?.id, data?.foto_profil])

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
      setError('Masukkan nomor WA untuk konfirmasi')
      return
    }
    setSendingLink(true)
    setError('')
    try {
      const res = await authAPI.requestUbahPassword(noWaKonfirmasi.trim())
      if (res.success) {
        setSuccess(res.message || 'Link ubah password telah dikirim ke WhatsApp Anda.')
        setShowPasswordForm(false)
        setNoWaKonfirmasi('')
        setTimeout(() => setSuccess(''), 5000)
      } else setError(res.message || 'Gagal mengirim link')
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan')
    } finally {
      setSendingLink(false)
    }
  }

  const handleUbahUsername = async () => {
    const u = (usernameBaru || '').trim()
    if (u.length < 5) {
      setError('Username baru minimal 5 karakter')
      return
    }
    if (/\s/.test(u)) {
      setError('Username tidak boleh mengandung spasi')
      return
    }
    if (!passwordUsername) {
      setError('Masukkan password saat ini untuk verifikasi')
      return
    }
    setSendingUsernameLink(true)
    setError('')
    try {
      const res = await authAPI.ubahUsernameLangsung(u, passwordUsername)
      if (res.success) {
        setSuccess(res.message || 'Username berhasil diubah.')
        setShowUsernameForm(false)
        setUsernameBaru('')
        setPasswordUsername('')
        setTimeout(() => setSuccess(''), 5000)
        useAuthStore.getState().checkAuth()
        const profileRes = await profilAPI.getProfil()
        if (profileRes.success) setData({ user: profileRes.user, nama: profileRes.nama, foto_profil: profileRes.foto_profil })
      } else setError(res.message || 'Gagal mengubah username')
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan')
    } finally {
      setSendingUsernameLink(false)
    }
  }

  /** Dipanggil dari crop modal: upload blob yang sudah di-crop & kompresi (maks 500 KB seperti uwaba) */
  const handleUploadFoto = async (blob) => {
    if (!blob || blob.size > 500 * 1024) {
      setError('Ukuran foto maksimal 500 KB')
      return
    }
    setUploadingFoto(true)
    setError('')
    setSuccess('')
    try {
      const file = new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' })
      const res = await profilAPI.uploadProfilFoto(file)
      if (res.success) {
        setSuccess(res.message || 'Foto profil berhasil diperbarui.')
        setTimeout(() => setSuccess(''), 4000)
        const profileRes = await profilAPI.getProfil()
        if (profileRes.success) setData({ user: profileRes.user, nama: profileRes.nama, foto_profil: profileRes.foto_profil })
      } else setError(res.message || 'Gagal mengunggah foto')
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunggah foto')
    } finally {
      setUploadingFoto(false)
    }
  }

  const handleDeleteFoto = async () => {
    if (!window.confirm('Hapus foto profil?')) return
    setUploadingFoto(true)
    setError('')
    setSuccess('')
    try {
      const res = await profilAPI.deleteProfilFoto()
      if (res.success) {
        setSuccess(res.message || 'Foto profil telah dihapus.')
        setTimeout(() => setSuccess(''), 4000)
        if (photoUrlRef.current) {
          URL.revokeObjectURL(photoUrlRef.current)
          photoUrlRef.current = null
        }
        setPhotoUrl(null)
        const profileRes = await profilAPI.getProfil()
        if (profileRes.success) setData({ user: profileRes.user, nama: profileRes.nama, foto_profil: profileRes.foto_profil })
      } else setError(res.message || 'Gagal menghapus foto')
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus foto')
    } finally {
      setUploadingFoto(false)
    }
  }

  const displayName = data?.nama ?? user?.nama ?? data?.user?.username ?? user?.username ?? 'Profil'
  const initial = displayName.trim().charAt(0).toUpperCase()

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
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      {/* Header: foto + nama */}
      <div className="mb-8">
        <div className="flex flex-col items-center sm:flex-row sm:items-center sm:gap-6 gap-5">
          <div className="relative group shrink-0">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center text-3xl sm:text-4xl font-semibold text-teal-600 dark:text-teal-400 ring-2 ring-gray-200 dark:ring-gray-600 cursor-pointer"
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
                        setShowCropModal(true)
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
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">
              {displayName}
            </h1>
            {(data?.user?.username || user?.username) && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">@{data?.user?.username || user?.username}</p>
            )}
          </div>
        </div>
      </div>

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

      {/* Data akun (dari tabel user) */}
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
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
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

      {/* Keamanan: ubah password & ubah username (sama seperti uwaba) */}
      <div className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Keamanan
          </h2>
        </div>
        <div className="p-5 space-y-5">
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

          {/* Ubah username */}
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
      </div>
    </div>
  )
}
