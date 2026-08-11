import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'nailulMurodReaderFontScale'
const STORAGE_KEY_LINE = 'nailulMurodReaderLineHeight'

/** Skala langkah diskret; 1 = 100% bawaan, maksimum 2 = 200% */
export const READER_FONT_STEPS = [
  0.85, 0.925, 1, 1.075, 1.15, 1.25, 1.35, 1.5, 1.65, 1.8, 1.9, 2,
] as const

/** Line-height tanpa satuan (kerapatan baris isi & terjemahan); minimum 1 */
export const READER_LINE_HEIGHT_STEPS = [1, 1.2, 1.35, 1.5, 1.65, 1.8, 1.95, 2.15] as const

export type ReaderFontStep = (typeof READER_FONT_STEPS)[number]
export type ReaderLineHeightStep = (typeof READER_LINE_HEIGHT_STEPS)[number]

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

export function useReaderFontScale() {
  const [scale, setScaleState] = useState<ReaderFontStep>(() =>
    typeof document !== 'undefined' ? readStoredScale() : 1
  )
  const [lineHeight, setLineHeightState] = useState<ReaderLineHeightStep>(() =>
    typeof document !== 'undefined' ? readStoredLineHeight() : 1.65
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
  }
}
