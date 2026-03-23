import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { authAPI, pendaftaranAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import DaftarAuthLeftPanel from '../components/Auth/DaftarAuthLeftPanel'
import PendaftaranInfoOffcanvas from '../components/Auth/PendaftaranInfoOffcanvas'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
}

const itemVariants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 120, damping: 18 }
  }
}

function Login() {
  const [nik, setNik] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedInput, setFocusedInput] = useState(null)
  const [nikValidation, setNikValidation] = useState('')
  const [checkingNik, setCheckingNik] = useState(false)
  const [nikExists, setNikExists] = useState(null)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [pendaftaranInfoOpen, setPendaftaranInfoOpen] = useState(false)
  const [isMd, setIsMd] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  )
  const [flipPhase, setFlipPhase] = useState('idle')
  const prevThemeRef = useRef(null)
  const { tahunHijriyah, tahunMasehi, refreshTahunAjaran } = useTahunAjaranStore()
  const { setAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  useEffect(() => {
    refreshTahunAjaran()
    const handleFocus = () => refreshTahunAjaran()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshTahunAjaran])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsMd(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!pendaftaranInfoOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [pendaftaranInfoOpen])

  useEffect(() => {
    if (prevThemeRef.current === null) {
      prevThemeRef.current = theme
      return
    }
    if (prevThemeRef.current !== theme) {
      prevThemeRef.current = theme
      setFlipPhase('close')
    }
  }, [theme])

  const handleInputCloseComplete = () => {
    if (flipPhase === 'close') setFlipPhase('open')
  }

  const handleInputOpenComplete = () => {
    if (flipPhase === 'open') setFlipPhase('idle')
  }

  const checkedNikRef = useRef(null)
  const checkingRef = useRef(false)

  const handleNikChange = (e) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 16) {
      setNik(value)
      setError('')
      if (value !== checkedNikRef.current) {
        setNikExists(null)
        checkedNikRef.current = null
      }
      if (value.length > 0 && value.length < 16) {
        setNikValidation(`NIK kurang ${16 - value.length} angka`)
      } else if (value.length === 16) {
        setNikValidation('Silakan di cek ulang, sebelum isi Formulir')
      } else {
        setNikValidation('')
      }
    }
  }

  useEffect(() => {
    if (nik.length !== 16) {
      if (nik.length < 16) {
        setNikExists(null)
        checkedNikRef.current = null
      }
      return
    }
    if (checkedNikRef.current === nik || checkingRef.current) return

    const timeoutId = setTimeout(async () => {
      if (checkedNikRef.current === nik || checkingRef.current) return
      checkingRef.current = true
      setCheckingNik(true)
      try {
        const response = await pendaftaranAPI.searchByNik(nik)
        if (response.success && response.data) {
          setNikExists(response.data.exists === true)
        } else {
          setNikExists(false)
        }
        checkedNikRef.current = nik
      } catch (err) {
        console.error('Error checking NIK:', err)
        setNikExists(false)
        checkedNikRef.current = nik
      } finally {
        setCheckingNik(false)
        checkingRef.current = false
      }
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [nik])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (nik.length !== 16) {
      setError('NIK harus terdiri dari 16 angka')
      return
    }
    setError('')
    setLoading(true)
    try {
      const response = await authAPI.login(nik)
      if (response.success) {
        const user = response.data.user
        try { sessionStorage.setItem('daftar_login_nik', nik) } catch (e) { /* ignore */ }
        const userToSet = user ? { ...user, nik: user.nik || nik } : user
        setAuth(response.data.token, userToSet)
        const redirectUrl = '/dashboard'
        try { sessionStorage.setItem('redirect_after_login', redirectUrl) } catch (e) { /* ignore */ }
        navigate(redirectUrl)
      } else {
        setError(response.message || 'Login gagal')
      }
    } catch (err) {
      console.error('Login error:', err)
      if (!err.response) {
        setError('Tidak dapat terhubung ke server. Pastikan backend PHP sudah berjalan di XAMPP.')
      } else if (err.response.status === 401) {
        const errorMsg = err.response?.data?.message
        setError(errorMsg?.includes('Terlalu banyak percobaan') ? errorMsg : 'Terjadi kesalahan saat login. Silakan coba lagi.')
      } else if (err.response.status === 403) {
        setError('Akses ditolak. Pastikan akun Anda memiliki izin untuk mengakses sistem ini.')
      } else if (err.response.status === 404) {
        setError('NIK tidak ditemukan. Untuk santri baru, sistem sedang dalam perbaikan. Silakan hubungi administrator.')
      } else if (err.response.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan login. Silakan tunggu sebentar sebelum mencoba lagi.')
      } else if (err.response.status >= 500) {
        setError('Terjadi kesalahan pada server. Silakan coba lagi beberapa saat.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat melakukan login. Silakan coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  const getButtonText = () => {
    if (loading) return 'Memproses...'
    if (nik.length === 16) {
      if (checkingNik) return 'Mengecek NIK...'
      if (nikExists === true) return 'Edit Formulir Pendaftaran'
      if (nikExists === false) return 'Isi Formulir Pendaftaran'
    }
    return 'Masuk'
  }

  return (
    <div className="w-full min-h-screen flex relative overflow-y-auto md:overflow-hidden">
      <DaftarAuthLeftPanel tahunHijriyah={tahunHijriyah} tahunMasehi={tahunMasehi} />

      {/* Desktop: toggle tema di pemisah kiri/kanan */}
      <div
        className="hidden md:flex fixed z-50 flex-col gap-2 p-2 rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg border border-gray-200/60 dark:border-gray-600/60"
        style={{ left: 'calc(100% - 480px)', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
          style={{ perspective: '120px' }}
          whileTap={{ scale: 0.92 }}
          aria-label="Ganti tema gelap/terang"
        >
          <span className="relative w-5 h-5 block">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
      </div>

      <div
        className="w-full md:w-[480px] flex items-start md:items-center justify-center pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-0 px-4 pb-24 md:pb-8 md:px-10 relative z-10 login-bg-gradient min-h-screen md:min-h-0"
        style={{ perspective: '1400px' }}
      >
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[400px] relative z-10 md:mx-0 -mt-1 md:mt-0"
        >
          <motion.div
            variants={itemVariants}
            className="relative px-4 pt-2 pb-3 md:p-10 md:rounded-3xl md:bg-white/90 md:dark:bg-gray-800/90 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow"
          >
            <div className="md:hidden text-center mb-4" style={{ perspective: '800px' }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={theme}
                  className="inline-block"
                  initial={{ rotateY: -90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  exit={{ rotateY: 90, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  <motion.img
                    src={theme === 'dark' ? '/images/icon/dark.webp' : '/images/icon/light.webp'}
                    alt="Logo Pendaftaran Santri"
                    className="w-32 h-32 mx-auto object-contain drop-shadow-lg mb-1"
                    whileHover={{ scale: 1.03 }}
                  />
                </motion.div>
              </AnimatePresence>
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 leading-tight mt-0.5">Pendaftaran</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                Tahun ajaran {tahunHijriyah || '—'} / {tahunMasehi || '—'}
              </p>
              <div className="flex justify-center gap-1.5 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="font-mono">v{APP_VERSION}</span>
              </div>
            </div>

            <div className="hidden md:block text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">Masuk</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Masukkan NIK untuk melanjutkan formulir</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-5" style={{ perspective: '600px' }}>
              <motion.div
                variants={itemVariants}
                className="space-y-1.5 md:space-y-2"
                style={{ transformStyle: 'preserve-3d', transformOrigin: 'bottom center' }}
                animate={{ rotateX: flipPhase === 'close' ? 90 : flipPhase === 'open' ? 0 : 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                onAnimationComplete={flipPhase === 'close' ? handleInputCloseComplete : flipPhase === 'open' ? handleInputOpenComplete : undefined}
              >
                <label className="block w-full text-center text-sm font-medium text-gray-500 dark:text-gray-400 tracking-wide">
                  NIK (Nomor Induk Kependudukan)
                </label>
                <div
                  className={`rounded-xl border-2 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 overflow-hidden transition-all ${
                    focusedInput === 'nik'
                      ? 'border-primary-500 ring-2 ring-primary-500/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex justify-end items-center px-3 pt-2 pb-1 border-b border-gray-200/90 dark:border-gray-600/80 bg-gray-50/90 dark:bg-gray-800/80 md:bg-gray-100/50 md:dark:bg-gray-900/40">
                    <button
                      type="button"
                      onClick={() => setShowInfoModal(true)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Info
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      value={nik}
                      onChange={handleNikChange}
                      onFocus={() => setFocusedInput('nik')}
                      onBlur={() => setFocusedInput(null)}
                      maxLength={16}
                      className="w-full pl-12 pr-16 py-3 border-0 rounded-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-0 text-base"
                      placeholder="16 digit NIK"
                      required
                      autoFocus
                    />
                    {nik.length > 0 && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-gray-400 dark:text-gray-500 pointer-events-none">
                        {nik.length}/16
                      </span>
                    )}
                  </div>
                </div>

                {nikValidation && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`text-xs ${nik.length < 16 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}
                  >
                    {nikValidation}
                  </motion.p>
                )}
                {checkingNik && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-2"
                  >
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Mengecek data santri...
                  </motion.p>
                )}
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 text-sm"
                >
                  <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </motion.div>
              )}

              <motion.button
                variants={itemVariants}
                type="submit"
                disabled={loading || checkingNik || nik.length !== 16}
                className="w-full py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all login-btn-glow"
                whileHover={{ scale: loading || checkingNik || nik.length !== 16 ? 1 : 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {loading || checkingNik ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {getButtonText()}
                  </span>
                ) : (
                  getButtonText()
                )}
              </motion.button>

              <div className="hidden md:flex flex-col items-center gap-2 pt-1">
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 font-mono">
                  Versi {APP_VERSION}
                </p>
                <button
                  type="button"
                  onClick={() => setPendaftaranInfoOpen(true)}
                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
                >
                  Info pendaftaran
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </div>

      {/* Mobile: Tema + Info — sejajar, pola eBeddien (ikon + label kecil, gap-8) */}
      <div
        className="md:hidden fixed left-0 right-0 flex justify-center items-end gap-8 z-40 px-4"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="flex flex-col items-center justify-center gap-0.5 text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 active:opacity-80"
          style={{ perspective: '140px' }}
          whileTap={{ scale: 0.96 }}
          aria-label="Ganti tema gelap/terang"
        >
          <span className="relative w-7 h-7 block">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {theme === 'dark' ? (
                  <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-[10px] font-medium leading-tight">Tema</span>
        </motion.button>
        <motion.button
          type="button"
          onClick={() => setPendaftaranInfoOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 active:opacity-80"
          whileTap={{ scale: 0.96 }}
          aria-label="Info pendaftaran"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] font-medium leading-tight">Info</span>
        </motion.button>
      </div>

      <PendaftaranInfoOffcanvas
        open={pendaftaranInfoOpen}
        onClose={() => setPendaftaranInfoOpen(false)}
        isMd={isMd}
      />

      <AnimatePresence>
        {showInfoModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInfoModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Informasi NIK</h3>
                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <img src="/images/info/nik.jpg" alt="Info NIK" className="w-full h-auto rounded-xl shadow-sm" />
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 text-center">
                  Pastikan yang dimasukkan adalah <b>NIK santri</b> yang mau mendaftar, sesuai dengan Kartu Keluarga (KK).
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowInfoModal(false)}
                  className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Mengerti
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Login
