import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { profilAPI } from '../services/api'

const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const BULAN_MASEHI = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

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

function formatTanggal(date) {
  const hari = HARI_INDONESIA[date.getDay()] || ''
  const tgl = date.getDate()
  const bulan = BULAN_MASEHI[date.getMonth()] || ''
  const tahun = date.getFullYear()
  return `${hari}, ${tgl} ${bulan} ${tahun}`
}

export default function Beranda() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const displayName = user?.nama || user?.username || 'Santri'
  const initial = (displayName || '?').trim().charAt(0).toUpperCase()

  const [photoUrl, setPhotoUrl] = useState(null)
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const photoUrlRef = useRef(null)
  const [waktuSekarang, setWaktuSekarang] = useState(() => new Date())

  useEffect(() => {
    const tick = () => setWaktuSekarang(new Date())
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="rounded-2xl overflow-hidden bg-linear-to-b from-teal-50/90 via-teal-50/40 to-transparent dark:from-teal-950/60 dark:via-teal-950/25 dark:to-transparent border border-gray-200/60 dark:border-gray-700/50 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5">
          <button
            type="button"
            onClick={() => navigate('/profil')}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-white/80 dark:bg-gray-700/50 flex items-center justify-center text-2xl sm:text-3xl font-semibold text-teal-600 dark:text-teal-400 ring-2 ring-white/80 dark:ring-gray-600/80 shadow-lg shrink-0 transition-all hover:ring-teal-300/60 focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Buka profil"
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="w-full h-full object-cover"
                style={{ opacity: photoLoaded ? 1 : 0 }}
                onLoad={() => setPhotoLoaded(true)}
              />
            ) : (
              <span>{initial}</span>
            )}
          </button>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider">
              Selamat {greeting}
            </p>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight mt-1">
              {displayName}
            </h1>
            <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              <p>{formatTanggal(waktuSekarang)}</p>
              <p className="font-semibold text-teal-700 dark:text-teal-300 tabular-nums mt-0.5">
                {formatJamDetik(waktuSekarang)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
