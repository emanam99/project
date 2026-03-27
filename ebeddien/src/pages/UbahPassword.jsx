import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'

/** Samakan backend: hapus whitespace dari salinan URL WhatsApp */
function normalizeTokenFromUrl(raw) {
  if (raw == null || typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, '').trim()
}

function UbahPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => normalizeTokenFromUrl(searchParams.get('token')), [searchParams])

  const [valid, setValid] = useState(null) // null = loading, true/false
  const [nama, setNama] = useState('')
  const [passwordBaru, setPasswordBaru] = useState('')
  const [konfirmasi, setKonfirmasi] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** Pesan khusus saat validasi token gagal (bukan hanya "kadaluarsa") */
  const [tokenCheckHint, setTokenCheckHint] = useState('')

  useEffect(() => {
    if (!token) {
      setValid(false)
      setTokenCheckHint('tidak_ada')
      return
    }
    let cancelled = false
    setTokenCheckHint('')
    authAPI.getUbahPasswordToken(token).then((res) => {
      if (cancelled) return
      if (res.success === false) {
        setValid(false)
        setTokenCheckHint(res.message || 'server')
        return
      }
      setValid(!!res.valid)
      if (res.valid && res.nama) setNama(res.nama)
      if (!res.valid) setTokenCheckHint('tidak_berlaku')
    }).catch((err) => {
      if (!cancelled) {
        setValid(false)
        setTokenCheckHint(err.response?.data?.message || 'jaringan')
      }
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
    const hint =
      tokenCheckHint === 'tidak_ada'
        ? 'Tidak ada token di alamat. Pastikan Anda membuka link lengkap dari WhatsApp (salin seluruh jika perlu).'
        : tokenCheckHint === 'jaringan'
          ? 'Tidak dapat menghubungi server. Periksa koneksi internet atau coba lagi.'
          : tokenCheckHint === 'tidak_berlaku'
            ? 'Link sudah kadaluarsa (aktif 15 menit) atau sudah dipakai. Silakan minta link baru dari halaman Profil (Ubah Password).'
            : tokenCheckHint && tokenCheckHint !== 'server'
              ? tokenCheckHint
              : 'Link sudah kadaluarsa (aktif 15 menit) atau sudah dipakai. Silakan minta link baru dari halaman Profil (Ubah Password).'
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-200 dark:border-gray-700"
        >
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Link tidak valid</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
            {hint}
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
