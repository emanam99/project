/**
 * Margin isi per satu salinan ijin (mm), preview & cetak — diterapkan pada kolom kiri & kanan.
 * Kiri/Kanan = tepi salinan (kolom kiri: kiri=kertas, kanan=gutter; kolom kanan: kiri=gutter, kanan=kertas).
 */

export const DEFAULT_PRINT_IJIN_MARGIN_MM = { top: 10, right: 8, bottom: 10, left: 8 }

function clampMarginMm(n, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(0, Math.min(40, Math.round(v * 10) / 10))
}

export function mergePageMarginMm(prop) {
  const d = DEFAULT_PRINT_IJIN_MARGIN_MM
  if (!prop || typeof prop !== 'object') return { ...d }
  return {
    top: clampMarginMm(prop.top, d.top),
    right: clampMarginMm(prop.right, d.right),
    bottom: clampMarginMm(prop.bottom, d.bottom),
    left: clampMarginMm(prop.left, d.left),
  }
}
