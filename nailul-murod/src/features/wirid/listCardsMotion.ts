import type { Variants } from 'framer-motion'

/** Kontainer grid kartu list bab / list judul — anak muncul bergantian */
export const listCardsContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.07,
    },
  },
}

export const listCardsItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 34,
      mass: 0.65,
    },
  },
}
