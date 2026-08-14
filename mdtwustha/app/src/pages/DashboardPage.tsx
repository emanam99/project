import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getDashboard,
  type DashboardData,
} from '../api/apiClient'
import MaterialIcon from '../components/MaterialIcon'
import { useTheme } from '../contexts/ThemeContext'
import { getStoredUser } from '../utils/auth'

const STATUS_META = [
  { key: 'H' as const, label: 'Hadir', color: '#22c55e' },
  { key: 'S' as const, label: 'Sakit', color: '#eab308' },
  { key: 'I' as const, label: 'Izin', color: '#3b82f6' },
  { key: 'A' as const, label: 'Alpa', color: '#ef4444' },
]

const SHORTCUTS = [
  { to: '/absensi', label: 'Absensi', icon: 'fact_check', desc: 'Isi kehadiran' },
  { to: '/nilai', label: 'Nilai', icon: 'edit_note', desc: 'Input & rekap' },
  { to: '/absen-guru', label: 'Absen Guru', icon: 'school', desc: 'Jurnal mengajar' },
  { to: '/data-santri', label: 'Santri', icon: 'groups', desc: 'Data santri' },
  { to: '/kalender', label: 'Kalender', icon: 'calendar_month', desc: 'Hijriyah / Masehi' },
]

function formatTanggalId(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatHariPendek(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
    })
  } catch {
    return iso.slice(5)
  }
}

function hadirPct(slot: { H: number; slot_total: number }): number {
  if (!slot.slot_total) return 0
  return Math.round((slot.H / slot.slot_total) * 1000) / 10
}

function kelasLabel(nama: string, kel: string): string {
  const n = (nama || '').trim()
  const k = (kel || '').trim()
  if (n && k) return `${n} ${k}`
  return n || k || '—'
}

