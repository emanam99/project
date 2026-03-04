import { motion } from 'framer-motion'

export default function DashboardPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl"
    >
      <h1 className="text-xl font-bold text-slate-50 tracking-tight mb-2">Dashboard</h1>
      <p className="text-slate-400 text-sm mb-6">Ringkasan dan statistik utama.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
          <p className="text-slate-400 text-sm">Santri</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">–</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
          <p className="text-slate-400 text-sm">Kehadiran Hari Ini</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">–</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
          <p className="text-slate-400 text-sm">Pembayaran Bulan Ini</p>
          <p className="text-lg font-semibold text-slate-100 mt-1">–</p>
        </div>
      </div>
    </motion.div>
  )
}
