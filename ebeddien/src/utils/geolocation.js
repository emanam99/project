/** @param {GeolocationPositionError | Error | null | undefined} err */
export function formatGeolocationError(err) {
  if (!err || typeof err !== 'object') {
    return 'Izin lokasi ditolak atau tidak tersedia'
  }
  switch (err.code) {
    case 1:
      return 'Izin lokasi ditolak. Berikan izin di pengaturan peramban atau perangkat.'
    case 2:
      return 'Sinyal lokasi tidak tersedia. Pastikan GPS atau layanan lokasi aktif.'
    case 3:
      return 'Pencarian GPS terlalu lama. Coba di tempat terbuka atau aktifkan lokasi presisi.'
    default:
      return err.message || 'Gagal mengambil lokasi'
  }
}

/** @param {GeolocationPosition} pos */
export function positionFromGeolocation(pos) {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  }
}

/**
 * Ambil posisi sekali: coba akurasi tinggi (GPS), lalu fallback jaringan/Wi‑Fi.
 * Di HP, GPS presisi sering timeout; fallback rendah biasanya lebih cepat.
 */
export function getGeolocationPosition(options = {}) {
  const {
    preferHighAccuracy = true,
    highTimeoutMs = 45000,
    lowTimeoutMs = 35000,
    highMaxAgeMs = 15000,
    lowMaxAgeMs = 120000,
  } = options

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(Object.assign(new Error('Peramban tidak mendukung geolokasi'), { code: 0 }))
      return
    }

    const once = (enableHighAccuracy, timeout, maximumAge) =>
      new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(
          res,
          rej,
          { enableHighAccuracy, timeout, maximumAge }
        )
      })

    const attempts = preferHighAccuracy
      ? [
          () => once(true, highTimeoutMs, highMaxAgeMs),
          () => once(false, lowTimeoutMs, lowMaxAgeMs),
        ]
      : [() => once(false, lowTimeoutMs, lowMaxAgeMs)]

    let chain = Promise.reject()
    for (const attempt of attempts) {
      chain = chain.catch(() => attempt())
    }
    chain.then(resolve).catch(reject)
  })
}

/** Opsi watchPosition yang lebih toleran di perangkat mobile. */
export const GEOLOCATION_WATCH_OPTIONS = {
  enableHighAccuracy: false,
  maximumAge: 30000,
  timeout: 90000,
}
