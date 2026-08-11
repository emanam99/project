import { motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

/** Transisi spring halus untuk konten saat halaman dibuka */
export const pageSpring = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.82,
}

export function pageEnterDelay(index = 0, step = 0.055) {
  return Math.min(index * step, 0.45)
}

/** Judul / intro halaman */
export function PageEnterTitle({ className = '', children }) {
  const reduced = usePrefersReducedMotion()
  if (reduced) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...pageSpring, delay: 0.02 }}
    >
      {children}
    </motion.div>
  )
}

/** Blok konten (kartu, daftar, header) dengan urutan index */
export function PageEnterBlock({ index = 0, className = '', children }) {
  const reduced = usePrefersReducedMotion()
  if (reduced) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...pageSpring, delay: pageEnterDelay(index) }}
    >
      {children}
    </motion.div>
  )
}

/** Wrapper halaman + fade ringan saat loading selesai */
export function PageEnter({ className = '', children }) {
  const reduced = usePrefersReducedMotion()
  if (reduced) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Spinner / state loading */
export function PageEnterLoading({ className = '', children }) {
  const reduced = usePrefersReducedMotion()
  if (reduced) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
