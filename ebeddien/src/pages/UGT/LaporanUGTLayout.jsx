import { useEffect, useMemo } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useUgtLaporanFiturAccess } from '../../hooks/useUgtLaporanFiturAccess'

export default function LaporanUGTLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    visibleTabs,
    noTabAccess,
    tabKoordinator,
    tabGt,
    tabPjgt
  } = useUgtLaporanFiturAccess()

  const pathAllowed = useMemo(() => {
    const p = location.pathname
    if (p.endsWith('/koordinator')) return tabKoordinator
    if (p.endsWith('/gt')) return tabGt
    if (p.endsWith('/pjgt')) return tabPjgt
    return true
  }, [location.pathname, tabKoordinator, tabGt, tabPjgt])

  useEffect(() => {
    if (noTabAccess) return
    if (pathAllowed) return
    const next = visibleTabs[0]?.to
    if (next) navigate(next, { replace: true })
  }, [noTabAccess, pathAllowed, visibleTabs, navigate])

  return (
    <div className="h-full flex flex-col min-h-0 bg-gray-50/50 dark:bg-gray-900/30">
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-0">
          {noTabAccess ? (
            <p className="text-sm text-amber-700 dark:text-amber-300 pb-4">
              Tidak ada tab laporan yang diizinkan untuk role Anda. Minta admin untuk mengatur akses di
              Pengaturan → Fitur (menu Laporan UGT).
            </p>
          ) : (
            <nav aria-label="Jenis laporan UGT">
              <ul className="flex gap-1 -mb-px">
                {visibleTabs.map(({ to, label }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end
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
            </nav>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">
        {!noTabAccess && <Outlet />}
      </div>
    </div>
  )
}
