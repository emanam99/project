import { motion } from 'framer-motion'
import { APP_VERSION } from '../../config/version'
import { getGambarUrl } from '../../config/images'

/**
 * Panel kiri halaman login (desktop md+), gaya sejajar eBeddien.
 */
export default function AuthLeftPanel() {
  return (
    <div className="hidden md:flex flex-1 relative min-h-screen login-panel-left overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-primary-900 via-primary-800 to-primary-900" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_20%_20%,rgba(45,212,191,0.25)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_80%_80%,rgba(20,184,166,0.15)_0%,transparent_50%)]" />
      <div className="absolute inset-0 login-panel-pattern" aria-hidden />
      <div className="absolute top-20 right-20 w-72 h-72 rounded-full bg-primary-500/10 blur-3xl" aria-hidden />
      <div className="absolute bottom-32 left-10 w-96 h-96 rounded-full bg-primary-400/10 blur-3xl" aria-hidden />

      <div className="relative z-10 flex flex-col justify-center items-start px-14 text-white">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md"
        >
          <motion.img
            src={getGambarUrl('/icon/mybeddienlogo.png')}
            alt="myBeddien"
            className="max-w-[200px] w-auto h-20 mb-3 drop-shadow-2xl object-contain"
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 300 }}
          />
          <motion.img
            src={getGambarUrl('/icon/mybeddientext.png')}
            alt="myBeddien"
            className="max-w-[200px] w-auto h-14 mb-2 object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 300 }}
          />
          <p className="text-primary-300/80 text-xs font-mono mb-6">v{APP_VERSION}</p>
          <p className="text-primary-200/95 text-lg font-medium tracking-wide mb-6">
            Biodata, riwayat pembayaran, dan profil santri &amp; toko
          </p>
          <div className="flex items-center gap-2 text-primary-300/80 text-sm">
            <span className="w-8 h-px bg-primary-400/50 rounded-full" />
            <span>Aplikasi santri</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
