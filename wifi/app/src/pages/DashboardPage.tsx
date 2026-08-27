import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchDashboard,
  type DashboardData,
  type DashboardTrendPoint,
  type RekapItem,
} from '../api/apiClient'
import OffcanvasDetailTagihanPelanggan from '../components/OffcanvasDetailTagihanPelanggan'
import { usePageTitle } from '../contexts/PageTitleContext'
import { getStoredUser } from '../utils/auth'
import { formatDateId, formatRp } from '../utils/format'
import { labelPeriode } from '../utils/tagihanSettings'

const BULAN_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

const CHART = {
  accent: '#2a96e0',
  ok: '#22a06b',
  warn: '#d97706',
  danger: '#c03545',
  muted: '#7d93a6',
  soft: '#94a3b8',
}

function useChartColors() {
  const dark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return {
    ...CHART,
    accent: dark ? '#4eb6f0' : '#2a96e0',
    grid: dark ? '#243445' : '#cddcea',
    tick: dark ? '#9bb0c4' : '#5a7388',
    tooltipBg: dark ? '#182636' : '#ffffff',
    tooltipBorder: dark ? '#243445' : '#cddcea',
  }
}

function formatCompactRp(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}rb`
  return String(Math.round(n))
}

function DeltaBadge({
  delta,
  deltaPct,
  invert = false,
}: {
  delta?: number
  deltaPct?: number | null
  /** true = naik jelek (sisa/terlambat) */
  invert?: boolean
}) {
  if (delta == null && (deltaPct == null || Number.isNaN(deltaPct))) {
    return <span className="text-[10px] text-muted">vs bln lalu</span>
  }
  const d = delta ?? 0
  const flat = Math.abs(d) < 0.00001 && (deltaPct == null || Math.abs(deltaPct) < 0.05)
  if (flat) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted">
        → stabil
      </span>
    )
  }
  const up = d > 0
  const good = invert ? !up : up
  const arrow = up ? '↑' : '↓'
  const cls = good
    ? 'text-[var(--ok-ink)] bg-[var(--ok-bg)]'
    : 'text-amber-800 dark:text-amber-200 bg-amber-500/15'

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {arrow}
      {deltaPct != null ? `${Math.abs(deltaPct).toFixed(1)}%` : formatCompactRp(Math.abs(d))}
      <span className="opacity-70 font-medium">vs bln lalu</span>
    </span>
  )
}

function StatCard({
  label,
  value,
  hint,
  tren,
  invertTrend = false,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tren?: DashboardTrendPoint
  invertTrend?: boolean
  tone?: 'default' | 'ok' | 'warn' | 'accent'
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-[var(--ok-ink)]'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'accent'
          ? 'text-[var(--accent)]'
          : 'text-ink'

  return (
    <div className="ui-card p-3 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]" />
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-[17px] font-semibold tabular-nums mt-0.5 tracking-tight ${toneClass}`}>{value}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {tren && <DeltaBadge delta={tren.delta} deltaPct={tren.delta_pct} invert={invertTrend} />}
        {hint && <span className="text-[10px] text-muted">{hint}</span>}
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`ui-card p-3 flex flex-col min-h-0 ${className}`}>
      <div className="mb-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 min-h-[12rem]">{children}</div>
    </div>
  )
}

function tooltipStyle(colors: ReturnType<typeof useChartColors>) {
  return {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: 10,
    fontSize: 12,
    color: 'var(--ink)',
  }
}

