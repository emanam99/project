import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Login from './pages/Login'
import Layout from './components/Layout/Layout'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import { NotificationProvider } from './contexts/NotificationContext'
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext'

// Lazy load pages
const PilihanStatus = lazy(() => import('./pages/PilihanStatus'))
const PilihanOpsiPendidikan = lazy(() => import('./pages/PilihanOpsiPendidikan'))
const PilihanStatusSantri = lazy(() => import('./pages/PilihanStatusSantri'))
const PilihanStatusMurid = lazy(() => import('./pages/PilihanStatusMurid'))
const PilihanProdi = lazy(() => import('./pages/PilihanProdi'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Biodata = lazy(() => import('./pages/Biodata'))
const Berkas = lazy(() => import('./pages/Berkas'))
const Pembayaran = lazy(() => import('./pages/Pembayaran'))
const ImageEditorPage = lazy(() => import('./pages/ImageEditorPage'))
const SyaratKetentuan = lazy(() => import('./pages/SyaratKetentuan'))
const KebijakanPengembalianDana = lazy(() => import('./pages/KebijakanPengembalianDana'))
const FAQ = lazy(() => import('./pages/FAQ'))

// Arah geser untuk animasi halaman flow (pilihan-status -> opsi -> status-santri)
const directionRef = { current: undefined }

function FlowPages() {
  const location = useLocation()
  const pathname = location.pathname
  const direction = location.state?.direction ?? 'forward'
  const prevPathRef = useRef(pathname)
  if (prevPathRef.current !== pathname) {
    prevPathRef.current = pathname
    directionRef.current = direction
  }

  let Page = null
  if (pathname === '/pilihan-status') Page = PilihanStatus
  else if (pathname === '/pilihan-opsi-pendidikan') Page = PilihanOpsiPendidikan
  else if (pathname === '/pilihan-status-murid') Page = PilihanStatusMurid
  else if (pathname === '/pilihan-prodi') Page = PilihanProdi
  else if (pathname === '/pilihan-status-santri') Page = PilihanStatusSantri

  if (!Page) return null

  const slideOffset = 72
  const transition = { duration: 0.28, ease: [0.4, 0, 0.2, 1] }
  const pageVariants = {
    initial: {
      x: direction === 'forward' ? slideOffset : -slideOffset,
      opacity: 0
    },
    animate: { x: 0, opacity: 1 },
    exit: (ref) => ({
      x: ref?.current === 'forward' ? -slideOffset : slideOffset,
      opacity: 0
    })
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        custom={directionRef}
        transition={transition}
        style={{ minHeight: '100vh', width: '100%' }}
      >
        <Suspense fallback={<PageLoader />}>
          <Page />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
  </div>
)

// Redirect setelah login: pakai redirect_after_login dari sessionStorage (set oleh Login). Selalu ke dashboard.
// Baca hanya sekali (ref) agar di Strict Mode / double-render tidak ter-override.
const RedirectAfterLogin = () => {
  const toRef = useRef(null)
  if (toRef.current === null) {
    const to = sessionStorage.getItem('redirect_after_login') || '/dashboard'
    sessionStorage.removeItem('redirect_after_login')
    toRef.current = to
  }
  return <Navigate to={toRef.current} replace />
}

// Helper function untuk mendapatkan domain utama (home domain aplikasi daftar)
const getHomeDomain = () => {
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  
  // Jika localhost atau IP lokal, tidak redirect
  const isLocal = hostname === 'localhost' || 
                  hostname === '127.0.0.1' ||
                  hostname.startsWith('192.168.') ||
                  hostname.startsWith('10.') ||
                  hostname.startsWith('172.16.')
  
  if (isLocal) {
    return null // Tidak redirect di localhost
  }
  
  // Kembalikan domain saat ini sebagai domain utama
  // Misal: daftar.alutsmani.id -> daftar.alutsmani.id (home page aplikasi daftar)
  if (!hostname || hostname === '' || hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return null
  }
  
  return `${protocol}//${hostname}`
}

// Komponen untuk menangani halaman tidak ditemukan
const NotFound = () => {
  const location = useLocation()
  
  useEffect(() => {
    const homeDomain = getHomeDomain()
    if (homeDomain) {
      // Redirect ke domain utama
      window.location.replace(homeDomain)
    } else {
      // Jika localhost, redirect ke dashboard atau login
      const isAuthenticated = localStorage.getItem('auth_token')
      window.location.replace(isAuthenticated ? '/dashboard' : '/login')
    }
  }, [location])
  
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
    </div>
  )
}

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore()
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Pastikan UI selalu tampil: jika checkAuth hang (mis. API tidak response), tetap tampilkan app setelah timeout
    const timeoutId = setTimeout(() => {
      if (!cancelled) setIsInitialized(true)
    }, 300)
    const initAuth = async () => {
      try {
        await checkAuth()
      } catch (e) {
        console.warn('checkAuth error:', e)
      }
      if (!cancelled) setIsInitialized(true)
    }
    initAuth()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [checkAuth])

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <NotificationProvider>
      <UnsavedChangesProvider>
        <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <RedirectAfterLogin /> : <Login />
          } 
        />
        
        {/* Public Pages - Terms, Policy, FAQ */}
        <Route 
          path="/syarat-ketentuan" 
          element={
            <Suspense fallback={<PageLoader />}>
              <SyaratKetentuan />
            </Suspense>
          } 
        />
        <Route 
          path="/kebijakan-pengembalian-dana" 
          element={
            <Suspense fallback={<PageLoader />}>
              <KebijakanPengembalianDana />
            </Suspense>
          } 
        />
        <Route 
          path="/faq" 
          element={
            <Suspense fallback={<PageLoader />}>
              <FAQ />
            </Suspense>
          } 
        />
        
        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          {/* Halaman flow pilihan (tanpa Layout, full screen) */}
          <Route path="/pilihan-status" element={<FlowPages />} />
          <Route path="/pilihan-opsi-pendidikan" element={<FlowPages />} />
          <Route path="/pilihan-status-murid" element={<FlowPages />} />
          <Route path="/pilihan-prodi" element={<FlowPages />} />
          <Route path="/pilihan-status-santri" element={<FlowPages />} />
          {/* Editor gambar: full page, tanpa header/footer */}
          <Route
            path="/editor"
            element={
              <Suspense fallback={<PageLoader />}>
                <ImageEditorPage />
              </Suspense>
            }
          />
          <Route element={<Layout />}>
            <Route 
              path="/" 
              element={<Navigate to="/dashboard" replace />}
            />
            <Route 
              path="/dashboard" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Dashboard />
                </Suspense>
              } 
            />
            <Route 
              path="/biodata" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Biodata />
                </Suspense>
              } 
            />
            <Route 
              path="/berkas" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Berkas />
                </Suspense>
              } 
            />
            <Route 
              path="/pembayaran" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Pembayaran />
                </Suspense>
              } 
            />
          </Route>
        </Route>
        
        <Route path="*" element={<NotFound />} />
      </Routes>
      </UnsavedChangesProvider>
    </NotificationProvider>
  )
}

export default App
