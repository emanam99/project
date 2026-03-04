import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'

function UbahUsername() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [valid, setValid] = useState(null) // null = loading, true/false
  const [nama, setNama] = useState('')
  const [usernameLama, setUsernameLama] = useState('')
  const [usernameBaru, setUsernameBaru] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setValid(false)
      return
    }
    let cancelled = false
    authAPI.getUbahUsernameToken(token).then((res) => {
      if (cancelled) return
      setValid(!!res.valid)
      if (res.valid) {
        setNama(res.nama || '')
        setUsernameLama(res.username || '')
      }
    }).catch(() => {
      if (!cancelled) setValid(false)
    })
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const u = usernameBaru.trim()
    if (u.length < 5) {
      setError('Username baru minimal 5 karakter')
      return
    }
    if (/\s/.test(u)) {
      setError('Username tidak boleh mengandung spasi')
      return
    }
    if (!password) {
      setError('Masukkan password saat ini untuk verifikasi')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.postUbahUsername(token, u, password)
      if (res.success) {
        navigate('/login', { replace: true })
      } else {
        setError(res.message || 'Gagal mengubah username')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengubah username')
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-teal-500 border-t-transparent" />
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
            Link sudah kadaluarsa (aktif 15 menit) atau sudah dipakai. Silakan minta link baru dari halaman Profil (Keamanan → Ubah username).
          </p>
          <a
            href="/login"
            className="inline-block py-2 px-4 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700"
          >
            Ke halaman Login
          </a>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-200 dark:border-gray-700"
      >
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">Ubah username</h1>
        {nama && <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">Halo, {nama}</p>}
        {usernameLama && <p className="text-gray-500 dark:text-gray-500 text-sm mb-6">Username saat ini: <span className="font-mono">{usernameLama}</span></p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Username baru</label>
            <input
              type="text"
              value={usernameBaru}
              onChange={(e) => setUsernameBaru(e.target.value)}
              placeholder="Min 5 karakter, tanpa spasi"
              className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password saat ini</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password yang benar untuk verifikasi"
              className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              autoComplete="current-password"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Password harus benar (sama dengan yang dipakai login).</p>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Menyimpan...' : 'Simpan username'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          Setelah berhasil, Anda akan diarahkan ke halaman login. Gunakan username baru dan password yang sama.
        </p>
      </motion.div>
    </div>
  )
}

export default UbahUsername
