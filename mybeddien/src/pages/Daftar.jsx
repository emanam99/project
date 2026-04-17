import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { authAPI } from '../services/api'
import { normalizeNikInput, isNikValid, normalizeNisInput } from '../utils/nikUtils'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { y: 16, opacity: 0 },
  visible: { y: 0, opacity: 1 },
}

export default function Daftar() {
  const [nis, setNis] = useState('')
  const [nik, setNik] = useState('')
  const [noWa, setNoWa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmModal, setConfirmModal] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')

  const handleDaftar = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setConfirmModal(null)

    const nisTrim = nis.trim()
    const nikTrim = nik.trim()
    if (nisTrim.length < 7) {
      setError('NIS harus 7 digit.')
      return
    }
    if (!isNikValid(nikTrim)) {
      setError('Coba kembali periksa NIK.')
      return
    }

    setLoading(true)
    try {
      const res = await authAPI.daftarCheckSantri(nisTrim, nikTrim, noWa.trim())
      if (!res.success) {
        setError(res.message || 'Gagal cek data')
        return
      }
      if (res.already_registered) {
        setError(res.message || 'Akun sudah terdaftar. Silakan login.')
        return
      }
      setConfirmModal({ nama: res.nama || 'Santri', no_wa: res.no_wa })
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
      const res = await authAPI.daftarKonfirmasiSantri(nis.trim(), nikTrim, noWa.trim())
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
    <div className="min-h-screen flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-linear-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="hidden md:flex flex-1 relative items-center justify-center p-12 bg-linear-to-br from-primary-700 to-primary-900">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-80" />
        <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} className="relative z-10 text-center text-white">
          <h1 className="text-4xl font-bold mb-3 tracking-tight">myBeddien</h1>
          <p className="text-primary-200 text-lg">Daftar akun santri</p>
        </motion.div>
      </div>

      <div className="w-full md:w-[440px] flex items-center justify-center p-6 md:p-10 shrink-0">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-sm"
        >
          <motion.div
            variants={itemVariants}
            className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/60 dark:border-gray-700 p-8"
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Daftar Akun</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Masukkan NIS, NIK, dan No. HP (WhatsApp) yang terdaftar.
              </p>
            </div>

            <form onSubmit={handleDaftar} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIS Santri</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nis}
                  onChange={(e) => setNis(normalizeNisInput(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 font-mono"
                  placeholder="7 digit NIS"
                  maxLength={7}
                  required
                />
                {nis.length > 0 && nis.length !== 7 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{nis.length}/7 digit</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIK</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={nik}
                  onChange={(e) => setNik(normalizeNikInput(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 font-mono tracking-wide"
                  placeholder="16 digit NIK"
                  maxLength={16}
                  required
                />
                {nik.length > 0 && nik.length !== 16 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{nik.length}/16 digit</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No. HP (WhatsApp)</label>
                <input
                  type="tel"
                  value={noWa}
                  onChange={(e) => setNoWa(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200"
                  placeholder="08xxxxxxxxxx"
                  required
                />
              </div>

              {error && (
                <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
                  {error}
                </div>
              )}
              {successMessage && (
                <div className="text-green-600 dark:text-green-400 text-sm bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-xl">
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        </motion.div>
      </div>

      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !loading && setConfirmModal(null)}
        >
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
