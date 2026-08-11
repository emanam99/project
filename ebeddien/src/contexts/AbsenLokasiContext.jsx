import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react'

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
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        })
        setGeoError(null)
      },
      (err) => {
        setGeoError(err.message || 'Izin lokasi ditolak atau tidak tersedia')
        setCoords(null)
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 }
    )
    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current)
        watchRef.current = null
      }
    }
  }, [gpsEnabled])

  /** Satu kali baca GPS segar (maximumAge 0) — melengkapi watchPosition agar posisi bisa diperbarui manual. */
  const refreshCoords = useCallback(() => {
    if (!gpsEnabled || typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.resolve()
    }
    setCoordsRefreshing(true)
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          })
          setGeoError(null)
          setCoordsRefreshing(false)
          resolve()
        },
        (err) => {
          // Jangan timpa geoError global: posisi dari watchPosition bisa tetap valid;
          // setGeoError di sini bisa menyembunyikan panel absen mandiri padahal coords dari watch masih ada.
          setCoordsRefreshing(false)
          resolve()
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 35000 }
      )
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
