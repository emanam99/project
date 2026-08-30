import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react'
import {
  formatGeolocationError,
  getGeolocationPosition,
  GEOLOCATION_WATCH_OPTIONS,
  positionFromGeolocation,
} from '../utils/geolocation'

const STORAGE_KEY = 'ebeddien_absen_gps_aktif'

const AbsenLokasiContext = createContext(null)

export function AbsenLokasiProvider({ children }) {
  const [gpsEnabled, setGpsEnabledState] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
  )
  const [coords, setCoords] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const [coordsRefreshing, setCoordsRefreshing] = useState(false)
  const watchRef = useRef(null)
  const coordsRef = useRef(null)

  useEffect(() => {
    coordsRef.current = coords
  }, [coords])

  const setGpsEnabled = useCallback((on) => {
    setGpsEnabledState(!!on)
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (!on) {
      if (watchRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
      setCoords(null)
      setGeoError(null)
    }
  }, [])

  useEffect(() => {
    if (!gpsEnabled) {
      return undefined
    }
    if (!navigator.geolocation) {
      setGeoError('Peramban tidak mendukung geolokasi')
      return undefined
    }

    let cancelled = false
    setGeoError(null)

    // Posisi awal: high accuracy → fallback jaringan (HP sering timeout hanya pakai watchPosition).
    getGeolocationPosition()
      .then((pos) => {
        if (cancelled) return
        setCoords(positionFromGeolocation(pos))
        setGeoError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setGeoError(formatGeolocationError(err))
      })

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return
        setCoords(positionFromGeolocation(pos))
        setGeoError(null)
      },
      (err) => {
        if (cancelled) return
        if (err.code === 1) {
          setGeoError(formatGeolocationError(err))
          setCoords(null)
          return
        }
        // Timeout watch: jangan hapus coords yang sudah ada; coba fallback sekali.
        if (err.code === 3 && coordsRef.current) {
          return
        }
        getGeolocationPosition({ preferHighAccuracy: false })
          .then((pos) => {
            if (cancelled) return
            setCoords(positionFromGeolocation(pos))
            setGeoError(null)
          })
          .catch((fallbackErr) => {
            if (cancelled) return
            if (!coordsRef.current) {
              setGeoError(formatGeolocationError(fallbackErr))
            }
          })
      },
      GEOLOCATION_WATCH_OPTIONS
    )

    return () => {
      cancelled = true
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }
  }, [gpsEnabled])

  /** Satu kali baca GPS segar — high accuracy lalu fallback jaringan. */
  const refreshCoords = useCallback(() => {
    if (!gpsEnabled || typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve()
    }
    setCoordsRefreshing(true)
    return getGeolocationPosition({ preferHighAccuracy: true })
      .then((pos) => {
        setCoords(positionFromGeolocation(pos))
        setGeoError(null)
      })
      .catch((err) => {
        if (!coordsRef.current) {
          setGeoError(formatGeolocationError(err))
        }
      })
      .finally(() => {
        setCoordsRefreshing(false)
      })
  }, [gpsEnabled])

  const value = {
    gpsEnabled,
    setGpsEnabled,
    coords,
    geoError,
    coordsRefreshing,
    refreshCoords,
    geoSupported: typeof navigator !== 'undefined' && !!navigator.geolocation
  }

  return (
    <AbsenLokasiContext.Provider value={value}>{children}</AbsenLokasiContext.Provider>
  )
}

export function useAbsenLokasi() {
  const ctx = useContext(AbsenLokasiContext)
  if (!ctx) {
    throw new Error('useAbsenLokasi harus di dalam AbsenLokasiProvider')
  }
  return ctx
}
