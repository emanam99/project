import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { authAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'
import { getStoredLoginUsername, setStoredLoginUsername } from '../utils/passkeyLoginPrefs'

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

export function LoginFormCard() {
  const [username, setUsername] = useState(() => getStoredLoginUsername())
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [webauthnSupported] = useState(() => typeof window !== 'undefined' && browserSupportsWebAuthn())
  const [passkeyRegistered, setPasskeyRegistered] = useState(null) // null = belum cek, true/false dari API
  const [passkeyStatusLoading, setPasskeyStatusLoading] = useState(false)
  const [flipPhase, setFlipPhase] = useState('idle') // idle | close | open (untuk input flip saat ganti tema)
  const prevThemeRef = useRef(null)
  const { setAuth, setPasskeyPromptOpen } = useAuthStore()
  const { theme } = useThemeStore()
  const navigate = useNavigate()

  // Saat tema berubah: trigger animasi flip logo + input menutup lalu membuka
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

  // Cek apakah user punya passkey (untuk menampilkan tombol login WebAuthn)
  useEffect(() => {
    if (!webauthnSupported) {
      setPasskeyRegistered(null)
      setPasskeyStatusLoading(false)
      return
    }
    const u = username.trim()
    if (u.length < 2) {
      setPasskeyRegistered(null)
      setPasskeyStatusLoading(false)
      return
    }
    let cancelled = false
    setPasskeyStatusLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await authAPI.webauthnStatus(u)
        if (!cancelled && res.success && res.data) {
          setPasskeyRegistered(!!res.data.webauthn_registered)
        } else if (!cancelled) {
          setPasskeyRegistered(null)
        }
      } catch {
        if (!cancelled) setPasskeyRegistered(null)
      } finally {
        if (!cancelled) setPasskeyStatusLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [username, webauthnSupported])

  const handleWebAuthnLogin = async () => {
    setError('')
    const u = username.trim()
    if (!u) {
      setError('Isi username terlebih dahulu.')
      return
    }
    setLoading(true)
    try {
      const deviceInfo = authAPI.getDeviceInfo()
      const optRes = await authAPI.webauthnLoginOptions(u)
      if (!optRes.success || !optRes.data?.options || !optRes.data?.challengeId) {
        setError(optRes.message || 'Passkey tidak tersedia untuk akun ini.')
        return
      }
      const credential = await startAuthentication({ optionsJSON: optRes.data.options })
      const response = await authAPI.webauthnLoginVerify(u, optRes.data.challengeId, credential, deviceInfo)
      if (response.success) {
        if (response.data?.device_id) {
          try { localStorage.setItem('uwaba_device_id', response.data.device_id) } catch (_) {}
        }
        const user = response.data.user
        const allowedApps = user?.allowed_apps || []
        if (!allowedApps.includes('uwaba')) {
          setError('Akses ditolak. Role Anda tidak memiliki izin untuk mengakses aplikasi eBeddien.')
          return
        }
        setAuth(response.data.token, user, response.data.refresh_token ?? null)
        setStoredLoginUsername(u)
        navigate(response.data.redirect_url || '/beranda')
      } else {
        setError(response.message || 'Login passkey gagal')
      }
    } catch (err) {
      console.error('WebAuthn login error:', err)
      const msg = err?.name === 'NotAllowedError'
        ? 'Login dibatalkan atau tidak diizinkan.'
        : (err?.message || 'Login passkey gagal. Pastikan perangkat mendukung dan passkey sudah didaftarkan.')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const deviceInfo = authAPI.getDeviceInfo()
      const response = await authAPI.loginV2(username, password, null, deviceInfo)
      if (response.success) {
        if (response.data?.device_id) {
          try { localStorage.setItem('uwaba_device_id', response.data.device_id) } catch (_) {}
        }
        const user = response.data.user
        const allowedApps = user?.allowed_apps || []
        if (!allowedApps.includes('uwaba')) {
          setError('Akses ditolak. Role Anda tidak memiliki izin untuk mengakses aplikasi eBeddien.')
          return
        }
        setAuth(response.data.token, user, response.data.refresh_token ?? null)
        setStoredLoginUsername(username.trim())
        if (response.data?.show_passkey_prompt) {
          setPasskeyPromptOpen(true)
        }
        navigate(response.data.redirect_url || '/beranda')
      } else {
        setError(response.message || 'Login gagal')
      }
    } catch (err) {
      console.error('Login error:', err)
      if (!err.response) {
        const isCorsOrNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
        setError(isCorsOrNetwork ? 'Tidak dapat terhubung ke server API. Cek: (1) Backend sudah jalan, (2) CORS di server mengizinkan origin ini, (3) Jaringan/URL API benar.' : 'Tidak dapat terhubung ke server. Pastikan backend PHP sudah berjalan (XAMPP/local) atau URL API di .env benar.')
      } else if (err.response.status === 401) {
        const errorMsg = err.response?.data?.message
        setError(errorMsg && errorMsg.includes('Terlalu banyak percobaan') ? errorMsg : 'Username atau password yang Anda masukkan salah. Silakan coba lagi.')
      } else if (err.response.status === 403) setError('Akses ditolak. Pastikan akun Anda memiliki izin untuk mengakses sistem ini.')
      else if (err.response.status === 429) setError(err.response?.data?.message || 'Terlalu banyak percobaan login. Silakan tunggu sebentar sebelum mencoba lagi.')
      else if (err.response.status >= 500) setError('Terjadi kesalahan pada server. Silakan coba lagi beberapa saat.')
      else setError(err.response?.data?.message || 'Terjadi kesalahan saat melakukan login. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full max-w-[400px] relative z-10">
      <motion.div variants={itemVariants} className="relative p-4 md:p-10 md:rounded-3xl md:bg-white/90 md:dark:bg-gray-800/90 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow">
        <div className="md:hidden text-center mb-8" style={{ perspective: '800px' }}>
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
              {theme === 'dark' ? (
                <>
                  <motion.img src={getGambarUrl('/icon/ebeddienlogoputih.png')} alt="eBeddien" className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain" whileHover={{ scale: 1.03 }} />
                  <motion.img src={getGambarUrl('/icon/ebeddientextputih.png')} alt="eBeddien" className="max-w-[100px] w-auto h-10 mx-auto object-contain" whileHover={{ scale: 1.03 }} />
                </>
              ) : (
                <>
                  <motion.img src={getGambarUrl('/icon/ebeddienlogo.png')} alt="eBeddien" className="max-w-[100px] w-auto h-12 mx-auto mb-2 object-contain" whileHover={{ scale: 1.03 }} />
                  <motion.img src={getGambarUrl('/icon/ebeddientext.png')} alt="eBeddien" className="max-w-[100px] w-auto h-10 mx-auto object-contain" whileHover={{ scale: 1.03 }} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="flex justify-center gap-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400"><span className="font-mono">v{APP_VERSION}</span></div>
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </span>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" placeholder="Username" required autoFocus autoComplete="username" />
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
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </span>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" placeholder="Password" required autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-600/50 transition-colors" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
                {showPassword ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
              </button>
            </div>
          </motion.div>
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </motion.div>
          )}
          {webauthnSupported && username.trim().length >= 2 && passkeyStatusLoading && (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">Memeriksa passkey untuk username ini…</p>
          )}
          <motion.div variants={itemVariants} className="flex gap-2 items-stretch w-full">
            <motion.button
              type="submit"
              disabled={loading}
              className="flex-1 min-w-0 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all login-btn-glow"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              {loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Memproses...</span> : 'Masuk'}
            </motion.button>
            {webauthnSupported && passkeyRegistered === true && (
              <motion.button
                type="button"
                disabled={loading}
                onClick={handleWebAuthnLogin}
                title="Login dengan passkey / sidik jari"
                aria-label="Login dengan passkey atau sidik jari"
                className="shrink-0 flex items-center justify-center w-[3.25rem] rounded-xl text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/50 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.726 18M12 11h.01M12 18h.01" />
                </svg>
              </motion.button>
            )}
          </motion.div>
          <div className="text-center space-y-1 pt-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Belum punya akun? <Link to="/daftar" className="font-medium text-primary-600 dark:text-primary-400 hover:underline">Daftar</Link></p>
            <p className="text-sm"><Link to="/lupa-password" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">Lupa password?</Link></p>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

export default LoginFormCard