export default function DashboardPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const user = useMemo(() => getStoredUser(), [])
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      const res = await getDashboard()
      if (cancelled) return
      if (!res.success || !res.data) {
        setError(res.message || 'Gagal memuat dashboard')
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const pieData = useMemo(() => {
    if (!data) return []
    return STATUS_META.map((s) => ({
      name: s.label,
      value: data.absen_hari_ini[s.key],
      color: s.color,
    })).filter((d) => d.value > 0)
  }, [data])

  const trenChart = useMemo(() => {
    if (!data) return []
    return data.tren_absen.map((t) => ({
      label: formatHariPendek(t.tanggal),
      hadir: hadirPct(t),
      H: t.H,
      nonH: t.S + t.I + t.A,
    }))
  }, [data])

  const chartAxis = isDark ? '#94a3b8' : '#64748b'
  const chartGrid = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.35)'
  const tooltipStyle = {
    backgroundColor: isDark ? '#1e293b' : '#fff',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
    borderRadius: 12,
    color: isDark ? '#f1f5f9' : '#0f172a',
    fontSize: 12,
  }

  const pctHariIni = data ? hadirPct(data.absen_hari_ini) : 0
  const firstName = (user?.name || 'Pengurus').split(/\s+/)[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="ui-title mb-1">Halo, {firstName}</h1>
          <p className="ui-subtitle">
            {data ? formatTanggalId(data.tanggal) : 'Ringkasan operasional madrasah'}
          </p>
        </div>
        {!loading && data && (
          <p className="text-xs ui-text-muted tabular-nums">
            Data per {data.tanggal}
          </p>
        )}
      </div>

      {error && (
        <div className="ui-error-box px-4 py-3 text-sm">{error}</div>
      )}

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ui-card-sm h-24 animate-pulse bg-slate-200/60 dark:bg-white/5" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiCard
              icon="groups"
              label="Santri aktif"
              value={String(data.counts.santri)}
              accent="from-blue-500/15 to-blue-500/5"
              iconClass="text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              icon="apartment"
              label="Kelas"
              value={String(data.counts.kelas)}
              accent="from-violet-500/15 to-violet-500/5"
              iconClass="text-violet-600 dark:text-violet-400"
            />
            <KpiCard
              icon="fact_check"
              label="Kehadiran hari ini"
              value={`${pctHariIni}%`}
              hint={
                data.absen_hari_ini.H +
                  data.absen_hari_ini.S +
                  data.absen_hari_ini.I +
                  data.absen_hari_ini.A ===
                0
                  ? 'Belum ada yang diabsen'
                  : `${data.absen_hari_ini.H} hadir · ${data.absen_hari_ini.slot_total} slot`
              }
              accent="from-emerald-500/15 to-emerald-500/5"
              iconClass="text-emerald-600 dark:text-emerald-400"
            />
            <KpiCard
              icon="menu_book"
              label="Jurnal hari ini"
              value={String(data.jurnal_hari_ini.total)}
              hint={
                data.jurnal_hari_ini.total
                  ? `${data.jurnal_hari_ini.mengajar} mengajar`
                  : 'Belum ada entri'
              }
              accent="from-amber-500/15 to-amber-500/5"
              iconClass="text-amber-600 dark:text-amber-400"
            />
            <KpiCard
              icon="admin_panel_settings"
              label="Pengurus"
              value={String(data.counts.pengurus)}
              accent="from-slate-500/15 to-slate-500/5"
              iconClass="text-slate-600 dark:text-slate-300"
            />
            <KpiCard
              icon="auto_stories"
              label="Mapel"
              value={String(data.counts.mapel)}
              accent="from-cyan-500/15 to-cyan-500/5"
              iconClass="text-cyan-600 dark:text-cyan-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="ui-card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="ui-text-strong text-base">Status absensi hari ini</h2>
                  <p className="ui-text-muted text-xs mt-0.5">Gabungan jam 1 &amp; 2</p>
                </div>
                <MaterialIcon name="pie_chart" className="text-slate-400" size={22} />
              </div>
              {pieData.length === 0 ? (
                <p className="ui-text-muted text-sm py-10 text-center">Belum ada yang diabsen hari ini</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-full sm:w-1/2 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="w-full sm:w-1/2 space-y-2">
                    {STATUS_META.map((s) => (
                      <li key={s.key} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 ui-text">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.label}
                        </span>
                        <span className="ui-text-strong tabular-nums">
                          {data.absen_hari_ini[s.key]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="ui-card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="ui-text-strong text-base">Tren kehadiran 7 hari</h2>
                  <p className="ui-text-muted text-xs mt-0.5">Persentase slot hadir</p>
                </div>
                <MaterialIcon name="show_chart" className="text-slate-400" size={22} />
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trenChart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hadirGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={chartGrid} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartAxis, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: chartAxis, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      unit="%"
                      width={40}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [`${value}%`, 'Hadir']}
                    />
                    <Area
                      type="monotone"
                      dataKey="hadir"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#hadirGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="ui-card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="ui-text-strong text-base">Kehadiran per kelas</h2>
                <p className="ui-text-muted text-xs mt-0.5">Hari ini · slot jam 1 &amp; 2</p>
              </div>
              <Link to="/absensi" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Buka absensi
              </Link>
            </div>
            <div className="ui-table-wrap !shadow-none">
              <table className="w-full text-sm">
                <thead className="ui-table-head">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium">Kelas</th>
                    <th className="text-right px-3 py-2.5 font-medium">Santri</th>
                    <th className="text-right px-3 py-2.5 font-medium">Hadir</th>
                  </tr>
                </thead>
                <tbody className="ui-table-body">
                  {data.per_kelas.map((k) => (
                    <tr key={k.kelas_id} className="ui-table-row">
                      <td className="px-3 py-2.5 ui-text-strong">{kelasLabel(k.nama_kelas, k.kel)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{k.santri}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`inline-flex items-center justify-end min-w-[3.25rem] tabular-nums font-semibold ${
                            k.hadir_pct >= 90
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : k.hadir_pct >= 75
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {k.hadir_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.per_kelas.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center ui-text-muted">
                        Belum ada kelas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="ui-text-strong text-base mb-3">Akses cepat</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {SHORTCUTS.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  className="ui-card-sm flex flex-col gap-2 hover:border-blue-400/40 dark:hover:border-blue-400/30 transition group"
                >
                  <span className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-500/15 transition">
                    <MaterialIcon name={s.icon} size={20} />
                  </span>
                  <span className="ui-text-strong text-sm leading-tight">{s.label}</span>
                  <span className="ui-text-muted text-xs">{s.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
  iconClass,
}: {
  icon: string
  label: string
  value: string
  hint?: string
  accent: string
  iconClass: string
}) {
  return (
    <div className={`ui-card-sm bg-gradient-to-br ${accent}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="ui-text-muted text-xs sm:text-sm leading-snug">{label}</p>
        <MaterialIcon name={icon} className={iconClass} size={20} />
      </div>
      <p className="text-2xl font-bold ui-text-strong mt-2 tabular-nums tracking-tight">{value}</p>
      {hint && <p className="ui-text-muted text-xs mt-1">{hint}</p>}
    </div>
  )
}
