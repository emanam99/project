/**
 * Cocokkan event hari penting dengan satu hari di kalender Masehi atau Hijriyah.
 * Tipe `dari_sampai`: `tanggal_dari` / `tanggal_sampai` berupa string Y-m-d (Masehi atau Hijriyah).
 */

function validYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export function ymdInInclusive(ymd, dari, sampai) {
  if (!validYmd(ymd) || !validYmd(dari) || !validYmd(sampai)) return false
  return ymd >= dari && ymd <= sampai
}

function matchSingleMasehi(day, month, year, item) {
  const matchDay = item.tanggal != null && item.tanggal !== '' ? Number(item.tanggal) : null
  const matchBulan = item.bulan != null && item.bulan !== '' ? Number(item.bulan) : null
  const matchTahun = item.tahun != null && item.tahun !== '' ? Number(item.tahun) : null
  return matchDay === day && (matchBulan == null || matchBulan === month) && (matchTahun == null || matchTahun === year)
}

function matchSingleHijri(hDay, hMonth, hYear, item) {
  const eventDay = item.tanggal != null && item.tanggal !== '' ? Number(item.tanggal) : null
  const eventBulan = item.bulan != null && item.bulan !== '' ? Number(item.bulan) : null
  const eventTahun = item.tahun != null && item.tahun !== '' ? Number(item.tahun) : null
  return (
    eventDay != null &&
    eventBulan != null &&
    hMonth === eventBulan &&
    hDay === eventDay &&
    (eventTahun == null || eventTahun === '' || hYear === eventTahun)
  )
}

/**
 * @param {string} isoMasehi - Y-m-d Masehi untuk hari yang ditampilkan
 * @param {string|null} hijriYmdForDay - Y-m-d Hijriyah dari API convert (boleh null)
 * @param {number} gregDay
 * @param {number} gregMonth 1-12
 * @param {number} gregYear
 * @param {object} item - baris psa___hari_penting
 */
export function matchesHariPentingMasehiCalendar(isoMasehi, hijriYmdForDay, gregDay, gregMonth, gregYear, item) {
  if (!item || item.aktif === 0) return false
  if (item.tipe === 'dari_sampai') {
    if (item.kategori === 'masehi') {
      return ymdInInclusive(isoMasehi, item.tanggal_dari, item.tanggal_sampai)
    }
    if (item.kategori === 'hijriyah' && hijriYmdForDay && hijriYmdForDay !== '0000-00-00') {
      return ymdInInclusive(hijriYmdForDay, item.tanggal_dari, item.tanggal_sampai)
    }
    return false
  }
  if (item.kategori === 'masehi') {
    return matchSingleMasehi(gregDay, gregMonth, gregYear, item)
  }
  if (item.kategori === 'hijriyah' && hijriYmdForDay && hijriYmdForDay !== '0000-00-00') {
    const [hy, hm, hd] = hijriYmdForDay.split('-').map(Number)
    return matchSingleHijri(hd, hm, hy, item)
  }
  return false
}

/**
 * Grid Hijriyah: `hijriDay` 1..n, `hijriMonth` & `hijriYear` bulan/tahun tampilan; `gregDay/Month/Year` untuk event kategori masehi.
 */
export function matchesHariPentingHijriCalendar(hijriDay, hijriMonth, hijriYear, gregDay, gregMonth, gregYear, item) {
  if (!item || item.aktif === 0) return false
  if (item.tipe === 'dari_sampai') {
    if (item.kategori === 'hijriyah') {
      if (hijriMonth == null || hijriYear == null || Number.isNaN(hijriDay)) return false
      const ymd = `${hijriYear}-${String(hijriMonth).padStart(2, '0')}-${String(hijriDay).padStart(2, '0')}`
      return ymdInInclusive(ymd, item.tanggal_dari, item.tanggal_sampai)
    }
    if (item.kategori === 'masehi') {
      const iso = `${gregYear}-${String(gregMonth).padStart(2, '0')}-${String(gregDay).padStart(2, '0')}`
      return ymdInInclusive(iso, item.tanggal_dari, item.tanggal_sampai)
    }
    return false
  }
  if (item.kategori === 'hijriyah') {
    return matchSingleHijri(hijriDay, hijriMonth, hijriYear, item)
  }
  if (item.kategori === 'masehi') {
    return matchSingleMasehi(gregDay, gregMonth, gregYear, item)
  }
  return false
}
