import { motion } from 'framer-motion'
import {
  FONT_SIZE_REM_MIN,
  FONT_SIZE_REM_MAX,
  FONT_SIZE_REM_STEP,
  type FontSettings,
} from '../utils/fontSettings'
import {
  LINE_THICKNESS_MIN,
  LINE_THICKNESS_MAX,
  LINE_THICKNESS_STEP,
  type GridViewSettings,
} from '../utils/gridView'

const accordionVariants = {
  closed: {
    height: 0,
    opacity: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
  },
  open: {
    height: 'auto',
    opacity: 1,
    marginBottom: '0.5rem',
    paddingTop: '0.35rem',
    paddingBottom: '0.35rem',
    overflow: 'visible',
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  },
}

function clampRem(value: number) {
  const n = Number(value)
  if (Number.isNaN(n)) return FONT_SIZE_REM_MIN
  return Math.min(FONT_SIZE_REM_MAX, Math.max(FONT_SIZE_REM_MIN, n))
}

function formatRem(value: number) {
  const n = Number(value)
  if (Number.isNaN(n)) return '0.75'
  return n.toFixed(2).replace(/\.?0+$/, '') || '0.75'
}

const FONT_SIZE_ROWS_HIJRI = [
  { sizeKey: 'fontSizeHijriTanggalHijriyah' as const, label: 'Tanggal Hijriyah' },
  { sizeKey: 'fontSizeHijriTanggalMasehi' as const, label: 'Tanggal Masehi' },
  { sizeKey: 'fontSizePasaran' as const, label: 'Pasaran' },
]

const FONT_SIZE_ROWS_MASEHI = [
  { sizeKey: 'fontSizeMasehiTanggalMasehi' as const, label: 'Tanggal Masehi' },
  { sizeKey: 'fontSizeMasehiTanggalHijriyah' as const, label: 'Tanggal Hijriyah' },
  { sizeKey: 'fontSizePasaran' as const, label: 'Pasaran' },
]

type Props = {
  tab?: 'hijri' | 'masehi'
  fontSettings: FontSettings
  onFontSettingsChange: (fn: (prev: FontSettings) => FontSettings) => void
  gridViewSettings?: GridViewSettings
  onGridViewSettingsChange?: (fn: (prev: GridViewSettings) => GridViewSettings) => void
}

