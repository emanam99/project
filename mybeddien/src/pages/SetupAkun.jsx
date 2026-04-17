import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'

export default function SetupAkun() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [valid, setValid] = useState(null)
  const [nama, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setValid(false)
      return
    }
    let cancelled = false
    authAPI.getSetupTokenSantri(token).then((res) => {
      if (cancelled) return
      setValid(!!res.valid)
      if (res.valid) setNama(res.nama || 'Santri')
    }).catch(() => {
      if (!cancelled) setValid(false)
    })
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const u = username.trim()
    if (u.length < 5) {
      setError('Username minimal 5 karakter')
      return
    }
    if (/\s/.test(u)) {
      setError('Username tidak boleh mengandung spasi')
      return
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.postSetupAkunSantri(token, u, password)
      if (res.success) {
        navigate('/login', { replace: true })
      } else {
        setError(res.message || 'Gagal membuat akun')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal membuat akun')
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-200 dark:border-gray-700"
        >
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Link tidak valid</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            Link sudah kadaluarsa (aktif 5 menit) atau sudah dipakai. Silakan minta link baru dari halaman Daftar.
          </p>
          <a
            href="/daftar"
            className="inline-block py-2 px-4 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700"
          >
            Ke halaman Daftar
          </a>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700"
      >
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Buat Username & Password</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
          Untuk: <strong>{nama}</strong>
        </p>
        <p className="text-gray-500 dark:text-gray-500 text-xs mb-6">
          Username minimal 5 karakter, tanpa spasi. Password minimal 6 karakter.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200"
              placeholder="Min. 5 karakter, tanpa spasi"
              minLength={5}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200"
              placeholder="Min. 6 karakter"
              minLength={6}
              required
            />
          </div>

          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Membuat akun...' : 'Buat akun & masuk'}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
