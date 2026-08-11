import { motion } from 'framer-motion'

export default function JadwalPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl"
    >
      <h1 className="ui-title mb-2">Jadwal</h1>
      <p className="ui-subtitle">Jadwal kegiatan dan pelajaran.</p>
    </motion.div>
  )
}
