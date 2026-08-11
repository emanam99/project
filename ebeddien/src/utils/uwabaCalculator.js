// Utility functions untuk perhitungan UWABA

/**
 * Normalisasi kunci lookup harga (lembaga.id, lttq, dll.)
 */
export function normalizeUwabaPriceKey(raw) {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (s === '' || s === '-' || s === 'null' || s === 'undefined') return ''
  return s
}

function addonWajib(section, rawValue) {
  if (!section || typeof section !== 'object') return 0
  const k = normalizeUwabaPriceKey(rawValue)
  if (!k) return 0
  if (section[k]?.wajib != null) return Number(section[k].wajib) || 0
  const n = Number(k)
  if (Number.isFinite(n) && String(n) === k && section[String(n)]?.wajib != null) {
    return Number(section[String(n)].wajib) || 0
  }
  return 0
}

/**
 * Gabungkan snapshot JSON bulan uwaba dengan biodata terkini (santri).
 * Diniyah/formal selalu mengikuti biodata jika ada lembaga_id terisi — harga mengikuti rombel sekarang.
 */
export function mergeBiodataForUwabaPricing(snapshot, liveBiodata) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const L = liveBiodata && typeof liveBiodata === 'object' ? liveBiodata : {}
  const liveDin = normalizeUwabaPriceKey(L.diniyah ?? L.lembaga_id_diniyah)
  const liveFor = normalizeUwabaPriceKey(L.formal ?? L.lembaga_id_formal)
  const snapDin = normalizeUwabaPriceKey(s.diniyah)
  const snapFor = normalizeUwabaPriceKey(s.formal)
  return {
    ...s,
    status_santri: normalizeUwabaPriceKey(L.status_santri) || normalizeUwabaPriceKey(s.status_santri) || '',
    kategori: normalizeUwabaPriceKey(L.kategori) || normalizeUwabaPriceKey(s.kategori) || '',
    diniyah: liveDin || snapDin,
    formal: liveFor || snapFor,
    lttq: normalizeUwabaPriceKey(L.lttq) || normalizeUwabaPriceKey(s.lttq) || '',
    saudara: normalizeUwabaPriceKey(L.saudara) || normalizeUwabaPriceKey(L.saudara_di_pesantren)
      || normalizeUwabaPriceKey(s.saudara) || normalizeUwabaPriceKey(s.saudara_di_pesantren) || '',
    saudara_di_pesantren: normalizeUwabaPriceKey(L.saudara_di_pesantren) || normalizeUwabaPriceKey(L.saudara)
      || normalizeUwabaPriceKey(s.saudara_di_pesantren) || normalizeUwabaPriceKey(s.saudara) || ''
  }
}

/**
 * Normalisasi baris dari API/DB uwaba ke bentuk input buildUniqueWajibJsonList.
 * @param {Array<Record<string, unknown>>} dbRows
 */
