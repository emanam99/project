import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'

function SantriOnlyRoute({ children }) {
  const { user } = useAuthStore()
  const location = useLocation()
  const isTokoOnly = user?.has_toko && !user?.santri_id
  const isSantriPath = ['/biodata', '/riwayat-pembayaran'].includes(location.pathname) ||
    location.pathname.startsWith('/riwayat-pembayaran/')
  if (isTokoOnly && isSantriPath) {
    return <Navigate to="/" replace />
  }
  return children
}
import Login from './pages/Login'
import Daftar from './pages/Daftar'
import SetupAkun from './pages/SetupAkun'
import UbahPassword from './pages/UbahPassword'
import UbahUsername from './pages/UbahUsername'
import Beranda from './pages/Beranda'
import Biodata from './pages/Biodata'
import RiwayatPembayaranIndex from './pages/riwayat/RiwayatPembayaranIndex'
import RiwayatPendaftaran from './pages/riwayat/RiwayatPendaftaran'
import RiwayatUwaba from './pages/riwayat/RiwayatUwaba'
import RiwayatKhusus from './pages/riwayat/RiwayatKhusus'
import RiwayatTunggakan from './pages/riwayat/RiwayatTunggakan'
import Profil from './pages/Profil'
import Toko from './pages/Toko'
import Barang from './pages/Barang'

function TokoRoute({ children }) {
  const { user } = useAuthStore()
  if (!user?.has_toko) return <Navigate to="/" replace />
  return children
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
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
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
        <Route path="biodata" element={<SantriOnlyRoute><Biodata /></SantriOnlyRoute>} />
        <Route path="riwayat-pembayaran" element={<SantriOnlyRoute><RiwayatPembayaranIndex /></SantriOnlyRoute>} />
        <Route path="riwayat-pembayaran/pendaftaran" element={<SantriOnlyRoute><RiwayatPendaftaran /></SantriOnlyRoute>} />
        <Route path="riwayat-pembayaran/uwaba" element={<SantriOnlyRoute><RiwayatUwaba /></SantriOnlyRoute>} />
        <Route path="riwayat-pembayaran/khusus" element={<SantriOnlyRoute><RiwayatKhusus /></SantriOnlyRoute>} />
        <Route path="riwayat-pembayaran/tunggakan" element={<SantriOnlyRoute><RiwayatTunggakan /></SantriOnlyRoute>} />
        <Route path="profil" element={<Profil />} />
        <Route path="toko" element={<TokoRoute><Toko /></TokoRoute>} />
        <Route path="barang" element={<TokoRoute><Barang /></TokoRoute>} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
    </Routes>
  )
}

export default App
