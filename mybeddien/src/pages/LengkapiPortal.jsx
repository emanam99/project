import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { getGambarUrl } from '../config/images'
import { getEbeddienAppUrl } from '../config/ebeddienAppUrl'

// Halaman untuk akun yang belum punya menu portal santri / toko / PJGT / wali.
// Pengurus eBeddien: sambungkan santri lewat aplikasi staff (eBeddien → Mybeddian).
export default function LengkapiPortal() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleSambungkanSantri = () => {
    const base = getEbeddienAppUrl()
    if (!base) {
      window.alert(
        'URL aplikasi eBeddien belum dikonfigurasi. Tambahkan VITE_EBEDDien_APP_URL di file .env (build myBeddien), lalu deploy ulang.'
      )
      return
    }
    const url = `${base.replace(/\/$/, '')}/mybeddian`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-linear-to-b from-primary-50/90 via-white to-primary-50/40 dark:from-gray-900 dark:via-slate-900 dark:to-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img
            src={getGambarUrl('/icon/mybeddienlogo.png')}
            alt=""
            className="h-14 w-auto mx-auto mb-4 object-contain"
          />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Lengkapi akses myBeddien
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 text-left leading-relaxed">
            Akun Anda belum memiliki menu Aplikasi santri, toko, PJGT, atau wali di myBeddien. Hal ini umum bagi pengurus
            yang masuk dengan akun eBeddien namun data santri (atau peran aplikasi lain) belum ditautkan ke akun ini.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 text-left leading-relaxed">
            Untuk <strong className="font-medium text-gray-800 dark:text-gray-200">menautkan santri</strong>, buka{' '}
            <strong className="font-medium">eBeddien</strong> (aplikasi staff), menu{' '}
            <strong className="font-medium">Mybeddian</strong>, lalu lakukan penautan dari situ. Anda akan diminta login
            staff eBeddien jika belum masuk di tab tersebut.
          </p>
          {(user?.username || user?.nama) ? (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-4 text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/50 px-3 py-2">
              Sedang masuk myBeddien sebagai:{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {user.nama || user.username || '—'}
              </span>
              {user.username ? (
                <span className="text-gray-500"> ({user.username})</span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleSambungkanSantri}
            className="w-full py-3.5 rounded-xl font-semibold text-white bg-linear-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-md transition-colors"
          >
            Sambungkan ke akun santri
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 border-2 border-gray-300 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90 hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors"
          >
            Logout
          </button>
        </div>
      </motion.div>
    </div>
  )
}
