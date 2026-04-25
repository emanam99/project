import { NavLink } from 'react-router-dom'

export function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" end>
        <span>🏠</span>
        <small>Beranda</small>
      </NavLink>
      <NavLink to="/list">
        <span>📚</span>
        <small>List Bab</small>
      </NavLink>
    </nav>
  )
}
