import { useEffect, useMemo, useRef, useState } from 'react'
import { kalenderAPI } from '../../services/api'
import { useAbsenLokasi } from '../../contexts/AbsenLokasiContext'
import {
  ISTIWA_DEFAULT_LAT,
  ISTIWA_DEFAULT_LNG,
  formatAlamatMarquee,
  formatHmsJakarta,
  formatWibKeIstSelisih,
  istiwaOffsetMs,
  istiwaSolarOffsetMs
} from './utils/jamIstiwa'

const FETCH_ALAMAT_MOVE_THRESHOLD_M = 42

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function KalenderJamIstiwaBar() {
  const { gpsEnabled, setGpsEnabled, coords, geoError, geoSupported } = useAbsenLokasi()
  const [now, setNow] = useState(() => new Date())
  const [defaultCoords, setDefaultCoords] = useState({
    lat: ISTIWA_DEFAULT_LAT,
    lng: ISTIWA_DEFAULT_LNG
  })
  const [alamatText, setAlamatText] = useState('')
  const lastResolvedPosRef = useRef(null)
  const seqRef = useRef(0)

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
        /* tetap Bondowoso */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const useGps = gpsEnabled && coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
  const effLat = useGps ? coords.lat : defaultCoords.lat
  const effLng = useGps ? coords.lng : defaultCoords.lng
  const effAcc = useGps && Number.isFinite(coords.accuracy) ? coords.accuracy : 0

  const solarOffsetMs = useMemo(() => istiwaSolarOffsetMs(now, effLat, effLng), [now, effLat, effLng])
  const offsetMs = useMemo(() => istiwaOffsetMs(now, effLat, effLng), [now, effLat, effLng])
  const wibText = formatHmsJakarta(now)
  const istiwaText = formatHmsJakarta(new Date(now.getTime() + offsetMs))
  const selisihText = formatWibKeIstSelisih(solarOffsetMs)

  const showGpsBtn = !gpsEnabled || (!!geoError && !coords)

  useEffect(() => {
    if (!Number.isFinite(effLat) || !Number.isFinite(effLng)) return undefined
    const prev = lastResolvedPosRef.current
    if (
      prev &&
      haversineMeters(prev.lat, prev.lng, effLat, effLng) < FETCH_ALAMAT_MOVE_THRESHOLD_M
    ) {
      return undefined
    }
    const seq = ++seqRef.current
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await kalenderAPI.get({
          action: 'istiwa-alamat',
          lat: String(effLat),
          lng: String(effLng),
          accuracy: effAcc > 0 ? String(effAcc) : undefined
        })
        if (cancelled || seq !== seqRef.current) return
        const text = formatAlamatMarquee(res?.data)
        if (text) {
          setAlamatText(text)
          lastResolvedPosRef.current = { lat: effLat, lng: effLng }
        }
      } catch {
        if (cancelled || seq !== seqRef.current) return
      }
    }, 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [effLat, effLng, effAcc])

  return (
    <div className="kalender-istiwa-bar flex-shrink-0">
      <div className="kalender-istiwa-bar__clocks">
        <div className="kalender-istiwa-bar__clock kalender-istiwa-bar__clock--wib">
          <span className="kalender-istiwa-bar__time" aria-live="off">
            {wibText}
          </span>
          <span className="kalender-istiwa-bar__label">WIB</span>
        </div>
        <p className="kalender-istiwa-bar__selisih" title="Selisih menit Istiwa’ terhadap WIB">
          {selisihText}
        </p>
        <div className="kalender-istiwa-bar__clock kalender-istiwa-bar__clock--ist">
          <span className="kalender-istiwa-bar__time" aria-live="off">
            {istiwaText}
          </span>
          <span className="kalender-istiwa-bar__label">Istiwa’</span>
        </div>
      </div>
      {showGpsBtn && (
        <button
          type="button"
          className="kalender-istiwa-bar__gps"
          onClick={() => setGpsEnabled(true)}
          disabled={!geoSupported}
        >
          Hidupkan GPS
        </button>
      )}
      {gpsEnabled && geoError && !coords && (
        <p className="kalender-istiwa-bar__hint">{geoError}</p>
      )}
      {gpsEnabled && !coords && !geoError && geoSupported && (
        <p className="kalender-istiwa-bar__hint">Mencari posisi GPS…</p>
      )}
      <div className="kalender-istiwa-marquee" aria-label={alamatText || 'Alamat'}>
        {alamatText ? (
          <div className="kalender-istiwa-marquee__track">
            <span className="kalender-istiwa-marquee__item">{alamatText}</span>
            <span className="kalender-istiwa-marquee__item" aria-hidden>
              {alamatText}
            </span>
          </div>
        ) : (
          <span className="kalender-istiwa-marquee__placeholder">Memuat alamat…</span>
        )}
      </div>
    </div>
  )
}
