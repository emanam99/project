import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { authAPI, pendaftaranAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'

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
  const { tahunHijriyah, tahunMasehi, loadTahunAjaran, refreshTahunAjaran } = useTahunAjaranStore()

  useEffect(() => {
    refreshTahunAjaran()
    const handleFocus = () => refreshTahunAjaran()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refreshTahunAjaran])

  const checkedNikRef = useRef(null)
  const checkingRef = useRef(false)
  const { setAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

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
        const hasSantriId = user != null && user.id != null && user.id !== ''
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
    <div className="min-h-screen flex flex-col md:flex-row relative overflow-hidden bg-gray-950">
      {/* Animated gradient background - full screen */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30 md:opacity-40"
          style={{ backgroundImage: `url(${getGambarUrl('/gedung.jpeg')})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900/90 via-gray-900/95 to-primary-800/90" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(45,212,191,0.15),transparent)]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary-400/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-80" />
      </div>

      {/* Theme toggle */}
      <motion.button
        onClick={toggleTheme}
        className="fixed top-5 right-5 z-50 p-2.5 rounded-xl bg-white/10 dark:bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all duration-200 shadow-lg"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </motion.button>

      {/* Left: Branding (desktop) */}
      <div className="hidden md:flex flex-1 flex-col justify-center items-center relative z-10 px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="max-w-md text-center"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={theme}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mb-8"
            >
              <img
                src={theme === 'dark' ? '/images/icon/dark.webp' : '/images/icon/light.webp'}
                alt="Logo eBeddien"
                className="w-40 h-40 mx-auto object-contain drop-shadow-2xl"
              />
            </motion.div>
          </AnimatePresence>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2 drop-shadow-lg">
            Pendaftaran
          </h1>
          <p className="text-primary-200/90 text-sm font-medium">
            Pendaftaran Santri
          </p>
          <p className="text-white/60 text-xs mt-4">
            Tahun Ajaran: <span className="font-semibold text-white/90">{tahunHijriyah || '-'}</span>
            <span className="mx-1">/</span>
            <span className="font-semibold text-white/90">{tahunMasehi || '-'}</span>
          </p>
        </motion.div>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 relative z-10 min-h-[60vh] md:min-h-0">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[420px]"
        >
          <motion.div
            variants={itemVariants}
            className="relative rounded-3xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"
          >
            {/* Card glow */}
            <div className="absolute -inset-px bg-gradient-to-b from-white/20 to-transparent rounded-3xl opacity-50 pointer-events-none" />
            <div className="relative p-8 md:p-10">
              {/* Mobile: logo + title */}
              <div className="md:hidden text-center mb-6">
                <img
                  src={theme === 'dark' ? '/images/icon/dark.webp' : '/images/icon/light.webp'}
                  alt="Logo"
                  className="w-36 h-36 mx-auto object-contain mb-3"
                />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pendaftaran</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Tahun Ajaran: {tahunHijriyah || '-'} / {tahunMasehi || '-'}
                </p>
              </div>

              {/* Desktop: title only */}
              <div className="hidden md:block text-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Masuk</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Masukkan NIK untuk melanjutkan</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <motion.div variants={itemVariants} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      NIK (Nomor Induk Kependudukan)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInfoModal(true)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-xs font-medium transition-colors border border-amber-200/50 dark:border-amber-700/50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Info NIK
                    </button>
                  </div>
                  <div
                    className={`relative flex items-center rounded-xl border-2 bg-gray-50 dark:bg-gray-800/50 transition-all duration-200 ${
                      focusedInput === 'nik'
                        ? 'border-primary-500 ring-4 ring-primary-500/20 dark:ring-primary-400/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <span className="pl-4 text-gray-400 dark:text-gray-500">
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
                      className="flex-1 py-3.5 pr-4 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-base"
                      placeholder="16 digit NIK"
                      required
                      autoFocus
                    />
                    {nik.length > 0 && (
                      <span className="pr-4 text-xs font-mono text-gray-400 dark:text-gray-500">
                        {nik.length}/16
                      </span>
                    )}
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
                    className="rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 text-sm font-medium"
                  >
                    {error}
                  </motion.div>
                )}

                <motion.button
                  variants={itemVariants}
                  type="submit"
                  disabled={loading || checkingNik || nik.length !== 16}
                  className="w-full relative py-4 rounded-xl font-semibold text-white overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 focus:ring-4 focus:ring-primary-500/30 shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {(loading || checkingNik) && (
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {getButtonText()}
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700" />
                </motion.button>

                <p className="text-center text-xs text-gray-400 dark:text-gray-500 font-mono pt-1">
                  Versi {APP_VERSION}
                </p>
              </form>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Info Modal */}
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
