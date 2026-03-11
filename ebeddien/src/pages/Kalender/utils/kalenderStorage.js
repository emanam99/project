/**
 * Penyimpanan lokal pengaturan kalender (font + centang Masehi/Hijriyah/Pasaran)
 */
import { DEFAULT_FONT_SETTINGS } from './fontSettings'

const KEY_FONT = 'uwaba_kalender_fontSettings'
const KEY_GRID_VIEW = 'uwaba_kalender_gridView'
const KEY_SHOW_GREGORIAN = 'uwaba_kalender_showGregorian'
const KEY_SHOW_HIJRIYAH = 'uwaba_kalender_showHijriyah'
const KEY_SHOW_PASARAN = 'uwaba_kalender_showPasaran'
const KEY_SHOW_HARI_PENTING_MARKERS = 'uwaba_kalender_showHariPentingMarkers'
const KEY_ACTIVE_TAB = 'uwaba_kalender_activeTab'

const DEFAULT_GRID_VIEW = {
  showDateBox: true,
  showHorizontalLines: true,
  showVerticalLines: true,
  lineThicknessHorizontal: 1,
  lineThicknessVertical: 1
}

function get(key, fallback) {
  try {
    const s = typeof window !== 'undefined' ? localStorage.getItem(key) : null
    if (s != null) return s
  } catch (e) {}
  return fallback
}

function set(key, value) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(key, value)
  } catch (e) {}
}

export function loadFontSettings() {
  try {
    const s = get(KEY_FONT, null)
    if (s) {
      const parsed = JSON.parse(s)
      const merged = { ...DEFAULT_FONT_SETTINGS, ...parsed }
      const num = (v, def) => (typeof v === 'number' && !Number.isNaN(v) ? v : (Number(v) || def))
      const defPrimer = num(merged.fontSizePrimer ?? merged.fontSize, 1)
      const defSekunder = num(merged.fontSizeSekunder, 0.75)
      merged.fontSizeHijriTanggalHijriyah = num(merged.fontSizeHijriTanggalHijriyah, defPrimer)
      merged.fontSizeHijriTanggalMasehi = num(merged.fontSizeHijriTanggalMasehi, defSekunder)
      merged.fontSizeMasehiTanggalMasehi = num(merged.fontSizeMasehiTanggalMasehi, defPrimer)
      merged.fontSizeMasehiTanggalHijriyah = num(merged.fontSizeMasehiTanggalHijriyah, defSekunder)
      merged.fontSizePasaran = num(merged.fontSizePasaran, 0.65)
      return merged
    }
  } catch (e) {}
  return { ...DEFAULT_FONT_SETTINGS }
}

export function saveFontSettings(settings) {
  set(KEY_FONT, JSON.stringify(settings))
}

const clampLineThickness = (v) => {
  const n = Number(v)
  if (Number.isNaN(n)) return 1
  return Math.min(3, Math.max(0.5, n))
}

export function loadGridViewSettings() {
  try {
    const s = get(KEY_GRID_VIEW, null)
    if (s) {
      const parsed = JSON.parse(s)
      return {
        showDateBox: parsed.showDateBox !== false,
        showHorizontalLines: parsed.showHorizontalLines !== false,
        showVerticalLines: parsed.showVerticalLines !== false,
        lineThicknessHorizontal: clampLineThickness(parsed.lineThicknessHorizontal ?? 1),
        lineThicknessVertical: clampLineThickness(parsed.lineThicknessVertical ?? 1)
      }
    }
  } catch (e) {}
  return { ...DEFAULT_GRID_VIEW }
}

export function saveGridViewSettings(settings) {
  set(KEY_GRID_VIEW, JSON.stringify(settings))
}

export function loadShowGregorian() {
  return get(KEY_SHOW_GREGORIAN, 'true') === 'true'
}

export function saveShowGregorian(value) {
  set(KEY_SHOW_GREGORIAN, value ? 'true' : 'false')
}

export function loadShowHijriyah() {
  return get(KEY_SHOW_HIJRIYAH, 'true') === 'true'
}

export function saveShowHijriyah(value) {
  set(KEY_SHOW_HIJRIYAH, value ? 'true' : 'false')
}

export function loadShowPasaran() {
  return get(KEY_SHOW_PASARAN, 'true') === 'true'
}

export function saveShowPasaran(value) {
  set(KEY_SHOW_PASARAN, value ? 'true' : 'false')
}

export function loadShowHariPentingMarkers() {
  return get(KEY_SHOW_HARI_PENTING_MARKERS, 'true') === 'true'
}

export function saveShowHariPentingMarkers(value) {
  set(KEY_SHOW_HARI_PENTING_MARKERS, value ? 'true' : 'false')
}

/** Tab aktif: 'hijri' | 'masehi'. Default 'hijri'. */
export function loadActiveTab() {
  const v = get(KEY_ACTIVE_TAB, 'hijri')
  return v === 'masehi' ? 'masehi' : 'hijri'
}

export function saveActiveTab(tab) {
  set(KEY_ACTIVE_TAB, tab === 'masehi' ? 'masehi' : 'hijri')
}
