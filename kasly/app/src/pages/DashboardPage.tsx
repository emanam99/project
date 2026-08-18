import { useEffect, useMemo, useState } from 'react'
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
      label: 'Saldo',
      value: formatRp(data.saldo),
      hint: `${data.jumlah_catatan} catatan`,
      accent: true,
    },
    {
      label: 'Masuk bulan ini',
      value: formatRp(data.masuk_bulan_ini),
      hint: `Hari ini ${formatRp(data.masuk_hari_ini)}`,
      accent: false,
    },
    {
      label: 'Keluar bulan ini',
      value: formatRp(data.keluar_bulan_ini),
      hint: `Rata ${formatRp(data.rata_keluar_harian)}/hari`,
      accent: false,
    },
    {
      label: 'Keluar hari ini',
      value: formatRp(data.keluar_hari_ini),
      hint: `${data.catatan_hari_ini} catatan hari ini`,
      accent: false,
    },
  ]

  return (
    <div className="space-y-3.5 min-w-0 max-w-full overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link to="/keluar?hari=1" className="ui-btn-ghost">
          Belanja hari ini
        </Link>
        {canManage && (
          <>
            <Link to="/masuk/baru" className="ui-btn-ghost">
              + Uang masuk
            </Link>
            <Link to="/keluar/baru" className="ui-btn-primary">
              + Catat belanja
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 min-w-0">
        {kpis.map((c) => (
          <div
            key={c.label}
            className={[
              'ui-card p-2.5 sm:p-3 min-w-0 overflow-hidden',
              c.accent ? 'border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]' : '',
            ].join(' ')}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted truncate">{c.label}</div>
            <div className="mt-1.5 font-display text-base sm:text-lg font-bold text-ink leading-tight tabular-nums break-all">
              {c.value}
            </div>
            <div className="mt-1 text-[11px] text-muted line-clamp-2">{c.hint}</div>
          </div>
        ))}
      </div>

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
