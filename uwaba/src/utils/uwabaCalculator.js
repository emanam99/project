// Utility functions untuk perhitungan UWABA

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

/**
 * Hitung wajib berdasarkan biodata
 * @param {Object} biodata - Biodata santri
 * @param {Object} prices - Data harga dari uwaba-prices.json
 * @returns {number} Total wajib
 */
export const calculateWajibFromBiodata = (biodata, prices) => {
  if (!prices || !biodata) return 0
  
  const { status_santri, kategori, diniyah, formal, lttq, saudara, saudara_di_pesantren } = biodata
  // Gunakan saudara atau saudara_di_pesantren (prioritas saudara)
  const saudaraValue = saudara || saudara_di_pesantren || ''
  
  // Harga dasar berdasarkan status_santri dan kategori
  let hargaDasar = 0
  if (status_santri && kategori && prices.status_santri?.[status_santri]?.[kategori]) {
    hargaDasar = prices.status_santri[status_santri][kategori].wajib || 0
  }
  
  // Total wajib tambahan (diniyah, formal, lttq)
  let totalWajibTambahan = 0
  
  if (diniyah && prices.diniyah?.[diniyah]) {
    totalWajibTambahan += prices.diniyah[diniyah].wajib || 0
  }
  
  if (formal && prices.formal?.[formal]) {
    totalWajibTambahan += prices.formal[formal].wajib || 0
  }
  
  if (lttq && prices.lttq?.[lttq]) {
    totalWajibTambahan += prices.lttq[lttq].wajib || 0
  }
  
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
    saudara: biodata1.saudara || biodata1.saudara_di_pesantren || ''
  }
  
  const biodata2Mapped = {
    ...biodata2,
    saudara: biodata2.saudara || biodata2.saudara_di_pesantren || ''
  }
  
  return fields.every(field => biodata1Mapped[field] === biodata2Mapped[field])
}

