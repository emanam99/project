import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import Layout from './components/Layout'
import LazyFallback from './components/LazyFallback'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const DataSantriPage = lazy(() => import('./pages/DataSantriPage'))
const AbsensiPage = lazy(() => import('./pages/AbsensiPage'))
const AbsenRekapPage = lazy(() => import('./pages/AbsenRekapPage'))
const PembayaranPage = lazy(() => import('./pages/PembayaranPage'))
const TahunAjaranPage = lazy(() => import('./pages/TahunAjaranPage'))
const JadwalPage = lazy(() => import('./pages/JadwalPage'))
const AbsenGuruPage = lazy(() => import('./pages/AbsenGuruPage'))
const AbsenGuruRekapPage = lazy(() => import('./pages/AbsenGuruRekapPage'))
const AbsenGuruHasilRekapPage = lazy(() => import('./pages/AbsenGuruHasilRekapPage'))
const JurnalRekapPage = lazy(() => import('./pages/JurnalRekapPage'))
const PengurusPage = lazy(() => import('./pages/PengurusPage'))
const KelasPage = lazy(() => import('./pages/KelasPage'))
const MapelPage = lazy(() => import('./pages/MapelPage'))
const NilaiPage = lazy(() => import('./pages/NilaiPage'))
const NilaiRekapPage = lazy(() => import('./pages/NilaiRekapPage'))
const RekapPublishWizardPage = lazy(() => import('./pages/RekapPublishWizardPage'))
const RekapHasilPublishPage = lazy(() => import('./pages/RekapHasilPublishPage'))
const KalenderPage = lazy(() => import('./pages/Kalender/KalenderPage'))

function App() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/data-santri" element={<DataSantriPage />} />
            <Route path="/absensi" element={<AbsensiPage />} />
            <Route path="/absensi/rekap" element={<AbsenRekapPage />} />
            <Route path="/absensi/hasil-rekap" element={<Navigate to="/rekap/hasil" replace />} />
            <Route path="/absensi/hasil-rekap/:id" element={<Navigate to="/rekap/hasil" replace />} />
            <Route path="/nilai" element={<NilaiPage />} />
            <Route path="/nilai/rekap" element={<NilaiRekapPage />} />
            <Route path="/nilai/hasil-rekap" element={<Navigate to="/rekap/hasil" replace />} />
            <Route path="/nilai/hasil-rekap/:id" element={<Navigate to="/rekap/hasil" replace />} />
            <Route path="/rekap/publish" element={<RekapPublishWizardPage />} />
            <Route path="/rekap/publish/:id" element={<RekapPublishWizardPage />} />
            <Route path="/rekap/hasil" element={<RekapHasilPublishPage />} />
            <Route path="/rekap/hasil/:id" element={<RekapHasilPublishPage />} />
            <Route path="/pembayaran" element={<Navigate to="/pembayaran/bayar" replace />} />
            <Route path="/pembayaran/:tab" element={<PembayaranPage />} />
            <Route path="/tahun-ajaran" element={<TahunAjaranPage />} />
            <Route path="/jadwal" element={<JadwalPage />} />
            <Route path="/kalender" element={<KalenderPage />} />
            <Route path="/absen-guru" element={<AbsenGuruPage />} />
            <Route path="/absen-guru/rekap" element={<AbsenGuruRekapPage />} />
            <Route path="/absen-guru/hasil-rekap" element={<AbsenGuruHasilRekapPage />} />
            <Route path="/absen-guru/hasil-rekap/:id" element={<AbsenGuruHasilRekapPage />} />
            <Route path="/absen-guru/jurnal-rekap" element={<JurnalRekapPage />} />
            <Route path="/kelas" element={<KelasPage />} />
            <Route path="/mapel" element={<MapelPage />} />
            <Route path="/pengurus" element={<PengurusPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
