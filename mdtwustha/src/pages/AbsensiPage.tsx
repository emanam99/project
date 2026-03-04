import { motion } from 'framer-motion'

export default function AbsensiPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl"
    >
      <h1 className="text-xl font-bold text-slate-50 tracking-tight mb-2">Absensi</h1>
      <p className="text-slate-400 text-sm">Kelola absensi santri.</p>
    </motion.div>
  )
}
