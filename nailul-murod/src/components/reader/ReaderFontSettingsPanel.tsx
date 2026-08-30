import { AnimatePresence, motion } from 'framer-motion'

import { useEffect, useState } from 'react'

import { ReaderDisplaySettings, type ReaderDisplaySettingsProps } from './ReaderDisplaySettings'



type Props = Pick<

  ReaderDisplaySettingsProps,

  | 'scale'

  | 'stepIndex'

  | 'onBumpDown'

  | 'onBumpUp'

  | 'canBumpDown'

  | 'canBumpUp'

  | 'lineHeight'

  | 'lineStepIndex'

  | 'onBumpLineDown'

  | 'onBumpLineUp'

  | 'canBumpLineDown'

  | 'canBumpLineUp'

  | 'faces'

  | 'onAyatFace'

  | 'onWiridFace'

  | 'onNadhomFace'

  | 'onLatinFace'

> & {

  open: boolean

  onClose: () => void

}



const backdropTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }



const springTransition = {

  type: 'spring' as const,

  damping: 26,

  stiffness: 320,

  mass: 0.78,

}



export function ReaderFontSettingsPanel({ open, onClose, ...displayProps }: Props) {

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

            <ReaderDisplaySettings variant="panel" {...displayProps} />

            <button type="button" className="theme-btn reader-font-panel-close" onClick={onClose}>

              Tutup

            </button>

          </motion.div>

        </motion.div>

      )}

    </AnimatePresence>

  )

}