export function mapUwabaDbRowsToWajibListInput(dbRows) {
  if (!Array.isArray(dbRows)) return []
  return dbRows.map((item) => {
    let jsonData = null
    const raw = item.json_data ?? item.jsonData
    if (raw) {
      try {
        jsonData = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (_) {
        jsonData = null
      }
    }
    const w = resolveUwabaWajibFromRow(item, jsonData)
    const tahun = item.tahun_ajaran != null ? String(item.tahun_ajaran) : ''
    const bulan = item.bulan != null ? String(item.bulan) : ''
    const namaBulan = tahun && bulan ? `${tahun} · ${bulan}` : (bulan || tahun || '')
    return { wajib: w, jsonData, namaBulan }
  })
}

/**
 * Agregasi wajib unik dari baris uwaba (kolom wajib + json).
 * Urutan tampilan: termurah → termahal. Nominal wajib sama → satu entri; JSON dari
 * entri terakhir dalam urutan array input (set urutan di sumber: mis. tahun_ajaran ASC, id ASC
 * agar yang terbaru menimpa).
 *
 * @param {Array<{ wajib?: number, jsonData?: object|null, namaBulan?: string }>} bulanRows
 * @returns {Array<{ wajib: number, jsonData: object|null, namaBulan: string, sourceIndex: number }>}
 */
export function buildUniqueWajibJsonList(bulanRows) {
  if (!Array.isArray(bulanRows)) return []
  const lastByWajib = new Map()
  for (let i = 0; i < bulanRows.length; i++) {
    const row = bulanRows[i]
    const w = Math.round(Number(row?.wajib) || 0)
    const jd = row?.jsonData
    const hasJson = jd != null && typeof jd === 'object' && Object.keys(jd).length > 0
    if (w === 0 && !hasJson) continue
    lastByWajib.set(w, {
      wajib: w,
      jsonData: hasJson ? jd : null,
      namaBulan: row?.namaBulan != null ? String(row.namaBulan) : '',
      sourceIndex: i
    })
  }
  return Array.from(lastByWajib.values()).sort((a, b) => a.wajib - b.wajib)
}

/**
 * Mapping id_bulan ke array index
 * Urutan Hijri: 11, 12, 1, 2, 3, 4, 5, 6, 7, 8
 * Array index: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
 */
export const mapBulanToArrayIndex = (idBulan) => {
  if (idBulan === 11) return 0 // Dzul Qo'dah - Bulan 1
  if (idBulan === 12) return 1 // Dzul Hijjah - Bulan 2
  if (idBulan >= 1 && idBulan <= 8) return idBulan + 1 // 1->2, 2->3, ..., 8->9
  return null // Invalid
}

/**
 * Mapping array index ke id_bulan
 */
export const mapArrayIndexToBulan = (index) => {
  if (index === 0) return 11 // Dzul Qo'dah
  if (index === 1) return 12 // Dzul Hijjah
  if (index >= 2 && index <= 9) return index - 1 // 2->1, 3->2, ..., 9->8
  return null // Invalid
}

/**
 * Nama bulan Hijriyah
 */
export const bulanHijriyah = [
  'Dzul Qo\'dah',
  'Dzul Hijjah',
  'Muharram',
  'Shafar',
  'Rabiul Awal',
  'Rabiul Akhir',
  'Jumadil Ula',
  'Jumadil Akhir',
  'Rajab',
  'Sya\'ban'
]

/** id_bulan DB + label (urutan hijri UWABA, 10 bulan). */
export const hijriUwabaBulanList = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8].map((id, i) => ({
  id,
  nama: bulanHijriyah[i],
}))

/**
 * Hitung wajib berdasarkan biodata
 * @param {Object} biodata - Biodata santri
 * @param {Object} prices - Data harga dari uwaba-prices.json
 * @returns {number} Total wajib
 */
export const calculateWajibFromBiodata = (biodata, prices) => {
  if (!prices || !biodata) return 0
  
  const {
    status_santri,
    kategori,
    diniyah,
    formal,
    lttq,
    saudara,
    saudara_di_pesantren,
    lembaga_id_diniyah,
    lembaga_id_formal
  } = biodata
  const dinKey = normalizeUwabaPriceKey(diniyah) || normalizeUwabaPriceKey(lembaga_id_diniyah)
  const forKey = normalizeUwabaPriceKey(formal) || normalizeUwabaPriceKey(lembaga_id_formal)
  const lttqKey = normalizeUwabaPriceKey(lttq)
  // Gunakan saudara atau saudara_di_pesantren (prioritas saudara)
  const saudaraValue = saudara || saudara_di_pesantren || ''
  
  // Harga dasar berdasarkan status_santri dan kategori
  let hargaDasar = 0
  if (status_santri && kategori && prices.status_santri?.[status_santri]?.[kategori]) {
    hargaDasar = prices.status_santri[status_santri][kategori].wajib || 0
  }
  
  // Total wajib tambahan (diniyah, formal, lttq) — kunci = lembaga.id di uwaba-prices
  let totalWajibTambahan = 0
  totalWajibTambahan += addonWajib(prices.diniyah, dinKey)
  totalWajibTambahan += addonWajib(prices.formal, forKey)
  totalWajibTambahan += addonWajib(prices.lttq, lttqKey)
  
  // Total sebelum diskon saudara
  const totalWajibSebelumDiskonSaudara = hargaDasar + totalWajibTambahan
  
  // Hitung diskon saudara
  let diskonSaudara = 0
  if (saudaraValue && saudaraValue !== 'Tidak Ada' && prices.saudara?.[saudaraValue]) {
    const saudaraConfig = prices.saudara[saudaraValue]
    if (saudaraConfig.diskon_type === 'percentage') {
      diskonSaudara = (totalWajibSebelumDiskonSaudara * saudaraConfig.diskon) / 100
    } else {
      diskonSaudara = saudaraConfig.diskon || 0
    }
  }
  
  // Final wajib (tidak boleh negatif)
  const finalWajib = Math.max(totalWajibSebelumDiskonSaudara - diskonSaudara, 0)
  
  return finalWajib
}

