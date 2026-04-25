import { NavLink } from 'react-router-dom'
import type { ReaderState } from '../../types/wirid'

type Props = {
  state: ReaderState
  syncInfo: string
  onRefresh: () => void
  onToggleTheme: () => void
  theme: 'light' | 'dark'
}

export function DesktopSidebar({ state, syncInfo, onRefresh, onToggleTheme, theme }: Props) {
  return (
    <aside className="desktop-sidebar">
      <div className="sidebar-brand">
        <img src="/gambar/icon/nailul-murod96.png" alt="" />
        <div>
          <strong>Nailul Murod</strong>
          <small>v{__APP_VERSION__}</small>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end>
          Beranda
        </NavLink>
        <NavLink to="/list">List Bab</NavLink>
      </nav>
      <div className="sidebar-foot">
        <p>Sumber: {state.source === 'api' ? 'Online API' : state.source === 'cache' ? 'Cache Offline' : '-'}</p>
        <p>Sinkron: {syncInfo}</p>
        <button className="theme-btn" onClick={onRefresh}>
          {state.syncing ? '⏳ Sinkron...' : '↻ Sinkron'}
        </button>
        <button className="theme-btn" onClick={onToggleTheme}>
          {theme === 'dark' ? '☀️ Terang' : '🌙 Gelap'}
        </button>
      </div>
    </aside>
  )
}
