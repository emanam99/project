import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import Daftar from './pages/Daftar'
import LupaPassword from './pages/LupaPassword'
import SetupAkun from './pages/SetupAkun'
import UbahPassword from './pages/UbahPassword'
import UbahUsername from './pages/UbahUsername'
import Tentang from './pages/Tentang/index.jsx'
import Version from './pages/Tentang/Version'
import InfoAplikasi from './pages/Tentang/InfoAplikasi'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import SuperAdminRoute from './components/Auth/SuperAdminRoute'
import AdminRoute from './components/Auth/AdminRoute'
import RoleRoute from './components/Auth/RoleRoute'
import { createFinanceRoute } from './components/Auth/PermissionRoute'

// Route Keuangan: manage_finance + hanya admin_uwaba & super_admin (bukan admin_umroh)
const FinanceRoute = createFinanceRoute()
import { NotificationProvider } from './contexts/NotificationContext'
import InstallPrompt from './components/InstallPrompt'
import pwaSubscriptionService from './services/pwaSubscriptionService'

// Lazy load pages for code splitting
const DashboardUmum = lazy(() => import('./pages/Settings/DashboardUmum'))
const DashboardPembayaran = lazy(() => import('./pages/Pembayaran/DashboardPembayaran'))
const ManageData = lazy(() => import('./pages/Pembayaran/ManageData'))
const DashboardUmroh = lazy(() => import('./pages/Umroh/DashboardUmroh'))
const DashboardPendaftaran = lazy(() => import('./pages/Pendaftaran/DashboardPendaftaran'))
const Pendaftaran = lazy(() => import('./pages/Pendaftaran/index.jsx'))
const PendaftaranItem = lazy(() => import('./pages/Pendaftaran/Item'))
const PendaftaranData = lazy(() => import('./pages/Pendaftaran/PendaftaranData'))
const DataPendaftar = lazy(() => import('./pages/Pendaftaran/DataPendaftar'))
const PadukanData = lazy(() => import('./pages/Pendaftaran/PadukanData'))
const Pengaturan = lazy(() => import('./pages/Pendaftaran/Pengaturan'))
const ImageEditorPage = lazy(() => import('./pages/Pendaftaran/ImageEditorPage'))
const ManageItemSet = lazy(() => import('./pages/Pendaftaran/ManageItemSet'))
const ManageKondisi = lazy(() => import('./pages/Pendaftaran/ManageKondisi'))
const KondisiRegistrasi = lazy(() => import('./pages/Pendaftaran/KondisiRegistrasi'))
const AssignItemToSet = lazy(() => import('./pages/Pendaftaran/AssignItemToSet'))
const Simulasi = lazy(() => import('./pages/Pendaftaran/Simulasi'))
const Pembayaran = lazy(() => import('./pages/Pembayaran/index.jsx'))
const PembayaranGate = lazy(() => import('./pages/Pembayaran/PembayaranGate.jsx'))
const Laporan = lazy(() => import('./pages/Pembayaran/Laporan'))
const LaporanUmroh = lazy(() => import('./pages/Umroh/LaporanUmroh'))
const ManageUsers = lazy(() => import('./pages/Settings/ManageUsers'))
const Pengurus = lazy(() => import('./pages/Settings/Pengurus'))
const ImportPengurus = lazy(() => import('./pages/Settings/Pengurus/ImportPengurus'))
const Koordinator = lazy(() => import('./pages/UGT/Koordinator'))
const EditUser = lazy(() => import('./pages/Settings/EditUser'))
const ImportUsers = lazy(() => import('./pages/Settings/ImportUsers'))
const ImportKhusus = lazy(() => import('./pages/Pembayaran/ImportKhusus'))
const ImportTunggakan = lazy(() => import('./pages/Pembayaran/ImportTunggakan'))
const Profil = lazy(() => import('./pages/MyWorkspace/Profil/index.jsx'))
const Beranda = lazy(() => import('./pages/MyWorkspace/Beranda/index.jsx'))
const AktivitasSaya = lazy(() => import('./pages/MyWorkspace/AktivitasSaya/index.jsx'))
const SemuaMenu = lazy(() => import('./pages/MyWorkspace/SemuaMenu/index.jsx'))
const Print = lazy(() => import('./pages/Pembayaran/print/Print'))
const PrintPengeluaran = lazy(() => import('./pages/Keuangan/Pengeluaran/print/PrintPengeluaran'))
const Pengeluaran = lazy(() => import('./pages/Keuangan/Pengeluaran/index.jsx'))
const EditRencana = lazy(() => import('./pages/Keuangan/EditRencana'))
const Pemasukan = lazy(() => import('./pages/Keuangan/Pemasukan'))
const Aktivitas = lazy(() => import('./pages/Keuangan/Aktivitas'))
const KeuanganDashboard = lazy(() => import('./pages/Keuangan/KeuanganDashboard'))
const AktivitasTahunAjaran = lazy(() => import('./pages/Keuangan/Aktivitas/AktivitasTahunAjaran'))
const Lembaga = lazy(() => import('./pages/Settings/Lembaga'))
const Rombel = lazy(() => import('./pages/Settings/Rombel'))
const ManageJabatan = lazy(() => import('./pages/Settings/ManageJabatan'))
const ManageUploads = lazy(() => import('./pages/Settings/ManageUploads'))
const UmrohJamaah = lazy(() => import('./pages/Umroh/Jamaah'))
const UmrohJamaahForm = lazy(() => import('./pages/Umroh/JamaahForm'))
const UmrohTabungan = lazy(() => import('./pages/Umroh/Tabungan'))
const DashboardIjin = lazy(() => import('./pages/Ijin/DashboardIjin'))
const DataIjin = lazy(() => import('./pages/Ijin/DataIjin'))
const DataBoyong = lazy(() => import('./pages/Ijin/DataBoyong'))
const DataJuara = lazy(() => import('./pages/Juara/DataJuara'))
const PublicLayout = lazy(() => import('./pages/santri/PublicLayout'))
const PublicSantri = lazy(() => import('./pages/santri'))
const PublicUwaba = lazy(() => import('./pages/santri/PublicUwaba'))
const PublicKhusus = lazy(() => import('./pages/santri/PublicKhusus'))
const PublicTunggakan = lazy(() => import('./pages/santri/PublicTunggakan'))
const PublicIjin = lazy(() => import('./pages/santri/PublicIjin'))
const PublicShohifah = lazy(() => import('./pages/santri/PublicShohifah'))
const PublicKalender = lazy(() => import('./pages/santri/PublicKalender'))
const Kalender = lazy(() => import('./pages/Kalender/index.jsx'))
const KalenderPengaturan = lazy(() => import('./pages/Kalender/KalenderPengaturan'))
const KalenderHariPenting = lazy(() => import('./pages/Kalender/HariPenting'))
const Converter = lazy(() => import('./pages/Converter/index.jsx'))
const KalenderPesantren = lazy(() => import('./pages/KalenderPesantren/index.jsx'))
const KalenderPesantrenPengaturan = lazy(() => import('./pages/KalenderPesantren/Pengaturan.jsx'))
const KalenderPesantrenKelolaEvent = lazy(() => import('./pages/KalenderPesantren/KelolaEvent.jsx'))
const DataMadrasah = lazy(() => import('./pages/UGT/DataMadrasah'))
const DataToko = lazy(() => import('./pages/Cashless/DataToko'))
const PembuatanAkunCashless = lazy(() => import('./pages/Cashless/PembuatanAkunCashless'))
const PengaturanCashless = lazy(() => import('./pages/Cashless/PengaturanCashless'))
const TopUpCashless = lazy(() => import('./pages/Cashless/TopUpCashless'))
const CetakKartuCashless = lazy(() => import('./pages/Cashless/CetakKartuCashless'))
const RoleAkses = lazy(() => import('./pages/Settings/RoleAkses'))
const Fitur = lazy(() => import('./pages/Settings/Fitur'))
const TahunAjaranPage = lazy(() => import('./pages/Settings/TahunAjaran'))
const RombelSantri = lazy(() => import('./pages/Settings/RombelSantri'))
const DataSantri = lazy(() => import('./pages/Santri/DataSantri'))
const DataLulusan = lazy(() => import('./pages/Lulusan/DataLulusan'))
const Daerah = lazy(() => import('./pages/Domisili/Daerah'))
const Kamar = lazy(() => import('./pages/Domisili/Kamar'))
const KoneksiWa = lazy(() => import('./pages/WhatsApp/KoneksiWa'))

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
  </div>
)

