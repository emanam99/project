import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'

function UbahPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [valid, setValid] = useState(null) // null = loading, true/false
  const [nama, setNama] = useState('')
  const [passwordBaru, setPasswordBaru] = useState('')
  const [konfirmasi, setKonfirmasi] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setValid(false)
      return
    }
    let cancelled = false
    authAPI.getUbahPasswordToken(token).then((res) => {
      if (cancelled) return
      setValid(!!res.valid)
      if (res.valid && res.nama) setNama(res.nama)
    }).catch(() => {
      if (!cancelled) setValid(false)
    })
    return () => { cancelled = true }
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (passwordBaru.length < 6) {
      setError('Password minimal 6 karakter')
      return
    }
    if (passwordBaru !== konfirmasi) {
      setError('Password dan konfirmasi tidak cocok')
      return
    }
    setLoading(true)
    try {
      const res = await authAPI.postUbahPassword(token, passwordBaru)
      if (res.success) {
        navigate('/login', { replace: true })
      } else {
        setError(res.message || 'Gagal mengubah password')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengubah password')
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
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
            Link sudah kadaluarsa (aktif 15 menit) atau sudah dipakai. Silakan minta link baru dari halaman Profil (Ubah Password).
          </p>
          <a
            href="/login"
            className="inline-block py-2 px-4 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700"
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
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">Buat password baru</h1>
        {nama && <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">Halo, {nama}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password baru</label>
            <input
              type="password"
              value={passwordBaru}
              onChange={(e) => setPasswordBaru(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Konfirmasi password</label>
            <input
              type="password"
              value={konfirmasi}
              onChange={(e) => setKonfirmasi(e.target.value)}
              placeholder="Ulangi password baru"
              className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Menyimpan...' : 'Simpan password'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          Setelah berhasil, Anda akan diarahkan ke halaman login.
        </p>
      </motion.div>
    </div>
  )
}

export default UbahPassword
