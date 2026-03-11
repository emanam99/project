/**
 * Opsi pengaturan font kalender dan mapping ke nilai CSS
 */
export const FONT_FAMILY_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'serif', label: 'Serif' },
  { value: 'arabic', label: 'Arabic' }
]

const FONT_FAMILY_MAP = {
  default: 'inherit',
  serif: 'Georgia, "Times New Roman", serif',
  arabic: "'Traditional Arabic', 'Amiri', 'Noto Naskh Arabic', serif"
}

/** Ukuran font: nilai dalam rem. Min/max/step untuk kontrol +/- */
export const FONT_SIZE_REM_MIN = 0.5
export const FONT_SIZE_REM_MAX = 1.5
export const FONT_SIZE_REM_STEP = 0.05

/** Pengaturan ukuran font per tab: Hijri tab punya Tanggal Hijriyah + Tanggal Masehi; Masehi tab punya Tanggal Masehi + Tanggal Hijriyah. Pasaran satu untuk semua. */
export const DEFAULT_FONT_SETTINGS = {
  fontSizeHijriTanggalHijriyah: 1,
  fontSizeHijriTanggalMasehi: 0.75,
  fontSizeMasehiTanggalMasehi: 1,
  fontSizeMasehiTanggalHijriyah: 0.75,
  fontSizePasaran: 0.65,
  fontTanggalPrimer: 'default',
  fontTanggalSekunder: 'default',
  fontPasaran: 'default'
}

/**
 * Ubah fontSettings ke objek style CSS variables untuk grid kalender.
 * @param {object} settings - fontSettings
 * @param {'hijri'|'masehi'} tab - tab aktif: ukuran primer/sekunder diambil dari pengaturan tab tersebut
 */
export function fontSettingsToStyle(settings, tab = 'hijri') {
  if (!settings) return {}
  const s = { ...DEFAULT_FONT_SETTINGS, ...settings }
  const isHijri = tab === 'hijri'
  const primerRem = isHijri
    ? `${Number(s.fontSizeHijriTanggalHijriyah) || 1}rem`
    : `${Number(s.fontSizeMasehiTanggalMasehi) || 1}rem`
  const sekunderRem = isHijri
    ? `${Number(s.fontSizeHijriTanggalMasehi) ?? 0.75}rem`
    : `${Number(s.fontSizeMasehiTanggalHijriyah) ?? 0.75}rem`
  const pasaranRem = `${Number(s.fontSizePasaran) ?? 0.65}rem`
  return {
    '--kalender-font-size-primer': primerRem,
    '--kalender-font-size-sekunder': sekunderRem,
    '--kalender-font-size-pasaran': pasaranRem,
    '--kalender-font-primer': FONT_FAMILY_MAP[s.fontTanggalPrimer] || FONT_FAMILY_MAP.default,
    '--kalender-font-sekunder': FONT_FAMILY_MAP[s.fontTanggalSekunder] || FONT_FAMILY_MAP.default,
    '--kalender-font-pasaran': FONT_FAMILY_MAP[s.fontPasaran] || FONT_FAMILY_MAP.default
  }
}
