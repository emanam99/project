import { Suspense, lazy, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { pageEase } from './components/PageTransition'
import RequireAuth from './components/RequireAuth'
import {
  canManageData,
  getStoredUser,
  hasAppAccess,
  homePathForRole,
  isLoggedIn,
  isPendingRole,
  isPortalUser,
  isSuperAdminRole,
} from './utils/auth'

const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const MenungguAksesPage = lazy(() => import('./pages/MenungguAksesPage'))
const PelangganPage = lazy(() => import('./pages/PelangganPage'))
const RekapPage = lazy(() => import('./pages/RekapPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const TagihanPage = lazy(() => import('./pages/TagihanPage'))
const TagihanSayaPage = lazy(() => import('./pages/TagihanSayaPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))

function PageFallback() {
  return (
    <div className="min-h-[40vh] grid place-items-center px-4 text-[13px] text-muted">Memuat…</div>
  )
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>
}

function SuperAdminOnly({ children }: { children: React.ReactNode }) {
  const user = getStoredUser()
  if (!isSuperAdminRole(user?.role)) {
    return <Navigate to={homePathForRole(user?.role)} replace />
  }
  return children
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const user = getStoredUser()
  if (!canManageData(user?.role)) {
    return <Navigate to={homePathForRole(user?.role)} replace />
  }
  return children
}

function PortalOnly({ children }: { children: React.ReactNode }) {
  const user = getStoredUser()
  if (!isPortalUser(user?.role)) {
    return <Navigate to={homePathForRole(user?.role)} replace />
  }
  return children
}

function LoginGate() {
  if (!isLoggedIn()) return withSuspense(<LoginPage />)
  const user = getStoredUser()
  if (isPendingRole(user?.role) || !hasAppAccess(user?.role)) {
    return <Navigate to="/menunggu-akses" replace />
  }
  return <Navigate to={homePathForRole(user?.role)} replace />
}

function routeShellKey(pathname: string): string {
  if (
    pathname === '/login' ||
    pathname === '/auth/callback' ||
    pathname === '/menunggu-akses'
  ) {
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
          <Route path="/auth/callback" element={withSuspense(<AuthCallbackPage />)} />

          <Route element={<RequireAuth />}>
            <Route path="/menunggu-akses" element={withSuspense(<MenungguAksesPage />)} />
            <Route element={<Layout />}>
              <Route
                path="/saya"
                element={withSuspense(
                  <PortalOnly>
                    <TagihanSayaPage />
                  </PortalOnly>,
                )}
              />
              <Route
                path="/dashboard"
                element={withSuspense(
                  <AdminOnly>
                    <DashboardPage />
                  </AdminOnly>,
                )}
              />
              <Route
                path="/tagihan"
                element={withSuspense(
                  <AdminOnly>
                    <TagihanPage />
                  </AdminOnly>,
                )}
              />
              <Route
                path="/pelanggan"
                element={withSuspense(
                  <AdminOnly>
                    <PelangganPage />
                  </AdminOnly>,
                )}
              />
              <Route
                path="/rekap"
                element={withSuspense(
                  <AdminOnly>
                    <RekapPage />
                  </AdminOnly>,
                )}
              />
              <Route path="/pengaturan" element={withSuspense(<SettingsPage />)} />
              <Route
                path="/pengguna"
                element={withSuspense(
                  <SuperAdminOnly>
                    <UsersPage />
                  </SuperAdminOnly>,
                )}
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}
