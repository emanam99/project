import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { profilAPI } from '../services/api'
import ProfilFotoCropModal from '../components/ProfilFotoCropModal'

/* Ikon Barang — sama seperti di menu HP (BottomNav) */
function BarangIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )
}

const tokoMenuItems = [
  { path: '/barang', label: 'Data Barang', icon: BarangIcon },
]

export default function Toko() {
  const navigate = useNavigate()
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

  useEffect(() => {
    if (!user?.id || !user?.has_toko) {
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
        else if (!cancelled) setError('Gagal memuat data toko')
      })
      .catch(() => {
        if (!cancelled) setError('Terjadi kesalahan saat memuat profil toko')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.id, user?.has_toko])

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

  const handleUploadFoto = async (blob) => {
    if (!blob) return
    setUploadingFoto(true)
    setError('')
    try {
      const file = new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' })
      const res = await profilAPI.uploadProfilFoto(file)
      if (res.success) {
        setSuccess(res.message || 'Foto toko berhasil diperbarui.')
        const profileRes = await profilAPI.getProfil()
        if (profileRes.success) setData({ user: profileRes.user, nama: profileRes.nama, foto_profil: profileRes.foto_profil })
      } else {
        setError(res.message || 'Gagal mengunggah foto')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunggah foto')
    } finally {
      setUploadingFoto(false)
    }
  }

  const handleDeleteFoto = async () => {
    setUploadingFoto(true)
    setError('')
    try {
      const res = await profilAPI.deleteProfilFoto()
      if (res.success) {
        setSuccess(res.message || 'Foto toko telah dihapus.')
        const profileRes = await profilAPI.getProfil()
        if (profileRes.success) setData({ user: profileRes.user, nama: profileRes.nama, foto_profil: profileRes.foto_profil })
        setPhotoUrl(null)
      } else {
        setError(res.message || 'Gagal menghapus foto')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus foto')
    } finally {
      setUploadingFoto(false)
    }
  }

  const namaToko = data?.nama || user?.toko_nama || 'Toko'
  const initial = (namaToko || 'T').charAt(0).toUpperCase()

  if (!user?.has_toko) {
    navigate('/', { replace: true })
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-teal-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Memuat profil toko...</p>
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

      <div className="rounded-2xl bg-white dark:bg-gray-800/90 shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/50">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
            Profil Toko
          </h2>
        </div>
        <div className="p-6 flex flex-col items-center">
          <div className="relative group shrink-0">
            <div
              className="w-28 h-28 rounded-full overflow-hidden bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center text-4xl font-semibold text-teal-600 dark:text-teal-400 ring-2 ring-gray-200 dark:ring-gray-600 cursor-pointer"
              onClick={() => setShowFotoMenu((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setShowFotoMenu((v) => !v)}
              aria-label="Foto toko"
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
          <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white tracking-tight text-center">
            {namaToko}
          </h1>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-tight mb-3">Menu</h2>
        <div className="grid grid-cols-3 gap-3">
          {tokoMenuItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-xl bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 active:bg-teal-100 dark:active:bg-teal-900/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <Icon className="w-6 h-6 shrink-0" />
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight">
                  {item.label}
                </span>
              </button>
            )
          })}
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
    </div>
  )
}
