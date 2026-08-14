import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPorsi, type PorsiRow, type PorsiUkuran } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { canManageData, getStoredUser } from '../utils/auth'
import { formatDateId, formatRp } from '../utils/format'

function ukuranLabel(u?: string | null): string {
  return u === 'kecil' ? 'Kecil' : 'Besar'
}

function ukuranClass(u?: string | null): string {
  return u === 'kecil'
    ? 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30'
    : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
}

export default function PorsiListPage() {
  usePageTitle('Porsi')
  const canManage = canManageData(getStoredUser()?.role)
  const [rows, setRows] = useState<PorsiRow[]>([])
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ukuran, setUkuran] = useState<'' | PorsiUkuran>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (override?: {
    q?: string
    from?: string
    to?: string
    ukuran?: '' | PorsiUkuran
  }) => {
    setLoading(true)
    setError('')
    const res = await listPorsi({
      q: override?.q ?? q,
      from: override?.from ?? from,
      to: override?.to ?? to,
      ukuran: (override?.ukuran ?? ukuran) || undefined,
    })
    if (res.success && res.data) {
      setRows(res.data)
    } else {
      setError(res.message || 'Gagal memuat data porsi')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-3.5 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">Catatan porsi & analisa gizi MBG</p>
        {canManage && (
          <Link to="/porsi/baru" className="ui-btn-primary text-[13px] px-3 py-1.5">
            + Catat porsi
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
            placeholder="Judul porsi atau nama menu…"
          />
        </div>
        <div>
          <label className="ui-label">Dari</label>
          <input
            type="date"
            className="ui-input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="ui-label">Sampai</label>
          <input
            type="date"
            className="ui-input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="ui-label">Ukuran</label>
          <select
            className="ui-input"
            value={ukuran}
            onChange={(e) => setUkuran(e.target.value as '' | PorsiUkuran)}
          >
            <option value="">Semua</option>
            <option value="besar">Besar</option>
            <option value="kecil">Kecil</option>
          </select>
        </div>
        <div className="sm:col-span-3 flex items-end">
          <button type="submit" className="ui-btn-ghost text-[13px]">
            Filter
          </button>
        </div>
      </form>

      {error && <div className="ui-alert-error">{error}</div>}

      {loading ? (
        <div className="text-[13px] text-muted">Memuat…</div>
      ) : rows.length === 0 ? (
        <div className="ui-card p-4 text-[13px] text-muted text-center">
          Belum ada catatan porsi.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/porsi/${row.id}`}
                className="ui-card block p-3 hover:border-[var(--accent)]/40 transition"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[14px] text-ink line-clamp-2">
                      {row.judul?.trim() || formatDateId(row.tanggal)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] text-muted">{formatDateId(row.tanggal)}</span>
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${ukuranClass(row.ukuran)}`}
                      >
                        Porsi {ukuranLabel(row.ukuran)}
                      </span>
                      <span className="text-[12px] text-muted">
                        {Number(row.menu_count || 0)} menu · {Number(row.energi_kkal || 0)} kkal
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-[12px] tabular-nums">
                    <div className="text-muted">
                      {row.ukuran === 'kecil' ? 'Total PK' : 'Total PB'}
                    </div>
                    <div className="font-semibold text-ink">
                      {formatRp(row.total_harga ?? (row.ukuran === 'kecil' ? row.total_pk : row.total_pb))}
                    </div>
                  </div>
                </div>
                {row.created_by_name && (
                  <div className="mt-1.5 text-[11px] text-faint truncate">
                    {row.created_by_name}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
