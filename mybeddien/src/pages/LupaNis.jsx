import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { authAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'
import { useHtmlDarkClass } from '../hooks/useHtmlDarkClass'
import {
  normalizeNikInput,
  isNikValid,
  parseNisPengajuanCheckResponse,
  parseNisPengajuanCheckPending,
} from '../utils/nikUtils'
import {
  hasLupaNisUploadPending,
  loadLupaNisUpload,
  saveLupaNisHasil,
  saveLupaNisTerkirim,
  saveLupaNisUpload,
} from '../utils/lupaNisResultStorage'
import NikFieldLabel from '../components/Auth/NikFieldLabel'
import { WaCheckHint } from '../components/Auth/WaCheckHint'
import { useWaNumberProbe } from '../hooks/useWaNumberProbe'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 120, damping: 18 },
  },
}

const inputClass =
  'w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all'

const inputClassMono = `${inputClass} font-mono`

export function LupaNisFormCard() {
  const navigate = useNavigate()
  const [nama, setNama] = useState('')
  const [nik, setNik] = useState('')
  const [tanggalLahir, setTanggalLahir] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [flipPhase, setFlipPhase] = useState('idle')
  const prevThemeRef = useRef(null)
  const isDark = useHtmlDarkClass()

  useEffect(() => {
    if (prevThemeRef.current === null) {
      prevThemeRef.current = isDark
      return
    }
    if (prevThemeRef.current !== isDark) {
      prevThemeRef.current = isDark
      setFlipPhase('close')
    }
  }, [isDark])

  useEffect(() => {
    const pending = loadLupaNisUpload()
    if (!hasLupaNisUploadPending(pending)) return
    const q = new URLSearchParams()
    if (pending.id) q.set('id', String(pending.id))
    if (pending.nama) q.set('nama', pending.nama)
    navigate(`/lupa-nis/upload-kk?${q.toString()}`, { replace: true, state: pending })
  }, [navigate])

  const nikNorm = normalizeNikInput(nik)
  const {
    waProbe,
    waChecking,
    waHint,
    waCanRetry,
    retryWaCheck,
    waVerified,
    waAcceptedForSubmit,
    waManualConfirmed,
    setWaManualConfirmedChecked,
    showManualWaConfirm,
    manualRetryClickCount,
    waDigitsLen,
  } = useWaNumberProbe(noWa, {
    hints: {
      empty: 'Nomor akan dicek ke WhatsApp otomatis setelah terisi (min. 10 digit).',
      ok: 'Nomor WhatsApp aktif — Anda bisa melanjutkan.',
    },
  })
  const formFilled =
    nama.trim().length >= 2 && nikNorm.length === 16 && tanggalLahir !== ''
  /** Tombol aktif setelah WA terverifikasi (atau konfirmasi manual) + field terisi. */
  const canSubmit = waAcceptedForSubmit && !waChecking && waDigitsLen >= 10 && formFilled

  const submitButtonLabel = (() => {
    if (loading) return 'Memeriksa…'
    if (waDigitsLen < 10) return 'Lengkapi nomor WhatsApp'
    if (waChecking || waProbe === 'pending') return 'Memverifikasi WhatsApp…'
    if (!waAcceptedForSubmit) {
      if (showManualWaConfirm && !waManualConfirmed) return 'Centang konfirmasi nomor WA'
      if (waProbe === 'server_down') return 'Layanan cek WA bermasalah'
      return 'Verifikasi WhatsApp dulu'
    }
    if (nama.trim().length < 2) return 'Lengkapi nama santri'
    if (nikNorm.length !== 16) return 'Lengkapi NIK (16 digit)'
    if (!tanggalLahir) return 'Lengkapi tanggal lahir'
    return 'Cek NIS'
  })()

  const handleCheck = async (e) => {
    e.preventDefault()
    setError('')
    if (!canSubmit) {
      if (waVerified && formFilled && !isNikValid(nikNorm)) {
        setError('NIK tidak valid. Pastikan 16 digit sesuai Kartu Keluarga (KK).')
      } else if (waVerified && formFilled) {
        setError('Lengkapi semua data dan pastikan nomor WhatsApp terverifikasi.')
      } else if (showManualWaConfirm && !waManualConfirmed) {
        setError(
          'Pengecekan WhatsApp gagal berulang. Centang pernyataan di bawah nomor WA atau ketuk Coba cek lagi.'
        )
      } else if (waProbe === 'server_down') {
        setError(
          waHint ||
            'Layanan cek WhatsApp sedang bermasalah. Periksa koneksi internet atau ketuk Coba cek lagi.'
        )
      } else {
        setError('Tunggu hingga nomor WhatsApp terverifikasi aktif, lalu coba lagi.')
      }
      return
    }
    if (!isNikValid(nikNorm)) {
      setError('NIK tidak valid. Pastikan 16 digit sesuai Kartu Keluarga (KK).')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.nisPengajuanCheck({
        nama,
        nik,
        tanggal_lahir: tanggalLahir,
        no_wa: noWa,
      })
      if (!res.success) {
        setError(res.message || 'Gagal memeriksa data.')
        return
      }
      const pending = parseNisPengajuanCheckPending(res)
      if (pending?.kind === 'review') {
        setError(
          pending.message ||
            'Pengajuan KK sedang ditinjau admin. NIS akan dikirim ke nomor WhatsApp Anda setelah disetujui.'
        )
        return
      }
      if (pending?.kind === 'wa_verify') {
        const payload = {
          id: pending.id,
          nama: pending.nama || nama.trim(),
          nik: pending.nik || nikNorm,
          tanggal_lahir: pending.tanggal_lahir || tanggalLahir,
          no_wa: pending.no_wa || noWa.trim(),
        }
        saveLupaNisTerkirim(payload)
        const q = new URLSearchParams()
        q.set('id', String(payload.id))
        if (payload.nama) q.set('nama', payload.nama)
        navigate(`/lupa-nis/terkirim?${q.toString()}`, { replace: true, state: payload })
        return
      }
      if (pending?.kind === 'kk_upload') {
        const payload = {
          id: pending.id,
          nama: pending.nama || nama.trim(),
          nik: pending.nik || nikNorm,
          tanggal_lahir: pending.tanggal_lahir || tanggalLahir,
          no_wa: pending.no_wa || noWa.trim(),
        }
        saveLupaNisUpload(payload)
        navigate('/lupa-nis/upload-kk', { replace: true, state: payload })
        return
      }

      const matched = parseNisPengajuanCheckResponse(res)
      if (matched) {
        const nikNorm = normalizeNikInput(nik)
        const payload = { ...matched, nik: nikNorm }
        saveLupaNisHasil(payload)
        navigate('/lupa-nis/hasil', { replace: true, state: payload })
        return
      }
      const namaTrim = nama.trim()
      const payload = {
        nama: namaTrim,
        nik: nikNorm,
        tanggal_lahir: tanggalLahir,
        no_wa: noWa.trim(),
      }
      saveLupaNisUpload(payload)
      navigate('/lupa-nis/upload-kk', { replace: true, state: payload })
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const flipMotionProps = {
    style: { transformStyle: 'preserve-3d', transformOrigin: 'bottom center' },
    animate: { rotateX: flipPhase === 'close' ? 90 : 0 },
    transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] },
    onAnimationComplete: () => {
      if (flipPhase === 'close') setFlipPhase('open')
      else if (flipPhase === 'open') setFlipPhase('idle')
    },
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-[400px] relative z-10"
    >
      <motion.div
        variants={itemVariants}
        className="relative p-4 md:p-10 md:rounded-3xl md:bg-white/90 md:dark:bg-gray-800/90 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow"
      >
        <motion.div variants={itemVariants} className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">Lupa NIS?</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Verifikasi identitas santri untuk mengetahui NIS.
          </p>
        </motion.div>

        <div className="rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/80 dark:bg-teal-900/20 px-3 py-2.5 text-xs text-teal-900 dark:text-teal-200 space-y-1">
          <p>
            Jika data belum cocok, Anda akan diminta mengunggah <strong>Kartu Keluarga (KK)</strong>.
          </p>
          <p>
            Setelah admin menyetujui, <strong>NIS dikirim ke nomor WhatsApp</strong> yang Anda isi di bawah.
          </p>
        </div>

        <form onSubmit={handleCheck} className="space-y-4">
            <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nama lengkap santri</label>
              <motion.div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className={`${inputClass} font-sans`}
                  placeholder="Sesuai data pusat"
                  required
                  autoFocus
                />
              </motion.div>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
              <NikFieldLabel required />
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={nik}
                  onChange={(e) => setNik(normalizeNikInput(e.target.value))}
                  className={`${inputClassMono} tracking-wide`}
                  placeholder="16 digit NIK"
                  maxLength={16}
                  required
                />
              </div>
              {nik.length > 0 && nik.length !== 16 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 pl-1">{nik.length}/16 digit</p>
              )}
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tanggal lahir</label>
              <motion.div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
                <input
                  type="date"
                  value={tanggalLahir}
                  onChange={(e) => setTanggalLahir(e.target.value)}
                  className={inputClass}
                  required
                />
              </motion.div>
            </motion.div>

            <motion.div variants={itemVariants} className="space-y-1" {...flipMotionProps}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">No. HP (WhatsApp)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={noWa}
                  onChange={(e) => setNoWa(e.target.value)}
                  className={`${inputClassMono} font-sans ${
                    waVerified
                      ? 'border-emerald-500/90 dark:border-emerald-500/70'
                      : waManualConfirmed
                        ? 'border-amber-500/90 dark:border-amber-500/70'
                        : ''
                  }`}
                  placeholder="08xxxxxxxxxx"
                  required
                  autoComplete="tel"
                />
              </div>
              <WaCheckHint
                waHint={waHint}
                waChecking={waChecking}
                waVerified={waVerified}
                waCanRetry={waCanRetry}
                onRetry={retryWaCheck}
                showManualConfirm={showManualWaConfirm}
                waManualConfirmed={waManualConfirmed}
                onManualConfirmChange={setWaManualConfirmedChecked}
                manualRetryClickCount={manualRetryClickCount}
              />
            </motion.div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
            >
              {submitButtonLabel}
            </button>
        </form>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400 pt-4">
          <Link to="/daftar" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Kembali ke daftar
          </Link>
        </p>

        <div className="hidden md:flex justify-center gap-1.5 mt-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-mono">v{APP_VERSION}</span>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default LupaNisFormCard
