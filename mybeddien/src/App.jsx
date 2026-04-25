import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { ACCESS_GROUP, resolveAccessGroupKeys } from './config/accessGroups'
import Layout from './components/Layout'

import Login from './pages/Login'
import Daftar from './pages/Daftar'
import SetupAkun from './pages/SetupAkun'
import UbahPassword from './pages/UbahPassword'
import UbahUsername from './pages/UbahUsername'
import Beranda from './pages/workspace/Beranda'
import Profil from './pages/workspace/Profil'
import Biodata from './pages/santri/Biodata'
import RiwayatPembayaranIndex from './pages/santri/riwayat/RiwayatPembayaranIndex'
import RiwayatPendaftaran from './pages/santri/riwayat/RiwayatPendaftaran'
import RiwayatUwaba from './pages/santri/riwayat/RiwayatUwaba'
import RiwayatKhusus from './pages/santri/riwayat/RiwayatKhusus'
import RiwayatTunggakan from './pages/santri/riwayat/RiwayatTunggakan'
import Toko from './pages/toko/Toko'
import Barang from './pages/toko/Barang'
import WaliSantriHome from './pages/waliSantri/WaliSantriHome'
import PjgtHome from './pages/pjgt/PjgtHome'

function SantriOnlyRoute({ children }) {
  const { user } = useAuthStore()
  const location = useLocation()
  const isTokoOnly = user?.has_toko && !user?.santri_id
  const isSantriPath = location.pathname.startsWith('/santri/')
  if (isTokoOnly && isSantriPath) {
    return <Navigate to="/" replace />
  }
  return children
}

function TokoRoute({ children }) {
  const { user } = useAuthStore()
  if (!user?.has_toko) return <Navigate to="/" replace />
  return children
}

function WaliSantriRoute({ children }) {
  const { user } = useAuthStore()
  if (!resolveAccessGroupKeys(user).has(ACCESS_GROUP.wali_santri)) {
    return <Navigate to="/" replace />
  }
  return children
}

function PjgtRoute({ children }) {
  const { user } = useAuthStore()
  if (!resolveAccessGroupKeys(user).has(ACCESS_GROUP.pjgt)) {
    return <Navigate to="/" replace />
  }
  return children
}

/** Redirect URL lama bookmark / tautan eksternal */
function LegacyRiwayatRedirect() {
  const { pathname, search, hash } = useLocation()
  const next = pathname.replace(/^\/riwayat-pembayaran/, '/santri/riwayat-pembayaran')
  return <Navigate to={`${next}${search}${hash}`} replace />
}

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    checkAuth().finally(() => setReady(true))
  }, [checkAuth])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/daftar" element={isAuthenticated ? <Navigate to="/" replace /> : <Daftar />} />
      <Route path="/setup-akun" element={isAuthenticated ? <Navigate to="/" replace /> : <SetupAkun />} />
      <Route path="/ubah-password" element={<UbahPassword />} />
      <Route path="/ubah-username" element={<UbahUsername />} />
      <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Beranda />} />
        <Route path="profil" element={<Profil />} />

        <Route path="santri/biodata" element={<SantriOnlyRoute><Biodata /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran" element={<SantriOnlyRoute><RiwayatPembayaranIndex /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/pendaftaran" element={<SantriOnlyRoute><RiwayatPendaftaran /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/uwaba" element={<SantriOnlyRoute><RiwayatUwaba /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/khusus" element={<SantriOnlyRoute><RiwayatKhusus /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/tunggakan" element={<SantriOnlyRoute><RiwayatTunggakan /></SantriOnlyRoute>} />

        <Route path="wali-santri" element={<WaliSantriRoute><WaliSantriHome /></WaliSantriRoute>} />

        <Route path="toko" element={<TokoRoute><Toko /></TokoRoute>} />
        <Route path="toko/barang" element={<TokoRoute><Barang /></TokoRoute>} />

        <Route path="pjgt" element={<PjgtRoute><PjgtHome /></PjgtRoute>} />

        <Route path="biodata" element={<Navigate to="/santri/biodata" replace />} />
        <Route path="riwayat-pembayaran/*" element={<LegacyRiwayatRedirect />} />
        <Route path="barang" element={<Navigate to="/toko/barang" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
    </Routes>
  )
}

export default App
