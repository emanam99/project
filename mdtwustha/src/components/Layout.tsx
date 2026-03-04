import { Outlet, NavLink, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/data-santri', label: 'Data Santri', icon: '👥' },
  { to: '/absensi', label: 'Absensi', icon: '✅' },
  { to: '/pembayaran', label: 'Pembayaran', icon: '💰' },
  { to: '/jadwal', label: 'Jadwal', icon: '📅' },
  { to: '/absen-guru', label: 'Absen Guru', icon: '👨‍🏫' },
]

export default function Layout() {
  const navigate = useNavigate()

  const handleLogout = () => {
    try {
      localStorage.removeItem('mdtwustha_user')
    } catch (_) {}
    navigate('/', { replace: true })
  }

  let userName = ''
  try {
    const raw = localStorage.getItem('mdtwustha_user')
    if (raw) {
      const user = JSON.parse(raw) as { name?: string; nip?: string }
      userName = user?.name || user?.nip || ''
    }
  } catch (_) {}

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex">
      {/* Sidebar kiri */}
      <aside className="w-56 sm:w-64 flex-shrink-0 border-r border-white/10 bg-slate-900/80 backdrop-blur flex flex-col">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-slate-100 font-bold text-lg tracking-tight">MD Twustha</h2>
          <p className="text-slate-500 text-xs mt-0.5">Menu Utama</p>
        </div>
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          <ul className="space-y-0.5 list-none m-0 p-0">
            {NAV_ITEMS.map(({ to, label, icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      isActive
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`
                  }
                  end={to === '/dashboard'}
                >
                  <span className="text-lg" aria-hidden>{icon}</span>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Area kanan: Header + konten */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header tetap di atas */}
        <header className="flex-shrink-0 h-14 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-white/10 bg-slate-900/60 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-slate-500 text-sm hidden sm:inline">MD Twustha</span>
          </div>
          <div className="flex items-center gap-2">
            {userName && (
              <span className="text-slate-400 text-sm truncate max-w-[120px] sm:max-w-[180px]" title={userName}>
                {userName}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-slate-400 border border-white/10 rounded-lg hover:text-slate-100 hover:border-white/20 hover:bg-white/5 transition"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* Konten halaman */}
        <main className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
