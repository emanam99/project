import { NavLink, Outlet } from 'react-router-dom'
import { clearSession, getStoredUser } from '../utils/auth'

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/tenants', label: 'Tenant SPPG' },
  { to: '/langganan', label: 'Langganan' },
  { to: '/pembayaran', label: 'Pembayaran' },
]

export default function PlatformAdminLayout() {
  const user = getStoredUser()

  return (
    <div className="min-h-dvh bg-canvas text-ink flex flex-col md:flex-row">
      <aside className="md:w-56 border-b md:border-b-0 md:border-r border-line bg-surface p-4 shrink-0">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">SPPG Platform</p>
          <h1 className="font-display text-lg font-bold">Admin Panel</h1>
        </div>
        <nav className="flex md:flex-col gap-1 flex-wrap">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted hover:bg-surface-soft'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 pt-4 border-t border-line text-sm">
          <p className="font-medium truncate">{user?.name || user?.email}</p>
          <button
            type="button"
            className="mt-2 text-[13px] text-muted hover:text-ink"
            onClick={() => {
              clearSession()
              window.location.href = '/login'
            }}
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-6 max-w-6xl">
        <Outlet />
      </main>
    </div>
  )
}
