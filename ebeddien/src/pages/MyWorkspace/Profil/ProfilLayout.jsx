import { NavLink, useLocation } from 'react-router-dom'

/**
 * Layout untuk area Profil.
 * Nav: Profil (tampilan) | Edit Profil | (nanti: Pengaturan)
 * Konten di-render via children (Routes dari index.jsx).
 */
export default function ProfilLayout({ children }) {
  const location = useLocation()
  const base = '/profil'
  const nav = [
    { to: base, end: true, label: 'Profil' },
    { to: `${base}/edit`, end: false, label: 'Edit Profil' }
  ]
  const isEditProfilPage = location.pathname === '/profil/edit'

  return (
    <div className="h-full flex flex-col bg-gray-50/80 dark:bg-gray-900/80">
      <nav className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between gap-3">
          <ul className="flex gap-1">
            {nav.map(({ to, end, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `block px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      isActive
                        ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          {isEditProfilPage && (
            <button
              type="submit"
              form="edit-profil-form"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium shadow-sm transition disabled:opacity-50"
            >
              Simpan
            </button>
          )}
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto min-h-0">
        {children}
      </main>
    </div>
  )
}
