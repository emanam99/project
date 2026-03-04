import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'
import { normalizeNikInput, isNikValid } from '../utils/nikUtils'

function Daftar() {
  const [idPengurus, setIdPengurus] = useState('')
  const [nik, setNik] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmModal, setConfirmModal] = useState(null) // { nama, no_wa } or null
  const [successMessage, setSuccessMessage] = useState('')
  const navigate = useNavigate()

  const handleDaftar = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setConfirmModal(null)

    const nikTrim = nik.trim()
    if (!isNikValid(nikTrim)) {
      setError('Coba kembali periksa NIK.')
      return
    }

    setLoading(true)
    try {
      const res = await authAPI.daftarCheck(idPengurus.trim(), nikTrim, noWa.trim())
      if (!res.success) {
        setError(res.message || 'Gagal cek data')
        return
      }
      if (res.already_registered) {
        setError(res.message || 'Akun sudah terdaftar. Silakan login.')
        return
      }
      setConfirmModal({ nama: res.nama || 'Pengurus', no_wa: res.no_wa })
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan. Coba lagi.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan daftar. Coba lagi nanti.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKonfirmasi = async () => {
    if (!confirmModal) return
    setError('')

    const nikTrim = nik.trim()
    if (!isNikValid(nikTrim)) {
      setError('Coba kembali periksa NIK.')
      return
    }

    setLoading(true)
    try {
      const res = await authAPI.daftarKonfirmasi(idPengurus.trim(), nikTrim, noWa.trim())
      if (res.success) {
        setSuccessMessage(res.message || 'Link telah dikirim ke WhatsApp.')
        setConfirmModal(null)
      } else {
        setError(res.message || 'Gagal mengirim link')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim link.')
      if (err.response?.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan. Coba lagi nanti.')
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
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Daftar Akun</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
          Masukkan NIP Pengurus, NIK, dan No. WA yang terdaftar.
        </p>
        <p className="text-gray-500 dark:text-gray-500 text-xs mb-4">
          Satu NIK hanya untuk satu pengurus. Jika NIK sudah terdaftar, silakan login. Ada masalah? Hubungi admin.
        </p>

        <form onSubmit={handleDaftar} className="space-y-4">
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
              placeholder="16 digit NIK"
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
            {loading ? 'Memeriksa...' : 'Daftar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Sudah punya akun?{' '}
          <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
            Masuk
          </Link>
        </p>
      </motion.div>

      {/* Modal Konfirmasi */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !loading && setConfirmModal(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Konfirmasi Daftar</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
              Daftar atas nama <strong>{confirmModal.nama}</strong>.
            </p>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
              Pastikan nomor WhatsApp yang Anda masukkan aktif. Link akan dikirim ke:
            </p>
            <p className="font-mono text-primary-600 dark:text-primary-400 mb-4">{confirmModal.no_wa}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleKonfirmasi}
                disabled={loading}
                className="flex-1 py-2 rounded-xl font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Mengirim...' : 'Konfirmasi'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default Daftar