/**
 * Tentukan wajib efektif dari baris DB (kolom wajib vs json.total_wajib).
 * Jika keduanya ada dan berbeda, kolom wajib diutamakan (hasil save-refresh terbaru).
 */
export function resolveUwabaWajibFromRow(item, jsonData = null) {
  const columnW = Math.round(Number(item?.wajib) || 0)
  let jsonW = null
  if (jsonData && jsonData.total_wajib !== undefined) {
    const tw = Math.round(Number(jsonData.total_wajib))
    if (!Number.isNaN(tw)) jsonW = tw
  }
  if (jsonW != null && columnW > 0 && columnW !== jsonW) return columnW
  if (jsonW != null) return jsonW
  return columnW
}

/**
 * Snapshot JSON uwaba dari biodata + katalog harga.
 */
export function buildUwabaJsonFromBiodata(biodata, prices) {
  if (!biodata || !prices) {
    return { total_wajib: 0, timestamp: Date.now() }
  }
  const dinKey = normalizeUwabaPriceKey(biodata.diniyah) || normalizeUwabaPriceKey(biodata.lembaga_id_diniyah)
  const forKey = normalizeUwabaPriceKey(biodata.formal) || normalizeUwabaPriceKey(biodata.lembaga_id_formal)
  const lttqKey = normalizeUwabaPriceKey(biodata.lttq) || ''
  const saudaraValue = biodata.saudara || biodata.saudara_di_pesantren || ''

  let hargaDasar = 0
  if (biodata.status_santri && biodata.kategori && prices.status_santri?.[biodata.status_santri]?.[biodata.kategori]) {
    hargaDasar = Number(prices.status_santri[biodata.status_santri][biodata.kategori].wajib) || 0
  }
  const hargaDiniyah = addonWajib(prices.diniyah, dinKey)
  const hargaFormal = addonWajib(prices.formal, forKey)
  const hargaLttq = addonWajib(prices.lttq, lttqKey)
  const totalSebelumDiskon = hargaDasar + hargaDiniyah + hargaFormal + hargaLttq
  let diskonSaudara = 0
  let diskonSaudaraType = ''
  if (saudaraValue && saudaraValue !== 'Tidak Ada' && prices.saudara?.[saudaraValue]) {
    const cfg = prices.saudara[saudaraValue]
    diskonSaudaraType = cfg.diskon_type || 'fixed'
    diskonSaudara =
      diskonSaudaraType === 'percentage'
        ? (totalSebelumDiskon * cfg.diskon) / 100
        : Number(cfg.diskon) || 0
  }
  const total_wajib = Math.max(totalSebelumDiskon - diskonSaudara, 0)

  return {
    status_santri: biodata.status_santri || '',
    kategori: biodata.kategori || '',
    diniyah: dinKey,
    formal: forKey,
    lttq: lttqKey,
    saudara: saudaraValue,
    saudara_di_pesantren: saudaraValue,
    harga_dasar: hargaDasar,
    harga_diniyah: hargaDiniyah,
    harga_formal: hargaFormal,
    harga_lttq: hargaLttq,
    diskon_saudara: diskonSaudara,
    diskon_saudara_type: diskonSaudaraType,
    total_wajib,
    timestamp: Date.now()
  }
}

/**
 * JSON payload save-refresh: kirim jsonData apa adanya (setelah Samakan) + timestamp.
 */
