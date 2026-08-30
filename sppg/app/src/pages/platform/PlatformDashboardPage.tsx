import { useEffect, useState } from 'react'
import { fetchPlatformDashboard } from '../../api/apiClient'
import { usePageTitle } from '../../contexts/PageTitleContext'
import { formatRp } from '../../utils/format'

export default function PlatformDashboardPage() {
  usePageTitle('Dashboard Platform')
  const [data, setData] = useState<{
    tenants_total: number
    subscriptions_active: number
    subscriptions_attention: number
    tenants_pending_dns: number
    revenue_month: number
  } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void fetchPlatformDashboard().then((res) => {
      if (!res.success || !res.data) {
        setError(res.message || 'Gagal memuat dashboard')
        return
      }
      setData(res.data)
    })
  }, [])

  if (error) return <p className="text-red-600">{error}</p>
  if (!data) return <p className="text-muted">Memuat…</p>

  const cards = [
    { label: 'Total tenant', value: String(data.tenants_total) },
    { label: 'Langganan aktif', value: String(data.subscriptions_active) },
    { label: 'Perlu perhatian', value: String(data.subscriptions_attention) },
    { label: 'Pending DNS', value: String(data.tenants_pending_dns) },
    { label: 'Pendapatan bulan ini', value: formatRp(data.revenue_month) },
  ]

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold">Ringkasan platform</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="ui-card p-4">
            <p className="text-sm text-muted">{c.label}</p>
            <p className="text-2xl font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
