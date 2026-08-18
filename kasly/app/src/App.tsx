import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { pageEase } from './components/PageTransition'
import RequireAuth from './components/RequireAuth'
import AuthCallbackPage from './pages/AuthCallbackPage'
import BelanjaDetailPage from './pages/BelanjaDetailPage'
import BelanjaFormPage from './pages/BelanjaFormPage'
import BelanjaListPage from './pages/BelanjaListPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import MenungguAksesPage from './pages/MenungguAksesPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import { getStoredUser, hasAppAccess, canManageData, isLoggedIn, isPendingRole, isSuperAdminRole } from './utils/auth'

function SuperAdminOnly({ children }: { children: React.ReactNode }) {
  const user = getStoredUser()
  if (!isSuperAdminRole(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function ManagerOnly({ children }: { children: React.ReactNode }) {
  const user = getStoredUser()
  if (!canManageData(user?.role)) {
    return <Navigate to="/keluar" replace />
  }
  return children
}

function LoginGate() {
  if (!isLoggedIn()) return <LoginPage />
  const user = getStoredUser()
  if (isPendingRole(user?.role) || !hasAppAccess(user?.role)) {
    return <Navigate to="/menunggu-akses" replace />
  }
  return <Navigate to="/dashboard" replace />
}

function routeShellKey(pathname: string): string {
  if (pathname === '/login' || pathname === '/auth/callback' || pathname === '/menunggu-akses') {
    return pathname
  }
  return 'app'
}

export default function App() {
  const location = useLocation()
  const shellKey = routeShellKey(location.pathname)
  const reduce = useReducedMotion()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={shellKey}
        className="min-h-dvh"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
        transition={{ duration: reduce ? 0.12 : 0.32, ease: pageEase }}
      >
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginGate />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/menunggu-akses" element={<MenungguAksesPage />} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/keluar" element={<BelanjaListPage />} />
              <Route
                path="/keluar/baru"
                element={
                  <ManagerOnly>
                    <BelanjaFormPage />
                  </ManagerOnly>
                }
              />
              <Route path="/keluar/:id" element={<BelanjaDetailPage />} />
              <Route path="/masuk" element={<BelanjaListPage />} />
              <Route
                path="/masuk/baru"
                element={
                  <ManagerOnly>
                    <BelanjaFormPage />
                  </ManagerOnly>
                }
              />
              <Route path="/masuk/:id" element={<BelanjaDetailPage />} />
              <Route path="/pengaturan" element={<SettingsPage />} />
              <Route
                path="/pengguna"
                element={
                  <SuperAdminOnly>
                    <UsersPage />
                  </SuperAdminOnly>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}
