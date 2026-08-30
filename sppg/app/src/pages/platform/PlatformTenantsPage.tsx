import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPlatformTenants, retryPlatformTenantDns, updatePlatformTenantStatus } from '../../api/apiClient'
import { usePageTitle } from '../../contexts/PageTitleContext'
import type { SppgProfile } from '../../utils/auth'

type TenantRow = SppgProfile & {
  subscription_status?: string | null
  period_end?: string | null
}

export default function PlatformTenantsPage() {
  usePageTitle('Tenant SPPG')
  const [items, setItems] = useState<TenantRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await fetchPlatformTenants(q)
    setLoading(false)
    if (!res.success || !res.data) {
      setError(res.message || 'Gagal memuat tenant')
      return
    }
    setItems(res.data.items)
  }

  useEffect(() => {
    void load()
  }, [])

  const setStatus = async (id: number, status: string) => {
    const res = await updatePlatformTenantStatus(id, status)
    if (!res.success) {
      setError(res.message || 'Gagal ubah status')
      return
    }
    void load()
  }

  const retryDns = async (id: number) => {
    const res = await retryPlatformTenantDns(id)
    if (!res.success) {
      setError(res.message || 'Gagal provision DNS')
      return
    }
    void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <h2 className="font-display text-xl font-bold">Semua tenant</h2>
        <div className="flex gap-2">
          <input
            className="ui-input text-sm"
            placeholder="Cari nama, subdomain…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="ui-btn-ghost text-sm" onClick={() => void load()}>
            Cari
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-muted">Memuat…</p> : null}
      <div className="ui-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="p-2">Unit</th>
              <th className="p-2">Subdomain</th>
              <th className="p-2">Status</th>
              <th className="p-2">Langganan</th>
              <th className="p-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-line/60">
                <td className="p-2">
                  <div className="font-medium">{t.nama_unit}</div>
                  <div className="text-xs text-muted font-mono">{t.public_id}</div>
                </td>
                <td className="p-2">
                  {t.subdomain ? (
                    <a href={t.tenant_url || '#'} className="text-[var(--accent)] font-mono text-xs" target="_blank" rel="noreferrer">
                      {t.subdomain}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="p-2">{t.status}</td>
                <td className="p-2">{t.subscription_status || '—'}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {t.tenant_url ? (
                      <a href={t.tenant_url} className="ui-btn-ghost text-xs py-1 px-2" target="_blank" rel="noreferrer">
                        Buka
                      </a>
                    ) : null}
                    {t.status === 'pending_dns' ? (
                      <button type="button" className="ui-btn-ghost text-xs py-1 px-2" onClick={() => void retryDns(t.id)}>
                        Retry DNS
                      </button>
                    ) : null}
                    {t.status !== 'suspended' ? (
                      <button type="button" className="ui-btn-ghost text-xs py-1 px-2" onClick={() => void setStatus(t.id, 'suspended')}>
                        Suspend
                      </button>
                    ) : (
                      <button type="button" className="ui-btn-ghost text-xs py-1 px-2" onClick={() => void setStatus(t.id, 'active')}>
                        Aktifkan
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Pendaftaran baru: <Link to="/" className="text-[var(--accent)]">landing sppg.cloudy.my.id/daftar</Link>
      </p>
    </div>
  )
}
