import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { authAPI, pendaftaranAPI } from '../services/api'
import { APP_VERSION } from '../config/version'
import { getGambarUrl } from '../config/images'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 100
    }
  }
}

function Login() {
  const [nik, setNik] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedInput, setFocusedInput] = useState(null)
  const [nikValidation, setNikValidation] = useState('')
  const [checkingNik, setCheckingNik] = useState(false)
  const [nikExists, setNikExists] = useState(null) // null = belum dicek, true = ada, false = belum ada
  const [showInfoModal, setShowInfoModal] = useState(false)
  const { tahunHijriyah, tahunMasehi, loadTahunAjaran, refreshTahunAjaran } = useTahunAjaranStore()

  // Load tahun ajaran saat mount - selalu refresh untuk mendapatkan data terbaru
  useEffect(() => {
    // Force refresh untuk memastikan data terbaru dari API
    refreshTahunAjaran()

    // Refresh saat window focus (user kembali ke tab)
    const handleFocus = () => {
      refreshTahunAjaran()
    }
    window.addEventListener('focus', handleFocus)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [refreshTahunAjaran])

  // Ref untuk track NIK yang sudah dicek
  const checkedNikRef = useRef(null)
  const checkingRef = useRef(false)

  const { setAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  // Handle NIK input change dengan validasi dan batasan 16 karakter
  const handleNikChange = (e) => {
    const value = e.target.value.replace(/\D/g, '') // Hanya angka
    if (value.length <= 16) {
      setNik(value)
      setError('')

      // Reset status cek jika NIK berubah
      if (value !== checkedNikRef.current) {
        setNikExists(null)
        checkedNikRef.current = null
      }

      // Validasi panjang NIK
      if (value.length > 0 && value.length < 16) {
        setNikValidation(`NIK kurang ${16 - value.length} angka`)
      } else if (value.length === 16) {
        setNikValidation('Silakan di cek ulang, sebelum isi Formulir')
      } else {
        setNikValidation('')
      }
    }
  }

  // Cek data santri ketika NIK sudah 16 karakter (hanya sekali per NIK)
  useEffect(() => {
    // Skip jika NIK belum 16 karakter
    if (nik.length !== 16) {
      if (nik.length < 16) {
        // Reset status jika NIK kurang dari 16 karakter
        setNikExists(null)
        checkedNikRef.current = null
      }
      return
    }

    // Skip jika NIK ini sudah dicek sebelumnya
    if (checkedNikRef.current === nik) {
      return
    }

    // Skip jika sedang dalam proses checking
    if (checkingRef.current) {
      return
    }

    // Debounce untuk menghindari terlalu banyak request
    const timeoutId = setTimeout(async () => {
      // Double check untuk memastikan tidak ada race condition
      if (checkedNikRef.current === nik || checkingRef.current) {
        return
      }

      checkingRef.current = true
      setCheckingNik(true)

      try {
        const response = await pendaftaranAPI.searchByNik(nik)
        if (response.success && response.data) {
          // Cek apakah NIK ada berdasarkan field 'exists'
          if (response.data.exists === true) {
            // NIK ditemukan
            setNikExists(true)
          } else {
            // NIK tidak ditemukan
            setNikExists(false)
          }
        } else {
          // Response tidak sukses, anggap NIK belum ada
          setNikExists(false)
        }

        // Mark NIK ini sudah dicek
        checkedNikRef.current = nik
      } catch (err) {
        console.error('Error checking NIK:', err)
        // Untuk error, anggap NIK belum ada
        setNikExists(false)
        // Mark NIK ini sudah dicek meskipun error
        checkedNikRef.current = nik
      } finally {
        setCheckingNik(false)
        checkingRef.current = false
      }
    }, 500)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [nik]) // Hanya depend pada nik, tidak pada checkingNik

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validasi NIK harus 16 karakter
    if (nik.length !== 16) {
      setError('NIK harus terdiri dari 16 angka')
      return
    }

    setError('')
    setLoading(true)

    try {
      const response = await authAPI.login(nik)

      if (response.success) {
        const user = response.data.user
        const data = response.data || {}
        const hasSantriId = user != null && user.id != null && user.id !== ''

        // Set auth dulu agar API getRegistrasi pakai token
        setAuth(response.data.token, user)

        // Simpan NIK yang baru dimasukkan agar halaman Biodata bisa pre-fill tanpa nulis ulang
        try {
          sessionStorage.setItem('daftar_login_nik', nik)
        } catch (e) { /* ignore */ }

        let redirectUrl = (data.show_pilihan_status === true ? '/pilihan-status' : null) || data.redirect_url || '/'
        const skipFlowByBackend = data.show_pilihan_status === false
        let hasRegistrasiTahunIni = false

        // Cek di frontend: jika NIK punya registrasi tahun ini → langsung dashboard (tidak tampilkan flow opsi pendidikan)
        if (hasSantriId) {
          try {
            await loadTahunAjaran(true)
            const { tahunHijriyah: th, tahunMasehi: tm } = useTahunAjaranStore.getState()
            if (th && tm) {
              const reg = await pendaftaranAPI.getRegistrasi(user.id, th, tm)
              if (reg.success && reg.data) {
                redirectUrl = '/dashboard'
                hasRegistrasiTahunIni = true
              }
            }
          } catch (e) {
            console.warn('Cek registrasi tahun ini:', e)
          }
        }

        // Jangan override ke flow jika sudah pasti punya registrasi tahun ini
        if (!hasRegistrasiTahunIni && !skipFlowByBackend && redirectUrl === '/dashboard' && hasSantriId) {
          redirectUrl = '/pilihan-status'
        }
        if (redirectUrl === '/pilihan-status' && hasSantriId) {
          try {
            localStorage.setItem('daftar_status_pendaftar', 'Lama')
          } catch (e) { /* ignore */ }
          redirectUrl = '/pilihan-opsi-pendidikan'
        }

        try {
          sessionStorage.setItem('redirect_after_login', redirectUrl)
        } catch (e) { /* ignore */ }
        navigate(redirectUrl)
      } else {
        setError(response.message || 'Login gagal')
      }
    } catch (err) {
      console.error('Login error:', err)

      if (!err.response) {
        setError('Tidak dapat terhubung ke server. Pastikan backend PHP sudah berjalan di XAMPP.')
      } else if (err.response.status === 401) {
        const errorMsg = err.response?.data?.message
        if (errorMsg && errorMsg.includes('Terlalu banyak percobaan')) {
          setError(errorMsg)
        } else {
          setError('Terjadi kesalahan saat login. Silakan coba lagi.')
        }
      } else if (err.response.status === 403) {
        setError('Akses ditolak. Pastikan akun Anda memiliki izin untuk mengakses sistem ini.')
      } else if (err.response.status === 404) {
        // NIK tidak ditemukan di backend (backward compatibility)
        // Tetap lanjutkan login dengan NIK yang diinput (santri baru)
        // Buat user sementara untuk login
        const tempUser = {
          id: null,
          nama: '',
          nik: nik,
          role_key: 'santri',
          role_label: 'Santri',
          allowed_apps: ['daftar'],
          permissions: []
        }

        // Generate token sementara di frontend (atau bisa juga langsung navigate)
        // Untuk sementara, kita langsung navigate karena backend sudah handle NIK tidak ditemukan
        // Tapi jika masih dapat 404, berarti backend belum diupdate
        setError('NIK tidak ditemukan. Untuk santri baru, sistem sedang dalam perbaikan. Silakan hubungi administrator.')
      } else if (err.response.status === 429) {
        setError(err.response?.data?.message || 'Terlalu banyak percobaan login. Silakan tunggu sebentar sebelum mencoba lagi.')
      } else if (err.response.status >= 500) {
        setError('Terjadi kesalahan pada server. Silakan coba lagi beberapa saat.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat melakukan login. Silakan coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Tentukan teks tombol berdasarkan status NIK
  const getButtonText = () => {
    if (loading) {
      return 'Memproses...'
    }

    if (nik.length === 16) {
      if (checkingNik) {
        return 'Mengecek NIK...'
      }

      if (nikExists === true) {
        return 'Edit Formulir Pendaftaran'
      } else if (nikExists === false) {
        return 'Isi Formulir Pendaftaran'
      }
    }

    return 'Masuk'
  }

  return (
    <div className="min-h-screen flex relative overflow-y-auto md:overflow-hidden">
      {/* Theme Toggle Button */}
      <motion.button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 p-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-200 dark:border-gray-700"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </motion.button>

      {/* Background Image Section - Desktop/Tablet */}
      <div className="hidden md:flex flex-1 relative">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${getGambarUrl('/gedung.jpeg')})`
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary-900/80 via-primary-800/70 to-primary-700/60"></div>
        </div>

        <div className="relative z-10 flex flex-col justify-center items-start px-12 text-white">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-md"
          >
            <h1 className="text-xl font-bold mb-0.5 drop-shadow-2xl">
              Pendaftaran Santri Baru
            </h1>
            {/* Tahun Ajaran - Desktop Background */}
            <p className="text-primary-200 text-xs drop-shadow-sm">
              Tahun Ajaran: <span className="font-semibold">{tahunHijriyah || '-'}</span> / <span className="font-semibold">{tahunMasehi || '-'}</span>
            </p>
          </motion.div>
        </div>
      </div>

      {/* Login Form Section */}
      <div className="w-full md:w-[450px] flex items-start md:items-center justify-center pt-8 md:pt-4 px-4 pb-20 md:pb-8 md:px-8 relative z-10">
        {/* Background untuk mobile */}
        <div
          className="md:hidden absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
          style={{
            backgroundImage: `url(${getGambarUrl('/gedung.jpeg')})`
          }}
        >
          <div className="absolute inset-0 bg-primary-900/40"></div>
        </div>

        {/* Background hiasan untuk desktop/tablet */}
        <div className="hidden md:block absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div
            className="absolute inset-0 opacity-5 dark:opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          ></div>

          <div className="absolute top-0 right-0 w-96 h-96 bg-primary-200/20 dark:bg-primary-800/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-300/20 dark:bg-primary-700/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary-400/10 dark:bg-primary-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md relative z-10"
        >
          <motion.div
            variants={itemVariants}
            className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-2xl pt-6 pb-8 px-8 md:pt-8 md:pb-10 md:px-10 border border-white/20"
          >
            {/* Animated Icon Section */}
            <div className="flex justify-center mb-3 overflow-hidden" style={{ perspective: "1000px" }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={theme}
                  initial={{ opacity: 0, rotateY: -110, scale: 0.5 }}
                  animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                  exit={{ opacity: 0, rotateY: 110, scale: 0.5 }}
                  transition={{
                    type: "spring",
                    stiffness: 100,
                    damping: 15,
                    mass: 0.8
                  }}
                >
                  <img
                    src={theme === 'dark' ? '/images/icon/dark.webp' : '/images/icon/light.webp'}
                    alt="Logo"
                    className="w-32 h-32 object-contain drop-shadow-2xl"
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Logo untuk mobile */}
            <div className="md:hidden text-center mb-4">
              <h1 className="text-lg font-bold text-gray-800 dark:text-white mb-0">
                Pendaftaran Santri Baru
              </h1>
              {/* Tahun Ajaran - Mobile */}
              <div className="flex items-center justify-center gap-3 mb-1.5 transition-all">
                <div className="text-[11px] text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Tahun Ajaran:</span>{' '}
                  <span className="font-semibold">{tahunHijriyah || '-'}</span> /{' '}
                  <span className="font-semibold">{tahunMasehi || '-'}</span>
                </div>
              </div>

            </div>

            {/* Title untuk desktop/tablet */}
            <div className="hidden md:block text-center mb-4">
              <h1 className="text-lg font-bold text-gray-800 dark:text-white mb-0">
                Pendaftaran Santri Baru
              </h1>
              {/* Tahun Ajaran - Desktop */}
              <div className="flex items-center justify-center gap-3 mb-1.5 transition-all">
                <div className="text-[11px] text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Tahun Ajaran:</span>{' '}
                  <span className="font-semibold">{tahunHijriyah || '-'}</span> /{' '}
                  <span className="font-semibold">{tahunMasehi || '-'}</span>
                </div>
              </div>

            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

              <motion.div
                variants={itemVariants}
                className="relative group"
                whileHover={{ scale: 1.01 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <div className="relative flex items-center">
                  <motion.div
                    className="flex items-center justify-center z-10"
                    animate={{
                      scale: focusedInput === 'nik' ? 1.2 : 1,
                      rotate: focusedInput === 'nik' ? [0, -10, 10, -10, 0] : 0,
                    }}
                    transition={{
                      scale: { duration: 0.2 },
                      rotate: { duration: 0.5, ease: "easeInOut" }
                    }}
                  >
                    <svg
                      className={`w-5 h-5 ${focusedInput === 'nik' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'} transition-colors duration-300`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                    </svg>
                  </motion.div>
                  <motion.input
                    type="text"
                    value={nik}
                    onChange={handleNikChange}
                    onFocus={() => setFocusedInput('nik')}
                    onBlur={() => setFocusedInput(null)}
                    maxLength={16}
                    className="flex-1 ml-3 py-3 bg-transparent border-none border-b-2 border-gray-400 dark:border-gray-500 text-gray-800 dark:text-gray-200 focus:outline-none transition-all duration-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm"
                    placeholder="NIK (Nomor Induk Kependudukan)"
                    required
                    autoFocus
                    whileFocus={{ scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  />

                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500"
                    initial={{ width: "0%" }}
                    animate={{
                      width: focusedInput === 'nik' ? "100%" : "0%"
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    style={{ originX: 0 }}
                  />
                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary-400 to-primary-500 dark:from-primary-500 dark:to-primary-400"
                    initial={{ width: "0%", opacity: 0 }}
                    whileHover={{
                      width: focusedInput !== 'nik' ? "100%" : "0%",
                      opacity: focusedInput !== 'nik' ? 1 : 0
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    style={{ originX: 0 }}
                  />
                </div>

                {/* Validasi NIK */}
                {nikValidation && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-2 text-[11px] text-center ${nik.length < 16
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-green-600 dark:text-green-400'
                      }`}
                  >
                    {nikValidation}
                  </motion.div>
                )}

                {/* Loading indicator saat cek NIK */}
                {checkingNik && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-2 flex items-center justify-center text-[11px] text-primary-600 dark:text-primary-400"
                  >
                    <svg className="animate-spin -ml-1 mr-2 h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Mengecek data santri...
                  </motion.div>
                )}

                {/* Info Button - Centered below messages */}
                <div className="flex justify-center mt-3">
                  <motion.button
                    type="button"
                    onClick={() => setShowInfoModal(true)}
                    className="flex items-center gap-1.5 p-1.5 pr-2.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors rounded-lg border border-amber-100 dark:border-amber-800 shadow-sm"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-wider uppercase">Info</span>
                  </motion.button>
                </div>
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                variants={itemVariants}
                type="submit"
                disabled={loading || checkingNik || nik.length !== 16}
                whileHover={{
                  scale: 1.02,
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                }}
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3 rounded-xl text-sm font-semibold hover:from-primary-700 hover:to-primary-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {loading || checkingNik ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {getButtonText()}
                  </span>
                ) : (
                  getButtonText()
                )}
              </motion.button>

              {/* Versi - ukuran sama dengan tahun ajaran (text-[11px]) */}
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                <svg className="w-3.5 h-3.5 text-blue-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H8a1 1 0 01-1-1V7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7l10 10" />
                </svg>
                <span className="font-mono">Versi {APP_VERSION}</span>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </div >
      {/* Info Modal */}
      < AnimatePresence >
        {showInfoModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInfoModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                  Informasi NIK
                </h3>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="p-4">
                <img
                  src="/images/info/nik.jpg"
                  alt="Info NIK"
                  className="w-full h-auto rounded-lg shadow-sm"
                />
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 text-center">
                  Pastikan yang dimasukkan adalah <b>NIK santri</b> yang mau mendaftar, sesuai dengan Kartu Keluarga (KK).
                </p>
              </div>

              {/* Footer */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Mengerti
                </button>
              </div>
            </motion.div>
          </div>
        )
        }
      </AnimatePresence >

    </div >
  )
}

export default Login
