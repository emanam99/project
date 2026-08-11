/** Ukuran kertas surat ijin (landscape). F4 = Folio Indonesia 215×330 mm. */

export const PRINT_IJIN_PAPER_STORAGE_KEY = 'ebeddien.ijin.printPaperSize'

/** @typedef {'A4' | 'F4'} PrintIjinPaperSize */

export const PRINT_IJIN_PAPER_OPTIONS = [
  {
    id: 'A4',
    label: 'A4',
    hint: '297 × 210 mm',
    /** landscape */
    widthMm: 297,
    heightMm: 210,
    pageSizeCss: 'A4 landscape',
  },
  {
    id: 'F4',
    label: 'F4',
    hint: '330 × 215 mm',
    widthMm: 330,
    heightMm: 215,
    /** Folio / F4 — beberapa driver kenal "folio"; fallback ukuran eksplisit */
    pageSizeCss: '330mm 215mm',
  },
]

/**
 * @param {unknown} raw
 * @returns {PrintIjinPaperSize}
 */
export function normalizePrintIjinPaperSize(raw) {
  const v = String(raw || '').trim().toUpperCase()
  return v === 'F4' ? 'F4' : 'A4'
}

/**
 * @param {PrintIjinPaperSize} size
 */
export function getPrintIjinPaperSpec(size) {
  const id = normalizePrintIjinPaperSize(size)
  return PRINT_IJIN_PAPER_OPTIONS.find((o) => o.id === id) || PRINT_IJIN_PAPER_OPTIONS[0]
}

export function readPrintIjinPaperSize() {
  if (typeof window === 'undefined') return 'A4'
  try {
    return normalizePrintIjinPaperSize(window.localStorage.getItem(PRINT_IJIN_PAPER_STORAGE_KEY))
  } catch {
    return 'A4'
  }
}

/**
 * @param {PrintIjinPaperSize} size
 */
export function writePrintIjinPaperSize(size) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PRINT_IJIN_PAPER_STORAGE_KEY, normalizePrintIjinPaperSize(size))
  } catch {
    /* ignore */
  }
}
