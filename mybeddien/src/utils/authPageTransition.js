/**
 * Variants transisi antar halaman auth (login / daftar), selaras eBeddien.
 */

const flipEase = [0.25, 0.46, 0.45, 0.94]

export const authPageFlipVariants = {
  hidden: {
    rotateY: 90,
    opacity: 0,
  },
  visible: {
    rotateY: 0,
    opacity: 1,
    transition: {
      type: 'tween',
      duration: 0.35,
      ease: flipEase,
    },
  },
  exit: {
    rotateY: -90,
    opacity: 0,
    transition: {
      type: 'tween',
      duration: 0.3,
      ease: flipEase,
    },
  },
}

export const authPageFlipStyle = {
  transformStyle: 'preserve-3d',
  backfaceVisibility: 'hidden',
  transformOrigin: 'center center',
}
