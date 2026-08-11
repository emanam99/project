import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import MaterialIcon from '../components/MaterialIcon'

const REKAP_CARDS = [
  {
    to: '/absen-guru/rekap',
    icon: 'analytics',
    title: 'Rekap Absen Guru',
    desc: 'Ringkasan jumlah mengajar, izin, dan sakit per guru berdasarkan jurnal (Jam 1 & Jam 2).',
  },
  {
    to: '/absen-guru/jurnal-rekap',
    icon: 'assignment',
    title: 'Rekap Jurnal Mengajar',
    desc: 'Daftar rinci setiap entri jurnal: tanggal, kelas, guru, pelajaran, dan alasan.',
  },
]

export default function AbsenGuruPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-4xl"
    >
      <div>
        <h1 className="ui-title-lg">Absen Guru</h1>
        <p className="ui-subtitle mt-1">
          Kehadiran guru dihitung dari jurnal mengajar di halaman Absensi. Isi jurnal sebelum absen santri.
        </p>
      </div>

      <div className="ui-card p-4 sm:p-5">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Untuk Guru</h2>
        <p className="text-sm ui-text-muted mb-4">
          Buka menu <strong>Absensi</strong>, pilih kelas, lalu isi <strong>Jurnal Mengajar</strong> (pelajaran, izin,
          atau sakit) untuk Jam 1 dan Jam 2 sebelum mencatat kehadiran santri.
        </p>
        <Link
          to="/absensi"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
        >
          <MaterialIcon name="fact_check" size={20} /> Ke halaman Absensi
        </Link>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">Rekap</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {REKAP_CARDS.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="ui-card p-5 hover:border-blue-500/40 transition group"
            >
              <MaterialIcon name={card.icon} size={32} className="mb-3 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                {card.title}
              </h3>
              <p className="text-sm ui-text-muted mt-1.5">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
