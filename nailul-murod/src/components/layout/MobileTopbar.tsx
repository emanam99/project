import { AnimatedHeaderTitle } from './AnimatedHeaderTitle'

type Props = {
  pageTitle: string
  onToggleTheme: () => void
  theme: 'light' | 'dark'
  canInstall: boolean
  onInstall: () => void
}

export function MobileTopbar({ pageTitle, onToggleTheme, theme, canInstall, onInstall }: Props) {
  return (
    <header className="topbar mobile-topbar">
      <div className="topbar-main">
        <div className="topbar-title-slot">
          <AnimatedHeaderTitle title={pageTitle} />
        </div>
        <div className="topbar-actions">
          {canInstall && (
            <button className="theme-btn install-btn" onClick={onInstall}>
              Install
            </button>
          )}
          <button className="theme-btn" onClick={onToggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  )
}