// Catch-all: jangan arahkan /setup-akun, /ubah-password, /ubah-username ke login (link dari WA)
function CatchAllRedirect() {
  const { pathname } = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const p = pathname.toLowerCase()
  if (p === '/setup-akun' || p.startsWith('/setup-akun?')) {
    return <SetupAkun />
  }
  if (p === '/ubah-password' || p.startsWith('/ubah-password?')) {
    return <UbahPassword />
  }
  if (p === '/ubah-username' || p.startsWith('/ubah-username?')) {
    return <UbahUsername />
  }
  return <Navigate to={isAuthenticated ? '/beranda' : '/login'} replace />
}

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    let cancelled = false
    const initAuth = async () => {
      try {
        await checkAuth()
      } catch (e) {
        console.error('checkAuth error:', e)
      } finally {
        if (!cancelled) {
          setTimeout(() => setIsInitialized(true), 100)
        }
      }
    }
    initAuth()
    return () => { cancelled = true }
  }, [checkAuth])

  // Initialize PWA subscription saat user sudah authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Initialize subscription dengan delay untuk memastikan service worker sudah ready
      const initSubscription = async () => {
        try {
          // Tunggu service worker ready (bisa lebih lama di production)
          let retries = 0
          const maxRetries = 10
          
          while (retries < maxRetries) {
            try {
              if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready
                if (registration) {
                  console.log('✅ Service worker ready, initializing subscription...')
                  break
                }
              }
            } catch (e) {
              // Service worker belum ready, tunggu sebentar
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000))
            retries++
          }
          
          // Initialize subscription
          await pwaSubscriptionService.initialize()
        } catch (error) {
          // Log error untuk debugging
          console.error('❌ PWA subscription initialization error:', error)
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          })
        }
      }
      
      // Delay lebih lama untuk production
      const delay = window.location.hostname.includes('alutsmani.id') ? 3000 : 1000
      setTimeout(initSubscription, delay)
    }
  }, [isAuthenticated])

  // Don't render routes until auth check is complete (tampilkan loading agar tidak putih polos)
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-teal-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <NotificationProvider>
      <InstallPrompt />
      <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          isAuthenticated ? <Navigate to="/beranda" replace /> : <Login />
        } 
      />
      <Route 
        path="/daftar" 
        element={
          isAuthenticated ? <Navigate to="/beranda" replace /> : <Daftar />
        } 
      />
      <Route 
        path="/lupa-password" 
        element={
          isAuthenticated ? <Navigate to="/beranda" replace /> : <LupaPassword />
        } 
      />
      <Route 
        path="/setup-akun" 
        element={<SetupAkun />} 
      />
      <Route 
        path="/ubah-password" 
        element={<UbahPassword />} 
      />
      <Route 
        path="/ubah-username" 
        element={<UbahUsername />} 
      />
      <Route path="/tentang" element={<Tentang />} />
      <Route path="/version" element={<Version />} />
      <Route path="/info-aplikasi" element={<InfoAplikasi />} />

      {/* Public Santri Routes - No Auth Required */}
      <Route element={
        <Suspense fallback={<PageLoader />}>
          <PublicLayout />
        </Suspense>
      }>
        <Route 
          path="/public/santri" 
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicSantri />
            </Suspense>
          } 
        />
        <Route 
          path="/public/uwaba" 
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicUwaba />
            </Suspense>
          } 
        />
        <Route 
          path="/public/khusus" 
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicKhusus />
            </Suspense>
          } 
        />
        <Route 
          path="/public/tunggakan" 
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicTunggakan />
            </Suspense>
          } 
        />
        <Route 
          path="/public/ijin" 
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicIjin />
            </Suspense>
          } 
        />
        <Route 
          path="/public/shohifah" 
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicShohifah />
            </Suspense>
          } 
        />
        <Route 
          path="/public/kalender" 
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicKalender />
            </Suspense>
          } 
        />
      </Route>
      
      {/* Print Routes - Public (No Layout, No Auth Required) */}
      <Route 
        path="/print" 
        element={
          <Suspense fallback={<PageLoader />}>
            <Print />
          </Suspense>
        } 
      />
      <Route 
        path="/print-uwaba" 
        element={
          <Suspense fallback={<PageLoader />}>
            <Print />
          </Suspense>
        } 
      />
      <Route 
        path="/print-pendaftaran" 
        element={
          <Suspense fallback={<PageLoader />}>
            <Print />
          </Suspense>
        } 
      />
      <Route 
        path="/print-pengeluaran" 
        element={
          <Suspense fallback={<PageLoader />}>
            <PrintPengeluaran />
          </Suspense>
        } 
      />
      
      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Halaman pertama untuk semua user: Beranda */}
          <Route path="/" element={<Navigate to="/beranda" replace />} />
          <Route path="/dashboard" element={<Navigate to="/beranda" replace />} />
          {/* Dashboard Pembayaran - Only accessible by admin_uwaba, petugas_uwaba, and super_admin */}
          <Route element={<RoleRoute allowedRoles={['admin_uwaba', 'petugas_uwaba', 'super_admin']} />}>
          <Route 
            path="/dashboard-pembayaran" 
            element={
              <Suspense fallback={<PageLoader />}>
                <DashboardPembayaran />
              </Suspense>
            } 
          />
          </Route>
          {/* Dashboard Umum - Only accessible by admin_uwaba, petugas_uwaba, or super_admin role */}
          <Route element={<RoleRoute allowedRoles={['admin_uwaba', 'petugas_uwaba', 'super_admin']} />}>
            <Route 
              path="/dashboard-umum" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardUmum />
                </Suspense>
              } 
            />
          </Route>
          {/* Dashboard Pendaftaran - Only accessible by admin_psb or petugas_psb role */}
          <Route element={<RoleRoute allowedRoles={['admin_psb', 'petugas_psb', 'super_admin']} />}>
            <Route 
              path="/dashboard-pendaftaran" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardPendaftaran />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Pendaftaran />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/data" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <PendaftaranData />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/data-pendaftar" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataPendaftar />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/editor" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ImageEditorPage />
                </Suspense>
              } 
            />
            
            {/* Pendaftaran Super Admin only: Item, Padukan Data, Item Set, Kondisi, Registrasi, Assign, Simulasi, Pengaturan */}
            <Route element={<RoleRoute allowedRoles={['super_admin']} />}>
              <Route 
                path="/pendaftaran/item" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <PendaftaranItem />
                  </Suspense>
                } 
              />
              <Route 
                path="/pendaftaran/padukan-data" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <PadukanData />
                  </Suspense>
                } 
              />
              <Route 
                path="/pendaftaran/manage-item-set" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ManageItemSet />
                  </Suspense>
                } 
              />
              <Route 
                path="/pendaftaran/manage-kondisi" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ManageKondisi />
                  </Suspense>
                } 
              />
              <Route 
                path="/pendaftaran/kondisi-registrasi" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <KondisiRegistrasi />
                  </Suspense>
                } 
              />
              <Route 
                path="/pendaftaran/assign-item" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <AssignItemToSet />
                  </Suspense>
                } 
              />
              <Route 
                path="/pendaftaran/simulasi" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Simulasi />
                  </Suspense>
                } 
              />
              <Route 
                path="/pendaftaran/pengaturan" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Pengaturan />
                  </Suspense>
                } 
              />
            </Route>
          </Route>

          {/* UWABA / Pembayaran Routes - satu route agar uwaba/tunggakan/khusus tidak unmount (biodata tetap) */}
          <Route element={<RoleRoute allowedRoles={['admin_uwaba', 'petugas_uwaba', 'super_admin']} />}>
            <Route 
              path="/pembayaran/manage-data" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageData />
                </Suspense>
              } 
            />
            <Route 
              path="/pembayaran/import-khusus" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ImportKhusus />
                </Suspense>
              } 
            />
            <Route 
              path="/pembayaran/import-tunggakan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ImportTunggakan />
                </Suspense>
              } 
            />
            <Route 
              path="/:pembayaranMode" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <PembayaranGate />
                </Suspense>
              } 
            />
          </Route>
          {/* Laporan - Only accessible by admin_uwaba, petugas_uwaba, admin_psb, petugas_psb, and super_admin */}
          <Route element={<RoleRoute allowedRoles={['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']} />}>
          <Route 
            path="/laporan" 
            element={
              <Suspense fallback={<PageLoader />}>
                <Laporan />
              </Suspense>
            } 
          />
          </Route>
          {/* Beranda & Profil - semua user login bisa akses */}
          <Route 
            path="/beranda" 
            element={
              <Suspense fallback={<PageLoader />}>
                <Beranda />
              </Suspense>
            } 
          />
          <Route 
            path="/semua-menu" 
            element={
              <Suspense fallback={<PageLoader />}>
                <SemuaMenu />
              </Suspense>
            } 
          />
          <Route 
            path="/profil/*" 
            element={
              <Suspense fallback={<PageLoader />}>
                <Profil />
              </Suspense>
            } 
          />
          <Route 
            path="/aktivitas-saya" 
            element={
              <Suspense fallback={<PageLoader />}>
                <AktivitasSaya />
              </Suspense>
            } 
          />
          {/* Kalender - semua user login bisa lihat */}
          <Route 
            path="/kalender" 
            element={
              <Suspense fallback={<PageLoader />}>
                <Kalender />
              </Suspense>
            } 
          />
          <Route 
            path="/kalender/hari-penting" 
            element={
              <Suspense fallback={<PageLoader />}>
                <KalenderHariPenting />
              </Suspense>
            } 
          />
          {/* Converter - hanya super_admin dan admin_kalender */}
          <Route element={<RoleRoute allowedRoles={['super_admin', 'admin_kalender']} />}>
            <Route
              path="/converter"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Converter />
                </Suspense>
              }
            />
          </Route>
          {/* Pengaturan Kalender - admin_kalender atau super_admin saja */}
          <Route element={<RoleRoute allowedRoles={['admin_kalender', 'super_admin']} />}>
            <Route 
              path="/kalender/pengaturan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <KalenderPengaturan />
                </Suspense>
              }
            />
          </Route>
          {/* Kalender Pesantren (Google Calendar) — hanya super_admin */}
          <Route element={<SuperAdminRoute />}>
            <Route 
              path="/kalender-pesantren" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <KalenderPesantren />
                </Suspense>
              } 
            />
            <Route 
              path="/kalender-pesantren/pengaturan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <KalenderPesantrenPengaturan />
                </Suspense>
              }
            />
            <Route 
              path="/kalender-pesantren/kelola-event" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <KalenderPesantrenKelolaEvent />
                </Suspense>
              }
            />
          </Route>
          {/* Routes Keuangan: manage_finance + hanya admin_uwaba & super_admin */}
          <Route element={<FinanceRoute />}>
            <Route 
              path="/dashboard-keuangan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <KeuanganDashboard />
                </Suspense>
              } 
            />
            <Route 
              path="/pengeluaran" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Pengeluaran />
                </Suspense>
              } 
            />
            <Route 
              path="/pengeluaran/create" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <EditRencana />
                </Suspense>
              } 
            />
            <Route 
              path="/pengeluaran/edit/:id" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <EditRencana />
                </Suspense>
              } 
            />
            <Route 
              path="/pemasukan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Pemasukan />
                </Suspense>
              } 
            />
            <Route 
              path="/aktivitas" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Aktivitas />
                </Suspense>
              } 
            />
            <Route 
              path="/aktivitas-tahun-ajaran" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <AktivitasTahunAjaran />
                </Suspense>
              } 
            />
          </Route>
          {/* Super Admin Only Routes */}
          <Route element={<SuperAdminRoute />}>
            <Route 
              path="/pendaftaran/item" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <PendaftaranItem />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/manage-item-set" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageItemSet />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/manage-kondisi" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageKondisi />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/kondisi-registrasi" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <KondisiRegistrasi />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/assign-item" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <AssignItemToSet />
                </Suspense>
              } 
            />
            <Route 
              path="/pendaftaran/simulasi" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Simulasi />
                </Suspense>
              } 
            />
            <Route 
              path="/manage-users" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageUsers />
                </Suspense>
              } 
            />
            <Route 
              path="/pengurus" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Pengurus />
                </Suspense>
              } 
            />
            <Route 
              path="/pengurus/import" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ImportPengurus />
                </Suspense>
              } 
            />
            <Route 
              path="/manage-users/edit/:id" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <EditUser />
                </Suspense>
              } 
            />
            <Route 
              path="/manage-users/import" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ImportUsers />
                </Suspense>
              } 
            />
            <Route 
              path="/settings/tahun-ajaran" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <TahunAjaranPage />
                </Suspense>
              } 
            />
            <Route 
              path="/lembaga" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Lembaga />
                </Suspense>
              } 
            />
            <Route 
              path="/santri" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataSantri />
                </Suspense>
              } 
            />
            <Route 
              path="/lulusan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataLulusan />
                </Suspense>
              } 
            />
            <Route 
              path="/rombel" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Rombel />
                </Suspense>
              } 
            />
            <Route 
              path="/rombel-santri" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <RombelSantri />
                </Suspense>
              } 
            />
            <Route 
              path="/domisili/daerah" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Daerah />
                </Suspense>
              } 
            />
            <Route 
              path="/domisili/kamar" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Kamar />
                </Suspense>
              } 
            />
            <Route 
              path="/manage-jabatan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageJabatan />
                </Suspense>
              } 
            />
            <Route 
              path="/settings/role-akses" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <RoleAkses />
                </Suspense>
              } 
            />
            <Route 
              path="/settings/fitur" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Fitur />
                </Suspense>
              } 
            />
            <Route 
              path="/manage-uploads" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageUploads />
                </Suspense>
              } 
            />
            <Route 
              path="/whatsapp-koneksi" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <KoneksiWa />
                </Suspense>
              } 
            />
            <Route 
              path="/juara/data-juara" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataJuara />
                </Suspense>
              } 
            />
          </Route>
          
          {/* Umroh — akses hanya super_admin dan petugas_umroh */}
          <Route element={<RoleRoute allowedRoles={['petugas_umroh', 'super_admin']} />}>
            <Route 
              path="/dashboard-umroh" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardUmroh />
                </Suspense>
              } 
            />
            <Route 
              path="/laporan-umroh" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <LaporanUmroh />
                </Suspense>
              } 
            />
            <Route 
              path="/umroh/jamaah" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <UmrohJamaah />
                </Suspense>
              } 
            />
            <Route 
              path="/umroh/jamaah/create" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <UmrohJamaahForm />
                </Suspense>
              } 
            />
            <Route 
              path="/umroh/jamaah/:id/edit" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <UmrohJamaahForm />
                </Suspense>
              } 
            />
            <Route 
              path="/umroh/tabungan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <UmrohTabungan />
                </Suspense>
              } 
            />
          </Route>
          
          {/* Dashboard Ijin - Only accessible by admin_ijin, petugas_ijin, and super_admin */}
          <Route element={<RoleRoute allowedRoles={['admin_ijin', 'petugas_ijin', 'super_admin']} />}>
            <Route 
              path="/dashboard-ijin" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardIjin />
                </Suspense>
              } 
            />
            <Route 
              path="/ijin/data-ijin" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataIjin />
                </Suspense>
              } 
            />
            {/* Data Boyong - Only admin_ijin and super_admin (petugas_ijin tidak bisa akses) */}
            <Route element={<RoleRoute allowedRoles={['admin_ijin', 'super_admin']} />}>
              <Route 
                path="/ijin/data-boyong" 
                element={
                  <Suspense fallback={<PageLoader />}>
                    <DataBoyong />
                  </Suspense>
                } 
              />
            </Route>
          </Route>
          {/* UGT - Data Madrasah: admin_ugt, koordinator_ugt, super_admin */}
          <Route element={<RoleRoute allowedRoles={['admin_ugt', 'koordinator_ugt', 'super_admin']} />}>
            <Route 
              path="/ugt/data-madrasah" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataMadrasah />
                </Suspense>
              } 
            />
          </Route>
          {/* UGT - Koordinator: admin_ugt, super_admin (Admin GT) */}
          <Route element={<RoleRoute allowedRoles={['admin_ugt', 'super_admin']} />}>
            <Route 
              path="/koordinator" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Koordinator />
                </Suspense>
              } 
            />
          </Route>
          {/* Cashless: admin_cashless, petugas_cashless, super_admin (petugas hanya lihat menu Top Up) */}
          <Route element={<RoleRoute allowedRoles={['admin_cashless', 'petugas_cashless', 'super_admin']} />}>
            <Route 
              path="/cashless/data-toko" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataToko />
                </Suspense>
              } 
            />
            <Route 
              path="/cashless/pembuatan-akun" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <PembuatanAkunCashless />
                </Suspense>
              } 
            />
            <Route 
              path="/cashless/pengaturan" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <PengaturanCashless />
                </Suspense>
              } 
            />
            <Route 
              path="/cashless/topup" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <TopUpCashless />
                </Suspense>
              } 
            />
            <Route 
              path="/cashless/cetak-kartu/:id" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <CetakKartuCashless />
                </Suspense>
              } 
            />
          </Route>
        </Route>
      </Route>
      
      {/* 404 - Jangan arahkan /setup-akun ke login (link WA ke buat username/password) */}
      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
    </NotificationProvider>
  )
}

export default App

