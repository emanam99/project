import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'nailulMurodReaderFontScale'
const STORAGE_KEY_LINE = 'nailulMurodReaderLineHeight'
const STORAGE_KEY_FACES = 'nailulMurodReaderFontFaces'

/** Skala langkah diskret; 1 = 100% bawaan, maksimum 2 = 200% */
export const READER_FONT_STEPS = [
  0.85, 0.925, 1, 1.075, 1.15, 1.25, 1.35, 1.5, 1.65, 1.8, 1.9, 2,
] as const

/** Line-height tanpa satuan (kerapatan baris isi & terjemahan); minimum 1 */
export const READER_LINE_HEIGHT_STEPS = [1, 1.2, 1.35, 1.5, 1.65, 1.8, 1.95, 2.15] as const

export type ReaderFontStep = (typeof READER_FONT_STEPS)[number]
export type ReaderLineHeightStep = (typeof READER_LINE_HEIGHT_STEPS)[number]

/** Font Arab untuk gaya Ayat / Wirid (dan kelas legacy amiri/lateef/scheherazade). */
export const READER_ARABIC_FACES = [
  {
    id: 'amiri',
    label: 'Amiri',
    sample: 'بِسْمِ اللّٰهِ',
    css: "'Amiri', Georgia, 'Times New Roman', serif",
  },
  {
    id: 'lateef',
    label: 'Lateef',
    sample: 'بِسْمِ اللّٰهِ',
    css: "'Lateef', 'Scheherazade New', serif",
  },
  {
    id: 'scheherazade',
    label: 'Scheherazade',
    sample: 'بِسْمِ اللّٰهِ',
    css: "'Scheherazade New', 'Lateef', serif",
  },
] as const

/** Font Latin untuk Judul / Sub judul / arti. */
export const READER_LATIN_FACES = [
  {
    id: 'inter',
    label: 'Inter',
    sample: 'Aa Bb',
    css: "'Inter', system-ui, sans-serif",
  },
  {
    id: 'roboto',
    label: 'Roboto',
    sample: 'Aa Bb',
    css: "'Roboto', 'Inter', system-ui, sans-serif",
  },
] as const

export type ReaderArabicFaceId = (typeof READER_ARABIC_FACES)[number]['id']
export type ReaderLatinFaceId = (typeof READER_LATIN_FACES)[number]['id']

export type ReaderFontFaces = {
  ayat: ReaderArabicFaceId
  wirid: ReaderArabicFaceId
  nadhom: ReaderArabicFaceId
  latin: ReaderLatinFaceId
}

const DEFAULT_FACES: ReaderFontFaces = {
  ayat: 'amiri',
  wirid: 'lateef',
  nadhom: 'scheherazade',
  latin: 'inter',
}

function arabicFaceCss(id: ReaderArabicFaceId): string {
  return READER_ARABIC_FACES.find((f) => f.id === id)?.css ?? READER_ARABIC_FACES[0].css
}

function latinFaceCss(id: ReaderLatinFaceId): string {
  return READER_LATIN_FACES.find((f) => f.id === id)?.css ?? READER_LATIN_FACES[0].css
}

function nearestStep(value: number): ReaderFontStep {
  let best: ReaderFontStep = READER_FONT_STEPS[0]
  for (const s of READER_FONT_STEPS) {
    if (Math.abs(s - value) < Math.abs(best - value)) best = s
  }
  return best
}

function nearestLineStep(value: number): ReaderLineHeightStep {
  let best: ReaderLineHeightStep = READER_LINE_HEIGHT_STEPS[0]
  for (const s of READER_LINE_HEIGHT_STEPS) {
    if (Math.abs(s - value) < Math.abs(best - value)) best = s
  }
  return best
}

function readStoredScale(): ReaderFontStep {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const v = raw == null ? 1 : parseFloat(raw)
    if (!Number.isFinite(v)) return 1
    return nearestStep(v)
  } catch {
    return 1
  }
}

function readStoredLineHeight(): ReaderLineHeightStep {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LINE)
    const v = raw == null ? 1.65 : parseFloat(raw)
    if (!Number.isFinite(v)) return 1.65
    return nearestLineStep(v)
  } catch {
    return 1.65
  }
}

function isArabicFace(id: unknown): id is ReaderArabicFaceId {
  return READER_ARABIC_FACES.some((f) => f.id === id)
}

function isLatinFace(id: unknown): id is ReaderLatinFaceId {
  return READER_LATIN_FACES.some((f) => f.id === id)
}

function readStoredFaces(): ReaderFontFaces {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FACES)
    if (!raw) return { ...DEFAULT_FACES }
    const parsed = JSON.parse(raw) as Partial<ReaderFontFaces>
    return {
      ayat: isArabicFace(parsed.ayat) ? parsed.ayat : DEFAULT_FACES.ayat,
      wirid: isArabicFace(parsed.wirid) ? parsed.wirid : DEFAULT_FACES.wirid,
      nadhom: isArabicFace(parsed.nadhom) ? parsed.nadhom : DEFAULT_FACES.nadhom,
      latin: isLatinFace(parsed.latin) ? parsed.latin : DEFAULT_FACES.latin,
    }
  } catch {
    return { ...DEFAULT_FACES }
  }
}

