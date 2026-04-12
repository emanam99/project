import { useEffect, useMemo, useRef, useState } from 'react'
import { useAbsenLokasi } from '../../../contexts/AbsenLokasiContext'
import { geocodeAPI } from '../../../services/api'

export default function AbsenGpsToggleBar() {
  const { gpsEnabled, setGpsEnabled, coords, geoError, geoSupported } = useAbsenLokasi()
  const [alamatData, setAlamatData] = useState(null)
  const [alamatError, setAlamatError] = useState('')
  const debounceRef = useRef(null)
  const seqRef = useRef(0)
  /** Untuk refetch: jangan kosongkan wilayah yang sudah tampil; hanya ganti saat respons baru sukses. */
  const alamatDataRef = useRef(null)
  useEffect(() => {
    alamatDataRef.current = alamatData
  }, [alamatData])

  const koordinatKey = useMemo(() => {
    if (!coords) return null
    const r4 = (n) => Math.round(n * 10000) / 10000
    return `${r4(coords.lat)},${r4(coords.lng)}`
  }, [coords])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (!gpsEnabled || geoError || !coords || koordinatKey == null) {
      setAlamatData(null)
      alamatDataRef.current = null
      setAlamatError('')
      return
    }

    if (alamatDataRef.current == null) {
      setAlamatError('')
    }
    const delayMs = 600
    debounceRef.current = setTimeout(() => {
      const mySeq = ++seqRef.current
      const lat = coords.lat
      const lng = coords.lng
      ;(async () => {
        try {
          const res = await geocodeAPI.reverse({ lat, lng })
          if (mySeq !== seqRef.current) return
          if (!res?.success || !res.data) {
            if (!alamatDataRef.current) {
              setAlamatData(null)
              setAlamatError(res?.message || 'Alamat tidak dapat dimuat')
            }
            return
          }
          const d = res.data
          const punyaWilayah = !!(d.desa || d.kecamatan || d.kota || d.provinsi)
          setAlamatData(d)
          setAlamatError(
            punyaWilayah ? '' : 'Detail desa/kecamatan tidak tersedia untuk titik ini'
          )
        } catch (e) {
          if (mySeq !== seqRef.current) return
          if (!alamatDataRef.current) {
            setAlamatData(null)
            setAlamatError(e?.response?.data?.message || e?.message || 'Gagal memuat alamat')
          }
        }
      })()
    }, delayMs)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [gpsEnabled, geoError, coords, koordinatKey])

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Akses lokasi (GPS)</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Hanya pengguna dengan akses tab Absen yang melihat opsi ini. Setelah diaktifkan, peramban meminta izin lokasi
            — dipakai untuk absen mandiri (GPS) di bagian bawah halaman tab ini.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer select-none">
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {gpsEnabled ? 'Aktif' : 'Nonaktif'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={gpsEnabled}
            disabled={!geoSupported}
            onClick={() => setGpsEnabled(!gpsEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              gpsEnabled ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'
            } ${!geoSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                gpsEnabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </label>
      </div>
      {!geoSupported && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Geolokasi tidak didukung di peramban ini.</p>
      )}
      {gpsEnabled && geoError && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{geoError}</p>
      )}
      {gpsEnabled && coords && !geoError && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono tabular-nums">
            Lat {coords.lat.toFixed(6)}, Lng {coords.lng.toFixed(6)}
            {coords.accuracy != null && ` · ±${Math.round(coords.accuracy)} m`}
          </p>
          {alamatError && !alamatData && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{alamatError}</p>
          )}
          {alamatData && (
            <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-xs text-gray-700 dark:text-gray-200 sm:grid-cols-2">
              {alamatData.desa ? (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Desa/kelurahan</dt>
                  <dd className="font-medium">{alamatData.desa}</dd>
                </>
              ) : null}
              {alamatData.kecamatan ? (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Kecamatan</dt>
                  <dd className="font-medium">{alamatData.kecamatan}</dd>
                </>
              ) : null}
              {alamatData.kota ? (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Kota/kabupaten</dt>
                  <dd className="font-medium">{alamatData.kota}</dd>
                </>
              ) : null}
              {alamatData.provinsi ? (
                <>
                  <dt className="text-gray-500 dark:text-gray-400">Provinsi</dt>
                  <dd className="font-medium">{alamatData.provinsi}</dd>
                </>
              ) : null}
              {!alamatData.desa &&
                !alamatData.kecamatan &&
                !alamatData.kota &&
                !alamatData.provinsi &&
                typeof alamatData.display_name === 'string' &&
                alamatData.display_name.trim() !== '' && (
                  <>
                    <dt className="text-gray-500 dark:text-gray-400 sm:col-span-1">Alamat</dt>
                    <dd className="sm:col-span-1 leading-snug">
                      {alamatData.display_name.length > 200
                        ? `${alamatData.display_name.slice(0, 197)}…`
                        : alamatData.display_name}
                    </dd>
                  </>
                )}
            </dl>
          )}
          {alamatError && alamatData && !alamatData.desa && !alamatData.kecamatan && !alamatData.kota && !alamatData.provinsi && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{alamatError}</p>
          )}
        </div>
      )}
    </div>
  )
}
