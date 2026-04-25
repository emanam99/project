type Props = {
  syncInfo: string
  onToggleTheme: () => void
  theme: 'light' | 'dark'
}

export function MobileTopbar({ syncInfo, onToggleTheme, theme }: Props) {
  return (
    <header className="topbar mobile-topbar">
      <div className="topbar-main">
        <div>
          <h1>Nailul Murod</h1>
          <p className="sync-meta">Sinkron {syncInfo}</p>
        </div>
        <button className="theme-btn" onClick={onToggleTheme}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  )
}
