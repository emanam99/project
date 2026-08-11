import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { loginPathWithRedirect } from './utils/loginRedirect'
import * as serviceWorkerRegistration from './serviceWorkerRegistration'
import { startAppUpdateWatcher } from './utils/appUpdate'
import { getGambarUrl } from './config/images'
import { ACCESS_GROUP, resolveAccessGroupKeys } from './config/accessGroups'
import { ACCESS_MODE } from './config/accessMode'
import Layout from './components/Layout'
import LayoutGate from './components/LayoutGate'
import PageLoader from './components/PageLoader'

import AuthPagesWrapper from './components/Auth/AuthPagesWrapper'
// Halaman auth dipertahankan eager-import: dipakai segera saat user belum login.
import { LoginFormCard } from './pages/Login'
import { DaftarFormCard } from './pages/Daftar'
import { LupaPasswordFormCard } from './pages/LupaPassword'
import { LupaUsernameFormCard } from './pages/LupaUsername'
import { LupaNisFormCard } from './pages/LupaNis'
import { LupaNisHasilCard } from './pages/LupaNisHasil'
import { LupaNisUploadKkCard } from './pages/LupaNisUploadKk'
import { LupaNisTerkirimCard } from './pages/LupaNisTerkirim'
import PwaInstallPrompt from './components/PwaInstallPrompt'

// Route-level code splitting (audit Mei 2026): halaman besar dimuat saat dibutuhkan.
// Halaman ringan/dipakai segera tetap eager untuk first paint cepat.
const SetupAkun = lazy(() => import('./pages/SetupAkun'))
const UbahPassword = lazy(() => import('./pages/UbahPassword'))
const UbahUsername = lazy(() => import('./pages/UbahUsername'))
const Beranda = lazy(() => import('./pages/workspace/Beranda'))
const MenuPage = lazy(() => import('./pages/workspace/MenuPage'))
const Profil = lazy(() => import('./pages/workspace/Profil'))
const Biodata = lazy(() => import('./pages/santri/Biodata'))
const RiwayatPembayaranIndex = lazy(() => import('./pages/santri/riwayat/RiwayatPembayaranIndex'))
const RiwayatPendaftaran = lazy(() => import('./pages/santri/riwayat/RiwayatPendaftaran'))
const RiwayatUwaba = lazy(() => import('./pages/santri/riwayat/RiwayatUwaba'))
const RiwayatKhusus = lazy(() => import('./pages/santri/riwayat/RiwayatKhusus'))
const RiwayatTunggakan = lazy(() => import('./pages/santri/riwayat/RiwayatTunggakan'))
const Toko = lazy(() => import('./pages/toko/Toko'))
const TokoSaldo = lazy(() => import('./pages/toko/TokoSaldo'))
const Barang = lazy(() => import('./pages/toko/Barang'))
const Penjualan = lazy(() => import('./pages/toko/Penjualan'))
const RiwayatPenjualan = lazy(() => import('./pages/toko/RiwayatPenjualan'))
const WaliSantriHome = lazy(() => import('./pages/waliSantri/WaliSantriHome'))
const PjgtDashboard = lazy(() => import('./pages/pjgt/PjgtDashboard'))
const PjgtMadrasahProfil = lazy(() => import('./pages/pjgt/PjgtMadrasahProfil'))
const PjgtMadrasahEditPage = lazy(() => import('./pages/pjgt/PjgtMadrasahEditPage'))
const PjgtLaporanPage = lazy(() => import('./pages/pjgt/PjgtLaporanPage'))
const PjgtRiwayatGuruTugasPage = lazy(() => import('./pages/pjgt/PjgtRiwayatGuruTugasPage'))
const SantriGtLaporanPage = lazy(() => import('./pages/santri/gt/SantriGtLaporanPage'))
const KompasPage = lazy(() => import('./pages/kompas/KompasPage'))
const RiwayatIjin = lazy(() => import('./pages/santri/riwayat/RiwayatIjin'))
const RiwayatPelanggaran = lazy(() => import('./pages/santri/riwayat/RiwayatPelanggaran'))
const ERapor = lazy(() => import('./pages/santri/eRapor'))
const RiwayatDiniyahFormal = lazy(() => import('./pages/santri/riwayat/RiwayatDiniyahFormal'))
const RiwayatKamar = lazy(() => import('./pages/santri/riwayat/RiwayatKamar'))
const RiwayatLttq = lazy(() => import('./pages/santri/riwayat/RiwayatLttq'))
const Cashless = lazy(() => import('./pages/santri/Cashless'))
const PilihAksesPage = lazy(() => import('./pages/PilihAksesPage'))
const LengkapiPortal = lazy(() => import('./pages/LengkapiPortal'))
const SyaratKetentuan = lazy(() => import('./pages/legal/SyaratKetentuan'))
const KebijakanPengembalianDana = lazy(() => import('./pages/legal/KebijakanPengembalianDana'))
const FAQ = lazy(() => import('./pages/legal/FAQ'))

/** Belum login → /login dengan redirect ke path yang diminta (mis. QR kwitansi). */
function RequireAuth({ children }) {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to={loginPathWithRedirect(location.pathname, location.search)} replace />
  }
  return children
}

