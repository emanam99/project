import { useEffect, useState } from 'react'
import { fetchPlatformSubscriptions } from '../../api/apiClient'
import { usePageTitle } from '../../contexts/PageTitleContext'
import { formatRp } from '../../utils/format'

type SubRow = {
  id: number
  sppg_id: number
  status: string
  amount: number
  period_end?: string | null
  nama_unit?: string
  subdomain?: string | null
  public_id?: string
}

export default function PlatformSubscriptionsPage() {
  usePageTitle('Langganan Platform')
  const [items, setItems] = useState<SubRow[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchPlatformSubscriptions(status).then((res) => {
      setLoading(false)
      if (res.success && res.data) setItems(res.data.items)
    })
  }, [status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h2 className="font-display text-xl font-bold">Monitor langganan</h2>
        <select className="ui-input text-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="pending_payment">Menunggu bayar</option>
          <option value="past_due">Jatuh tempo</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
      </div>
      {loading ? <p className="text-muted">Memuat…</p> : null}
      <div className="ui-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="p-2">SPPG</th>
              <th className="p-2">Subdomain</th>
              <th className="p-2">Status</th>
              <th className="p-2">Nominal</th>
              <th className="p-2">Berakhir</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-line/60">
                <td className="p-2">
                  <div>{s.nama_unit}</div>
                  <div className="text-xs font-mono text-muted">{s.public_id}</div>
                </td>
                <td className="p-2 font-mono text-xs">{s.subdomain || '—'}</td>
                <td className="p-2">{s.status}</td>
                <td className="p-2">{formatRp(s.amount)}</td>
                <td className="p-2">
                  {s.period_end ? new Date(s.period_end).toLocaleDateString('id-ID') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
