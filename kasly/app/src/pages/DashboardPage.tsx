import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardSummary, type DashboardSummary } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { canManageData, getStoredUser, jenisBase } from '../utils/auth'
import { formatDateId, formatRp } from '../utils/format'

function DailyAreaChart({
  points,
}: {
  points: Array<{ tanggal: string; total: number }>
}) {
  const w = 320
  const h = 140
  const padX = 4
  const padY = 14
  const max = Math.max(...points.map((p) => p.total), 1)
  const step = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0

  const coords = points.map((p, i) => {
    const x = padX + i * step
    const y = h - padY - (p.total / max) * (h - padY * 2)
    return { x, y, ...p }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L${coords[coords.length - 1]?.x ?? padX},${h - padY} L${padX},${h - padY} Z`

  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full max-w-full h-auto aspect-[320/140]"
        role="img"
        aria-label="Grafik belanja 14 hari"
      >
        <defs>
          <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => {
          const y = padY + (1 - t) * (h - padY * 2)
          return <line key={t} x1={padX} x2={w - padX} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
        })}
        <path d={area} fill="url(#dashArea)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c) => (
          <circle
            key={c.tanggal}
            cx={c.x}
            cy={c.y}
            r={c.total > 0 ? 2.6 : 1.6}
            fill="var(--accent)"
            opacity={c.total > 0 ? 1 : 0.35}
          />
        ))}
      </svg>
    </div>
  )
}

function shortDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`)
  return d.toLocaleDateString('id-ID', { weekday: 'short' }).replace('.', '')
}

function DailyChartLabels({ dates }: { dates: string[] }) {
  const showIndex = (i: number) => i === 0 || i === dates.length - 1 || i % 3 === 0

  return (
    <div
      className="mt-1 grid w-full min-w-0 text-[9px] sm:text-[10px] text-muted"
      style={{ gridTemplateColumns: `repeat(${Math.max(dates.length, 1)}, minmax(0, 1fr))` }}
    >
      {dates.map((tanggal, i) => (
        <span key={tanggal} className="min-w-0 text-center truncate">
          {showIndex(i) ? shortDay(tanggal) : ''}
        </span>
      ))}
    </div>
  )
}

function HomeAction({
  to,
  label,
  tone,
  children,
}: {
  to: string
  label: string
  tone: 'in' | 'out' | 'neutral'
  children: ReactNode
}) {
  const ring =
    tone === 'in'
      ? 'bg-[color-mix(in_srgb,var(--ok-ink)_14%,var(--surface-soft))] text-[var(--ok-ink)]'
      : tone === 'out'
        ? 'bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface-soft))] text-[var(--accent)]'
        : 'bg-surface-soft text-ink'

  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 min-w-[4.5rem] group">
      <span
        className={`grid h-12 w-12 place-items-center rounded-full shadow-sm border border-line ${ring} group-active:scale-95 transition`}
      >
        {children}
      </span>
      <span className="text-[11px] font-semibold text-ink text-center leading-tight">{label}</span>
    </Link>
  )
}

