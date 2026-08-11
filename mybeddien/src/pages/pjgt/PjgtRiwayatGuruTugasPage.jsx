import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { usePjgtGtRiwayat, usePjgtMadrasahId } from '../../hooks/usePjgtCachedResources'
import { GtPenugasanStatusBadge, rowGtAktif } from '../../utils/pjgtGuruTugasPenugasan'

/** Satu baris timeline — selaras offcanvas Riwayat GT di eBeddien Data Madrasah. */
function GtRiwayatRow({ row, isLast }) {
  const aktif = rowGtAktif(row)
  return (
    <li className={`relative flex items-start gap-2 sm:gap-3 pl-2 -ml-px list-none ${!aktif ? 'opacity-70' : ''}`}>
      {!isLast && (
        <span
          className="absolute left-[13px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-600 rounded-full"
          aria-hidden
        />
      )}
      <span
        className={`relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 border-2 border-white dark:border-gray-800 ${
          aktif
            ? 'bg-teal-500 dark:bg-teal-400 ring-teal-100 dark:ring-teal-900/50'
            : 'bg-gray-400 dark:bg-gray-500 ring-gray-100 dark:ring-gray-800/50'
        }`}
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className="min-w-0 flex-1 pt-0.5 pb-4 pr-1"
      >
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span>
            {row.santri_nama || '—'}
            {row.santri_nis != null && String(row.santri_nis).trim() !== '' ? (
              <span className="text-gray-500 dark:text-gray-400 font-normal"> · NIS {row.santri_nis}</span>
            ) : null}
          </span>
          <GtPenugasanStatusBadge aktif={aktif} />
        </p>
        {row.keterangan ? (
          <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 line-clamp-3 leading-snug">{row.keterangan}</p>
        ) : null}
      </motion.div>
    </li>
  )
}

export default function PjgtRiwayatGuruTugasPage() {
  const madrasahId = usePjgtMadrasahId()
  const { rows, loading, error } = usePjgtGtRiwayat()

  const riwayatByTa = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const ta = String(r.id_tahun_ajaran ?? '').trim() || '(Tanpa tahun ajaran)'
      if (!map.has(ta)) map.set(ta, [])
      map.get(ta).push(r)
    }
    return [...map.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0]), undefined, { numeric: true }))
  }, [rows])

  if (!madrasahId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 sm:p-6 max-w-3xl mx-auto"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Akun PJGT belum terhubung ke data madrasah. Hubungkan akun atau login ulang.
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4 pb-10"
    >
      {error && (
        <motion.div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm"
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/40">
          <h2 className="text-xs font-semibold text-gray-800 dark:text-gray-100">Riwayat Guru Tugas di madrasah ini</h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Dikelompokkan per tahun ajaran. Badge hijau = penugasan aktif; kuning = nonaktif (tidak dipakai saat membuat laporan PJGT).
          </p>
        </div>

        <motion.div className="px-4 sm:px-5 py-4">
          {loading ? (
            <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-8">Memuat…</p>
          ) : riwayatByTa.length === 0 ? (
            <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-8">Belum ada penugasan.</p>
          ) : (
            riwayatByTa.map(([ta, taRows], groupIdx) => {
              const jumlahAktif = taRows.filter((r) => rowGtAktif(r)).length
              return (
                <motion.div
                  key={ta}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + groupIdx * 0.04 }}
                  className="mb-6 last:mb-0"
                >
                  <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider mb-3 py-0.5">
                    {ta}
                    <span className="normal-case font-normal text-gray-500 dark:text-gray-400 tracking-normal">
                      {' '}
                      · {taRows.length} orang ({jumlahAktif} aktif
                      {jumlahAktif < taRows.length ? `, ${taRows.length - jumlahAktif} nonaktif` : ''})
                    </span>
                  </p>
                  <ul className="relative list-none p-0 m-0">
                    {taRows.map((r, idx) => (
                      <GtRiwayatRow key={r.id ?? `${ta}-${r.id_santri}-${idx}`} row={r} isLast={idx === taRows.length - 1} />
                    ))}
                  </ul>
                </motion.div>
              )
            })
          )}
        </motion.div>
      </motion.div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
        Data penugasan disinkronkan dengan UGT di eBeddien. Status aktif/nonaktif diatur admin UGT.
      </p>
    </motion.div>
  )
}
