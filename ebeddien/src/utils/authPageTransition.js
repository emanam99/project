/**
 * Variants untuk transisi flip per-elemen antar halaman auth (login/daftar/lupa-password).
 * Parent pakai staggerChildren; setiap section (panel kiri, area form) pakai flip rotateY.
 */

const flipEase = [0.25, 0.46, 0.45, 0.94]

export const authPageParentVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0
    }
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.08,
      staggerDirection: -1
    }
  }
}

export const authPageFlipVariants = {
  hidden: {
    rotateY: 90,
    opacity: 0
  },
  visible: {
    rotateY: 0,
    opacity: 1,
    transition: {
      type: 'tween',
      duration: 0.35,
      ease: flipEase
    }
  },
  exit: {
    rotateY: -90,
    opacity: 0,
    transition: {
      type: 'tween',
      duration: 0.3,
      ease: flipEase
    }
  }
}

export const authPageFlipStyle = {
  transformStyle: 'preserve-3d',
  backfaceVisibility: 'hidden',
  transformOrigin: 'center center'
}
