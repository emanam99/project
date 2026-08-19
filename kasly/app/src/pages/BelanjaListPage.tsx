import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { listBelanja, type BelanjaRow } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { canManageData, getStoredUser, jenisBase, jenisFromPath, jenisLabel } from '../utils/auth'
import { formatDateId, formatRp, todayYmd } from '../utils/format'

export default function BelanjaListPage() {
  const location = useLocation()
  const jenis = jenisFromPath(location.pathname)
  const base = jenisBase(jenis)
  const title = jenisLabel(jenis)
  usePageTitle(title)

  const canManage = canManageData(getStoredUser()?.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<BelanjaRow[]>([])
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kategori, setKategori] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [todayTotal, setTodayTotal] = useState(0)

  const load = async (override?: { q?: string; from?: string; to?: string }) => {
    const nextQ = override?.q ?? q
    const nextFrom = override?.from ?? from
    const nextTo = override?.to ?? to
    setLoading(true)
    const res = await listBelanja({
      jenis,
      q: nextQ.trim() || undefined,
      from: nextFrom || undefined,
      to: nextTo || undefined,
    })
    if (res.success && res.data) {
      setRows(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat data')
    }
    setLoading(false)
  }

  useEffect(() => {
    const today = todayYmd()
    void (async () => {
      const res = await listBelanja({ jenis, from: today, to: today })
      if (res.success && res.data) {
        setTodayTotal(res.data.reduce((sum, r) => sum + Number(r.total || 0), 0))
      }
    })()

    if (searchParams.get('hari') === '1') {
      setFrom(today)
      setTo(today)
      void load({ from: today, to: today })
      setSearchParams({}, { replace: true })
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jenis])

  const kategoriOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) {
      const name = (r.kategori || '').trim()
      if (!name) continue
      map.set(name, (map.get(name) || 0) + 1)
    }
    return [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'id'))
  }, [rows])

  const visibleRows = useMemo(() => {
    if (!kategori) return rows
    return rows.filter((r) => (r.kategori || '') === kategori)
  }, [rows, kategori])

  const periodTotal = useMemo(
    () => visibleRows.reduce((sum, r) => sum + Number(r.total || 0), 0),
    [visibleRows],
  )

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-muted">
          Hari ini {formatRp(todayTotal)}
          {visibleRows.length > 0 ? ` · tampilan ${formatRp(periodTotal)}` : ''}
        </div>
        {canManage && (
          <Link to={`${base}/baru`} className="ui-btn-primary">
            + Catat {jenisLabel(jenis, { short: true }).toLowerCase()}
          </Link>
        )}
      </div>

      <form
        className="ui-card p-3 grid sm:grid-cols-4 gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void load()
        }}
      >
        <div className="sm:col-span-2">
          <label className="ui-label">Cari</label>
          <input
            className="ui-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Keterangan, kategori, atau nama item"
          />
        </div>
        <div>
          <label className="ui-label">Dari</label>
          <input type="date" className="ui-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="ui-label">Sampai</label>
          <input type="date" className="ui-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="ui-label">Kategori</label>
          <select className="ui-input" value={kategori} onChange={(e) => setKategori(e.target.value)}>
            <option value="">Semua</option>
            {kategoriOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.value} ({opt.count})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="ui-btn-primary w-full" disabled={loading}>
            {loading ? 'Memuat…' : 'Terapkan'}
          </button>
        </div>
      </form>

      {error && <div className="ui-alert-error">{error}</div>}

      {loading ? (
        <div className="text-muted text-[13px]">Memuat…</div>
      ) : visibleRows.length === 0 ? (
        <div className="ui-card p-4 text-[13px] text-muted">
          Belum ada catatan {title.toLowerCase()}.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visibleRows.map((row) => (
            <li key={row.id}>
              <Link to={`${base}/${row.id}`} className="ui-list-row">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">
                    {row.keterangan?.trim() || row.kategori || title}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {formatDateId(row.tanggal)}
                    {row.kategori ? ` · ${row.kategori}` : ''}
                    {row.item_count ? ` · ${row.item_count} item` : ''}
                    {row.alokasi_label ? ` · ${row.alokasi_label}` : ''}
                  </div>
                </div>
                <div
                  className={[
                    'text-[13px] font-semibold whitespace-nowrap tabular-nums',
                    jenis === 'masuk' ? 'text-[var(--ok-ink)]' : 'text-ink',
                  ].join(' ')}
                >
                  {jenis === 'masuk' ? '+' : '−'}
                  {formatRp(row.total)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
