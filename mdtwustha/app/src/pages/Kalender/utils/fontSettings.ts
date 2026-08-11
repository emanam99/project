import type { CSSProperties } from 'react'

export const FONT_SIZE_REM_MIN = 0.5
export const FONT_SIZE_REM_MAX = 1.5
export const FONT_SIZE_REM_STEP = 0.05

const FONT_FAMILY_MAP: Record<string, string> = {
  default: 'inherit',
  serif: 'Georgia, "Times New Roman", serif',
  arabic: "'Traditional Arabic', 'Amiri', 'Noto Naskh Arabic', serif",
}

export type FontSettings = {
  fontSizeHijriTanggalHijriyah: number
  fontSizeHijriTanggalMasehi: number
  fontSizeMasehiTanggalMasehi: number
  fontSizeMasehiTanggalHijriyah: number
  fontSizePasaran: number
  fontTanggalPrimer: string
  fontTanggalSekunder: string
  fontPasaran: string
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  fontSizeHijriTanggalHijriyah: 1,
  fontSizeHijriTanggalMasehi: 0.75,
  fontSizeMasehiTanggalMasehi: 1,
  fontSizeMasehiTanggalHijriyah: 0.75,
  fontSizePasaran: 0.65,
  fontTanggalPrimer: 'default',
  fontTanggalSekunder: 'default',
  fontPasaran: 'default',
}

export function fontSettingsToStyle(settings: FontSettings | null, tab: 'hijri' | 'masehi' = 'hijri'): CSSProperties {
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
    '--kalender-font-pasaran': FONT_FAMILY_MAP[s.fontPasaran] || FONT_FAMILY_MAP.default,
  } as CSSProperties
}
