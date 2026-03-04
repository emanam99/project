import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { loginWithSheet } from '../api/appScript'

export default function LoginPage() {
  const navigate = useNavigate()
  const [nip, setNip] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [userName, setUserName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!nip.trim() || !password) {
      setError('NIP dan Password wajib diisi.')
      return
    }
    setLoading(true)
    try {
      const result = await loginWithSheet({ nip: nip.trim(), password })
      if (result.success && result.user) {
        setUserName(result.user.name || nip.trim())
        try {
          localStorage.setItem('mdtwustha_user', JSON.stringify(result.user))
        } catch (_) {}
        setSuccess(true)
        setTimeout(() => navigate('/dashboard'), 1200)
      } else {
        setError(result.message || 'Login gagal.')
      }
    } catch (err) {
      setError('Koneksi gagal. Periksa URL Apps Script atau jaringan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full bg-gradient-to-br from-blue-500 to-violet-500 opacity-15 blur-3xl -top-32 -right-20 pointer-events-none"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 opacity-10 blur-3xl -bottom-20 -left-16 pointer-events-none"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.2, ease: 'easeOut' }}
      />

      <motion.div
        className="relative w-full max-w-md bg-slate-800/70 backdrop-blur-xl border border-white/10 rounded-xl p-8 shadow-2xl"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <motion.h1
          className="text-2xl font-bold text-slate-50 mb-1 tracking-tight"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          MDT Wustha
        </motion.h1>
        <motion.p
          className="text-slate-400 text-sm mb-7"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          Silakan masuk dengan NIP dan password Anda
        </motion.p>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              className="text-center py-6"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl font-bold"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              >
                ✓
              </motion.div>
              <p className="text-slate-100 text-lg">Login berhasil!</p>
              <p className="text-slate-400 text-sm mt-1">Selamat datang, {userName}</p>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.25 }}
              className="space-y-5"
            >
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <label htmlFor="login-nip" className="block text-sm font-medium text-slate-300">NIP</label>
                <input
                  id="login-nip"
                  type="text"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  placeholder="Masukkan NIP"
                  autoComplete="username"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/60 border border-white/10 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition disabled:opacity-70"
                />
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-300">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg bg-slate-900/60 border border-white/10 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition disabled:opacity-70"
                />
              </motion.div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    className="px-3 py-2.5 rounded-lg text-sm text-red-300 bg-red-500/15 border border-red-500/30"
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
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="w-full py-3.5 px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:shadow-lg hover:shadow-blue-500/40 disabled:opacity-85 disabled:cursor-not-allowed transition mt-1"
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
    </div>
  )
}
