import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { kalenderAPI } from '../../services/api'
import { useAbsenLokasi } from '../../contexts/AbsenLokasiContext'
import { getIcon } from '../../config/menuIcons'
import { ISTIWA_DEFAULT_LAT, ISTIWA_DEFAULT_LNG } from './utils/jamIstiwa'
import { loadHourCycle, saveHourCycle, loadJadwalIkhtiyath, saveJadwalIkhtiyath } from './utils/kalenderStorage'
import {
  IKHTIYATH_OPTIONS,
  PRAYER_SLOTS,
  THULU_IKHTIYATH_OPTIONS,
  buildTodaySchedule,
  findNextPrayer,
  formatJakartaDateLong,
  formatPrayerClock,
  formatRemainHms,
  normalizeIkhtiyath,
} from './utils/jadwalSholat'
import './Kalender.css'

function formatIkhtiyathOption(mins) {
  const n = Number(mins)
  return { value: n, label: `${n} menit` }
}

export default function JadwalSholat() {
  const { gpsEnabled, setGpsEnabled, coords, geoError, geoSupported } = useAbsenLokasi()
  const [now, setNow] = useState(() => new Date())
  const [defaultCoords, setDefaultCoords] = useState({
    lat: ISTIWA_DEFAULT_LAT,
    lng: ISTIWA_DEFAULT_LNG,
  })
  const [hourCycle, setHourCycle] = useState(loadHourCycle)
  const [ikhtiyath, setIkhtiyath] = useState(() => normalizeIkhtiyath(loadJadwalIkhtiyath()))
  const [showPengaturan, setShowPengaturan] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await kalenderAPI.get({ action: 'istiwa' })
        const lat = Number(data?.latitude)
        const lng = Number(data?.longitude)
        if (cancelled || !Number.isFinite(lat) || !Number.isFinite(lng)) return
        setDefaultCoords({ lat, lng })
      } catch {
        /* tetap default pondok */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveHourCycle(hourCycle)
  }, [hourCycle])

  useEffect(() => {
    saveJadwalIkhtiyath(ikhtiyath)
  }, [ikhtiyath])

  const useGps = gpsEnabled && coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
  const lat = useGps ? coords.lat : defaultCoords.lat
  const lng = useGps ? coords.lng : defaultCoords.lng
  const showGpsBtn = !gpsEnabled || (!!geoError && !coords)

  const schedule = useMemo(() => buildTodaySchedule(lat, lng, now, ikhtiyath), [lat, lng, now, ikhtiyath])
  const next = useMemo(() => findNextPrayer(lat, lng, now, ikhtiyath), [lat, lng, now, ikhtiyath])
  const remainMs = next?.at instanceof Date ? next.at.getTime() - now.getTime() : 0

  const setSlotIkhtiyath = (key, value) => {
    setIkhtiyath((prev) => normalizeIkhtiyath({ ...prev, [key]: Number(value) }))
  }

  return (
    <div className="kalender-page h-full min-h-0 flex flex-col overflow-hidden">
      <div className="kalender-page__content flex-1 min-h-0 flex flex-col overflow-y-auto">
        <div className="jadwal-sholat">
          <div className="jadwal-sholat__head">
            <div className="jadwal-sholat__head-text">
              <p className="jadwal-sholat__date">{formatJakartaDateLong(now)}</p>
              <p className="jadwal-sholat__source">
                {useGps ? 'Dari GPS Anda' : 'Koordinat default pondok'} · WIB
              </p>
            </div>
            <button
              type="button"
              className={`jadwal-sholat__settings-btn${showPengaturan ? ' is-open' : ''}`}
              onClick={() => setShowPengaturan((v) => !v)}
              aria-expanded={showPengaturan}
              aria-label="Pengaturan waktu ikhtiyath"
              title="Waktu ikhtiyath"
            >
              <motion.span
                className="inline-flex"
                animate={{ rotate: showPengaturan ? 90 : 0 }}
                transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {getIcon('cog', 'w-5 h-5')}
              </motion.span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showPengaturan && (
              <motion.div
                key="ikhtiyath-panel"
                className="jadwal-sholat__ikhtiyath-anim"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              >
                <section className="jadwal-sholat__ikhtiyath" aria-label="Waktu ikhtiyath">
              <div className="jadwal-sholat__ikhtiyath-title-row">
                <h2 className="jadwal-sholat__ikhtiyath-title">Waktu ikhtiyath</h2>
              </div>
              <ul className="jadwal-sholat__ikhtiyath-list">
                {PRAYER_SLOTS.map((slot) => {
                  const options = slot.key === 'thulu' ? THULU_IKHTIYATH_OPTIONS : IKHTIYATH_OPTIONS
                  return (
                    <li key={slot.key} className="jadwal-sholat__ikhtiyath-row">
                      <label className="jadwal-sholat__ikhtiyath-label" htmlFor={`ikhtiyath-${slot.key}`}>
                        {slot.label}
                      </label>
                      <select
                        id={`ikhtiyath-${slot.key}`}
                        className="jadwal-sholat__ikhtiyath-select"
                        value={ikhtiyath[slot.key]}
                        onChange={(e) => setSlotIkhtiyath(slot.key, e.target.value)}
                      >
                        {options.map((m) => {
                          const opt = formatIkhtiyathOption(m)
                          return (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          )
                        })}
                      </select>
                    </li>
                  )
                })}
              </ul>
              <p className="jadwal-sholat__ikhtiyath-note">
                Ikhtiyath adalah waktu yang akan ditambahkan pada hasil perhitungan waktu sholat
                sebenarnya untuk mengantisipasi jam yang kurang akurat serta dapat menjangkau
                wilayah yang lebih luas.{' '}
                <strong>3 menit (direkomendasikan)</strong>
              </p>
            </section>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="jadwal-sholat__toolbar">
            <button
              type="button"
              className="kalender-istiwa-bar__hour-cycle"
              onClick={() => setHourCycle((v) => (v === 12 ? 24 : 12))}
              aria-pressed={hourCycle === 24}
              title={hourCycle === 12 ? 'Format 12 jam — klik untuk 24 jam' : 'Format 24 jam — klik untuk 12 jam'}
            >
              {hourCycle}
            </button>
            {showGpsBtn && (
              <button
                type="button"
                className="kalender-istiwa-bar__gps jadwal-sholat__gps"
                onClick={() => setGpsEnabled(true)}
                disabled={!geoSupported}
              >
                Akses lokasi
              </button>
            )}
          </div>
          {gpsEnabled && geoError && !coords && (
            <p className="kalender-istiwa-bar__hint">{geoError}</p>
          )}
          {gpsEnabled && !coords && !geoError && geoSupported && (
            <p className="kalender-istiwa-bar__hint">Mencari posisi GPS…</p>
          )}

          {next && (
            <div className="jadwal-sholat__next" aria-live="polite">
              <p className="jadwal-sholat__next-label">Berikutnya</p>
              <p className="jadwal-sholat__next-name">{next.label}</p>
              <p className="jadwal-sholat__next-time">{formatPrayerClock(next.at, hourCycle)}</p>
              <p className="jadwal-sholat__countdown" title="Sisa jam:menit:detik">
                {formatRemainHms(remainMs)}
              </p>
            </div>
          )}

          <ul className="jadwal-sholat__list">
            {schedule.map((row) => {
              const isNext = next && row.key === next.key && row.at.getTime() === next.at.getTime()
              const isPast = row.at instanceof Date && row.at.getTime() <= now.getTime()
              return (
                <li
                  key={row.key}
                  className={`jadwal-sholat__row${isNext ? ' jadwal-sholat__row--next' : ''}${isPast ? ' jadwal-sholat__row--past' : ''}`}
                >
                  <span className="jadwal-sholat__row-label">{row.label}</span>
                  <span className="jadwal-sholat__row-time">{formatPrayerClock(row.at, hourCycle)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
