import { Children, isValidElement, forwardRef } from 'react'
import { motion } from 'framer-motion'
import './animista-flip-scale-up-hor.css'

const EASE = [0.25, 0.46, 0.45, 0.94]

/** Container: anak muncul berurutan. */
export const staggerRevealContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.065, delayChildren: 0.06 },
  },
}

/** Baris / blok (tanpa geser) — judul di dalam pakai RevealTitle/RevealLabel. */
export const staggerRevealRow = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: EASE },
  },
}

/** Animista flip-scale-up-hor untuk teks judul (selaras keyframe CSS). */
export const flipScaleUpHorItem = {
  hidden: {
    scale: 1,
    rotateY: 0,
    opacity: 1,
  },
  visible: {
    scale: [1, 2.5, 1],
    rotateY: [0, -90, -180],
    transition: { duration: 0.5, times: [0, 0.5, 1], ease: 'linear' },
  },
}

const titleMotionStyle = {
  display: 'block',
  transformStyle: 'preserve-3d',
  backfaceVisibility: 'hidden',
}

export const RevealLabel = forwardRef(function RevealLabel({ className, children, ...rest }, ref) {
  return (
    <motion.label
      ref={ref}
      className={className}
      variants={flipScaleUpHorItem}
      style={titleMotionStyle}
      {...rest}
    >
      {children}
    </motion.label>
  )
})

export const RevealTitle = forwardRef(function RevealTitle(
  { as: Tag = 'span', className, children, ...rest },
  ref
) {
  const MotionTag = motion[Tag] ?? motion.span
  return (
    <MotionTag
      ref={ref}
      className={className}
      variants={flipScaleUpHorItem}
      style={titleMotionStyle}
      {...rest}
    >
      {children}
    </MotionTag>
  )
})

export function StaggerReveal({ children, className, animateKey, style, ...rest }) {
  return (
    <motion.div
      key={animateKey}
      className={className}
      variants={staggerRevealContainer}
      initial="hidden"
      animate="visible"
      style={{ perspective: 800, ...style }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

export const StaggerRevealItem = forwardRef(function StaggerRevealItem({ children, className, ...rest }, ref) {
  return (
    <motion.div ref={ref} className={className} variants={staggerRevealRow} {...rest}>
      {children}
    </motion.div>
  )
})

/**
 * Membungkus tiap anak langsung dengan baris stagger; label/judul di dalam pakai RevealLabel/RevealTitle.
 */
export function StaggerRevealList({ children, className, animateKey, style, ...rest }) {
  const items = Children.toArray(children).filter((c) => {
    if (c == null || c === false) return false
    if (typeof c === 'string') return c.trim() !== ''
    return true
  })

  return (
    <motion.div
      key={animateKey}
      className={className}
      variants={staggerRevealContainer}
      initial="hidden"
      animate="visible"
      style={{ perspective: 800, ...style }}
      {...rest}
    >
      {items.map((child, i) => {
        const key =
          isValidElement(child) && child.key != null && child.key !== ''
            ? String(child.key)
            : `stagger-${i}`
        return (
          <motion.div key={key} variants={staggerRevealRow}>
            {child}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
