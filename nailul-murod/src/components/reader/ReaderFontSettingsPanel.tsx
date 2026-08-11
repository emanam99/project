import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { READER_FONT_STEPS, READER_LINE_HEIGHT_STEPS } from '../../hooks/useReaderFontScale'

type Props = {
  open: boolean
  onClose: () => void
  scale: number
  stepIndex: number
  onBumpDown: () => void
  onBumpUp: () => void
  canBumpDown: boolean
  canBumpUp: boolean
  lineHeight: number
  lineStepIndex: number
  onBumpLineDown: () => void
  onBumpLineUp: () => void
  canBumpLineDown: boolean
  canBumpLineUp: boolean
}

const backdropTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }

const springTransition = {
  type: 'spring' as const,
  damping: 26,
  stiffness: 320,
  mass: 0.78,
}

function lineHeightLabel(i: number) {
  if (i === 0) return 'Sangat rapat'
  if (i <= 2) return 'Rapat'
  if (i === 3) return 'Sedang'
  if (i === 4) return 'Standar'
  if (i <= 5) return 'Lega'
  return 'Sangat lega'
}

export function ReaderFontSettingsPanel({
  open,
  onClose,
  scale,
  stepIndex,
  onBumpDown,
  onBumpUp,
  canBumpDown,
  canBumpUp,
  lineHeight,
  lineStepIndex,
  onBumpLineDown,
  onBumpLineUp,
  canBumpLineDown,
  canBumpLineUp,
}: Props) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 961px)').matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 961px)')
    const fn = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const label =
    stepIndex <= 1
      ? 'Kecil'
      : stepIndex === 2
        ? 'Standar'
        : stepIndex <= 5
          ? 'Besar'
          : stepIndex <= 9
            ? 'Sangat besar'
            : 'Maksimum'

  const panelHidden = isDesktop
    ? { opacity: 0, scale: 0.96, y: -20 }
    : { opacity: 0, y: '115%' as const, scale: 1 }
  const panelVisible = { opacity: 1, scale: 1, y: 0 }
  const panelExit = isDesktop
    ? { opacity: 0, scale: 0.96, y: -14 }
    : { opacity: 0.96, y: '115%' as const, scale: 1 }

  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => {
        document.body.style.overflow = ''
      }}
    >
      {open && (
        <motion.div
          key="reader-font-backdrop"
          className="reader-font-panel-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
          onClick={onClose}
        >
          <motion.div
            key="reader-font-panel"
            className="reader-font-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-font-panel-title"
            initial={panelHidden}
            animate={panelVisible}
            exit={panelExit}
            transition={springTransition}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reader-font-panel-title" className="reader-font-panel-title">
              Teks pembaca
            </h2>
            <p className="reader-font-panel-meta">
              Ukuran: {label} · {Math.round(scale * 100)}%
            </p>
            <div className="reader-font-panel-row">
              <button type="button" className="theme-btn reader-font-bump" disabled={!canBumpDown} onClick={onBumpDown}>
                A−
              </button>
              <div className="reader-font-steps" aria-hidden="true">
                {READER_FONT_STEPS.map((s, i) => (
                  <span key={s} className={`reader-font-step-dot${i === stepIndex ? ' active' : ''}`} />
                ))}
              </div>
              <button type="button" className="theme-btn reader-font-bump" disabled={!canBumpUp} onClick={onBumpUp}>
                A+
              </button>
            </div>
            <hr className="reader-font-panel-divider" />
            <h3 className="reader-font-panel-section">Renggang baris dalam paragraf</h3>
            <p className="reader-font-panel-meta">
              {lineHeightLabel(lineStepIndex)} · {lineHeight.toFixed(2).replace('.', ',')}{' '}
              
            </p>
            <div className="reader-font-panel-row">
              <button
                type="button"
                className="theme-btn reader-font-bump"
                disabled={!canBumpLineDown}
                onClick={onBumpLineDown}
                title="Perpendek jarak antar baris"
                aria-label="Perpendek jarak antar baris"
              >
                ≡−
              </button>
              <div className="reader-font-steps" aria-hidden="true">
                {READER_LINE_HEIGHT_STEPS.map((s, i) => (
                  <span key={s} className={`reader-font-step-dot${i === lineStepIndex ? ' active' : ''}`} />
                ))}
              </div>
              <button
                type="button"
                className="theme-btn reader-font-bump"
                disabled={!canBumpLineUp}
                onClick={onBumpLineUp}
                title="Perpanjang jarak antar baris"
                aria-label="Perpanjang jarak antar baris"
              >
                ≡+
              </button>
            </div>
            <button type="button" className="theme-btn reader-font-panel-close" onClick={onClose}>
              Tutup
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
