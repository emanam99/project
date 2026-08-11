import { motion } from 'framer-motion'
import type { SyiirLayoutMode } from '../../contexts/SyiirReaderContext'

type Props = {
  mode: SyiirLayoutMode
  className?: string
}

const transition = { type: 'spring' as const, stiffness: 520, damping: 34 }

/** Ikon morf: paired = dua kolom satu baris; stacked = dua baris kanan/kiri */
export function SyiirLayoutToggleIcon({ mode, className }: Props) {
  const paired = mode === 'paired'

  return (
    <span className={`syiir-layout-toggle-icon-wrap${className ? ` ${className}` : ''}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="syiir-layout-toggle-svg">
        <motion.g
          initial={false}
          animate={{
            opacity: paired ? 1 : 0,
            rotate: paired ? 0 : -8,
            scale: paired ? 1 : 0.82,
          }}
          transition={transition}
          style={{ transformOrigin: '12px 12px' }}
        >
          <rect x="2.5" y="7" width="8.5" height="10" rx="2" fill="currentColor" opacity={0.92} />
          <rect x="13" y="7" width="8.5" height="10" rx="2" fill="currentColor" opacity={0.45} />
        </motion.g>
        <motion.g
          initial={false}
          animate={{
            opacity: paired ? 0 : 1,
            rotate: paired ? 8 : 0,
            scale: paired ? 0.82 : 1,
          }}
          transition={transition}
          style={{ transformOrigin: '12px 12px' }}
        >
          <rect x="3" y="4" width="18" height="7" rx="2" fill="currentColor" opacity={0.92} />
          <rect x="3" y="13" width="18" height="7" rx="2" fill="currentColor" opacity={0.45} />
        </motion.g>
      </svg>
    </span>
  )
}
