import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ugtKompasAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

function formatWaktu(iso) {
  if (!iso) return '—'
  const d = new Date(String(iso).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatCard({ label, value, hint, accent = 'teal', index = 0 }) {
  const card = {
    teal: {
      wrap: 'border-teal-200 bg-gradient-to-br from-teal-50 to-white dark:border-teal-800 dark:from-teal-950/50 dark:to-gray-800',
      value: 'text-teal-700 dark:text-teal-300',
    },
    emerald: {
      wrap: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-800 dark:from-emerald-950/50 dark:to-gray-800',
      value: 'text-emerald-700 dark:text-emerald-300',
    },
    amber: {
      wrap: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-800 dark:from-amber-950/50 dark:to-gray-800',
      value: 'text-amber-700 dark:text-amber-300',
    },
    sky: {
      wrap: 'border-sky-200 bg-gradient-to-br from-sky-50 to-white dark:border-sky-800 dark:from-sky-950/50 dark:to-gray-800',
      value: 'text-sky-700 dark:text-sky-300',
    },
  }[accent]

  return (
    <motion.div
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={`rounded-2xl border p-4 shadow-sm ${card.wrap}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${card.value}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </motion.div>
  )
}

function QuickLink({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-white/20 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-white/30 disabled:pointer-events-none disabled:opacity-40"
    >
      {label}
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

/**
 * @param {{ tahunAjaran: string, fitur?: Record<string, unknown>, onNavigateTab?: (id: string) => void }} props
 */
export default function KompasDashboardTab({ tahunAjaran, fitur = {}, onNavigateTab }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    if (!tahunAjaran) return
    setLoading(true)
    try {
      const res = await ugtKompasAPI.dashboard(tahunAjaran)
      if (res?.success) setData(res.data)
      else {
        setData(null)
        showNotification(res?.message || 'Gagal memuat dashboard', 'error')
      }
    } catch (err) {
      setData(null)
      showNotification(err?.response?.data?.message || 'Gagal memuat dashboard', 'error')
    } finally {
      setLoading(false)
    }
  }, [tahunAjaran, showNotification])

  useEffect(() => {
    load()
  }, [load])

  const summary = data?.summary
  const aturan = data?.aturan
  const perLomba = data?.per_lomba || []
  const recent = data?.recent_daftar || []
  const maxBar = Math.max(1, Number(summary?.max_daftar_per_lomba || 0), 1)

  const statusOpen = aturan?.pendaftaran_terbuka !== false

  const kategoriMix = useMemo(() => {
    const g = Number(summary?.daftar_grup || 0)
    const p = Number(summary?.daftar_perorangan || 0)
    const tot = g + p
    return {
      grup: g,
      perorangan: p,
      grupPct: tot ? Math.round((g / tot) * 100) : 0,
      peroranganPct: tot ? Math.round((p / tot) * 100) : 0,
    }
  }, [summary])

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-700/50" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-gray-200 dark:bg-gray-700/50" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-gray-200 dark:bg-gray-700/50" />
      </div>
    )
  }

  if (!data) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada data dashboard untuk tahun ini.</p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Hero status — teks putih di atas gradien solid (ebeddien: bg-gradient-to-*) */}
      <motion.section
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className={`relative overflow-hidden rounded-2xl border px-5 py-5 text-white shadow-sm sm:px-6 sm:py-6 ${
          statusOpen
            ? 'border-teal-600 bg-gradient-to-br from-emerald-600 via-teal-600 to-teal-800'
            : 'border-amber-600 bg-gradient-to-br from-amber-500 via-orange-600 to-stone-700'
        }`}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
              Dashboard · TA {tahunAjaran}
            </p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {statusOpen ? 'Pendaftaran masih terbuka' : 'Pendaftaran sudah ditutup'}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/90">
              {aturan?.batas_pendaftaran
                ? `Batas terakhir: ${aturan.batas_pendaftaran}`
                : 'Batas pendaftaran belum ditentukan di Aturan Umum.'}
              {aturan?.catatan ? ` · ${aturan.catatan}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {fitur.tabLomba !== false ? (
              <QuickLink
                label="Kelola lomba"
                onClick={() => onNavigateTab?.('lomba')}
                disabled={!onNavigateTab}
              />
            ) : null}
            {fitur.tabDaftar !== false ? (
              <QuickLink
                label="Lihat daftar"
                onClick={() => onNavigateTab?.('daftar')}
                disabled={!onNavigateTab}
              />
            ) : null}
            {fitur.tabAturan !== false ? (
              <QuickLink
                label="Aturan umum"
                onClick={() => onNavigateTab?.('aturan')}
                disabled={!onNavigateTab}
              />
            ) : null}
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Lomba"
          value={summary?.total_lomba ?? 0}
          hint={`${summary?.lomba_dengan_pendaftar ?? 0} sudah ada pendaftar`}
          accent="teal"
        />
        <StatCard
          index={1}
          label="Pendaftaran"
          value={summary?.total_daftar ?? 0}
          hint="Tim / entri madrasah"
          accent="emerald"
        />
        <StatCard
          index={2}
          label="Peserta"
          value={summary?.total_peserta ?? 0}
          hint="Total peserta terdaftar"
          accent="sky"
        />
        <StatCard
          index={3}
          label="Madrasah"
          value={summary?.total_madrasah ?? 0}
          hint="Madrasah unik yang daftar"
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <motion.section
          variants={fadeUp}
          custom={2}
          initial="hidden"
          animate="visible"
          className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5 lg:col-span-3"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pendaftar per lomba</h3>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                Urutan dari paling banyak pendaftar
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              className="text-[11px] font-medium text-teal-600 hover:underline dark:text-teal-400"
            >
              Muat ulang
            </button>
          </div>

          {perLomba.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Belum ada lomba di tahun ini.
            </p>
          ) : (
            <ul className="space-y-3.5">
              {perLomba.map((row) => {
                const pct = Math.round((Number(row.jumlah_daftar || 0) / maxBar) * 100)
                return (
                  <li key={row.id}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                          {row.nama}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          {row.kategori === 'grup'
                            ? `Grup · ${row.anggota_per_kelompok || '—'} orang`
                            : 'Perorangan'}
                          {' · '}Usia {row.usia_min}–{row.usia_max}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                        {row.jumlah_daftar}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400"
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </motion.section>

        <div className="space-y-4 lg:col-span-2">
          <motion.section
            variants={fadeUp}
            custom={3}
            initial="hidden"
            animate="visible"
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Komposisi kategori</h3>
            <p className="mb-4 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              Pendaftaran berdasarkan jenis lomba
            </p>
            <div className="flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className="bg-teal-500 transition-all duration-500"
                style={{ width: `${kategoriMix.grupPct}%` }}
                title={`Grup ${kategoriMix.grupPct}%`}
              />
              <div
                className="bg-sky-500 transition-all duration-500"
                style={{ width: `${kategoriMix.peroranganPct}%` }}
                title={`Perorangan ${kategoriMix.peroranganPct}%`}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 dark:border-teal-900 dark:bg-teal-950/40">
                <p className="text-teal-700 dark:text-teal-300">Grup</p>
                <p className="mt-0.5 font-semibold tabular-nums text-teal-900 dark:text-teal-100">
                  {kategoriMix.grup}{' '}
                  <span className="text-[11px] font-normal">({kategoriMix.grupPct}%)</span>
                </p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950/40">
                <p className="text-sky-700 dark:text-sky-300">Perorangan</p>
                <p className="mt-0.5 font-semibold tabular-nums text-sky-900 dark:text-sky-100">
                  {kategoriMix.perorangan}{' '}
                  <span className="text-[11px] font-normal">({kategoriMix.peroranganPct}%)</span>
                </p>
              </div>
            </div>
          </motion.section>

          <motion.section
            variants={fadeUp}
            custom={4}
            initial="hidden"
            animate="visible"
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pendaftaran terbaru</h3>
            <p className="mb-3 mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">8 entri terakhir</p>
            {recent.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada pendaftaran.</p>
            ) : (
              <ul className="space-y-2.5">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40"
                  >
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {row.nama_madrasah}
                    </p>
                    <p className="truncate text-[11px] text-gray-600 dark:text-gray-400">
                      {row.nama_lomba} · {row.jumlah_peserta} peserta
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-500">
                      {formatWaktu(row.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        </div>
      </div>
    </div>
  )
}