export default function KalenderFontAccordion({
  tab = 'hijri',
  fontSettings,
  onFontSettingsChange,
  gridViewSettings = {
    showDateBox: true,
    showHorizontalLines: true,
    showVerticalLines: true,
    lineThicknessHorizontal: 1,
    lineThicknessVertical: 1,
  },
  onGridViewSettingsChange,
}: Props) {
  const update = (key: keyof FontSettings, value: number | string) => {
    onFontSettingsChange((prev) => ({ ...prev, [key]: value }))
  }

  const setGridView = (key: keyof GridViewSettings, value: boolean | number) => {
    onGridViewSettingsChange?.((prev) => ({ ...prev, [key]: value }))
  }

  const changeSize = (key: keyof FontSettings, delta: number) => {
    const current = Number(fontSettings[key]) || 0.75
    update(key, clampRem(current + delta))
  }

  const setSize = (key: keyof FontSettings, value: string | number) => {
    update(key, clampRem(Number(value)))
  }

  const rows = tab === 'masehi' ? FONT_SIZE_ROWS_MASEHI : FONT_SIZE_ROWS_HIJRI

  const gridToggles = [
    { key: 'showDateBox' as const, label: 'Kotak tanggal' },
    { key: 'showHorizontalLines' as const, label: 'Garis horizontal', thicknessKey: 'lineThicknessHorizontal' as const },
    { key: 'showVerticalLines' as const, label: 'Garis vertikal', thicknessKey: 'lineThicknessVertical' as const },
  ]

  const clampLineThickness = (v: unknown) => {
    const n = Number(v)
    if (Number.isNaN(n)) return 1
    return Math.min(LINE_THICKNESS_MAX, Math.max(LINE_THICKNESS_MIN, n))
  }

  const setLineThickness = (key: 'lineThicknessHorizontal' | 'lineThicknessVertical', value: number) => {
    onGridViewSettingsChange?.((prev) => ({ ...prev, [key]: clampLineThickness(value) }))
  }

  const changeLineThickness = (
    key: 'lineThicknessHorizontal' | 'lineThicknessVertical',
    delta: number
  ) => {
    const current = clampLineThickness(gridViewSettings[key])
    setLineThickness(key, current + delta)
  }

  return (
    <motion.div
      className="kalender-pengaturan-accordion"
      initial="closed"
      animate="open"
      exit="closed"
      variants={accordionVariants}
    >
      {rows.map(({ sizeKey, label }) => {
        const sizeValue = Number(fontSettings[sizeKey]) ?? 0.75
        return (
          <div key={sizeKey} className="kalender-pengaturan-accordion__row">
            <label className="kalender-pengaturan-accordion__label">{label}</label>
            <div className="kalender-pengaturan-accordion__controls">
              <div className="kalender-pengaturan-accordion__size">
                <button
                  type="button"
                  className="kalender-pengaturan-accordion__btn"
                  onClick={() => changeSize(sizeKey, -FONT_SIZE_REM_STEP)}
                  aria-label="Kurangi ukuran"
                >
                  −
                </button>
                <input
                  type="number"
                  min={FONT_SIZE_REM_MIN}
                  max={FONT_SIZE_REM_MAX}
                  step={FONT_SIZE_REM_STEP}
                  value={formatRem(sizeValue)}
                  onChange={(e) => setSize(sizeKey, e.target.value)}
                  className="kalender-pengaturan-accordion__input"
                />
                <button
                  type="button"
                  className="kalender-pengaturan-accordion__btn"
                  onClick={() => changeSize(sizeKey, FONT_SIZE_REM_STEP)}
                  aria-label="Tambah ukuran"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )
      })}
      {onGridViewSettingsChange &&
        gridToggles.map(({ key, label, thicknessKey }) => (
          <div key={key} className="kalender-pengaturan-accordion__row kalender-pengaturan-accordion__row--toggle">
            <span className="kalender-pengaturan-accordion__label">{label}</span>
            <div className="kalender-pengaturan-accordion__toggle-with-thickness">
              <label className="kalender-pengaturan-accordion__switch">
                <input
                  type="checkbox"
                  checked={gridViewSettings[key] !== false}
                  onChange={(e) => setGridView(key, e.target.checked)}
                />
                <span className="kalender-pengaturan-accordion__switch-slider" />
              </label>
              {thicknessKey && (
                <div className="kalender-pengaturan-accordion__line-thickness">
                  <div className="kalender-pengaturan-accordion__size">
                    <button
                      type="button"
                      className="kalender-pengaturan-accordion__btn"
                      onClick={() => changeLineThickness(thicknessKey, -LINE_THICKNESS_STEP)}
                      aria-label="Kurangi ketebalan"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={LINE_THICKNESS_MIN}
                      max={LINE_THICKNESS_MAX}
                      step={LINE_THICKNESS_STEP}
                      value={clampLineThickness(gridViewSettings[thicknessKey])}
                      onChange={(e) => setLineThickness(thicknessKey, Number(e.target.value))}
                      className="kalender-pengaturan-accordion__input kalender-pengaturan-accordion__thickness-input"
                      aria-label={`Ketebalan ${label}`}
                    />
                    <button
                      type="button"
                      className="kalender-pengaturan-accordion__btn"
                      onClick={() => changeLineThickness(thicknessKey, LINE_THICKNESS_STEP)}
                      aria-label="Tambah ketebalan"
                    >
                      +
                    </button>
                  </div>
                  <span className="kalender-pengaturan-accordion__thickness-unit">px</span>
                </div>
              )}
            </div>
          </div>
        ))}
    </motion.div>
  )
}