export default function DashboardPage() {
  usePageTitle('Dashboard')
  const user = getStoredUser()
  const colors = useChartColors()
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<RekapItem | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetchDashboard({ periode_bulan: bulan, periode_tahun: tahun })
    if (res.success && res.data) {
      setData(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat dashboard')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulan, tahun])

  const greetName = (user?.name || '').trim() || user?.email?.split('@')[0] || 'Admin'
  const periodeLabel = labelPeriode(bulan, tahun)
  const p = data?.periode
  const pel = data?.pelanggan
  const bayar = data?.pembayaran
  const tren = data?.tren
  const charts = data?.charts

  const bulananChart = useMemo(
    () =>
      (charts?.bulanan ?? []).map((r) => ({
        ...r,
        name: `${BULAN_SHORT[r.periode_bulan]}`,
      })),
    [charts],
  )

  const statusChart = useMemo(() => {
    const rows = (charts?.status ?? []).filter((s) => s.value > 0)
    return rows.length ? rows : [{ key: 'empty', label: 'Kosong', value: 1 }]
  }, [charts])

  const statusColors: Record<string, string> = {
    lunas: CHART.ok,
    belum: CHART.warn,
    terlambat: CHART.danger,
    empty: CHART.soft,
  }

  const viaChart = useMemo(() => {
    const rows = (charts?.via ?? []).filter((v) => v.value > 0)
    return rows.length ? rows : [{ key: 'empty', label: 'Belum ada', value: 1 }]
  }, [charts])

  const viaColors: Record<string, string> = {
    cash: CHART.accent,
    tf: '#8b5cf6',
    empty: CHART.soft,
  }

  const koleksiPct = p?.koleksi_pct ?? 0

  return (
    <div className="space-y-3.5 pb-4">
      <div className="ui-card p-3.5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted uppercase tracking-wide font-semibold">Dashboard</div>
          <h1 className="text-[18px] font-semibold text-ink mt-0.5 truncate">Halo, {greetName}</h1>
          <p className="text-[13px] text-muted mt-1">
            Tren & koleksi · {periodeLabel}
            {loading ? ' · memuat…' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="ui-label">Bulan</label>
            <select className="ui-input" value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
              {BULAN_SHORT.slice(1).map((b, i) => (
                <option key={b} value={i + 1}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label">Tahun</label>
            <input
              className="ui-input w-24"
              type="number"
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {error && <div className="ui-alert-error">{error}</div>}

      {loading && !data ? (
        <div className="ui-card p-8 text-center text-[13px] text-muted">Memuat dashboard…</div>
      ) : data && p && pel && bayar ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatCard
              label="Kewajiban"
              value={formatRp(p.total_kewajiban)}
              hint={`${p.jumlah_tagihan} tagihan`}
              tren={tren?.kewajiban}
            />
            <StatCard
              label="Terbayar"
              value={formatRp(p.total_terbayar)}
              hint={`${p.jumlah_lunas} pelanggan lunas`}
              tren={tren?.terbayar}
              tone="ok"
            />
            <StatCard
              label="Sisa"
              value={formatRp(p.total_sisa)}
              hint={`${p.jumlah_belum} belum lunas`}
              tren={tren?.sisa}
              invertTrend
              tone={p.total_sisa > 0 ? 'warn' : 'ok'}
            />
            <StatCard
              label="Koleksi"
              value={`${koleksiPct.toFixed(1)}%`}
              hint="terbayar / kewajiban"
              tren={tren?.koleksi_pct}
              tone={koleksiPct >= 80 ? 'ok' : koleksiPct >= 50 ? 'accent' : 'warn'}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatCard label="Pelanggan aktif" value={String(pel.aktif)} hint={`${pel.total} total`} tone="accent" />
            <StatCard
              label="Bayar hari ini"
              value={formatRp(bayar.hari_ini_total)}
              hint={
                bayar.hari_ini_delta_pct != null
                  ? `${bayar.hari_ini_jumlah} trx · ${bayar.hari_ini_delta_pct >= 0 ? '+' : ''}${bayar.hari_ini_delta_pct}% vs kmrn`
                  : `${bayar.hari_ini_jumlah} transaksi`
              }
            />
            <StatCard
              label="Bayar bulan ini"
              value={formatRp(bayar.periode_total)}
              hint={`${bayar.periode_jumlah} transaksi (tgl bayar)`}
            />
            <StatCard
              label="Terlambat"
              value={String(p.jumlah_terlambat)}
              hint="pelanggan lewat tempo"
              tren={tren?.terlambat}
              invertTrend
              tone={p.jumlah_terlambat > 0 ? 'warn' : 'default'}
            />
          </div>

          {/* Progress koleksi */}
          <div className="ui-card p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <div className="text-[13px] font-semibold text-ink">Progress koleksi</div>
                <div className="text-[11px] text-muted">
                  {formatRp(p.total_terbayar)} dari {formatRp(p.total_kewajiban)}
                </div>
              </div>
              <div className="text-[15px] font-semibold tabular-nums text-[var(--accent)]">
                {koleksiPct.toFixed(1)}%
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-surface-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, koleksiPct))}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <ChartCard title="Tren 6 bulan" subtitle="Kewajiban vs terbayar vs sisa">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={bulananChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gTerbayar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.ok} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART.ok} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gKewajiban" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.accent} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={formatCompactRp}
                    tick={{ fill: colors.tick, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle(colors)}
                    formatter={(v: number, name: string) => [formatRp(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="kewajiban"
                    name="Kewajiban"
                    stroke={colors.accent}
                    fill="url(#gKewajiban)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="terbayar"
                    name="Terbayar"
                    stroke={CHART.ok}
                    fill="url(#gTerbayar)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="sisa"
                    name="Sisa"
                    stroke={CHART.warn}
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Pembayaran 14 hari" subtitle="Cash vs transfer per tanggal">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts?.harian ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: colors.tick, fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={formatCompactRp}
                    tick={{ fill: colors.tick, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle(colors)}
                    formatter={(v: number, name: string) => [formatRp(v), name]}
                    labelFormatter={(_, payload) => {
                      const t = payload?.[0]?.payload?.tanggal
                      return t ? formatDateId(t) : ''
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="cash" name="Cash" stackId="a" fill={colors.accent} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="tf" name="Transfer" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <ChartCard title="Status pelanggan" subtitle={`Periode ${periodeLabel}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChart}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {statusChart.map((entry) => (
                      <Cell key={entry.key} fill={statusColors[entry.key] || CHART.muted} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle(colors)}
                    formatter={(v: number, name: string) => [v, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Via pembayaran" subtitle="Bulan kalender aktif">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={viaChart}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {viaChart.map((entry) => (
                      <Cell key={entry.key} fill={viaColors[entry.key] || CHART.muted} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle(colors)}
                    formatter={(v: number, name: string) => [formatRp(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Koleksi % / bulan" subtitle="6 bulan terakhir">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bulananChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: colors.tick, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle(colors)}
                    formatter={(v: number) => [`${v}%`, 'Koleksi']}
                  />
                  <Bar dataKey="koleksi_pct" name="Koleksi" radius={[6, 6, 0, 0]}>
                    {bulananChart.map((row, i) => (
                      <Cell
                        key={`${row.label}-${i}`}
                        fill={row.koleksi_pct >= 80 ? CHART.ok : row.koleksi_pct >= 50 ? colors.accent : CHART.warn}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { to: '/tagihan', label: 'Tagihan', desc: 'Kelola per pelanggan' },
                { to: '/pelanggan', label: 'Pelanggan', desc: 'Data & email akses' },
                { to: '/rekap', label: 'Rekap', desc: 'Rekap & tagihan masal' },
                { to: '/pengaturan', label: 'Pengaturan', desc: 'Tema & jatuh tempo' },
              ] as const
            ).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="ui-card p-3 transition hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"
              >
                <div className="text-[13px] font-semibold text-ink">{item.label}</div>
                <div className="text-[11px] text-muted mt-0.5">{item.desc}</div>
              </Link>
            ))}
          </div>

          <div className="ui-card overflow-hidden">
            <div className="px-3 py-2.5 border-b border-line flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-semibold text-ink">Belum lunas</h2>
                <p className="text-[11px] text-muted">
                  Prioritas terlambat & sisa terbesar · {periodeLabel}
                </p>
              </div>
              <Link to="/rekap" className="text-[12px] font-semibold text-[var(--accent)]">
                Lihat rekap
              </Link>
            </div>
            {data.belum_lunas.length === 0 ? (
              <div className="p-4 text-[13px] text-muted">Semua pelanggan periode ini sudah lunas.</div>
            ) : (
              <ul className="divide-y divide-line">
                {data.belum_lunas.map((row) => {
                  const pct =
                    row.nominal > 0 ? Math.min(100, Math.round((row.total_bayar / row.nominal) * 100)) : 0
                  return (
                    <li key={row.pelanggan_id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-soft transition"
                        onClick={() =>
                          setDetail({
                            pelanggan_id: row.pelanggan_id,
                            nama_pelanggan: row.nama_pelanggan,
                            jumlah_tagihan: row.jumlah_tagihan,
                            nominal: row.nominal,
                            total_bayar: row.total_bayar,
                            sisa: row.sisa,
                            lunas: row.lunas,
                            jatuh_tempo: row.jatuh_tempo,
                            periode_bulan: row.periode_bulan,
                            periode_tahun: row.periode_tahun,
                          })
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[13px] font-semibold text-ink truncate">
                                {row.nama_pelanggan}
                              </span>
                              {row.terlambat && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                  Terlambat
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted mt-0.5">
                              {row.jumlah_tagihan} tagihan
                              {row.jatuh_tempo ? ` · jatuh ${formatDateId(row.jatuh_tempo)}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[13px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
                              {formatRp(row.sisa)}
                            </div>
                            <div className="text-[11px] text-muted tabular-nums">{pct}% bayar</div>
                          </div>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-surface-soft overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <OffcanvasDetailTagihanPelanggan
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        pelangganId={detail?.pelanggan_id ?? null}
        pelangganNama={detail?.nama_pelanggan ?? ''}
        periodeBulan={bulan}
        periodeTahun={tahun}
        ringkas={
          detail
            ? {
                jumlah_tagihan: detail.jumlah_tagihan,
                nominal: detail.nominal,
                total_bayar: detail.total_bayar,
                sisa: detail.sisa,
              }
            : undefined
        }
        onChanged={() => void load()}
      />
    </div>
  )
}