function SantriOnlyRoute({ children }) {
  const { user, activeAccess } = useAuthStore()
  if (activeAccess !== ACCESS_MODE.santri || !user?.santri_id) {
    return <Navigate to="/" replace />
  }
  return children
}

function LoginOrHomeRedirect() {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Navigate to={loginPathWithRedirect(location.pathname, location.search)} replace />
}

function TokoRoute({ children }) {
  const { user, activeAccess } = useAuthStore()
  if (activeAccess !== ACCESS_MODE.toko || !user?.has_toko) {
    return <Navigate to="/" replace />
  }
  return children
}

function WaliSantriRoute({ children }) {
  const { user, activeAccess } = useAuthStore()
  if (
    activeAccess !== ACCESS_MODE.wali ||
    !resolveAccessGroupKeys(user).has(ACCESS_GROUP.wali_santri)
  ) {
    return <Navigate to="/" replace />
  }
  return children
}

function PjgtRoute({ children }) {
  const { user, activeAccess } = useAuthStore()
  if (
    activeAccess !== ACCESS_MODE.pjgt ||
    !resolveAccessGroupKeys(user).has(ACCESS_GROUP.pjgt)
  ) {
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
  const pwaActivatedRef = useRef(false)
  const swRegistrationRef = useRef(null)

  useEffect(() => {
    checkAuth().finally(() => setReady(true))
  }, [checkAuth])

  // Cek versi dist (pwa-release.txt) sejak awal — termasuk halaman login
  useEffect(() => startAppUpdateWatcher(() => swRegistrationRef.current), [])

  // Daftarkan SW segera setelah app siap (bukan hanya setelah login) agar update PWA sampai ke semua user
  useEffect(() => {
    if (!ready || pwaActivatedRef.current) return
    pwaActivatedRef.current = true
    serviceWorkerRegistration.register({
      onUpdate: (registration) => {
        swRegistrationRef.current = registration || null
        if (registration?.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      },
      onSuccess: (registration) => {
        swRegistrationRef.current = registration || null
        console.log('[myBeddien] Service Worker siap – pembaruan akan auto-load.')
      },
    })
  }, [ready])

  // Manifest PWA sejak app siap (termasuk login) agar beforeinstallprompt tersedia di auth
  useEffect(() => {
    if (!ready) return undefined
    const head = document.head
    if (!head) return undefined

    const ensureMeta = (selector, attrs) => {
      let el = head.querySelector(selector)
      if (!el) {
        el = document.createElement('meta')
        head.appendChild(el)
      }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      return el
    }

    const appleTitleEl = ensureMeta('meta[data-mb-pwa="apple-title"]', {
      'data-mb-pwa': 'apple-title',
      name: 'apple-mobile-web-app-title',
      content: 'myBeddien',
    })

    const ensureLink = (selector, attrs) => {
      let el = head.querySelector(selector)
      if (!el) {
        el = document.createElement('link')
        head.appendChild(el)
      }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      return el
    }

    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    const appVer = import.meta.env.VITE_APP_VERSION || ''
    const manifestHref = `${base}/manifest.webmanifest${appVer ? `?v=${encodeURIComponent(appVer)}` : ''}`

    const manifestEl = ensureLink('link[data-mb-pwa="manifest"]', {
      rel: 'manifest',
      href: manifestHref,
      'data-mb-pwa': 'manifest',
    })
    const appleIconEl = ensureLink('link[data-mb-pwa="apple-touch-icon"]', {
      rel: 'apple-touch-icon',
      href: getGambarUrl('/icon/mybeddienicon192.png'),
      'data-mb-pwa': 'apple-touch-icon',
    })
    const icon192El = ensureLink('link[data-mb-pwa="icon-192"]', {
      rel: 'icon',
      type: 'image/png',
      sizes: '192x192',
      href: getGambarUrl('/icon/mybeddienicon192.png'),
      'data-mb-pwa': 'icon-192',
    })
    const icon512El = ensureLink('link[data-mb-pwa="icon-512"]', {
      rel: 'icon',
      type: 'image/png',
      sizes: '512x512',
      href: getGambarUrl('/icon/mybeddienicon512.png'),
      'data-mb-pwa': 'icon-512',
    })

    return () => {
      appleTitleEl?.remove()
      manifestEl?.remove()
      appleIconEl?.remove()
      icon192El?.remove()
      icon512El?.remove()
    }
  }, [ready])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1761ac]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/80 border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <Suspense fallback={<PageLoader />}>
      <Routes>
      <Route element={<AuthPagesWrapper />}>
        <Route path="/login" element={<LoginFormCard />} />
        <Route path="/login-pjgt" element={<LoginFormCard />} />
        <Route path="/daftar" element={<DaftarFormCard />} />
        <Route path="/daftar-pjgt" element={<DaftarFormCard variant="pjgt" />} />
        <Route path="/daftar-toko" element={<DaftarFormCard variant="toko" />} />
        <Route path="/lupa-password" element={<LupaPasswordFormCard />} />
        <Route path="/lupa-password-pjgt" element={<LupaPasswordFormCard />} />
        <Route path="/lupa-password-toko" element={<LupaPasswordFormCard />} />
        <Route path="/lupa-username" element={<LupaUsernameFormCard />} />
        <Route path="/lupa-username-pjgt" element={<LupaUsernameFormCard />} />
        <Route path="/lupa-username-toko" element={<LupaUsernameFormCard />} />
        <Route path="/lupa-nis" element={<LupaNisFormCard />} />
        <Route path="/lupa-nis/hasil" element={<LupaNisHasilCard />} />
        <Route path="/lupa-nis/upload-kk" element={<LupaNisUploadKkCard />} />
        <Route path="/lupa-nis/terkirim" element={<LupaNisTerkirimCard />} />
      </Route>
      <Route path="/setup-akun" element={isAuthenticated ? <Navigate to="/" replace /> : <SetupAkun />} />
      <Route path="/ubah-password" element={<UbahPassword />} />
      <Route path="/ubah-username" element={<UbahUsername />} />
      <Route
        path="/pilih-akses"
        element={<RequireAuth><PilihAksesPage /></RequireAuth>}
      />
      <Route path="/" element={<RequireAuth><LayoutGate /></RequireAuth>}>
        <Route path="lengkapi-portal" element={<LengkapiPortal />} />
        <Route element={<Layout />}>
        <Route index element={<Beranda />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="profil" element={<Profil />} />

        <Route path="santri/biodata" element={<SantriOnlyRoute><Biodata /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran" element={<SantriOnlyRoute><RiwayatPembayaranIndex /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/pendaftaran" element={<SantriOnlyRoute><RiwayatPendaftaran /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/uwaba" element={<SantriOnlyRoute><RiwayatUwaba /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/khusus" element={<SantriOnlyRoute><RiwayatKhusus /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pembayaran/tunggakan" element={<SantriOnlyRoute><RiwayatTunggakan /></SantriOnlyRoute>} />
        <Route path="santri/laporan-gt" element={<SantriOnlyRoute><SantriGtLaporanPage /></SantriOnlyRoute>} />
        <Route path="santri/kompas" element={<SantriOnlyRoute><KompasPage /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-ijin" element={<SantriOnlyRoute><RiwayatIjin /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-pelanggaran" element={<SantriOnlyRoute><RiwayatPelanggaran /></SantriOnlyRoute>} />
        <Route path="santri/e-rapor" element={<SantriOnlyRoute><ERapor /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-diniyah-formal" element={<SantriOnlyRoute><RiwayatDiniyahFormal /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-kamar" element={<SantriOnlyRoute><RiwayatKamar /></SantriOnlyRoute>} />
        <Route path="santri/riwayat-lttq" element={<SantriOnlyRoute><RiwayatLttq /></SantriOnlyRoute>} />
        <Route path="santri/cashless" element={<SantriOnlyRoute><Cashless /></SantriOnlyRoute>} />

        <Route path="wali-santri" element={<WaliSantriRoute><WaliSantriHome /></WaliSantriRoute>} />

        <Route path="toko" element={<TokoRoute><Toko /></TokoRoute>} />
        <Route path="toko/saldo" element={<TokoRoute><TokoSaldo /></TokoRoute>} />
        <Route path="toko/barang" element={<TokoRoute><Barang /></TokoRoute>} />
        <Route path="toko/penjualan" element={<TokoRoute><Penjualan /></TokoRoute>} />
        <Route path="toko/riwayat" element={<TokoRoute><RiwayatPenjualan /></TokoRoute>} />

        <Route path="pjgt/dashboard" element={<PjgtRoute><PjgtDashboard /></PjgtRoute>} />
        <Route path="pjgt" element={<Navigate to="/pjgt/dashboard" replace />} />
        <Route path="pjgt/madrasah" element={<PjgtRoute><PjgtMadrasahProfil /></PjgtRoute>} />
        <Route path="pjgt/madrasah/edit" element={<PjgtRoute><PjgtMadrasahEditPage /></PjgtRoute>} />
        <Route path="pjgt/laporan" element={<PjgtRoute><PjgtLaporanPage /></PjgtRoute>} />
        <Route path="pjgt/guru-tugas" element={<PjgtRoute><PjgtRiwayatGuruTugasPage /></PjgtRoute>} />
        <Route path="pjgt/kompas" element={<PjgtRoute><KompasPage /></PjgtRoute>} />

        <Route path="syarat-ketentuan" element={<SyaratKetentuan />} />
        <Route path="kebijakan-pengembalian-dana" element={<KebijakanPengembalianDana />} />
        <Route path="faq" element={<FAQ />} />

        <Route path="biodata" element={<Navigate to="/santri/biodata" replace />} />
        <Route path="riwayat-pembayaran/*" element={<LegacyRiwayatRedirect />} />
        <Route path="barang" element={<Navigate to="/toko/barang" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<LoginOrHomeRedirect />} />
    </Routes>
    </Suspense>
    {isAuthenticated && ready ? <PwaInstallPrompt /> : null}
    </>
  )
}

export default App
