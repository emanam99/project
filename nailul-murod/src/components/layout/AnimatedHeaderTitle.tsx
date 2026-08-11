import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  title: string
}

export function AnimatedHeaderTitle({ title }: Props) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.h1
        key={title}
        className="topbar-dynamic-title"
        style={{ transformOrigin: '0% 0%' }}
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {title}
      </motion.h1>
    </AnimatePresence>
  )
}
