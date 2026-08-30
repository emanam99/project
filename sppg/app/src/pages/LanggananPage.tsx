import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createSubscriptionPayment, fetchMe, fetchSubscriptionDetail } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { formatRp } from '../utils/format'
import { getSessionContext, isSuperAdminRole, getStoredUser } from '../utils/auth'
import type { SubscriptionInfo, SppgProfile } from '../utils/auth'

export default function LanggananPage() {
  usePageTitle('Langganan')
  const navigate = useNavigate()
  const user = getStoredUser()
  const isSuper = isSuperAdminRole(user?.role)
  const [sppg, setSppg] = useState<SppgProfile | null>(() => getSessionContext()?.sppg ?? null)
  const [sub, setSub] = useState<SubscriptionInfo | null>(() => getSessionContext()?.subscription ?? null)
  const [payments, setPayments] = useState<Array<{ id: number; amount: number; status: string; paid_at?: string | null; created_at: string }>>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      await fetchMe()
      if (isSuper) {
        const res = await fetchSubscriptionDetail()
        if (res.success && res.data) {
          setSppg(res.data.sppg)
          setSub(res.data.subscription)
          setPayments(res.data.payments || [])
        }
      }
      setLoading(false)
    })()
  }, [isSuper])

  const pay = async () => {
    if (!isSuper) return
    setPaying(true)
    setError('')
    const res = await createSubscriptionPayment()
    setPaying(false)
    if (!res.success || !res.data?.invoice_url) {
      setError(res.message || 'Gagal membuat invoice')
      return
    }
    window.location.href = res.data.invoice_url
  }

  const active = sub?.status === 'active'

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-bold">Langganan SPPG</h1>
          {sppg ? (
            <p className="text-sm text-muted">
              {sppg.nama_unit} · {sppg.nama_yayasan}
            </p>
          ) : null}
        </div>

        {loading ? <p className="text-center text-muted">Memuat…</p> : null}

        <div className="ui-card p-4 space-y-3">
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="text-sm text-muted">Paket bulanan</div>
              <div className="text-2xl font-bold tabular-nums">{formatRp(sub?.amount ?? 50000)}</div>
            </div>
            <span
              className={[
                'text-xs font-semibold px-2 py-1 rounded-full border',
                active ? 'bg-[var(--ok-bg)] text-[var(--ok-ink)] border-[var(--ok-line)]' : 'bg-amber-500/15 text-amber-800 border-amber-500/30',
              ].join(' ')}
            >
              {sub?.status === 'active' ? 'Aktif' : sub?.status === 'past_due' ? 'Jatuh tempo' : 'Menunggu bayar'}
            </span>
          </div>

          {sub?.period_end ? (
            <p className="text-sm text-muted">
              Berlaku sampai: {new Date(sub.period_end).toLocaleDateString('id-ID', { dateStyle: 'long' })}
            </p>
          ) : null}

          {!active && isSuper ? (
            <button type="button" className="ui-btn-primary w-full" disabled={paying} onClick={() => void pay()}>
              {paying ? 'Menyiapkan…' : 'Bayar / Perpanjang via Xendit'}
            </button>
          ) : null}

          {!isSuper ? (
            <p className="text-sm text-muted">Hubungi super admin SPPG untuk pembayaran langganan.</p>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {active ? (
            <button type="button" className="ui-btn-ghost w-full" onClick={() => navigate('/dashboard')}>
              Masuk aplikasi
            </button>
          ) : null}
        </div>

        {isSuper && payments.length > 0 ? (
          <div className="ui-card p-4 space-y-2">
            <h2 className="ui-section-title">Riwayat pembayaran</h2>
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between text-sm border-b border-line/60 py-2 last:border-0">
                <span>{new Date(p.created_at).toLocaleDateString('id-ID')}</span>
                <span className="tabular-nums">{formatRp(p.amount)} · {p.status}</span>
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-center text-sm">
          <Link to="/profil-sppg" className="text-[var(--accent)]">Profil SPPG</Link>
          {' · '}
          <Link to="/login" className="text-muted">Logout</Link>
        </p>
      </div>
    </div>
  )
}