function HorizonBars({
  rows,
}: {
  rows: Array<{ nama: string; total: number }>
}) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.nama} className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
            <span className="text-[12px] font-semibold text-ink truncate">{row.nama}</span>
            <span className="text-[12px] font-semibold text-ink tabular-nums whitespace-nowrap shrink-0">{formatRp(row.total)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-soft overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${Math.max(4, (row.total / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function DashboardPage() {
  usePageTitle('Beranda')
  const canManage = canManageData(getStoredUser()?.role)
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const res = await getDashboardSummary()
      if (res.success && res.data) {
        setData(res.data)
        setError('')
      } else {
        setError(res.message || 'Gagal memuat ringkasan')
      }
      setLoading(false)
    })()
  }, [])

  const peakDay = useMemo(() => {
    if (!data?.daily?.length) return null
    return data.daily.reduce((best, cur) => (cur.keluar > best.keluar ? cur : best), data.daily[0])
  }, [data])

  if (loading) return <div className="text-muted text-[13px]">Memuat beranda…</div>
  if (error) return <div className="ui-alert-error">{error}</div>
  if (!data) return null

  const kpis = [
    {
      label: 'Masuk bulan ini',
      value: formatRp(data.masuk_bulan_ini),
      hint: `Hari ini ${formatRp(data.masuk_hari_ini)}`,
    },
    {
      label: 'Keluar bulan ini',
      value: formatRp(data.keluar_bulan_ini),
      hint: `Rata ${formatRp(data.rata_keluar_harian)}/hari`,
    },
    {
      label: 'Keluar hari ini',
      value: formatRp(data.keluar_hari_ini),
      hint: `${data.catatan_hari_ini} catatan hari ini`,
    },
  ]

  return (
    <div className="space-y-3.5 min-w-0 max-w-full overflow-x-hidden">
      <section
        className="relative overflow-hidden rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-white shadow-md"
        style={{
          background:
            'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 55%, #7a1048) 100%)',
        }}
      >
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-black/10" />
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">Saldo</div>
          <div className="mt-1.5 font-display text-[1.85rem] sm:text-[2.15rem] font-bold leading-none tabular-nums tracking-tight">
            {formatRp(data.saldo)}
          </div>
          <div className="mt-2 text-[12px] text-white/80">{data.jumlah_catatan} catatan</div>
        </div>
      </section>

      <div className="flex items-start justify-around sm:justify-center sm:gap-10 px-2">
        {canManage && (
          <>
            <HomeAction to="/masuk/baru" label="Uang masuk" tone="in">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                <path d="M12 4v12" strokeLinecap="round" />
                <path d="M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 20h14" strokeLinecap="round" />
              </svg>
            </HomeAction>
            <HomeAction to="/keluar/baru" label="Catat belanja" tone="out">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none" />
                <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20 8H7" />
              </svg>
            </HomeAction>
          </>
        )}
        <HomeAction to="/keluar?hari=1" label="Hari ini" tone="neutral">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M8 3v4M16 3v4M4 10h16" strokeLinecap="round" />
          </svg>
        </HomeAction>
      </div>

      <div className="grid grid-cols-3 gap-2 min-w-0">
        {kpis.map((c) => (
          <div key={c.label} className="ui-card p-2.5 sm:p-3 min-w-0 overflow-hidden">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted line-clamp-2 leading-tight">
              {c.label}
            </div>
            <div className="mt-1.5 font-display text-[13px] sm:text-base font-bold text-ink leading-tight tabular-nums break-all">
              {c.value}
            </div>
            <div className="mt-1 text-[11px] text-muted line-clamp-2">{c.hint}</div>
          </div>
        ))}
      </div>

      {(data.rekening?.length || 0) > 0 && (
        <section className="ui-card p-3">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h2 className="ui-section-title">Uang di mana</h2>
            <Link to="/rekening" className="text-[12px] font-semibold text-[var(--accent)] hover:underline">
              Rek →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            {[
              { label: 'Bank', value: data.saldo_bank || 0 },
              { label: 'E-wallet', value: data.saldo_ewallet || 0 },
              { label: 'Cash', value: data.saldo_cash || 0 },
            ].map((c) => (
              <div key={c.label} className="rounded-lg bg-surface-soft px-2 py-2 min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{c.label}</div>
                <div className="mt-0.5 text-[13px] font-bold text-ink tabular-nums break-all">{formatRp(c.value)}</div>
              </div>
            ))}
          </div>
          <ul className="space-y-1">
            {(data.rekening || [])
              .filter((r) => Number(r.aktif) === 1)
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1 border-b border-line last:border-0">
                  <span className="text-[12px] font-semibold text-ink truncate">{r.nama}</span>
                  <span className="text-[12px] font-semibold tabular-nums text-ink whitespace-nowrap">{formatRp(r.saldo || 0)}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="grid lg:grid-cols-5 gap-2.5 min-w-0">
        <section className="ui-card p-3 lg:col-span-3 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-2 min-w-0">
            <div className="min-w-0">
              <h2 className="ui-section-title">Pengeluaran 14 hari</h2>
              <p className="text-[11px] text-muted mt-0.5 break-words">
                Puncak:{' '}
                {peakDay && peakDay.keluar > 0
                  ? `${formatRp(peakDay.keluar)} · ${formatDateId(peakDay.tanggal)}`
                  : 'belum ada data'}
              </p>
            </div>
          </div>
          <DailyAreaChart points={data.daily.map((d) => ({ tanggal: d.tanggal, total: d.keluar }))} />
          <DailyChartLabels dates={data.daily.map((d) => d.tanggal)} />
        </section>

        <section className="ui-card p-3 lg:col-span-2 min-w-0 overflow-hidden">
          <h2 className="ui-section-title mb-2">Masuk vs keluar</h2>
          <ul className="space-y-1 max-h-[220px] overflow-y-auto overflow-x-hidden pr-0.5">
            {[...data.daily].reverse().map((row) => (
              <li key={row.tanggal} className="flex items-center justify-between gap-2 py-1 border-b border-line last:border-0 min-w-0">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-ink truncate">{formatDateId(row.tanggal)}</div>
                  <div className="text-[11px] text-muted tabular-nums">
                    +{formatRp(row.masuk)} · −{formatRp(row.keluar)}
                  </div>
                </div>
                <div
                  className={`text-[12px] font-semibold tabular-nums ${
                    row.masuk - row.keluar >= 0 ? 'text-[var(--ok-ink)]' : 'text-[var(--danger)]'
                  }`}
                >
                  {formatRp(row.masuk - row.keluar)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        <section className="ui-card p-3">
          <h2 className="ui-section-title mb-2.5">Keluar per kategori · 30 hari</h2>
          {data.by_kategori_keluar.length === 0 ? (
            <p className="text-[13px] text-muted">Belum ada data.</p>
          ) : (
            <HorizonBars rows={data.by_kategori_keluar} />
          )}
        </section>

        <section className="ui-card p-3">
          <h2 className="ui-section-title mb-2.5">Masuk per kategori · 30 hari</h2>
          {data.by_kategori_masuk.length === 0 ? (
            <p className="text-[13px] text-muted">Belum ada data.</p>
          ) : (
            <HorizonBars rows={data.by_kategori_masuk} />
          )}
        </section>

        <section className="ui-card p-3 md:col-span-2 xl:col-span-1">
          <h2 className="ui-section-title mb-2">Barang teratas · 30 hari</h2>
          {data.top_items.length === 0 ? (
            <p className="text-[13px] text-muted">Belum ada item.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.top_items.map((row, idx) => (
                <li key={row.nama_barang} className="ui-list-row !py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-5 w-5 shrink-0 rounded-md bg-surface-soft text-[10px] font-bold text-muted grid place-items-center">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink truncate">{row.nama_barang}</div>
                      <div className="text-[11px] text-muted">Qty {Number(row.total_qty)}</div>
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold text-ink whitespace-nowrap tabular-nums">
                    {formatRp(row.total_nilai)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="ui-card p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="ui-section-title">Transaksi terbaru</h2>
          <Link to="/keluar" className="text-[12px] font-semibold text-[var(--accent)] hover:underline">
            Semua →
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <p className="text-[13px] text-muted">Belum ada catatan.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {data.recent.map((row) => (
              <li key={row.id}>
                <Link
                  to={`${jenisBase(row.jenis)}/${row.id}`}
                  className="flex items-center justify-between gap-2 py-2 hover:bg-surface-soft/60 rounded-md px-1 -mx-1 transition"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">
                      {row.keterangan || row.kategori || (row.jenis === 'masuk' ? 'Uang masuk' : 'Belanja')}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      {row.jenis === 'masuk' ? 'Masuk' : 'Keluar'}
                      {' · '}
                      {formatDateId(row.tanggal)}
                      {row.kategori ? ` · ${row.kategori}` : ''}
                    </div>
                  </div>
                  <div
                    className={[
                      'text-[13px] font-semibold whitespace-nowrap tabular-nums',
                      row.jenis === 'masuk' ? 'text-[var(--ok-ink)]' : 'text-ink',
                    ].join(' ')}
                  >
                    {row.jenis === 'masuk' ? '+' : '−'}
                    {formatRp(row.total)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
