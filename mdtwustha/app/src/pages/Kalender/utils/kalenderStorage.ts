import { DEFAULT_FONT_SETTINGS, type FontSettings } from './fontSettings'
import type { GridViewSettings } from './gridView'

const KEY_FONT = 'mdtwustha_kalender_fontSettings'
const KEY_GRID_VIEW = 'mdtwustha_kalender_gridView'
const KEY_SHOW_GREGORIAN = 'mdtwustha_kalender_showGregorian'
const KEY_SHOW_HIJRIYAH = 'mdtwustha_kalender_showHijriyah'
const KEY_SHOW_PASARAN = 'mdtwustha_kalender_showPasaran'
const KEY_ACTIVE_TAB = 'mdtwustha_kalender_activeTab'

const DEFAULT_GRID_VIEW: GridViewSettings = {
  showDateBox: true,
  showHorizontalLines: true,
  showVerticalLines: true,
  lineThicknessHorizontal: 1,
  lineThicknessVertical: 1,
}

function get(key: string, fallback: string | null) {
  try {
    const s = typeof window !== 'undefined' ? localStorage.getItem(key) : null
    if (s != null) return s
  } catch {
    /* ignore */
  }
  return fallback
}

function set(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

const clampLineThickness = (v: unknown) => {
  const n = Number(v)
  if (Number.isNaN(n)) return 1
  return Math.min(3, Math.max(0.5, n))
}

export function loadFontSettings(): FontSettings {
  try {
    const s = get(KEY_FONT, null)
    if (s) {
      const parsed = JSON.parse(s) as Partial<FontSettings>
      const merged = { ...DEFAULT_FONT_SETTINGS, ...parsed }
      const num = (v: unknown, def: number) => (typeof v === 'number' && !Number.isNaN(v) ? v : Number(v) || def)
      merged.fontSizeHijriTanggalHijriyah = num(merged.fontSizeHijriTanggalHijriyah, 1)
      merged.fontSizeHijriTanggalMasehi = num(merged.fontSizeHijriTanggalMasehi, 0.75)
      merged.fontSizeMasehiTanggalMasehi = num(merged.fontSizeMasehiTanggalMasehi, 1)
      merged.fontSizeMasehiTanggalHijriyah = num(merged.fontSizeMasehiTanggalHijriyah, 0.75)
      merged.fontSizePasaran = num(merged.fontSizePasaran, 0.65)
      return merged
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FONT_SETTINGS }
}

export function saveFontSettings(settings: FontSettings) {
  set(KEY_FONT, JSON.stringify(settings))
}

export function loadGridViewSettings(): GridViewSettings {
  try {
    const s = get(KEY_GRID_VIEW, null)
    if (s) {
      const parsed = JSON.parse(s) as Partial<GridViewSettings>
      return {
        showDateBox: parsed.showDateBox !== false,
        showHorizontalLines: parsed.showHorizontalLines !== false,
        showVerticalLines: parsed.showVerticalLines !== false,
        lineThicknessHorizontal: clampLineThickness(parsed.lineThicknessHorizontal ?? 1),
        lineThicknessVertical: clampLineThickness(parsed.lineThicknessVertical ?? 1),
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_GRID_VIEW }
}

export function saveGridViewSettings(settings: GridViewSettings) {
  set(KEY_GRID_VIEW, JSON.stringify(settings))
}

export function loadShowGregorian() {
  return get(KEY_SHOW_GREGORIAN, 'true') === 'true'
}

export function saveShowGregorian(value: boolean) {
  set(KEY_SHOW_GREGORIAN, value ? 'true' : 'false')
}

export function loadShowHijriyah() {
  return get(KEY_SHOW_HIJRIYAH, 'true') === 'true'
}

export function saveShowHijriyah(value: boolean) {
  set(KEY_SHOW_HIJRIYAH, value ? 'true' : 'false')
}

export function loadShowPasaran() {
  return get(KEY_SHOW_PASARAN, 'true') === 'true'
}

export function saveShowPasaran(value: boolean) {
  set(KEY_SHOW_PASARAN, value ? 'true' : 'false')
}

export function loadActiveTab(): 'hijri' | 'masehi' {
  const v = get(KEY_ACTIVE_TAB, 'hijri')
  return v === 'masehi' ? 'masehi' : 'hijri'
}

export function saveActiveTab(tab: 'hijri' | 'masehi') {
  set(KEY_ACTIVE_TAB, tab === 'masehi' ? 'masehi' : 'hijri')
}
