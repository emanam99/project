import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { alumniAPI, clearAlumniSession } from '../../services/alumniApi'
import { useAlumniAuthStore } from '../../store/alumniAuthStore'
import { getGambarUrl } from '../../config/images'
import AlumniCountBadge from '../../components/alumni/AlumniCountBadge'
import { extractTanggalLahirFromNIK } from '../../utils/nikUtils'
import { alumniPath } from '../../config/alumniApp'

function AlumniNik() {
  const [nik, setNik] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nikValidation, setNikValidation] = useState('')
  const [nikExists, setNikExists] = useState(null)
  const [checkingNik, setCheckingNik] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const checkedNikRef = useRef(null)
  const checkingRef = useRef(false)
  const navigate = useNavigate()
  const { setAuth, isAuthenticated, clearAuth } = useAlumniAuthStore()

  // /alumni selalu halaman input NIK — jangan auto-lempar ke biodata/tercatat saat buka/reload link

  const handleNikChange = (e) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 16) {
      setNik(value)
      setError('')
      if (value !== checkedNikRef.current) {
        setNikExists(null)
        checkedNikRef.current = null
      }
      if (value.length > 0 && value.length < 16) {
        setNikValidation(`NIK kurang ${16 - value.length} angka`)
      } else if (value.length === 16) {
        // Validasi TTL tersembunyi — jangan ungkap detail ke user
        if (!extractTanggalLahirFromNIK(value)) {
          setNikValidation('')
          setError('NIK tidak valid')
        } else {
          setNikValidation('')
          setError('')
        }
      } else {
        setNikValidation('')
      }
    }
  }

  useEffect(() => {
    if (nik.length !== 16) {
      if (nik.length < 16) {
        setNikExists(null)
        checkedNikRef.current = null
      }
      return
    }
    if (checkedNikRef.current === nik || checkingRef.current) return

    const timeoutId = setTimeout(async () => {
      if (checkedNikRef.current === nik || checkingRef.current) return
      checkingRef.current = true
      setCheckingNik(true)
      try {
        const response = await alumniAPI.checkNik(nik)
        if (response.success && response.data) {
          setNikExists(response.data.exists === true)
        } else {
          setNikExists(false)
        }
        checkedNikRef.current = nik
      } catch {
        setNikExists(null)
        checkedNikRef.current = nik
      } finally {
        setCheckingNik(false)
        checkingRef.current = false
      }
    }, 450)
    return () => clearTimeout(timeoutId)
  }, [nik])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (nik.length !== 16 || !extractTanggalLahirFromNIK(nik)) {
      setError('NIK tidak valid')
      return
    }
    setError('')
    setLoading(true)
    try {
      const response = await alumniAPI.loginNik(nik)
      if (!response.success || !response.data?.token) {
        setError(response.message?.includes('NIK') ? 'NIK tidak valid' : (response.message || 'NIK tidak valid'))
        return
      }
      const identity = response.data.identity || {}
      // Ganti sesi lama sepenuhnya agar biodata tidak memakai NIK sebelumnya
      clearAuth()
      clearAlumniSession()
      setAuth(response.data.token, {
        ...response.data.user,
        nik: nik,
        gender: response.data.user?.gender || identity.gender || null,
        tanggal_lahir: identity.tanggal_lahir || response.data.user?.tanggal_lahir || null,
        tempat_lahir: identity.tempat_lahir || response.data.user?.tempat_lahir || null,
        registered: response.data.registered === true,
      })
      if (response.data.registered) {
        navigate(alumniPath('tercatat'), {
          replace: true,
          state: {
            mode: 'summary',
            alumni: response.data.alumni || {
              id: response.data.user?.id,
              id_alumni: response.data.user?.id_alumni,
              nama: response.data.user?.nama || '',
            },
          },
        })
      } else {
        navigate(alumniPath('biodata'), {
          replace: true,
          state: {
            loginNik: nik,
            identity,
            formReset: true,
          },
        })
      }
    } catch (err) {
      const msg = err?.response?.data?.message || ''
      setError(msg.toLowerCase().includes('nik') || err?.response?.status === 400 ? 'NIK tidak valid' : 'Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 max-w-xl mx-auto">
      <div className="text-center space-y-4">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight"
        >
          Pendataan Alumni
        </motion.h1>
        <p className="text-sm font-medium text-teal-700 dark:text-teal-300 max-w-md mx-auto">
          Sensus Alumni Pesantren Salafiyah Al-Utsmani
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Masukkan NIK Anda untuk mendaftar atau melihat data alumni yang sudah tercatat.
        </p>
        <AlumniCountBadge size="lg" label="Alumni sudah terdaftar" />
      </div>

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 sm:p-6 space-y-4"
      >
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="alumni-nik" className="text-sm font-medium text-gray-700 dark:text-gray-200">
              NIK
            </label>
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
            >
              Contoh lokasi NIK
            </button>
          </div>
          <input
            id="alumni-nik"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={nik}
            onChange={handleNikChange}
            placeholder="16 digit angka"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-lg tracking-wider focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
          />
          {nikValidation && (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{nikValidation}</p>
          )}
          {checkingNik && (
            <p className="mt-1.5 text-xs text-teal-600 dark:text-teal-400">Memeriksa NIK…</p>
          )}
          {!checkingNik && nikExists === true && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              NIK sudah terdaftar — Anda akan diarahkan ke halaman data tercatat.
            </p>
          )}
          {!checkingNik && nikExists === false && nik.length === 16 && (
            <p className="mt-1.5 text-xs text-teal-600 dark:text-teal-400">
              NIK belum terdaftar — lanjut isi biodata alumni.
            </p>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || nik.length !== 16}
          className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
        >
          {loading ? 'Memproses…' : nikExists ? 'Lihat data alumni' : 'Lanjut'}
        </button>

        {isAuthenticated && (
          <button
            type="button"
            onClick={() => {
              clearAuth()
              clearAlumniSession()
              setNik('')
              setNikExists(null)
              setError('')
            }}
            className="w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Keluar sesi alumni
          </button>
        )}
      </motion.form>

      <motion.aside
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="max-w-xl mx-auto px-1 space-y-3 text-center"
        aria-label="Refleksi alumni"
      >
        <blockquote className="text-sm sm:text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 font-medium italic">
          “Tidak ada yang namanya mantan santri. Sampai kapanpun, santri tetaplah santri.”
        </blockquote>
        <p className="text-xs sm:text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          Pendataan ini bukan sekadar administrasi, melainkan jembatan silaturahmi: agar kita tetap
          saling mengenal, saling mendoakan, dan tetap tersambung dengan keluarga besar
          Pesantren Salafiyah Al-Utsmani — di mana pun kita mengabdi dan berkarya.
        </p>
      </motion.aside>

      <AnimatePresence>
        {showInfo && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowInfo(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Contoh NIK di KTP</h3>
                <button
                  type="button"
                  onClick={() => setShowInfo(false)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-4">
                <img
                  src={getGambarUrl('/info/ktp.jpg')}
                  alt="Contoh KTP"
                  className="w-full h-auto rounded-xl shadow-sm"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                <img
                  src={getGambarUrl('/info/nik.jpg')}
                  alt="Contoh NIK"
                  className="w-full h-auto rounded-xl shadow-sm"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
                  NIK terdiri dari <b>16 digit angka</b>. Pastikan yang dimasukkan adalah NIK alumni sesuai KTP/KK.
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowInfo(false)}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium"
                >
                  Mengerti
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AlumniNik
