import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { pageEase } from './components/PageTransition'
import RequireAuth from './components/RequireAuth'
import ArsipEksporDetailPage from './pages/ArsipEksporDetailPage'
import ArsipEksporPage from './pages/ArsipEksporPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import BelanjaDetailPage from './pages/BelanjaDetailPage'
import BelanjaFormPage from './pages/BelanjaFormPage'
import BelanjaListPage from './pages/BelanjaListPage'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import RegisterPage from './pages/RegisterPage'
import PilihSppgPage from './pages/PilihSppgPage'
import LanggananPage from './pages/LanggananPage'
import LoginPage from './pages/LoginPage'
import SppgProfilePage from './pages/SppgProfilePage'
import MenungguAksesPage from './pages/MenungguAksesPage'
import PorsiDetailPage from './pages/PorsiDetailPage'
import PorsiFormPage from './pages/PorsiFormPage'
import PorsiListPage from './pages/PorsiListPage'
import RekeningPage from './pages/RekeningPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import PlatformAdminLayout from './layouts/PlatformAdminLayout'
import RequirePlatformAdmin from './components/RequirePlatformAdmin'
import PlatformDashboardPage from './pages/platform/PlatformDashboardPage'
import PlatformTenantsPage from './pages/platform/PlatformTenantsPage'
import PlatformSubscriptionsPage from './pages/platform/PlatformSubscriptionsPage'
import PlatformPaymentsPage from './pages/platform/PlatformPaymentsPage'
import { getHostMode, getLandingUrl, isPlatformAdminHost, isTenantHost } from './utils/tenantHost'
import { getStoredUser, hasAppAccess, canManageData, isLoggedIn, isPendingRole, isPlatformAdminRole, isSuperAdminRole } from './utils/auth'
import { isPwaDisplayMode } from './hooks/usePwaInstallPrompt'

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
    return <Navigate to="/belanja" replace />
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

/** Shell terpisah untuk auth vs app — navigasi dalam app tidak remount Layout. */
function routeShellKey(pathname: string): string {
  if (
    pathname === '/login' ||
    pathname === '/daftar' ||
    pathname === '/pilih-sppg' ||
    pathname === '/auth/callback' ||
    pathname === '/menunggu-akses' ||
    pathname === '/langganan'
  ) {
    return pathname === '/' ? 'landing' : pathname
  }
  return 'app'
}

function TenantRoot() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  const user = getStoredUser()
  if (isPendingRole(user?.role) || !hasAppAccess(user?.role)) {
    return <Navigate to="/menunggu-akses" replace />
  }
  return <Navigate to="/dashboard" replace />
}

function RegisterRoute() {
  if (isTenantHost()) {
    const landing = getLandingUrl()
    if (landing) {
      window.location.replace(`${landing}/daftar`)
      return null
    }
  }
  return <RegisterPage />
}

function LandingRoute() {
  const mode = getHostMode()
  // Tenant / legacy (alutsmani) / PWA standalone: langsung ke beranda atau login
  if (mode === 'tenant' || mode === 'legacy' || isPwaDisplayMode()) {
    return <TenantRoot />
  }
  return <LandingPage />
}

function PlatformLoginGate() {
  if (!isLoggedIn()) return <LoginPage />
  const user = getStoredUser()
  if (!isPlatformAdminRole(user?.role)) {
    return <Navigate to="/login?error=Akses%20admin%20platform%20ditolak" replace />
  }
  return <Navigate to="/" replace />
}

function PlatformAdminApp() {
  const location = useLocation()
  const reduce = useReducedMotion()
  const shellKey =
    location.pathname === '/login' || location.pathname === '/auth/callback'
      ? location.pathname
      : 'admin'

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
          <Route path="/login" element={<PlatformLoginGate />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<RequirePlatformAdmin />}>
            <Route element={<PlatformAdminLayout />}>
              <Route path="/" element={<PlatformDashboardPage />} />
              <Route path="/tenants" element={<PlatformTenantsPage />} />
              <Route path="/langganan" element={<PlatformSubscriptionsPage />} />
              <Route path="/pembayaran" element={<PlatformPaymentsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  if (isPlatformAdminHost()) {
    return <PlatformAdminApp />
  }

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
          <Route path="/" element={<LandingRoute />} />
          <Route path="/daftar" element={<RegisterRoute />} />
          <Route path="/pilih-sppg" element={<PilihSppgPage />} />
          <Route path="/login" element={<LoginGate />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/menunggu-akses" element={<MenungguAksesPage />} />
            <Route path="/langganan" element={<LanggananPage />} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/belanja" element={<BelanjaListPage />} />
              <Route
                path="/belanja/baru"
                element={
                  <ManagerOnly>
                    <BelanjaFormPage />
                  </ManagerOnly>
                }
              />
              <Route path="/belanja/:id" element={<BelanjaDetailPage />} />
              <Route path="/porsi" element={<PorsiListPage />} />
              <Route
                path="/porsi/baru"
                element={
                  <ManagerOnly>
                    <PorsiFormPage />
                  </ManagerOnly>
                }
              />
              <Route path="/porsi/:id" element={<PorsiDetailPage />} />
              <Route path="/rekening" element={<RekeningPage />} />
              <Route path="/pengaturan" element={<SettingsPage />} />
              <Route
                path="/arsip-ekspor"
                element={
                  <SuperAdminOnly>
                    <ArsipEksporPage />
                  </SuperAdminOnly>
                }
              />
              <Route
                path="/arsip-ekspor/:id"
                element={
                  <SuperAdminOnly>
                    <ArsipEksporDetailPage />
                  </SuperAdminOnly>
                }
              />
              <Route
                path="/profil-sppg"
                element={
                  <SuperAdminOnly>
                    <SppgProfilePage />
                  </SuperAdminOnly>
                }
              />
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}
