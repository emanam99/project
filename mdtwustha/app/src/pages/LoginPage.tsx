import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { login } from '../api/apiClient'
import { gambarUrl } from '../config/paths'
import { usePwaInstallPrompt } from '../hooks/usePwaInstallPrompt'
import MaterialIcon from '../components/MaterialIcon'
import { isLoggedIn, saveSession } from '../utils/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const [checkingSession, setCheckingSession] = useState(true)
  const [nip, setNip] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [userName, setUserName] = useState('')
  const idleMessage =
    (location.state as { reason?: string } | null)?.reason === 'idle'
      ? 'Sesi berakhir karena tidak ada aktivitas selama 5 jam. Silakan login lagi.'
      : ''

  useEffect(() => {
    if (isLoggedIn()) {
      navigate('/dashboard', { replace: true })
      return
    }
    setCheckingSession(false)
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!nip.trim() || !password) {
      setError('NIP dan Password wajib diisi.')
      return
    }
    setLoading(true)
    try {
      const result = await login({ nip: nip.trim(), password })
      if (result.success && result.user?.id && result.user?.nip) {
        setUserName(result.user.name || nip.trim())
        saveSession({
          id: String(result.user.id),
          nip: result.user.nip,
          name: result.user.name,
          jabatan: result.user.jabatan,
          akses: result.user.akses,
        })
        setSuccess(true)
        setTimeout(() => navigate('/dashboard', { replace: true }), 1200)
      } else {
        setError(result.message || 'Login gagal.')
      }
    } catch {
      setError('Koneksi gagal. Periksa API atau jaringan.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return null
  }

  return (
    <div className="ui-login-bg">
      <motion.div
        className="absolute w-[28rem] h-[28rem] rounded-full bg-gradient-to-br from-blue-500/25 to-sky-400/10 blur-3xl -top-36 -right-24 pointer-events-none"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-cyan-400/15 to-blue-600/10 blur-3xl -bottom-24 -left-16 pointer-events-none"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.15, ease: 'easeOut' }}
      />

      <div className="relative z-10 w-full max-w-[26rem] flex flex-col items-stretch gap-4">
        <motion.div
          className="ui-login-card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <motion.div
            className="flex flex-col items-center text-center mb-7"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.4 }}
          >
            <div className="relative mb-4">
              <div
                className="absolute inset-0 rounded-[1.35rem] bg-blue-500/20 blur-xl scale-110"
                aria-hidden
              />
              <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.25rem] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900/80 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/10 overflow-hidden">
                <img
                  src={gambarUrl('logo/icon.png')}
                  alt="Logo MDT Wustha"
                  className="h-12 w-12 object-contain"
                />
              </div>
            </div>
            <h1 className="text-[1.65rem] font-bold tracking-tight text-slate-800 dark:text-slate-50 leading-tight">
              MDT Wustha
            </h1>
            <p className="mt-1.5 text-sm ui-text-muted max-w-[18rem]">
              Masuk dengan NIP dan password pengurus
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                className="text-center py-5"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.28 }}
              >
                <motion.div
                  className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.08 }}
                >
                  <MaterialIcon name="check" size={28} />
                </motion.div>
                <p className="ui-text-strong text-lg">Login berhasil</p>
                <p className="ui-subtitle mt-1">Selamat datang, {userName}</p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.15 }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label htmlFor="login-nip" className="ui-label">
                    NIP
                  </label>
                  <input
                    id="login-nip"
                    type="text"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    placeholder="Masukkan NIP"
                    autoComplete="username"
                    disabled={loading}
                    className="ui-input-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="login-password" className="ui-label">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    autoComplete="current-password"
                    disabled={loading}
                    className="ui-input-lg"
                  />
                </div>

                {idleMessage && !error && (
                  <div className="px-3 py-2.5 text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                    {idleMessage}
                  </div>
                )}

                <AnimatePresence>
                  {error && (
                    <motion.div
                      className="px-3 py-2.5 text-sm ui-error-box rounded-xl"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: loading ? 1 : 1.01 }}
                  whileTap={{ scale: loading ? 1 : 0.985 }}
                  className="w-full py-3.5 px-5 ui-btn-primary hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-85 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <motion.span
                        className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                      />
                      Memeriksa...
                    </span>
                  ) : (
                    'Masuk'
                  )}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {canInstall && (
          <motion.button
            type="button"
            onClick={() => void promptInstall()}
            className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-2xl border border-blue-500/25 bg-white/85 dark:bg-slate-900/70 backdrop-blur text-blue-700 dark:text-blue-300 text-sm font-semibold shadow-sm hover:bg-blue-500/10 hover:border-blue-500/40 transition"
            title="Install aplikasi MDT Wustha"
            aria-label="Install aplikasi"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25 }}
          >
            <MaterialIcon name="download" size={20} />
            Install aplikasi
          </motion.button>
        )}
      </div>
    </div>
  )
}
