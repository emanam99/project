import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listExportArsip, type ExportArsipRow } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { formatDateId, formatRp } from '../utils/format'

function typeLabel(type: string, filename?: string): string {
  if (type === 'maker_xlsx') return 'Excel Maker'
  if (filename && /_IH_/i.test(filename)) return 'BNI Inhouse'
  if (filename && /_Online_/i.test(filename)) return 'BNI Online'
  return 'CSV BNI'
}

function typeClass(type: string): string {
  if (type === 'maker_xlsx') {
    return 'bg-violet-500/15 text-violet-800 border-violet-500/30'
  }
  return 'bg-sky-500/15 text-sky-800 border-sky-500/30'
}

function statusLabel(status: string): string {
  if (status === 'approved') return 'Matched'
  if (status === 'waiting') return 'Waiting'
  return status
}

export default function ArsipEksporPage() {
  usePageTitle('Arsip Ekspor')
  const [rows, setRows] = useState<ExportArsipRow[]>([])
  const [typeFilter, setTypeFilter] = useState<'' | 'bni_csv' | 'maker_xlsx'>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async (type = typeFilter) => {
    setLoading(true)
    const res = await listExportArsip(type ? { type } : {})
    if (res.success && res.data) {
      setRows(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat arsip ekspor')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (!typeFilter) return rows
    return rows.filter((r) => r.export_type === typeFilter)
  }, [rows, typeFilter])

  return (
    <div className="space-y-3.5">
      <div className="ui-card p-2.5 flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-muted">Jenis</label>
        <select
          className="ui-input max-w-[11rem]"
          value={typeFilter}
          onChange={(e) => {
            const v = e.target.value as '' | 'bni_csv' | 'maker_xlsx'
            setTypeFilter(v)
            void load(v)
          }}
        >
          <option value="">Semua</option>
          <option value="bni_csv">CSV BNI</option>
          <option value="maker_xlsx">Excel Maker</option>
        </select>
        <button type="button" className="ui-btn-ghost ml-auto" onClick={() => void load()}>
          Muat ulang
        </button>
      </div>

      {error && <div className="ui-alert-error">{error}</div>}

      {loading ? (
        <div className="text-muted text-[13px]">Memuat…</div>
      ) : filtered.length === 0 ? (
        <div className="ui-card p-6 text-center text-muted text-[13px]">Belum ada arsip ekspor.</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((row) => (
            <Link
              key={row.id}
              to={`/arsip-ekspor/${row.id}`}
              className="ui-card p-2.5 flex items-center justify-between gap-2 hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] transition"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-ink truncate">{row.nama_file}</span>
                  <span
                    className={[
                      'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border',
                      typeClass(row.export_type),
                    ].join(' ')}
                  >
                    {typeLabel(row.export_type, row.csv_filename)}
                  </span>
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border bg-surface-soft text-muted border-line">
                    {statusLabel(row.status)}
                  </span>
                </div>
                <div className="text-[11px] text-muted mt-0.5 truncate">
                  {formatDateId(row.created_at.slice(0, 10))}
                  {' · '}
                  {row.record_count} rek
                  {' · '}
                  Diekspor oleh:{' '}
                  <span className="text-ink font-medium">
                    {row.exported_by_name || row.exported_by_email || 'Tidak diketahui'}
                  </span>
                  {row.bni_reference ? ` · Ref ${row.bni_reference}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-[15px] font-bold text-ink tabular-nums">
                  {formatRp(row.total_amount)}
                </div>
                <div className="text-[10px] text-faint">{row.record_count} item</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