function applyFaceCssVars(faces: ReaderFontFaces) {
  const root = document.documentElement
  root.style.setProperty('--reader-face-ayat', arabicFaceCss(faces.ayat))
  root.style.setProperty('--reader-face-wirid', arabicFaceCss(faces.wirid))
  root.style.setProperty('--reader-face-nadhom', arabicFaceCss(faces.nadhom))
  root.style.setProperty('--reader-face-latin', latinFaceCss(faces.latin))
}

export function useReaderFontScale() {
  const [scale, setScaleState] = useState<ReaderFontStep>(() =>
    typeof document !== 'undefined' ? readStoredScale() : 1
  )
  const [lineHeight, setLineHeightState] = useState<ReaderLineHeightStep>(() =>
    typeof document !== 'undefined' ? readStoredLineHeight() : 1.65
  )
  const [faces, setFacesState] = useState<ReaderFontFaces>(() =>
    typeof document !== 'undefined' ? readStoredFaces() : { ...DEFAULT_FACES }
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--reader-font-scale', String(scale))
    try {
      localStorage.setItem(STORAGE_KEY, String(scale))
    } catch {
      // ignore
    }
  }, [scale])

  useEffect(() => {
    document.documentElement.style.setProperty('--reader-line-height', String(lineHeight))
    try {
      localStorage.setItem(STORAGE_KEY_LINE, String(lineHeight))
    } catch {
      // ignore
    }
  }, [lineHeight])

  useEffect(() => {
    applyFaceCssVars(faces)
    try {
      localStorage.setItem(STORAGE_KEY_FACES, JSON.stringify(faces))
    } catch {
      // ignore
    }
  }, [faces])

  const stepIndex = useMemo(() => {
    const i = READER_FONT_STEPS.indexOf(scale)
    return i >= 0 ? i : READER_FONT_STEPS.indexOf(nearestStep(scale))
  }, [scale])

  const lineStepIndex = useMemo(() => {
    const i = READER_LINE_HEIGHT_STEPS.indexOf(lineHeight)
    return i >= 0 ? i : READER_LINE_HEIGHT_STEPS.indexOf(nearestLineStep(lineHeight))
  }, [lineHeight])

  const bumpUp = useCallback(() => {
    setScaleState((prev) => {
      const i = READER_FONT_STEPS.indexOf(prev)
      const next = Math.min(READER_FONT_STEPS.length - 1, Math.max(0, i) + 1)
      return READER_FONT_STEPS[next]
    })
  }, [])

  const bumpDown = useCallback(() => {
    setScaleState((prev) => {
      const i = READER_FONT_STEPS.indexOf(prev)
      const next = Math.max(0, i - 1)
      return READER_FONT_STEPS[next]
    })
  }, [])

  const bumpLineUp = useCallback(() => {
    setLineHeightState((prev) => {
      const i = READER_LINE_HEIGHT_STEPS.indexOf(prev)
      const next = Math.min(READER_LINE_HEIGHT_STEPS.length - 1, Math.max(0, i) + 1)
      return READER_LINE_HEIGHT_STEPS[next]
    })
  }, [])

  const bumpLineDown = useCallback(() => {
    setLineHeightState((prev) => {
      const i = READER_LINE_HEIGHT_STEPS.indexOf(prev)
      const next = Math.max(0, i - 1)
      return READER_LINE_HEIGHT_STEPS[next]
    })
  }, [])

  const setAyatFace = useCallback((id: ReaderArabicFaceId) => {
    setFacesState((prev) => (prev.ayat === id ? prev : { ...prev, ayat: id }))
  }, [])

  const setWiridFace = useCallback((id: ReaderArabicFaceId) => {
    setFacesState((prev) => (prev.wirid === id ? prev : { ...prev, wirid: id }))
  }, [])

  const setNadhomFace = useCallback((id: ReaderArabicFaceId) => {
    setFacesState((prev) => (prev.nadhom === id ? prev : { ...prev, nadhom: id }))
  }, [])

  const setLatinFace = useCallback((id: ReaderLatinFaceId) => {
    setFacesState((prev) => (prev.latin === id ? prev : { ...prev, latin: id }))
  }, [])

  const canBumpUp = stepIndex < READER_FONT_STEPS.length - 1
  const canBumpDown = stepIndex > 0
  const canBumpLineUp = lineStepIndex < READER_LINE_HEIGHT_STEPS.length - 1
  const canBumpLineDown = lineStepIndex > 0

  return {
    scale,
    bumpUp,
    bumpDown,
    canBumpUp,
    canBumpDown,
    stepIndex,
    lineHeight,
    lineStepIndex,
    bumpLineUp,
    bumpLineDown,
    canBumpLineUp,
    canBumpLineDown,
    faces,
    setAyatFace,
    setWiridFace,
    setNadhomFace,
    setLatinFace,
  }
}
