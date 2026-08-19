import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getExportArsip, type BelanjaRow, type ExportArsipRow } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { formatDateId, formatRp } from '../utils/format'

function typeLabel(type?: string, filename?: string): string {
  if (type === 'maker_xlsx') return 'Excel Maker'
  if (filename && /_IH_/i.test(filename)) return 'BNI Inhouse'
  if (filename && /_Online_/i.test(filename)) return 'BNI Online'
  return 'CSV BNI'
}

function bniLabel(status?: string | null): string {
  if (status === 'maker') return 'Maker'
  if (status === 'approved') return 'Approved'
  return 'Belum'
}

function cairLabel(status?: string | null): string {
  if (status === 'jatim') return 'Jatim'
  if (status === 'cair') return 'Cair'
  return '—'
}

export default function ArsipEksporDetailPage() {
  const { id } = useParams()
  const batchId = Number(id)
  const [batch, setBatch] = useState<(ExportArsipRow & { debit_account?: string }) | null>(null)
  const [belanja, setBelanja] = useState<BelanjaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  usePageTitle(batch ? `Arsip: ${batch.nama_file}` : 'Arsip Ekspor')

  useEffect(() => {
    if (!batchId) {
      setError('ID arsip tidak valid')
      setLoading(false)
      return
    }
    void (async () => {
      setLoading(true)
      const res = await getExportArsip(batchId)
      if (res.success && res.data) {
        setBatch(res.data.batch)
        setBelanja(res.data.belanja)
        setError('')
      } else {
        setError(res.message || 'Gagal memuat detail arsip')
      }
      setLoading(false)
    })()
  }, [batchId])

  if (loading) return <div className="text-muted text-[13px]">Memuat…</div>
  if (error && !batch) return <div className="ui-alert-error">{error}</div>
  if (!batch) return null

  return (
    <div className="space-y-3.5">
      <div>
        <Link to="/arsip-ekspor" className="text-sm text-muted hover:underline">
          ← Arsip ekspor
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-lg font-bold text-ink">{batch.nama_file}</h1>
            <p className="text-[13px] text-muted mt-0.5">
              {typeLabel(batch.export_type, batch.csv_filename)}
              {' · '}
              {formatDateId(batch.created_at.slice(0, 10))}
              {' · '}
              {batch.record_count} rek
              {batch.bni_reference ? ` · Ref ${batch.bni_reference}` : ''}
            </p>
            <p className="text-[12px] text-muted mt-1">
              Diekspor oleh:{' '}
              <span className="font-semibold text-ink">
                {batch.exported_by_name || batch.exported_by_email || 'Tidak diketahui'}
              </span>
              {batch.exported_by_name && batch.exported_by_email
                ? ` (${batch.exported_by_email})`
                : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">Total</div>
            <div className="font-display text-lg font-bold text-ink">{formatRp(batch.total_amount)}</div>
          </div>
        </div>
      </div>

      {error && <div className="ui-alert-error">{error}</div>}

      {belanja.length === 0 ? (
        <div className="ui-card p-6 text-center text-muted text-[13px]">Tidak ada belanja di arsip ini.</div>
      ) : (
        <div className="space-y-1.5">
          {belanja.map((row) => (
            <Link
              key={row.id}
              to={`/belanja/${row.id}`}
              className="ui-card p-2.5 flex items-center justify-between gap-2 hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] transition"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="text-[13px] font-semibold text-ink truncate">
                    {row.nama_penerima || 'Tanpa rekening'}
                  </div>
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border bg-surface-soft text-muted border-line">
                    {bniLabel(row.bni_status)}
                  </span>
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border bg-surface-soft text-muted border-line">
                    {cairLabel(row.cair_status)}
                  </span>
                </div>
                <div className="text-[11px] text-muted mt-0.5 truncate">
                  {row.keterangan || 'Belanja dapur'}
                  {' · '}
                  {formatDateId(row.tanggal)}
                  {row.kategori ? ` · ${row.kategori}` : ''}
                  {' · '}
                  Dibuat:{' '}
                  {row.created_by_name || row.created_by_email || '—'}
                </div>
              </div>
              <div className="font-display text-[15px] font-bold text-ink whitespace-nowrap tabular-nums">
                {formatRp(row.total)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