export function buildUwabaSaveJson(bulan, biodata) {
  const wajib = Math.round(Number(bulan?.wajib) || 0)
  if (bulan?.jsonData && typeof bulan.jsonData === 'object') {
    return { ...bulan.jsonData, timestamp: Date.now() }
  }
  return {
    status_santri: biodata?.status_santri || '',
    kategori: biodata?.kategori || '',
    diniyah: biodata?.diniyah || '',
    formal: biodata?.formal || '',
    lttq: biodata?.lttq || '',
    saudara_di_pesantren: biodata?.saudara || biodata?.saudara_di_pesantren || '',
    harga_dasar: 0,
    harga_diniyah: 0,
    harga_formal: 0,
    harga_lttq: 0,
    diskon_saudara: 0,
    diskon_saudara_type: '',
    total_wajib: wajib,
    timestamp: Date.now()
  }
}

/** Ubah kolom wajib tampilan saja; JSON bulan tidak disentuh. */
export function withWajibOnly(bulan, wajib) {
  if (!bulan) return bulan
  const w = Math.round(Number(wajib ?? bulan.wajib) || 0)
  return {
    ...bulan,
    wajib: w,
    keterangan: formatKeteranganPembayaran(w, bulan.nominal ?? 0)
  }
}

/** Samakan: ganti JSON dari biodata + wajib mengikuti. */
export function applySamakanBiodata(bulan, biodata, prices) {
  if (!bulan || !biodata || !prices) return bulan
  const jsonData = buildUwabaJsonFromBiodata(biodata, prices)
  const w = jsonData.total_wajib
  return {
    ...bulan,
    wajib: w,
    jsonData,
    samaSebelumnya: true,
    keterangan: formatKeteranganPembayaran(w, bulan.nominal ?? 0)
  }
}

/** Set wajib bulan + selaraskan json.total_wajib (hanya setelah Samakan / simpan). */
export function withUwabaWajibSynced(bulan, wajib) {
  if (!bulan) return bulan
  const w = Math.round(Number(wajib ?? bulan.wajib) || 0)
  const next = { ...bulan, wajib: w }
  if (next.jsonData && typeof next.jsonData === 'object') {
    next.jsonData = { ...next.jsonData, total_wajib: w }
  }
  return next
}

/**
 * Format keterangan pembayaran
 */
export const formatKeteranganPembayaran = (wajibValue, nominalValue) => {
  if (nominalValue >= wajibValue) {
    return 'Lunas'
  } else if (nominalValue > 0) {
    const kekurangan = wajibValue - nominalValue
    return `Kurang ${kekurangan.toLocaleString('id-ID')}`
  } else {
    return 'Belum'
  }
}

/**
 * Bandingkan biodata
 */
export const compareBiodata = (biodata1, biodata2) => {
  const fields = ['status_santri', 'kategori', 'diniyah', 'formal', 'lttq', 'saudara']
  
  // Normalize saudara field (bisa 'saudara' atau 'saudara_di_pesantren')
  const biodata1Mapped = {
    ...biodata1,
    saudara: biodata1.saudara || biodata1.saudara_di_pesantren || '',
    diniyah: normalizeUwabaPriceKey(biodata1.diniyah) || normalizeUwabaPriceKey(biodata1.lembaga_id_diniyah),
    formal: normalizeUwabaPriceKey(biodata1.formal) || normalizeUwabaPriceKey(biodata1.lembaga_id_formal)
  }
  
  const biodata2Mapped = {
    ...biodata2,
    saudara: biodata2.saudara || biodata2.saudara_di_pesantren || '',
    diniyah: normalizeUwabaPriceKey(biodata2.diniyah) || normalizeUwabaPriceKey(biodata2.lembaga_id_diniyah),
    formal: normalizeUwabaPriceKey(biodata2.formal) || normalizeUwabaPriceKey(biodata2.lembaga_id_formal)
  }
  
  return fields.every(field => biodata1Mapped[field] === biodata2Mapped[field])
}

/** Apakah JSON bulan selaras dengan biodata santri (untuk indikator centang). */
export function isUwabaJsonSamaBiodata(biodata, jsonData) {
  if (!biodata || !jsonData || typeof jsonData !== 'object') return false
  return compareBiodata(biodata, jsonData)
}

