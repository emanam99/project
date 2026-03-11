import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'
import { normalizeNikInput, isNikValid } from '../utils/nikUtils'

function LupaPassword() {
  const [idPengurus, setIdPengurus] = useState('')
  const [nik, setNik] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    const nikTrim = nik.trim()
    if (!isNikValid(nikTrim)) {
      setError('Coba kembali periksa NIK.')
      return
    }

    setLoading(true)
    try {
      const res = await authAPI.lupaPasswordRequest(idPengurus.trim(), nikTrim, noWa.trim())
      if (res.success) {
        setSuccessMessage(res.message || 'Link buat password baru telah dikirim ke WhatsApp Anda.')
      } else {
        setError(res.message || 'Gagal mengirim link.')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak permintaan. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700"
      >
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Lupa Password</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
          Masukkan NIP Pengurus, NIK, dan No. WA yang sama persis dengan saat daftar. Link buat password baru akan dikirim ke WhatsApp Anda.
        </p>
        <p className="text-amber-700 dark:text-amber-400 text-xs mb-4 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
          NIK harus persis sama dengan yang terdaftar (tanpa spasi atau titik). Jika salah, permintaan akan ditolak.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIP Pengurus</label>
            <input
              type="text"
              value={idPengurus}
              onChange={(e) => setIdPengurus(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              placeholder="Contoh: 333"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIK</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={nik}
              onChange={(e) => setNik(normalizeNikInput(e.target.value))}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono tracking-wide"
              placeholder="16 digit NIK (persis seperti saat daftar)"
              maxLength={16}
              required
            />
            {nik.length > 0 && nik.length !== 16 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{nik.length}/16 digit</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No. WA</label>
            <input
              type="text"
              value={noWa}
              onChange={(e) => setNoWa(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              placeholder="08xxxxxxxxxx"
              required
            />
          </div>

          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="text-green-600 dark:text-green-400 text-sm bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Mengirim...' : 'Kirim link ke WhatsApp'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Ingat password?{' '}
          <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
            Masuk
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default LupaPassword
