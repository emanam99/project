import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { authAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'
import { useHtmlDarkClass } from '../hooks/useHtmlDarkClass'
import { normalizeNikInput, isNikValid, normalizeNisInput } from '../utils/nikUtils'
import NikFieldLabel from '../components/Auth/NikFieldLabel'
import DaftarPjgtQrScannerOffcanvas from '../components/Auth/DaftarPjgtQrScannerOffcanvas'
import WaPreparePanel from '../components/Auth/WaPreparePanel'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
}

const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 120, damping: 18 },
  },
}

const inputClass =
  'w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all'

function FieldShell({ children }) {
  return (
    <motion.div variants={itemVariants} className="space-y-1">
      {children}
    </motion.div>
  )
}

/**
 * Lupa username — verifikasi identitas seperti daftar (santri / PJGT / toko), lalu kirim username ke WA.
 */
export function LupaUsernameFormCard() {
  const location = useLocation()
  const path = location.pathname
  const mode = path.includes('pjgt') ? 'pjgt' : path.includes('toko') ? 'toko' : 'santri'
  const loginPath = mode === 'pjgt' ? '/login-pjgt' : '/login'
  const lupaPasswordPath =
    mode === 'pjgt' ? '/lupa-password-pjgt' : mode === 'toko' ? '/lupa-password-toko' : '/lupa-password'

  const [nis, setNis] = useState('')
  const [nik, setNik] = useState('')
  const [identitas, setIdentitas] = useState('')
  const [namaMadrasah, setNamaMadrasah] = useState('')
  const [kodeToko, setKodeToko] = useState('')
  const [namaToko, setNamaToko] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [waPrepare, setWaPrepare] = useState(null)
  const [pjgtQrOpen, setPjgtQrOpen] = useState(false)
  const isDark = useHtmlDarkClass()
  const noWaRef = useRef(noWa)
  noWaRef.current = noWa

  useEffect(() => {
    setError('')
    setSuccessMessage('')
    setWaPrepare(null)
    setNis('')
    setNik('')
    setIdentitas('')
    setNamaMadrasah('')
    setKodeToko('')
    setNamaToko('')
    // Pertahankan no WA antar mode agar tidak perlu ketik ulang
    setNoWa(noWaRef.current)
    setPjgtQrOpen(false)
  }, [mode])

  // Pre-bundle @zxing saat mode PJGT (sama seperti daftar).
  useEffect(() => {
    if (mode !== 'pjgt') return undefined
    let cancelled = false
    import('@zxing/browser').catch(() => {
      if (!cancelled && import.meta.env.DEV) {
        /* vite:preloadError / reload di main.jsx menangani deps kedaluwarsa */
      }
    })
    return () => {
      cancelled = true
    }
  }, [mode])

  const modeTitle = mode === 'pjgt' ? 'PJGT' : mode === 'toko' ? 'Toko' : 'Santri'
  const modeHint =
    mode === 'pjgt'
      ? 'Isi identitas & nama madrasah serta No. WA PJGT (sama seperti daftar).'
      : mode === 'toko'
        ? 'Isi kode & nama toko serta No. WA (sama seperti daftar).'
        : 'Isi NIS, NIK, dan No. WA (sama seperti daftar).'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    let payload = { mode, no_wa: noWa.trim() }

    if (mode === 'santri') {
      const nisTrim = nis.trim()
      const nikTrim = nik.trim()
      if (nisTrim.length < 7) {
        setError('NIS harus 7 digit.')
        return
      }
      if (!isNikValid(nikTrim)) {
        setError('Coba kembali periksa NIK.')
        return
      }
      if (!payload.no_wa) {
        setError('Nomor WhatsApp wajib diisi.')
        return
      }
      payload = { ...payload, nis: nisTrim, nik: nikTrim }
    } else if (mode === 'pjgt') {
      if (identitas.trim().length < 2) {
        setError('Identitas madrasah wajib diisi.')
        return
      }
      if (namaMadrasah.trim().length < 2) {
        setError('Nama madrasah wajib diisi.')
        return
      }
      if (!payload.no_wa) {
        setError('Nomor WhatsApp wajib diisi.')
        return
      }
      payload = {
        ...payload,
        identitas: identitas.trim(),
        nama: namaMadrasah.trim(),
      }
    } else {
      if (!kodeToko.trim()) {
        setError('Kode toko wajib diisi.')
        return
      }
      if (namaToko.trim().length < 2) {
        setError('Nama toko wajib diisi.')
        return
      }
      if (!payload.no_wa) {
        setError('Nomor WhatsApp wajib diisi.')
        return
      }
      payload = {
        ...payload,
        kode_toko: kodeToko.trim(),
        nama_toko: namaToko.trim(),
      }
    }

    setLoading(true)
    try {
      const res = await authAPI.lupaUsernameRequest(payload)
      if (res.success) {
        if (res.wa_me_url) {
          setWaPrepare({
            message: res.message,
            wa_me_url: res.wa_me_url,
            wa_message: res.wa_message || '',
            expires_in_minutes: res.expires_in_minutes || 30,
          })
          setSuccessMessage('')
        } else {
          setSuccessMessage(res.message || 'Username sedang dikirim ke WhatsApp Anda.')
        }
      } else {
        setError(res.message || 'Gagal mengirim username.')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak permintaan. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <motion.div
      key={mode}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-[400px] relative z-10"
    >
      <motion.div
        variants={itemVariants}
        className="relative p-4 md:p-10 md:rounded-3xl md:bg-white/90 md:dark:bg-gray-800/90 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow"
      >
        <div className="md:hidden text-center mb-8" style={{ perspective: '800px' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isDark ? 'dark' : 'light'}
              className="inline-block"
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {isDark ? (
                <>
                  <motion.img
                    src={getGambarUrl('/icon/mybeddienlogo.png')}
                    alt="myBeddien"
                    className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain drop-shadow-md"
                    whileHover={{ scale: 1.03 }}
                  />
                  <motion.img
                    src={getGambarUrl('/icon/mybeddientextputih.png')}
                    alt="myBeddien"
                    className="max-w-[120px] w-auto h-10 mx-auto object-contain"
                    whileHover={{ scale: 1.03 }}
                  />
                </>
              ) : (
                <>
                  <motion.img
                    src={getGambarUrl('/icon/mybeddienlogo.png')}
                    alt="myBeddien"
                    className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain"
                    whileHover={{ scale: 1.03 }}
                  />
                  <motion.img
                    src={getGambarUrl('/icon/mybeddientexthitam.png')}
                    alt="myBeddien"
                    className="max-w-[120px] w-auto h-10 mx-auto object-contain"
                    whileHover={{ scale: 1.03 }}
                  />
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="flex justify-center gap-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-mono">v{APP_VERSION}</span>
          </div>
        </div>

        <div className="hidden md:block text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">
            Lupa username · {modeTitle}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{modeHint}</p>
        </div>

        <p className="text-amber-800 dark:text-amber-300/95 text-xs mb-4 bg-amber-50 dark:bg-amber-900/25 px-3 py-2 rounded-xl border border-amber-200/80 dark:border-amber-800/50">
          Verifikasi sama seperti saat daftar. Setelah isi formulir, kirim pesan ke WhatsApp resmi; username dikirim di balasan bot (bukan ditampilkan di layar).
        </p>

        {waPrepare ? (
          <WaPreparePanel
            message={waPrepare.message}
            waMeUrl={waPrepare.wa_me_url}
            waMessage={waPrepare.wa_message}
            expiresInMinutes={waPrepare.expires_in_minutes || 30}
            onReset={() => setWaPrepare(null)}
          />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'santri' && (
            <>
              <FieldShell>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">NIS Santri</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={nis}
                    onChange={(e) => setNis(normalizeNisInput(e.target.value))}
                    className={`${inputClass} font-mono`}
                    placeholder="7 digit NIS"
                    maxLength={7}
                    required
                    autoFocus
                  />
                </div>
              </FieldShell>
              <FieldShell>
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
                    className={`${inputClass} font-mono tracking-wide`}
                    placeholder="16 digit NIK"
                    maxLength={16}
                    required
                  />
                </div>
              </FieldShell>
            </>
          )}

          {mode === 'pjgt' && (
            <>
              <FieldShell>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Identitas madrasah
                </label>
                <div className="flex items-stretch gap-2">
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={identitas}
                      onChange={(e) => setIdentitas(e.target.value)}
                      className={`${inputClass} font-sans w-full`}
                      placeholder="Identitas madrasah"
                      required
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPjgtQrOpen(true)}
                    className="flex flex-col items-center justify-center gap-0.5 shrink-0 w-13 px-1 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 text-primary-600 dark:text-primary-400 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-50/80 dark:hover:bg-primary-900/25 transition-colors"
                    aria-label="Scan QR identitas madrasah"
                  >
                    <span className="text-[10px] font-medium leading-tight text-gray-600 dark:text-gray-400">Scan QR</span>
                    <svg className="w-auto h-full max-h-7 min-h-4.5 flex-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                  </button>
                </div>
              </FieldShell>
              <FieldShell>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Nama madrasah
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={namaMadrasah}
                    onChange={(e) => setNamaMadrasah(e.target.value)}
                    className={`${inputClass} font-sans`}
                    placeholder="Nama madrasah"
                    required
                  />
                </div>
              </FieldShell>
            </>
          )}

          {mode === 'toko' && (
            <>
              <FieldShell>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kode toko</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={kodeToko}
                    onChange={(e) => setKodeToko(e.target.value)}
                    className={`${inputClass} font-sans`}
                    placeholder="Kode toko"
                    required
                    autoFocus
                  />
                </div>
              </FieldShell>
              <FieldShell>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nama toko</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={namaToko}
                    onChange={(e) => setNamaToko(e.target.value)}
                    className={`${inputClass} font-sans`}
                    placeholder="Nama toko"
                    required
                  />
                </div>
              </FieldShell>
            </>
          )}

          <FieldShell>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              No. HP (WhatsApp)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </span>
              <input
                type="tel"
                value={noWa}
                onChange={(e) => setNoWa(e.target.value)}
                className={`${inputClass} font-sans`}
                placeholder="08xxxxxxxxxx"
                required
              />
            </div>
          </FieldShell>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 text-sm"
            >
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </motion.div>
          )}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-green-800 dark:text-green-300 px-4 py-3 text-sm"
            >
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{successMessage}</span>
            </motion.div>
          )}

          <motion.button
            variants={itemVariants}
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-linear-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all login-btn-glow shadow-md hover:shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Mengirim...
              </span>
            ) : (
              'Siapkan tautan WhatsApp'
            )}
          </motion.button>

          <div className="text-center text-sm text-gray-600 dark:text-gray-400 pt-2 space-y-1">
            <p>
              Ingat username?{' '}
              <Link to={loginPath} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                Masuk
              </Link>
            </p>
            <p>
              <Link to={lupaPasswordPath} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                Lupa password?
              </Link>
            </p>
          </div>
        </form>
        )}
      </motion.div>
    </motion.div>

    {mode === 'pjgt' ? (
      <DaftarPjgtQrScannerOffcanvas
        isOpen={pjgtQrOpen}
        onClose={() => setPjgtQrOpen(false)}
        onSuccess={({ identitas: idVal, nama }) => {
          setIdentitas(idVal || '')
          setNamaMadrasah(nama || '')
          setError('')
          setSuccessMessage('')
          setWaPrepare(null)
        }}
      />
    ) : null}
    </>
  )
}

export default LupaUsernameFormCard
