import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import DataSantriPage from './pages/DataSantriPage'
import AbsensiPage from './pages/AbsensiPage'
import PembayaranPage from './pages/PembayaranPage'
import JadwalPage from './pages/JadwalPage'
import AbsenGuruPage from './pages/AbsenGuruPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/data-santri" element={<DataSantriPage />} />
        <Route path="/absensi" element={<AbsensiPage />} />
        <Route path="/pembayaran" element={<PembayaranPage />} />
        <Route path="/jadwal" element={<JadwalPage />} />
        <Route path="/absen-guru" element={<AbsenGuruPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
