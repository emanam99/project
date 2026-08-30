import { useEffect, useState } from 'react'
import { fetchPlatformPayments } from '../../api/apiClient'
import { usePageTitle } from '../../contexts/PageTitleContext'
import { formatRp } from '../../utils/format'

type PayRow = {
  id: number
  sppg_id: number
  amount: number
  status: string
  paid_at?: string | null
  created_at: string
  nama_unit?: string
  subdomain?: string | null
  public_id?: string
}

export default function PlatformPaymentsPage() {
  usePageTitle('Pembayaran Platform')
  const [items, setItems] = useState<PayRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchPlatformPayments().then((res) => {
      setLoading(false)
      if (res.success && res.data) setItems(res.data.items)
    })
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold">Riwayat pembayaran Xendit</h2>
      {loading ? <p className="text-muted">Memuat…</p> : null}
      <div className="ui-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="p-2">SPPG</th>
              <th className="p-2">Status</th>
              <th className="p-2">Nominal</th>
              <th className="p-2">Dibayar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-line/60">
                <td className="p-2">
                  <div>{p.nama_unit}</div>
                  <div className="text-xs font-mono text-muted">{p.public_id}</div>
                </td>
                <td className="p-2">{p.status}</td>
                <td className="p-2">{formatRp(p.amount)}</td>
                <td className="p-2">
                  {p.paid_at ? new Date(p.paid_at).toLocaleString('id-ID') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
