/**
 * Pratinjau alamat dari titik lokasi absen (bukan reverse geocode).
 * Jika koordinat berada dalam radius titik dan titik punya isian alamat manual,
 * tampilkan isian tersebut (urutan prioritas: radius terkecil, lalu jarak terdekat).
 */

const ALAMAT_KEYS = ['dusun', 'rt', 'rw', 'desa', 'kecamatan', 'kabupaten', 'provinsi']

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function trimStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

export function lokasiPunyaAlamatManual(r) {
  if (!r || typeof r !== 'object') return false
  return ALAMAT_KEYS.some((k) => trimStr(r[k]) !== '')
}

function parseCoord(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseFloat(String(v).trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/**
 * Bentuk objek selaras geocode reverse (UI) + meta _source.
 * @param {Record<string, unknown>} r baris lokasi atau override form
 */
export function lokasiRowToAlamatPreviewShape(r) {
  const dusun = trimStr(r.dusun)
  const rt = trimStr(r.rt)
  const rw = trimStr(r.rw)
  const desa = trimStr(r.desa)
  const kecamatan = trimStr(r.kecamatan)
  const kabupaten = trimStr(r.kabupaten)
  const provinsi = trimStr(r.provinsi)

  const lineParts = []
  if (dusun) lineParts.push(dusun)
  if (rt || rw) {
    const rtRw = [rt ? `RT ${rt}` : '', rw ? `RW ${rw}` : ''].filter(Boolean).join(', ')
    if (rtRw) lineParts.push(rtRw)
  }
  if (desa) lineParts.push(desa)
  if (kecamatan) lineParts.push(kecamatan)
  if (kabupaten) lineParts.push(kabupaten)
  if (provinsi) lineParts.push(provinsi)

  return {
    _source: 'lokasi_manual',
    dusun: dusun || null,
    rt: rt || null,
    rw: rw || null,
    desa: desa || null,
    kecamatan: kecamatan || null,
    kota: kabupaten || null,
    provinsi: provinsi || null,
    display_name: lineParts.length ? lineParts.join(', ') : null
  }
}

/**
 * @param {unknown[]} lokasiList
 * @param {number} lat
 * @param {number} lng
 * @param {{
 *   excludeId?: string|number|null
 *   formOverride?: Record<string, unknown>|null
 *   radiusSlackMeters?: number
 * }} [opts] radiusSlackMeters: ditambah ke radius (m), mis. min(akurasi GPS, 120) — selaras zona absen mandiri
 */
export function pickAlamatPratinjauFromLokasiList(lokasiList, lat, lng, opts = {}) {
  const { excludeId = null, formOverride = null, radiusSlackMeters = 0 } = opts
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const slack = Number.isFinite(radiusSlackMeters) && radiusSlackMeters > 0 ? radiusSlackMeters : 0

  const rows = Array.isArray(lokasiList) ? lokasiList : []
  const candidates = rows.filter((r) => excludeId == null || String(r?.id ?? '') !== String(excludeId))
  if (formOverride && lokasiPunyaAlamatManual(formOverride)) {
    candidates.push(formOverride)
  }

  const matches = []
  for (const r of candidates) {
    if (!lokasiPunyaAlamatManual(r)) continue
    const plat = parseCoord(r.latitude)
    const plng = parseCoord(r.longitude)
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue
    const rad = Math.max(10, parseInt(String(r.radius_meter ?? 100), 10) || 100) + slack
    const d = haversineMeters(lat, lng, plat, plng)
    if (!Number.isFinite(d) || d > rad) continue
    matches.push({ r, d, rad })
  }
  if (matches.length === 0) return null
  matches.sort((a, b) => a.rad - b.rad || a.d - b.d)
  return lokasiRowToAlamatPreviewShape(matches[0].r)
}
