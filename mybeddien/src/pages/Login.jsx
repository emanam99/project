import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { useTheme } from '../contexts/ThemeContext'
import { getGambarUrl } from '../config/images'
import { useHtmlDarkClass } from '../hooks/useHtmlDarkClass'
import AuthLeftPanel from '../components/Auth/AuthLeftPanel'

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

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [flipPhase, setFlipPhase] = useState('idle')
  const prevThemeRef = useRef(null)

  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const { toggleTheme } = useTheme()
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

  const handleInputCloseComplete = () => {
    if (flipPhase === 'close') setFlipPhase('open')
  }

  const handleInputOpenComplete = () => {
    if (flipPhase === 'open') setFlipPhase('idle')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const deviceInfo = authAPI.getDeviceInfo()
      const response = await authAPI.loginMybeddian(username, password, null, deviceInfo)
      if (response.success) {
        if (response.data?.device_id) {
          try {
            localStorage.setItem('mybeddian_device_id', response.data.device_id)
          } catch (_) {}
        }
        const user = response.data.user
        const allowedApps = user?.allowed_apps || []
        if (allowedApps.length && !allowedApps.includes('mybeddian') && !allowedApps.includes('uwaba')) {
          setError('Akses ditolak. Role Anda tidak memiliki izin untuk aplikasi ini.')
          return
        }
        setAuth(response.data.token, user)
        navigate(response.data.redirect_url || '/')
      } else {
        setError(response.message || 'Login gagal')
      }
    } catch (err) {
      console.error('Login error:', err)
      if (!err.response) {
        const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
        setError(
          isNetwork
            ? 'Tidak dapat terhubung ke server API. Pastikan backend berjalan dan CORS/URL API benar.'
            : 'Tidak dapat terhubung ke server. Cek backend (XAMPP) dan VITE_API_BASE_URL di .env.'
        )
      } else if (err.response.status === 401) {
        const msg = err.response?.data?.message
        setError(msg?.includes('Terlalu banyak') ? msg : 'Username atau password salah.')
      } else if (err.response.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan. Tunggu sebentar.')
      } else if (err.response.status >= 500) {
        setError('Kesalahan server. Coba lagi nanti.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full min-h-screen flex relative overflow-y-auto md:overflow-hidden">
      <AuthLeftPanel />

      {/* Desktop: tombol tema di pemisah kiri/kanan */}
      <div
        className="hidden md:flex fixed z-50 flex-col gap-2 p-2 rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg border border-gray-200/60 dark:border-gray-600/60"
        style={{ left: 'calc(100% - 480px)', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
          style={{ perspective: '120px' }}
          whileTap={{ scale: 0.92 }}
          aria-label={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
        >
          <span className="relative w-5 h-5 block">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? 'dark' : 'light'}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {isDark ? (
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
      </div>

      <div
        className="w-full md:w-[480px] flex items-start md:items-center justify-center pt-6 md:pt-0 px-4 pb-24 md:pb-8 md:px-10 relative z-10 login-bg-gradient"
        style={{ perspective: '1400px' }}
      >
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

            <div className="hidden md:block text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">Selamat Datang</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Masuk ke akun Anda untuk melanjutkan</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" style={{ perspective: '600px' }}>
              <motion.div
                variants={itemVariants}
                className="space-y-1"
                style={{ transformStyle: 'preserve-3d', transformOrigin: 'bottom center' }}
                animate={{ rotateX: flipPhase === 'close' ? 90 : flipPhase === 'open' ? 0 : 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                onAnimationComplete={flipPhase === 'close' ? handleInputCloseComplete : flipPhase === 'open' ? handleInputOpenComplete : undefined}
              >
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    placeholder="Username"
                    required
                    autoFocus
                    autoComplete="username"
                  />
                </div>
              </motion.div>

              <motion.div
                variants={itemVariants}
                className="space-y-1"
                style={{ transformStyle: 'preserve-3d', transformOrigin: 'bottom center' }}
                animate={{ rotateX: flipPhase === 'close' ? 90 : flipPhase === 'open' ? 0 : 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                onAnimationComplete={flipPhase === 'close' ? handleInputCloseComplete : flipPhase === 'open' ? handleInputOpenComplete : undefined}
              >
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-600/50 transition-colors"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
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
                    Memproses...
                  </span>
                ) : (
                  'Masuk'
                )}
              </motion.button>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 pt-2">
                Belum punya akun?{' '}
                <Link to="/daftar" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                  Daftar
                </Link>
              </p>
            </form>
          </motion.div>
        </motion.div>
      </div>

      {/* Mobile: tombol tema di bawah */}
      <div className="md:hidden fixed bottom-6 left-0 right-0 flex justify-center z-40 px-4">
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="flex flex-col items-center justify-center gap-0.5 text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 active:opacity-80"
          style={{ perspective: '140px' }}
          whileTap={{ scale: 0.96 }}
          aria-label={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
        >
          <span className="relative w-7 h-7 block">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? 'dark' : 'light'}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {isDark ? (
                  <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-[10px] font-medium leading-tight">Tema</span>
        </motion.button>
      </div>
    </div>
  )
}
