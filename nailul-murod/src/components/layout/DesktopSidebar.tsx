import { NavLink } from 'react-router-dom'
import type { ReaderState } from '../../types/wirid'
import { APP_VERSION } from '../../config/version'

type Props = {
  state: ReaderState
  syncInfo: string
  onRefresh: () => void
  onToggleTheme: () => void
  theme: 'light' | 'dark'
  collapsed: boolean
  onToggleCollapse: () => void
  canInstall: boolean
  installReady: boolean
  installed: boolean
  onInstall: () => void
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11.5L12 4l9 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 10.5V20h11V10.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DesktopSidebar({
  state,
  syncInfo,
  onRefresh,
  onToggleTheme,
  theme,
  collapsed,
  onToggleCollapse,
  canInstall,
  installReady,
  installed,
  onInstall,
}: Props) {
  const gambarBase = (import.meta.env.VITE_GAMBAR_BASE || '/gambar').replace(/\/$/, '')

  return (
    <aside className={`desktop-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-brand">
        <img src={`${gambarBase}/icon/nailul-murod96.png`} alt="" />
        <div className="sidebar-brand-text">
          <strong>Nailul Murod</strong>
          <small>v{APP_VERSION}</small>
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}
          aria-label={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end title="Beranda">
          <span className="sidebar-nav-icon">
            <HomeIcon />
          </span>
          <span className="sidebar-nav-label">Beranda</span>
        </NavLink>
        <NavLink to="/list" title="List Bab">
          <span className="sidebar-nav-icon">
            <ListIcon />
          </span>
          <span className="sidebar-nav-label">List Bab</span>
        </NavLink>
      </nav>
      <div className="sidebar-foot">
        <p>Sumber: {state.source === 'api' ? 'Online API' : state.source === 'cache' ? 'Cache Offline' : '-'}</p>
        <p>Sinkron: {syncInfo}</p>
        {!installed && (
          <button
            className="theme-btn install-btn desktop-install-btn"
            onClick={onInstall}
            disabled={!canInstall}
            title={installReady ? 'Install aplikasi' : 'Menyiapkan komponen install'}
          >
            <span className="sidebar-btn-icon">⬇️</span>
            <span className="sidebar-btn-label">{installReady ? (canInstall ? 'Install' : 'Loading...') : 'Loading...'}</span>
          </button>
        )}
        <button className="theme-btn" onClick={onRefresh}>
          <span className="sidebar-btn-icon">{state.syncing ? '⏳' : '↻'}</span>
          <span className="sidebar-btn-label">{state.syncing ? 'Sinkron...' : 'Sinkron'}</span>
        </button>
        <button className="theme-btn" onClick={onToggleTheme}>
          <span className="sidebar-btn-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span className="sidebar-btn-label">{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
        </button>
      </div>
    </aside>
  )
}
