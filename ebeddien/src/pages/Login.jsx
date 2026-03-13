import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { authAPI } from '../services/api'
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
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [focusedInput, setFocusedInput] = useState(null)
  
  const { setAuth } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const deviceInfo = authAPI.getDeviceInfo()
      const response = await authAPI.loginV2(username, password, null, deviceInfo)
      
      if (response.success) {
        // Simpan device_id agar login berikutnya dari perangkat yang sama pakai id yang sama
        if (response.data?.device_id) {
          try { localStorage.setItem('uwaba_device_id', response.data.device_id) } catch (_) {}
        }
        // Validasi akses aplikasi
        const user = response.data.user
        const allowedApps = user?.allowed_apps || []
        
        if (!allowedApps.includes('uwaba')) {
          setError('Akses ditolak. Role Anda tidak memiliki izin untuk mengakses aplikasi eBeddien.')
          return
        }
        
        setAuth(response.data.token, user)
        navigate(response.data.redirect_url || '/beranda')
      } else {
        setError(response.message || 'Login gagal')
      }
    } catch (err) {
      console.error('Login error:', err)
      
      // Handle network errors (termasuk saat CORS memblokir atau server tidak terjangkau)
      if (!err.response) {
        const isCorsOrNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
        setError(
          isCorsOrNetwork
            ? 'Tidak dapat terhubung ke server API. Cek: (1) Backend sudah jalan, (2) CORS di server mengizinkan origin ini, (3) Jaringan/URL API benar.'
            : 'Tidak dapat terhubung ke server. Pastikan backend PHP sudah berjalan (XAMPP/local) atau URL API di .env benar.'
        )
      } else if (err.response.status === 401) {
        const errorMsg = err.response?.data?.message
        if (errorMsg && errorMsg.includes('Terlalu banyak percobaan')) {
          setError(errorMsg)
        } else {
          setError('Username atau password yang Anda masukkan salah. Silakan coba lagi.')
        }
      } else if (err.response.status === 403) {
        setError('Akses ditolak. Pastikan akun Anda memiliki izin untuk mengakses sistem ini.')
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
          {/* Overlay dengan gradient untuk readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary-900/80 via-primary-800/70 to-primary-700/60"></div>
        </div>
        
        {/* Content di sisi kiri */}
        <div className="relative z-10 flex flex-col justify-center items-start px-12 text-white">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-md"
          >
            <motion.img
              src={getGambarUrl('/icon/ebeddienlogoputih.png')}
              alt="eBeddien"
              className="max-w-xs w-auto h-24 mb-6 drop-shadow-2xl object-contain"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
            />
            <motion.img
              src={getGambarUrl('/icon/ebeddientextputih.png')}
              alt="eBeddientext"
              className="max-w-xs w-auto h-24 mb-6 drop-shadow-2xl object-contain"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
            />
            <p className="text-primary-200 text-lg drop-shadow-sm">
              Kelola data pesantren dengan mudah dan efisien
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
          {/* Pattern overlay */}
          <div 
            className="absolute inset-0 opacity-5 dark:opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          ></div>
          
          {/* Dekorasi geometris */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary-200/20 dark:bg-primary-800/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-300/20 dark:bg-primary-700/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary-400/10 dark:bg-primary-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
          
          {/* Garis dekoratif */}
          <div className="absolute top-20 right-10 w-px h-32 bg-gradient-to-b from-primary-300/50 to-transparent dark:from-primary-600/50"></div>
          <div className="absolute bottom-20 left-10 w-32 h-px bg-gradient-to-r from-primary-300/50 to-transparent dark:from-primary-600/50"></div>
          <div className="absolute top-1/3 right-1/4 w-24 h-24 border-2 border-primary-300/30 dark:border-primary-600/30 rounded-full"></div>
          <div className="absolute bottom-1/4 left-1/3 w-16 h-16 border-2 border-primary-400/30 dark:border-primary-500/30 rounded-full"></div>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md relative z-10"
        >
          <motion.div
            variants={itemVariants}
            className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 md:p-10 border border-white/20"
          >
            {/* Logo untuk mobile */}
            <div className="md:hidden text-center mb-6">
                {theme === 'dark' ? (
                  <>
                    <motion.img
                      src={getGambarUrl('/icon/ebeddienlogoputih.png')}
                      alt="eBeddien"
                      className="max-w-[120px] w-auto h-16 mx-auto mb-1 object-contain" // mb-1 agar jarak lebih dekat
                      whileHover={{ scale: 1.05 }}
                    />
                    <motion.img
                      src={getGambarUrl('/icon/ebeddientextputih.png')}
                      alt="eBeddientext"
                      className="max-w-[120px] w-auto h-16 mx-auto mb-3 object-contain"
                      whileHover={{ scale: 1.05 }}
                    />
                  </>
                ) : (
                  <>
                    <motion.img
                      src={getGambarUrl('/icon/ebeddienlogo.png')}
                      alt="eBeddien"
                      className="max-w-[120px] w-auto h-16 mx-auto mb-1 object-contain" // mb-1 agar jarak lebih dekat
                      whileHover={{ scale: 1.05 }}
                    />
                    <motion.img
                      src={getGambarUrl('/icon/ebeddientext.png')}
                      alt="eBeddientext"
                      className="max-w-[120px] w-auto h-16 mx-auto mb-3 object-contain"
                      whileHover={{ scale: 1.05 }}
                    />
                  </>
                )}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H8a1 1 0 01-1-1V7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7l10 10" />
                </svg>
                <span className="font-mono">Versi {APP_VERSION}</span>
              </div>
            </div>

            {/* Title untuk desktop/tablet */}
            <div className="hidden md:block text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                Selamat Datang
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                Masuk ke akun Anda untuk melanjutkan
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H8a1 1 0 01-1-1V7z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7l10 10" />
                </svg>
                <span className="font-mono">Versi {APP_VERSION}</span>
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
                      scale: focusedInput === 'username' ? 1.2 : 1,
                      rotate: focusedInput === 'username' ? [0, -10, 10, -10, 0] : 0,
                    }}
                    transition={{
                      scale: { duration: 0.2 },
                      rotate: { duration: 0.5, ease: "easeInOut" }
                    }}
                  >
                    <svg 
                      className={`w-5 h-5 ${focusedInput === 'username' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'} transition-colors duration-300`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </motion.div>
                  <motion.input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedInput('username')}
                    onBlur={() => setFocusedInput(null)}
                    className="flex-1 ml-3 pr-0 py-3 bg-transparent border-none border-b-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none transition-all duration-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 group-hover:border-primary-400 dark:group-hover:border-primary-500"
                    placeholder="Username"
                    required
                    autoFocus
                    autoComplete="username"
                    whileFocus={{ scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  />
                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500"
                    initial={{ width: "0%" }}
                    animate={{ 
                      width: focusedInput === 'username' ? "100%" : "0%"
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    style={{ originX: 0 }}
                  />
                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary-400 to-primary-500 dark:from-primary-500 dark:to-primary-400"
                    initial={{ width: "0%", opacity: 0 }}
                    whileHover={{ 
                      width: focusedInput !== 'username' ? "100%" : "0%",
                      opacity: focusedInput !== 'username' ? 1 : 0
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    style={{ originX: 0 }}
                  />
                </div>
              </motion.div>

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
                      scale: focusedInput === 'password' ? 1.2 : 1,
                      rotate: focusedInput === 'password' ? [0, -10, 10, -10, 0] : 0,
                    }}
                    transition={{
                      scale: { duration: 0.2 },
                      rotate: { duration: 0.5, ease: "easeInOut" }
                    }}
                  >
                    <svg 
                      className={`w-5 h-5 ${focusedInput === 'password' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'} transition-colors duration-300`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </motion.div>
                  <motion.input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput('password')}
                    onBlur={() => setFocusedInput(null)}
                    className="flex-1 ml-3 pr-0 py-3 bg-transparent border-none border-b-2 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 focus:outline-none transition-all duration-300 placeholder:text-gray-400 dark:placeholder:text-gray-500 group-hover:border-primary-400 dark:group-hover:border-primary-500"
                    placeholder="Password"
                    required
                    whileFocus={{ scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  />
                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500"
                    initial={{ width: "0%" }}
                    animate={{ 
                      width: focusedInput === 'password' ? "100%" : "0%"
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    style={{ originX: 0 }}
                  />
                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary-400 to-primary-500 dark:from-primary-500 dark:to-primary-400"
                    initial={{ width: "0%", opacity: 0 }}
                    whileHover={{ 
                      width: focusedInput !== 'password' ? "100%" : "0%",
                      opacity: focusedInput !== 'password' ? 1 : 0
                    }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    style={{ originX: 0 }}
                  />
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
                disabled={loading}
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
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white py-3.5 rounded-xl font-semibold hover:from-primary-700 hover:to-primary-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Masuk'
                )}
              </motion.button>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                Jika belum punya akun,{' '}
                <Link to="/daftar" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                  Daftar
                </Link>
                {' '}di sini
              </p>
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-1">
                <Link to="/lupa-password" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                  Lupa password?
                </Link>
              </p>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

export default Login

