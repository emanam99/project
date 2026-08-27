import { useEffect, useState } from 'react'
import { listTagihan, type Tagihan } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { getStoredUser } from '../utils/auth'
import { formatDateId, formatRp } from '../utils/format'
import { labelPeriode } from '../utils/tagihanSettings'

/** Halaman portal user: lihat tagihan atas nama pelanggan yang dihubungkan. */
export default function TagihanSayaPage() {
  usePageTitle('Tagihan saya')
  const me = getStoredUser()
  const [rows, setRows] = useState<Tagihan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const res = await listTagihan()
      if (cancelled) return
      if (res.success && res.data) {
        setRows(res.data)
        setError('')
      } else {
        setError(res.message || 'Gagal memuat tagihan')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!me?.pelanggan_id) {
    return (
      <div className="ui-card p-4 space-y-2 max-w-lg">
        <h2 className="text-[15px] font-semibold text-ink">Belum terhubung ke pelanggan</h2>
        <p className="text-[13px] text-muted leading-relaxed">
          Akun Anda belum dihubungkan ke data pelanggan. Hubungi admin agar tagihan atas nama Anda
          bisa ditampilkan di sini.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3.5 max-w-2xl">
      <div className="ui-card p-3">
        <div className="text-[11px] text-muted">Atas nama</div>
        <div className="text-[16px] font-semibold text-ink">{me.pelanggan_nama || 'Pelanggan'}</div>
      </div>

      {error && <div className="ui-alert-error">{error}</div>}

      {loading ? (
        <div className="text-muted text-[13px]">Memuat…</div>
      ) : rows.length === 0 ? (
        <div className="ui-card p-4 text-[13px] text-muted">Belum ada tagihan.</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((t) => (
            <li key={t.id} className="ui-card p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">
                    {labelPeriode(t.periode_bulan, t.periode_tahun)}
                  </div>
                  <div className="text-[11px] text-muted">
                    Jatuh tempo {formatDateId(t.jatuh_tempo)}
                    {t.keterangan ? ` · ${t.keterangan}` : ''}
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Dibayar {formatRp(t.total_bayar)} / {formatRp(t.nominal)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold text-ink">{formatRp(t.nominal)}</div>
                  <div
                    className={`text-[11px] font-semibold ${t.lunas ? 'text-emerald-600' : 'text-amber-600'}`}
                  >
                    {t.lunas ? 'Lunas' : `Sisa ${formatRp(t.sisa)}`}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
