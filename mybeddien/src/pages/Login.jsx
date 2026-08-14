import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../services/api'
import {
  clearStoredAccessPick,
  getHomePathForAccess,
  listAvailableAccessModes,
} from '../config/accessMode'
import { sanitizeAppRedirect } from '../utils/loginRedirect'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'
import { useHtmlDarkClass } from '../hooks/useHtmlDarkClass'
import {
  addLocalPasskeyRowId,
  clearLocalPasskeyRowIdsForUsername,
  clearStoredLoginUsername,
  getStoredLoginUsername,
  setStoredLoginUsername,
  shouldShowPasskeyLoginButton,
} from '../utils/passkeyLoginPrefs'
import AuthPwaInstallButton from '../components/Auth/AuthPwaInstallButton'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { y: 12, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 120, damping: 18 },
  },
}

export function LoginFormCard() {
  const location = useLocation()
  const isPjgtAuth = location.pathname.includes('pjgt')
  const daftarPath = isPjgtAuth ? '/daftar-pjgt' : '/daftar'
  const lupaPath = isPjgtAuth ? '/lupa-password-pjgt' : '/lupa-password'
  const lupaUsernamePath = isPjgtAuth ? '/lupa-username-pjgt' : '/lupa-username'

  const [username, setUsername] = useState('')
  const [useRememberedUsername, setUseRememberedUsername] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [flipPhase, setFlipPhase] = useState('idle')
  const prevThemeRef = useRef(null)
  const usernameInputRef = useRef(null)
  const prevRememberedUsernameRef = useRef(false)
  /** Respons login: akun punya lebih dari satu tautan santri — pilih identitas */
  const [santriChoiceOptions, setSantriChoiceOptions] = useState(null)
  /** true = pilihan santri untuk alur login passkey (bukan password) */
  const [santriChoiceFromWebauthn, setSantriChoiceFromWebauthn] = useState(false)
  const [webauthnSupported] = useState(() => typeof window !== 'undefined' && !!window.PublicKeyCredential)
  const [passkeyRegistered, setPasskeyRegistered] = useState(null)
  const [passkeyStatusLoading, setPasskeyStatusLoading] = useState(false)

  const { setAuth, setPasskeyPromptOpen } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDark = useHtmlDarkClass()

  const pendingRedirect = sanitizeAppRedirect(searchParams.get('redirect'))

  useEffect(() => {
    const stored = getStoredLoginUsername().trim()
    if (stored.length >= 2) {
      setUsername(stored)
      setUseRememberedUsername(true)
      prevRememberedUsernameRef.current = true
    }
  }, [])

  const applyClearedRememberedUsername = () => {
    setUsername('')
    setUseRememberedUsername(false)
    setPasskeyRegistered(null)
    setPasskeyStatusLoading(false)
  }

  useEffect(() => {
    const onCleared = () => applyClearedRememberedUsername()
    window.addEventListener('mybeddian-stored-username-cleared', onCleared)
    return () => window.removeEventListener('mybeddian-stored-username-cleared', onCleared)
  }, [])

  useEffect(() => {
    const wasRemembered = prevRememberedUsernameRef.current
    prevRememberedUsernameRef.current = useRememberedUsername
    if (wasRemembered && !useRememberedUsername && usernameInputRef.current) {
      usernameInputRef.current.focus({ preventScroll: false })
    }
  }, [useRememberedUsername])

  const handleClearStoredUsername = () => {
    clearStoredLoginUsername()
    applyClearedRememberedUsername()
  }

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
          const reg = !!res.data.webauthn_registered
          setPasskeyRegistered(reg)
          if (!reg) clearLocalPasskeyRowIdsForUsername(u)
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

  /** Setelah token & user valid: simpan device, cek allowed_apps, navigasi. @returns {boolean} false jika ditolak */
  const navigateAfterLogin = (data, usernameForPrefs = null) => {
    if (data?.device_id) {
      try {
        localStorage.setItem('mybeddian_device_id', data.device_id)
      } catch (_) {}
    }
    const user = data.user
    const allowedApps = user?.allowed_apps || []
    if (allowedApps.length && !allowedApps.includes('mybeddian') && !allowedApps.includes('uwaba')) {
      setError('Akses ditolak. Role Anda tidak memiliki izin untuk aplikasi ini.')
      return false
    }
    setAuth(data.token, user)
    if (usernameForPrefs != null && String(usernameForPrefs).trim().length >= 2) {
      setStoredLoginUsername(String(usernameForPrefs).trim())
    }
    if (data?.show_passkey_prompt) {
      setPasskeyPromptOpen(true)
    }
    const modes = listAvailableAccessModes(user)
    // Multi-akses: selalu minta pilih ulang setelah login (HP sering punya pick lama di
    // localStorage / PWA sehingga melewati /pilih-akses). Buka sesi tanpa login tetap pakai pick.
    if (modes.length > 1) {
      clearStoredAccessPick()
      useAuthStore.setState({ activeAccess: null })
      navigate('/pilih-akses', {
        replace: true,
        state: { forcePick: true, redirect: pendingRedirect || undefined },
      })
      return true
    }
    const st = useAuthStore.getState()
    let dest = null
    const apiRedirect = typeof data.redirect_url === 'string' ? data.redirect_url.trim() : ''
    if (pendingRedirect) {
      dest = pendingRedirect
    } else if (apiRedirect && apiRedirect !== '/') {
      dest = apiRedirect
    } else if (st.activeAccess) {
      dest = getHomePathForAccess(st.activeAccess)
    } else {
      dest = '/'
    }
    navigate(dest, { replace: true })
    return true
  }

  const handleWebAuthnLogin = async (santriIdPick = null) => {
    setError('')
    const u = username.trim()
    if (!u) {
      setError('Isi username terlebih dahulu.')
      return
    }
    setLoading(true)
    try {
      const deviceInfo = authAPI.getDeviceInfo()
      const extras = { mybeddian_login: true }
      if (santriIdPick != null && santriIdPick !== '') {
        const n = Number(santriIdPick)
        if (!Number.isNaN(n) && n > 0) extras.santri_id = n
      }
      const optRes = await authAPI.webauthnLoginOptions(u, extras)
      if (optRes?.code === 'SANTRI_CHOICE_REQUIRED' && Array.isArray(optRes.data?.santri_options)) {
        setSantriChoiceOptions(optRes.data.santri_options)
        setSantriChoiceFromWebauthn(true)
        setLoading(false)
        return
      }
      if (!optRes.success || !optRes.data?.options || !optRes.data?.challengeId) {
        setError(optRes.message || 'Passkey tidak tersedia untuk akun ini.')
        return
      }
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const credential = await startAuthentication({ optionsJSON: optRes.data.options })
      const response = await authAPI.webauthnLoginVerify(
        u,
        optRes.data.challengeId,
        credential,
        deviceInfo,
        extras
      )
      setSantriChoiceOptions(null)
      setSantriChoiceFromWebauthn(false)
      if (response?.code === 'SANTRI_CHOICE_REQUIRED' && Array.isArray(response.data?.santri_options)) {
        setSantriChoiceOptions(response.data.santri_options)
        setSantriChoiceFromWebauthn(true)
        return
      }
      if (response.success) {
        const cid = response.data?.credential_db_id
        if (cid != null) addLocalPasskeyRowId(u, cid)
        navigateAfterLogin(response.data, u)
      } else {
        setError(response.message || 'Login passkey gagal')
      }
    } catch (err) {
      console.error('WebAuthn login error:', err)
      let msg = err?.message || 'Login passkey gagal. Pastikan perangkat mendukung dan passkey sudah didaftarkan.'
      if (err?.name === 'NotAllowedError') {
        msg =
          'Login sidik jari dibatalkan atau passkey tidak cocok di perangkat ini. Coba lagi, atau daftar ulang passkey dari Profil setelah login password.'
      } else if (err?.name === 'InvalidStateError') {
        msg = 'Passkey tidak tersedia di perangkat ini. Login dengan password, lalu daftar passkey ulang di Profil.'
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const runMybeddianLogin = async (santriIdPick = null) => {
    setError('')
    setLoading(true)
    try {
      const deviceInfo = authAPI.getDeviceInfo()
      const response = await authAPI.loginMybeddian(username, password, null, deviceInfo, santriIdPick)
      if (response?.code === 'SANTRI_CHOICE_REQUIRED' && Array.isArray(response.data?.santri_options)) {
        setSantriChoiceOptions(response.data.santri_options)
        setSantriChoiceFromWebauthn(false)
        setLoading(false)
        return
      }
      setSantriChoiceOptions(null)
      setSantriChoiceFromWebauthn(false)
      if (response.success) {
        navigateAfterLogin(response.data, username.trim())
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
        setError(msg || 'Username atau password salah.')
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSantriChoiceFromWebauthn(false)
    await runMybeddianLogin(null)
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-100 relative z-10"
    >
      <motion.div
        variants={itemVariants}
        className="relative px-4 pt-2 pb-4 md:p-10 md:rounded-3xl md:bg-white/90 md:dark:bg-gray-800/90 md:backdrop-blur-xl md:border md:border-white/40 md:dark:border-gray-600/40 md:login-card-glow"
      >
        <div className="md:hidden text-center mb-2" style={{ perspective: '800px' }}>
          <motion.img
            src={getGambarUrl('/icon/mybeddienlogo.png')}
            alt="myBeddien"
            className="max-w-25 w-auto h-11 mx-auto mb-1 object-contain"
            whileHover={{ scale: 1.03 }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.img
              key={isDark ? 'text-dark' : 'text-light'}
              src={getGambarUrl(isDark ? '/icon/mybeddientextputih.png' : '/icon/mybeddientexthitam.png')}
              alt="myBeddien"
              className="max-w-30 w-auto h-9 mx-auto object-contain"
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
              whileHover={{ scale: 1.03 }}
            />
          </AnimatePresence>
          <div className="flex justify-center gap-1.5 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <button
              type="button"
              onClick={handleClearStoredUsername}
              className="font-mono select-none cursor-default"
              tabIndex={-1}
              aria-hidden
            >
              v{APP_VERSION}
            </button>
          </div>
          <motion.div variants={itemVariants} className="mt-2 space-y-1">
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">Selamat Datang</h1>
            {useRememberedUsername && username.trim() && (
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 tracking-tight">{username.trim()}</p>
            )}
          </motion.div>
        </div>

        <div className="hidden md:block text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1 tracking-tight">Selamat Datang</h1>
          {useRememberedUsername && username.trim() && (
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 tracking-tight">{username.trim()}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-5" style={{ perspective: '600px' }}>
          {santriChoiceOptions ? (
            <motion.div variants={itemVariants} className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Akun ini terhubung ke beberapa data santri. Pilih identitas yang akan dipakai di sesi Mybeddian ini.
              </p>
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {santriChoiceOptions.map((opt) => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => (santriChoiceFromWebauthn ? handleWebAuthnLogin(opt.id) : runMybeddianLogin(opt.id))}
                      className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 hover:border-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-900/20 disabled:opacity-60 transition-all"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100 block">{opt.nama || '—'}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">NIS {opt.nis ?? '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setSantriChoiceOptions(null)
                  setSantriChoiceFromWebauthn(false)
                  setError('')
                }}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                ← Kembali ke formulir login
              </button>
            </motion.div>
          ) : (
            <>
          {!useRememberedUsername && (
          <motion.div
            key="username-field"
            initial={false}
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
                ref={usernameInputRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white/95 dark:bg-gray-800/95 md:bg-gray-50/50 md:dark:bg-gray-700/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                placeholder="Username"
                required
                autoFocus={!useRememberedUsername}
                autoComplete="username"
              />
            </div>
          </motion.div>
          )}

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
                autoFocus={useRememberedUsername}
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
            </>
          )}

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

          {!santriChoiceOptions && (
            <>
              {webauthnSupported && username.trim().length >= 2 && passkeyStatusLoading && (
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  Memeriksa passkey untuk username ini…
                </p>
              )}
              <motion.div variants={itemVariants} className="flex gap-2 items-stretch w-full">
                <motion.button
                  variants={itemVariants}
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="flex-1 min-w-0 py-3.5 rounded-xl font-semibold text-white bg-linear-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all login-btn-glow shadow-md hover:shadow-lg"
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
                {webauthnSupported && shouldShowPasskeyLoginButton(passkeyRegistered === true, username) && (
                  <motion.button
                    type="button"
                    disabled={loading}
                    onClick={() => handleWebAuthnLogin(null)}
                    title="Login dengan passkey / sidik jari"
                    aria-label="Login dengan passkey atau sidik jari"
                    className="shrink-0 flex items-center justify-center w-13 rounded-xl text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/50 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.726 18M12 11h.01M12 18h.01" />
                    </svg>
                  </motion.button>
                )}
              </motion.div>
            </>
          )}

          <motion.div variants={itemVariants} className="text-center space-y-1 pt-0 md:pt-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Belum punya akun?{' '}
              <Link to={daftarPath} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                Daftar
              </Link>
            </p>
            <p className="text-sm">
              <Link to={lupaUsernamePath} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                Lupa username?
              </Link>
              <span className="text-gray-400 dark:text-gray-500 mx-1.5" aria-hidden>
                ·
              </span>
              <Link to={lupaPath} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
                Lupa password?
              </Link>
            </p>
          </motion.div>
          <motion.div variants={itemVariants} className="pt-1">
            <AuthPwaInstallButton variant="card" />
          </motion.div>
        </form>
      </motion.div>
    </motion.div>
  )
}

export default LoginFormCard
