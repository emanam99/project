import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useTheme } from '../../contexts/ThemeContext'
import { profilAPI } from '../../services/api'
import { useActiveAccessDisplayName } from '../../hooks/useActiveAccessDisplayName'
import { ACCESS_MODE } from '../../config/accessMode'
import { APP_VERSION } from '../../config/version'
import { getGambarUrl } from '../../config/images'
import { useSantriBiodata } from '../../hooks/useSantriCachedResources'
import { isSantriGuruTugas } from '../../utils/santriGuruTugas'
import {
  BULAN_HIJRIYAH,
  ensureHijriTodayFetched,
  formatYmdKeNamaBulan,
  getBootPenanggalanPair,
} from '../../utils/hijriPenanggalan'
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt'

/** Logo KOMMPAS ringkas — sama dengan halaman KOMMPAS. */
const KOMMPAS_LOGO_URL = getGambarUrl('/kop/kommpas192.png')

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
  const { user, activeAccess } = useAuthStore()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { displayName, initial } = useActiveAccessDisplayName()
  const { canInstall, promptInstall } = usePwaInstallPrompt()
  const { biodata } = useSantriBiodata()

  const showKompasBanner =
    activeAccess === ACCESS_MODE.pjgt ||
    (activeAccess === ACCESS_MODE.santri && isSantriGuruTugas(biodata))
  const kompasPath = activeAccess === ACCESS_MODE.pjgt ? '/pjgt/kompas' : '/santri/kompas'

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
    const fotoPath = user?.foto_profil
    if (!fotoPath) {
      setPhotoUrl(null)
      return undefined
    }
    let cancelled = false
    profilAPI.getProfilFotoBlob(fotoPath).then((blob) => {
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
      setPhotoUrl(null)
      setPhotoLoaded(false)
    }
  }, [user?.id, user?.foto_profil])

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
            className="rounded-none sm:rounded-2xl overflow-hidden bg-linear-to-b from-primary-50/90 via-primary-50/40 to-transparent dark:from-primary-900/55 dark:via-primary-900/22 dark:to-transparent sm:from-primary-50/90 sm:via-white/95 sm:to-primary-50/70 sm:dark:from-primary-900/40 sm:dark:via-gray-800/95 sm:dark:to-primary-900/28 border-0 shadow-none sm:border sm:border-gray-200/60 sm:dark:border-gray-700/50 sm:shadow-md flex flex-col sm:flex-row sm:items-center pt-8 sm:pt-7 pb-11 sm:pb-7 px-6 sm:p-7 gap-7 sm:gap-5"
          >
            <motion.div
              variants={heroStaggerItem}
              className="flex flex-col sm:flex-row items-center sm:items-center gap-6 sm:gap-5 w-full sm:w-auto sm:flex-1 sm:min-w-0"
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
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white tracking-tight mt-1.5 sm:mt-1">
                  {displayName}
                </h1>
                <div className="mt-5 sm:mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:gap-4 text-left max-w-sm sm:max-w-md mx-auto sm:mx-0 w-full">
                  <div className="space-y-1.5 sm:space-y-1">
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Tanggal
                    </p>
                    <p className="text-[11px] leading-snug text-gray-800 dark:text-gray-100">
                      {hijriTampilBeranda}
                      <span className="text-[9px] text-primary-500/90 dark:text-primary-400/90 ml-0.5">H</span>
                    </p>
                    <p className="text-[11px] leading-snug text-gray-700 dark:text-gray-200">
                      {formatTanggalMasehi(waktuSekarang)}
                      <span className="text-[9px] text-primary-500/90 dark:text-primary-400/90 ml-0.5">M</span>
                    </p>
                  </div>
                  <div className="space-y-1.5 sm:space-y-1">
                    <p className="text-[10px] font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                      Hari &amp; jam
                    </p>
                    <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-snug">
                      {getHariIndonesia(waktuSekarang)}
                    </p>
                    <p className="text-[11px] font-semibold text-primary-700 dark:text-primary-300 tabular-nums leading-snug">
                      {formatJamDetik(waktuSekarang)}
                    </p>
                  </div>
                </div>
                <div className="mt-5 sm:mt-3 flex flex-wrap items-center justify-between gap-3 max-w-sm sm:max-w-md mx-auto sm:mx-0 w-full pt-3 sm:pt-1 border-t border-gray-200/70 dark:border-gray-600/50">
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
                  {canInstall && (
                    <button
                      type="button"
                      onClick={() => void promptInstall()}
                      className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-sm transition-colors"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v10m0 0l-4-4m4 4l4-4M5 19h14" />
                      </svg>
                      Install aplikasi
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>

        {showKompasBanner && (
          <motion.div
            variants={heroCardVariants}
            initial="hidden"
            animate="visible"
            className="mx-4 sm:mx-0 rounded-2xl border border-primary-200/80 dark:border-primary-700/50 bg-linear-to-br from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-900 text-white shadow-md overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 py-4 sm:px-5 sm:py-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-white/40"
                  aria-hidden
                >
                  <img
                    src={KOMMPAS_LOGO_URL}
                    alt=""
                    className="h-full w-full object-contain"
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-tight">KOMMPAS</p>
                  <p className="mt-0.5 text-xs text-white/85 leading-snug">
                    Lihat lomba dan kelola pendaftaran peserta madrasah.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(kompasPath)}
                className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-50"
              >
                Buka KOMMPAS
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
