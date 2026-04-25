import type { ReaderState } from '../types/wirid'
import { groupByBab } from '../utils/groupByBab'

type Props = {
  state: ReaderState
}

export function HomePage({ state }: Props) {
  const grouped = groupByBab(state.rows)
  const totalBab = grouped.length
  const totalWirid = state.rows.length
  const syncInfo = state.lastSyncAt
    ? state.lastSyncAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : 'Belum sinkron'

  return (
    <section className="home-page">
      <div className="hero-card">
        <img src="/gambar/icon/nailul-murod192.png" alt="Nailul Murod" className="hero-icon" />
        <div>
          <h1>Nailul Murod</h1>
          <p>Reader wirid modern tanpa login.</p>
          <div className="hero-meta">
            <span>Versi {__APP_VERSION__}</span>
            <span>{state.source === 'api' ? 'Online API' : state.source === 'cache' ? 'Cache Offline' : '-'}</span>
            <span>Sinkron {syncInfo}</span>
          </div>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <small>Total Bab</small>
          <strong>{totalBab}</strong>
        </div>
        <div className="stat-card">
          <small>Total Wirid</small>
          <strong>{totalWirid}</strong>
        </div>
      </div>
      <div className="callout">
        <p>
          Buka menu <strong>List Bab</strong> untuk membaca per bab, lalu masuk ke halaman tiap wirid
          dengan URL permanen.
        </p>
      </div>
    </section>
  )
}
