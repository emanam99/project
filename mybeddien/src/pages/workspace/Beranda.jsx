import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useTheme } from '../../contexts/ThemeContext'
import { profilAPI } from '../../services/api'
import { APP_VERSION } from '../../config/version'
import {
  BULAN_HIJRIYAH,
  ensureHijriTodayFetched,
  formatYmdKeNamaBulan,
  getBootPenanggalanPair,
} from '../../utils/hijriPenanggalan'

const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN_MASEHI = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

function getHariIndonesia(date = new Date()) {
  return HARI_INDONESIA[date.getDay()] || ''
}

const pageVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
}

const heroCardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

const heroStaggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

const heroStaggerItem = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] } },
}

const heroEasing = [0.25, 0.46, 0.45, 0.94]

function getTimeGreeting() {
  const h = new Date().getHours()
  if (h >= 4 && h < 11) return 'Pagi'
  if (h >= 11 && h < 15) return 'Siang'
  if (h >= 15 && h < 18) return 'Sore'
  return 'Malam'
}

function formatJamDetik(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/** Tanggal Masehi panjang tanpa nama hari, mis. "18 April 2026". */
function formatTanggalMasehi(date) {
  const tgl = date.getDate()
  const bulan = BULAN_MASEHI[date.getMonth()] || ''
  const tahun = date.getFullYear()
  return `${tgl} ${bulan} ${tahun}`
}

export default function Beranda() {
  const { user } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const displayName = user?.nama || user?.username || 'Santri'
  const initial = (displayName || '?').trim().charAt(0).toUpperCase()

  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const photoUrlRef = useRef(null)
  const [waktuSekarang, setWaktuSekarang] = useState(() => new Date())
  const [todayTanggal, setTodayTanggal] = useState(() => {
    const b = getBootPenanggalanPair()
    return { masehi: b.masehi, hijriyah: b.hijriyah || null }
  })

  useEffect(() => {
    const tick = () => setWaktuSekarang(new Date())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    ensureHijriTodayFetched().then((row) => {
      if (!cancelled && row?.masehi) {
        setTodayTanggal({ masehi: row.masehi, hijriyah: row.hijriyah || null })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    setPhotoLoaded(false)
    let cancelled = false
    profilAPI.getProfilFotoBlob().then((blob) => {
      if (cancelled) return
      if (blob instanceof Blob) {
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
        const url = URL.createObjectURL(blob)
        photoUrlRef.current = url
        setPhotoUrl(url)
      } else {
        setPhotoUrl(null)
      }
    }).catch(() => {
      if (!cancelled) setPhotoUrl(null)
    })
    return () => {
      cancelled = true
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current)
        photoUrlRef.current = null
      }
    }
  }, [user?.id])

  const greeting = getTimeGreeting()

  const hijriTampilBeranda =
    formatYmdKeNamaBulan(todayTanggal.hijriyah, BULAN_HIJRIYAH) ??
    (todayTanggal.masehi ? <span className="text-gray-400 dark:text-gray-500">⋯</span> : '–')

  return (
    <motion.div
      className="min-h-0"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="max-w-2xl mx-auto px-0 sm:px-4 pt-0 sm:pt-4 pb-8 sm:pb-10 space-y-6">
        <motion.div variants={heroCardVariants} initial="hidden" animate="visible" className="space-y-0">
          <motion.div
            variants={heroStaggerContainer}
            initial="hidden"
            animate="visible"
            className="rounded-none sm:rounded-2xl overflow-hidden bg-linear-to-b from-primary-50/90 via-primary-50/40 to-transparent dark:from-primary-900/55 dark:via-primary-900/22 dark:to-transparent sm:from-primary-50/90 sm:via-white/95 sm:to-primary-50/70 sm:dark:from-primary-900/40 sm:dark:via-gray-800/95 sm:dark:to-primary-900/28 border-0 shadow-none sm:border sm:border-gray-200/60 sm:dark:border-gray-700/50 sm:shadow-md flex flex-col sm:flex-row sm:items-center pt-8 sm:pt-7 pb-10 sm:pb-7 px-5 sm:p-7 gap-6 sm:gap-5"
          >
            <motion.div
              variants={heroStaggerItem}
              className="flex flex-col sm:flex-row items-center sm:items-center gap-5 w-full sm:w-auto sm:flex-1 sm:min-w-0"
            >
              <motion.button
                type="button"
                variants={heroStaggerItem}
                onClick={() => navigate('/profil')}
                className="w-28 h-28 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-white/90 dark:bg-gray-700/55 flex items-center justify-center text-2xl sm:text-xl font-semibold text-primary-600 dark:text-primary-400 ring-[3px] ring-white dark:ring-gray-600 shadow-lg shrink-0 cursor-pointer transition-all duration-200 hover:ring-primary-300/70 dark:hover:ring-primary-600/50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-primary-50/80 dark:focus:ring-offset-gray-900"
                aria-label="Buka profil"
              >
                {photoUrl ? (
                  <motion.img
                    src={photoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: photoLoaded ? 1 : 0 }}
                    transition={{ duration: 0.45, ease: heroEasing }}
                    onLoad={() => setPhotoLoaded(true)}
                  />
                ) : (
                  <span>{initial}</span>
                )}
              </motion.button>
              <motion.div variants={heroStaggerItem} className="flex-1 min-w-0 text-center sm:text-left">
                <p className="text-[11px] sm:text-xs font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                  Selamat {greeting}
                </p>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white tracking-tight mt-1">
                  {displayName}
                </h1>
                <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-3 sm:gap-4 text-left max-w-md mx-auto sm:mx-0 w-full">
                  <div>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Tanggal
                    </p>
                    <p className="text-[11px] leading-tight text-gray-800 dark:text-gray-100">
                      {hijriTampilBeranda}
                      <span className="text-[9px] text-primary-500/90 dark:text-primary-400/90 ml-0.5">H</span>
                    </p>
                    <p className="text-[11px] leading-tight text-gray-700 dark:text-gray-200 mt-0.5">
                      {formatTanggalMasehi(waktuSekarang)}
                      <span className="text-[9px] text-primary-500/90 dark:text-primary-400/90 ml-0.5">M</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-1">
                      Hari &amp; jam
                    </p>
                    <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-tight">
                      {getHariIndonesia(waktuSekarang)}
                    </p>
                    <p className="text-[11px] font-semibold text-primary-700 dark:text-primary-300 tabular-nums leading-tight mt-0.5">
                      {formatJamDetik(waktuSekarang)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 max-w-md mx-auto sm:mx-0 w-full pt-1 border-t border-gray-200/70 dark:border-gray-600/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg
                      className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                      />
                    </svg>
                    <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Tema
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={theme === 'dark'}
                        onChange={toggleTheme}
                        className="sr-only"
                        aria-label={theme === 'dark' ? 'Alihkan ke tema terang' : 'Alihkan ke tema gelap'}
                      />
                      <span
                        className={`w-10 h-6 flex items-center rounded-full p-1 duration-300 ${
                          theme === 'dark' ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}
                      >
                        <motion.span
                          animate={{ x: theme === 'dark' ? 16 : 0 }}
                          className="bg-white w-4 h-4 rounded-full shadow-md transform duration-300"
                        />
                      </span>
                    </label>
                  </div>
                  <div className="text-right min-w-0">
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5">
                      Versi
                    </p>
                    <p className="font-mono text-sm text-gray-800 dark:text-gray-100 tabular-nums">{APP_VERSION}</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35, ease: heroEasing }}
          className="text-center sm:text-left text-xs text-gray-500 dark:text-gray-400 px-5 sm:px-0"
        >
          Gunakan menu samping (desktop) atau navigasi bawah (ponsel) untuk grup Workspace, Santri, Toko, dan profil.
        </motion.p>
      </div>
    </motion.div>
  )
}
