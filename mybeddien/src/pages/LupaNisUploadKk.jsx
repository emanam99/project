import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { APP_VERSION } from '../config/version'
import { authAPI } from '../services/api'
import {
  loadLupaNisTerkirim,
  resolveLupaNisPengajuan,
  saveLupaNisTerkirim,
  saveLupaNisUpload,
} from '../utils/lupaNisResultStorage'
import { mapLupaNisUploadError } from '../utils/lupaNisUploadErrors'
import {
  formatFileSize,
  KK_MAX_IMAGE_MB,
  KK_MAX_PDF_MB,
  prepareKkFileForUpload,
} from '../utils/kkUploadPrepare'

function AuthCardShell({ children }) {
  return (
    <div className="w-full max-w-[400px] relative z-10">
      <div className="relative p-4 md:p-10 md:rounded-3xl md:bg-white/95 md:dark:bg-gray-800/95 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow">
        {children}
      </div>
    </div>
  )
}

function formatWaDisplay(noWa) {
  const digits = String(noWa || '').replace(/\D/g, '')
  if (!digits) return '—'
  if (digits.startsWith('62')) return `+${digits}`
  if (digits.startsWith('0')) return digits
  return digits
}

export function LupaNisUploadKkCard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [kkFile, setKkFile] = useState(null)
  const [fileMeta, setFileMeta] = useState(null)
  const [preparing, setPreparing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const previewUrlRef = useRef(null)

  const pengajuan = useMemo(
    () => resolveLupaNisPengajuan(searchParams, location.state),
    [searchParams, location.state]
  )

  const waDisplay = formatWaDisplay(pengajuan?.no_wa)

  const alreadyTerkirim = useMemo(() => {
    const t = loadLupaNisTerkirim()
    return !!(t && pengajuan && t.id === pengajuan.id)
  }, [pengajuan])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!alreadyTerkirim || !pengajuan) return
    const q = new URLSearchParams()
    q.set('id', String(pengajuan.id))
    if (pengajuan.nama) q.set('nama', pengajuan.nama)
    navigate(`/lupa-nis/terkirim?${q.toString()}`, { replace: true, state: pengajuan })
  }, [alreadyTerkirim, pengajuan, navigate])

  if (alreadyTerkirim) {
    return null
  }

  const handleFileChange = async (e) => {
    const raw = e.target.files?.[0] || null
    setError('')
    setKkFile(null)
    setFileMeta(null)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    if (!raw) return

    setPreparing(true)
    try {
      const result = await prepareKkFileForUpload(raw)
      if (result.error) {
        setError(result.error)
        e.target.value = ''
        return
      }
      if (result.previewUrl) {
        previewUrlRef.current = result.previewUrl
      }
      setKkFile(result.file)
      setFileMeta({
        name: result.file.name,
        sizeLabel: formatFileSize(result.file.size),
        previewUrl: result.previewUrl,
      })
    } finally {
      setPreparing(false)
    }
  }

  const canSubmit = !!kkFile && !preparing && !loading

  const submitButtonLabel = (() => {
    if (loading) return 'Mengunggah KK…'
    if (preparing) return 'Memproses file…'
    if (!kkFile) return 'Pilih file KK dulu'
    return 'Kirim KK & ajukan verifikasi'
  })()

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!pengajuan || !kkFile || !canSubmit) {
      setError('Pilih file Kartu Keluarga (KK) terlebih dahulu.')
      return
    }
    setLoading(true)
    setError('')
    try {
      let pengajuanId = Number(pengajuan.id) || 0
      if (pengajuanId < 1) {
        const createRes = await authAPI.nisPengajuanCreate({
          nama: pengajuan.nama,
          nik: pengajuan.nik,
          tanggal_lahir: pengajuan.tanggal_lahir,
          no_wa: pengajuan.no_wa,
        })
        if (!createRes.success) {
          setError(mapLupaNisUploadError({ response: { data: createRes } }, createRes.message))
          return
        }
        pengajuanId = Number(createRes.data?.id)
        if (!pengajuanId || pengajuanId < 1) {
          setError('Gagal membuat pengajuan. Coba lagi.')
          return
        }
        saveLupaNisUpload({ ...pengajuan, id: pengajuanId })
      }
      const res = await authAPI.nisPengajuanUploadKk(pengajuanId, kkFile)
      if (!res.success) {
        setError(mapLupaNisUploadError({ response: { data: res } }, res.message))
        return
      }
      if (!res.wa_me_url) {
        setError('KK tersimpan, tetapi tautan WhatsApp gagal dibuat. Coba buka ulang halaman konfirmasi.')
      }
      const payload = {
        id: pengajuanId,
        nama: pengajuan.nama,
        no_wa: pengajuan.no_wa,
        wa_me_url: res.wa_me_url || '',
        wa_message: res.wa_message || '',
        expires_in_minutes: res.expires_in_minutes || 30,
        message: res.message || '',
      }
      saveLupaNisTerkirim(payload)
      const q = new URLSearchParams()
      q.set('id', String(payload.id))
      if (payload.nama) q.set('nama', payload.nama)
      navigate(`/lupa-nis/terkirim?${q.toString()}`, { replace: true, state: payload })
    } catch (err) {
      setError(mapLupaNisUploadError(err))
    } finally {
      setLoading(false)
    }
  }

  if (!pengajuan) {
    return (
      <AuthCardShell>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Sesi tidak ditemukan</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Data pengajuan sudah tidak tersedia. Silakan verifikasi identitas dari awal.
        </p>
        <Link
          to="/lupa-nis"
          className="block w-full py-3 rounded-xl font-semibold text-center text-white bg-primary-600 hover:bg-primary-700"
        >
          Cek NIS lagi
        </Link>
      </AuthCardShell>
    )
  }

  return (
    <AuthCardShell>
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">Unggah Kartu Keluarga</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          Data identitas belum cocok dengan data pusat. Admin membutuhkan foto/scan KK untuk verifikasi.
        </p>
        {pengajuan.nama ? (
          <p className="text-sm text-gray-800 dark:text-gray-200 mt-2 font-medium">{pengajuan.nama}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/80 dark:bg-teal-900/20 px-3 py-3 text-sm text-teal-900 dark:text-teal-100 space-y-2 mb-4">
        <p className="font-semibold">Setelah KK dikirim</p>
        <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm">
          <li>Anda diarahkan mengirim pesan WhatsApp berisi token (dari nomor yang sama).</li>
          <li>Bot membalas konfirmasi, lalu pengajuan masuk antrean admin (1–2 hari kerja).</li>
          <li>
            Jika disetujui, <strong>NIS dikirim ke WhatsApp</strong>:
            <span className="block font-mono mt-0.5 text-teal-800 dark:text-teal-200">{waDisplay}</span>
          </li>
        </ol>
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Foto / scan Kartu Keluarga (KK)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none z-10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              capture="environment"
              onChange={handleFileChange}
              disabled={preparing || loading}
              className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/40 dark:file:text-primary-300 disabled:opacity-60"
            />
          </div>
          <ul className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 space-y-1 list-disc list-inside">
            <li>
              Foto jelas: nama, NIK, dan tanggal lahir terbaca (tidak buram atau terpotong).
            </li>
            <li>
              Gambar otomatis dikompres (maks. {KK_MAX_IMAGE_MB} MB). PDF hasil scan maks. {KK_MAX_PDF_MB} MB.
            </li>
            <li>iPhone: jika gagal, simpan foto sebagai JPG (bukan HEIC) lalu unggah lagi.</li>
          </ul>
          {preparing ? (
            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">Memproses file…</p>
          ) : null}
          {fileMeta?.previewUrl ? (
            <img
              src={fileMeta.previewUrl}
              alt="Pratinjau KK"
              className="mt-2 w-full max-h-40 object-contain rounded-lg border border-gray-200 dark:border-gray-600"
            />
          ) : null}
          {fileMeta && !fileMeta.previewUrl ? (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate" title={fileMeta.name}>
              {fileMeta.name} · {fileMeta.sizeLabel}
            </p>
          ) : null}
          {fileMeta?.previewUrl ? (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {fileMeta.name} · {fileMeta.sizeLabel}
            </p>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl border border-red-200 dark:border-red-800/50">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3.5 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitButtonLabel}
        </button>
        {!kkFile && !preparing && !loading ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Pilih file KK dari galeri atau ambil foto langsung.
          </p>
        ) : null}
      </form>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400 pt-4">
        <Link to="/lupa-nis" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
          Kembali ke cek NIS
        </Link>
      </p>

      <p className="hidden md:block text-center text-xs text-gray-500 mt-6 font-mono">v{APP_VERSION}</p>
    </AuthCardShell>
  )
}

export default LupaNisUploadKkCard
