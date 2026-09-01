import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import Layout from './components/Layout/Layout'
import SetupAkun from './pages/SetupAkun'
import UbahPassword from './pages/UbahPassword'
import UbahUsername from './pages/UbahUsername'
import VerifikasiEmail from './pages/VerifikasiEmail'
import Tentang from './pages/Tentang/index.jsx'
import TentangPageLayout from './pages/Tentang/TentangPageLayout'
import Version from './pages/Tentang/Version'
import InfoAplikasi from './pages/Tentang/InfoAplikasi'
import { useAuthStore, initAuthCrossTabSync, EBEDDIEN_PASSKEY_PROMPT_FLAG } from './store/authStore'
import { useThemeStore } from './store/themeStore'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import DatabaseMenuOutlet from './components/Auth/DatabaseMenuOutlet'
import ChatAiSubRouteGuard from './components/Auth/ChatAiSubRouteGuard'
import PendaftaranAdminSubRouteGuard from './components/Auth/PendaftaranAdminSubRouteGuard'
import { NotificationProvider } from './contexts/NotificationContext'
import { AbsenLokasiProvider } from './contexts/AbsenLokasiContext'
import { GlobalSyncOutboxProvider } from './contexts/GlobalSyncOutboxContext'
import LiveSocketSync from './components/LiveSocket/LiveSocketSync'
import GlobalSyncOutboxBridge from './services/ijinOutbox/GlobalSyncOutboxBridge'
import { LiveSocketProvider } from './contexts/LiveSocketContext'
import { ChatOffcanvasProvider } from './contexts/ChatOffcanvasContext'
import { ChatAiOffcanvasProvider } from './contexts/ChatAiOffcanvasContext'
import pwaSubscriptionService from './services/pwaSubscriptionService'
import * as serviceWorkerRegistration from './serviceWorkerRegistration.js'
import { authPageFlipVariants, authPageFlipStyle } from './utils/authPageTransition'
import { ensureStaffPwaHead } from './utils/ensureStaffPwaHead'
import { useUgtLaporanFiturAccess } from './hooks/useUgtLaporanFiturAccess'
import AuthPwaInstallButton from './components/Auth/AuthPwaInstallButton'

// Lazy load pages for code splitting
const DashboardUmum = lazy(() => import('./pages/Settings/DashboardUmum'))
const DashboardPembayaran = lazy(() => import('./pages/Pembayaran/DashboardPembayaran'))
const ManageData = lazy(() => import('./pages/Pembayaran/ManageData'))
const DashboardUmroh = lazy(() => import('./pages/Umroh/DashboardUmroh'))
const DashboardPendaftaran = lazy(() => import('./pages/Pendaftaran/DashboardPendaftaran'))
const Pendaftaran = lazy(() => import('./pages/Pendaftaran/index.jsx'))
const PendaftaranItem = lazy(() => import('./pages/Pendaftaran/Item'))
const ItemRekap = lazy(() => import('./pages/Pendaftaran/ItemRekap'))
const PendaftaranItemLayout = lazy(() => import('./pages/Pendaftaran/PendaftaranItemLayout'))
const PendaftaranData = lazy(() => import('./pages/Pendaftaran/PendaftaranData'))
const DataPendaftar = lazy(() => import('./pages/Pendaftaran/DataPendaftar'))
const TesMasuk = lazy(() => import('./pages/Pendaftaran/TesMasuk'))
const AnalisisPendaftar = lazy(() => import('./pages/Pendaftaran/AnalisisPendaftar'))
const PengajuanNis = lazy(() => import('./pages/Pendaftaran/PengajuanNis'))
const PadukanData = lazy(() => import('./pages/Pendaftaran/PadukanData'))
const Pengaturan = lazy(() => import('./pages/Pendaftaran/Pengaturan'))
const ImageEditorPage = lazy(() => import('./pages/Pendaftaran/ImageEditorPage'))
const ManageItemSet = lazy(() => import('./pages/Pendaftaran/ManageItemSet'))
const ManageKondisi = lazy(() => import('./pages/Pendaftaran/ManageKondisi'))
const KondisiRegistrasi = lazy(() => import('./pages/Pendaftaran/KondisiRegistrasi'))
const AssignItemToSet = lazy(() => import('./pages/Pendaftaran/AssignItemToSet'))
const Simulasi = lazy(() => import('./pages/Pendaftaran/Simulasi'))
const PembayaranGate = lazy(() => import('./pages/Pembayaran/PembayaranGate.jsx'))
const Laporan = lazy(() => import('./pages/Pembayaran/Laporan'))
const LaporanUmroh = lazy(() => import('./pages/Umroh/LaporanUmroh'))
const ManageUsers = lazy(() => import('./pages/Settings/ManageUsers'))
const Pengurus = lazy(() => import('./pages/Settings/Pengurus'))
const ImportPengurus = lazy(() => import('./pages/Settings/Pengurus/ImportPengurus'))
const ExcelPengurusEditor = lazy(() => import('./pages/Settings/Pengurus/ExcelPengurusEditor'))
const Koordinator = lazy(() => import('./pages/UGT/Koordinator'))
const ManageUsersEditRedirect = lazy(() => import('./pages/Settings/ManageUsersEditRedirect'))
const ImportKhusus = lazy(() => import('./pages/Pembayaran/ImportKhusus'))
const ImportTunggakan = lazy(() => import('./pages/Pembayaran/ImportTunggakan'))
const Profil = lazy(() => import('./pages/MyWorkspace/Profil/index.jsx'))
const Mybeddian = lazy(() => import('./pages/MyWorkspace/Mybeddian/index.jsx'))
const Beranda = lazy(() => import('./pages/MyWorkspace/Beranda/index.jsx'))
const AktivitasSaya = lazy(() => import('./pages/MyWorkspace/AktivitasSaya/index.jsx'))
const DeepseekChat = lazy(() => import('./pages/MyWorkspace/DeepseekChat/index.jsx'))
const Chat = lazy(() => import('./pages/MyWorkspace/Chat/index.jsx'))
const ChatAiLayout = lazy(() => import('./pages/MyWorkspace/ChatAiLayout.jsx'))
const AiTrainingBank = lazy(() => import('./pages/MyWorkspace/AiTrainingBank.jsx'))
const AiTrainingChat = lazy(() => import('./pages/MyWorkspace/AiTrainingChat.jsx'))
const AiChatDashboard = lazy(() => import('./pages/MyWorkspace/AiChatDashboard.jsx'))
const AiChatRiwayat = lazy(() => import('./pages/MyWorkspace/AiChatRiwayat.jsx'))
const AiUserSettingsPage = lazy(() => import('./pages/MyWorkspace/AiUserSettingsPage.jsx'))
const ChatAiPengaturanPage = lazy(() => import('./pages/MyWorkspace/ChatAiPengaturanPage.jsx'))
const ChatAiKemampuanPage = lazy(() => import('./pages/MyWorkspace/ChatAiKemampuanPage.jsx'))
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
const AbsenPage = lazy(() => import('./pages/Lembaga/Absen'))
const BisyarohPage = lazy(() => import('./pages/Lembaga/Bisyaroh'))
const WebsiteDashboard = lazy(() => import('./pages/Website/Dashboard'))
const TingkatanLttq = lazy(() => import('./pages/Lttq/TingkatanLttq'))
const DataSantriLttq = lazy(() => import('./pages/Lttq/DataSantriLttq'))
const WebsiteBerita = lazy(() => import('./pages/Website/Berita'))
const WebsiteBeritaEditor = lazy(() => import('./pages/Website/WebsiteBeritaEditor'))
const WebsiteKategoriBerita = lazy(() => import('./pages/Website/KategoriBerita'))
const WebsiteBanner = lazy(() => import('./pages/Website/Banner'))
const WebsiteHalaman = lazy(() => import('./pages/Website/Halaman'))
const WebsiteGaleri = lazy(() => import('./pages/Website/Galeri'))
const WebsiteKategoriGaleri = lazy(() => import('./pages/Website/KategoriGaleri'))
const WebsiteSeo = lazy(() => import('./pages/Website/Seo'))
const Kurikulum = lazy(() => import('./pages/Settings/Kurikulum'))
const NailulMurod = lazy(() => import('./pages/Wirid/NailulMurod'))
const NailulMurodForm = lazy(() => import('./pages/Wirid/NailulMurodForm'))
const Ujian = lazy(() => import('./pages/Settings/Ujian'))
const Rombel = lazy(() => import('./pages/Settings/Rombel'))
const ManageJabatan = lazy(() => import('./pages/Settings/ManageJabatan'))
const ManageUploads = lazy(() => import('./pages/Settings/ManageUploads'))
const UmrohJamaah = lazy(() => import('./pages/Umroh/Jamaah'))
const UmrohJamaahForm = lazy(() => import('./pages/Umroh/JamaahForm'))
const UmrohTabungan = lazy(() => import('./pages/Umroh/Tabungan'))
const UmrohPengeluaran = lazy(() => import('./pages/Umroh/PengeluaranUmroh'))
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
const PublicRiwayatRegistrasi = lazy(() => import('./pages/santri/PublicRiwayatRegistrasi'))
const ExcelSantriEditor = lazy(() => import('./pages/santri/ExcelSantriEditor'))
const Kalender = lazy(() => import('./pages/Kalender/index.jsx'))
const KalenderPengaturan = lazy(() => import('./pages/Kalender/KalenderPengaturan'))
const KalenderHariPenting = lazy(() => import('./pages/Kalender/HariPenting'))
const KalenderJadwalSholat = lazy(() => import('./pages/Kalender/JadwalSholat'))
const Converter = lazy(() => import('./pages/Converter/index.jsx'))
const DataMadrasah = lazy(() => import('./pages/UGT/DataMadrasah'))
const LaporanUGT = lazy(() => import('./pages/UGT/LaporanUGT'))
const LaporanKoordinatorPage = lazy(() => import('./pages/UGT/LaporanKoordinatorPage'))
const LaporanGTPage = lazy(() => import('./pages/UGT/LaporanGTPage'))
const LaporanPJGTPage = lazy(() => import('./pages/UGT/LaporanPJGTPage'))
const Kompas = lazy(() => import('./pages/UGT/Kompas/Kompas'))
const DataToko = lazy(() => import('./pages/Cashless/DataToko'))
const DataMahrom = lazy(() => import('./pages/Cashless/DataMahrom'))
const PembuatanAkunCashless = lazy(() => import('./pages/Cashless/PembuatanAkunCashless'))
const PengaturanCashless = lazy(() => import('./pages/Cashless/PengaturanCashless'))
const TopUpCashless = lazy(() => import('./pages/Cashless/TopUpCashless'))
const CetakKartuCashless = lazy(() => import('./pages/Cashless/CetakKartuCashless'))
const CetakKartuCashlessIndex = lazy(() => import('./pages/Cashless/CetakKartuCashlessIndex'))
const BukuTamu = lazy(() => import('./pages/Cashless/BukuTamu'))
const RoleAkses = lazy(() => import('./pages/Settings/RoleAkses'))
const Fitur = lazy(() => import('./pages/Settings/Fitur'))
const TahunAjaranPage = lazy(() => import('./pages/Settings/TahunAjaran'))
const Notifikasi = lazy(() => import('./pages/Settings/Notifikasi'))
const Watzap = lazy(() => import('./pages/Settings/Watzap'))
const EmailOtp = lazy(() => import('./pages/Settings/EmailOtp'))
const EvolutionWa = lazy(() => import('./pages/Settings/EvolutionWa'))
const PaymentGatewaySettings = lazy(() => import('./pages/Settings/PaymentGateway'))
const WhatsAppHub = lazy(() => import('./pages/Settings/WhatsAppHub'))
const WaInteractiveMenu = lazy(() => import('./pages/Settings/WaInteractiveMenu'))
const DataSantri = lazy(() => import('./pages/santri/DataSantri'))
const DataLulusan = lazy(() => import('./pages/Lulusan/DataLulusan'))
const DataAlumni = lazy(() => import('./pages/Alumni/DataAlumni'))
const Daerah = lazy(() => import('./pages/Domisili/Daerah'))
const Kamar = lazy(() => import('./pages/Domisili/Kamar'))
const StatusSantriDomisili = lazy(() => import('./pages/Domisili/StatusSantri'))
const PelanggaranDomisili = lazy(() => import('./pages/Domisili/DataPelanggaran'))
const PelanggaranMasterDomisili = lazy(() => import('./pages/Domisili/PelanggaranMaster'))
const KoneksiWa = lazy(() => import('./pages/WhatsApp/KoneksiWa'))
const WaChatList = lazy(() => import('./pages/WhatsApp/WaChatList'))
const DashboardSuperAdmin = lazy(() => import('./pages/SuperAdmin/Dashboard'))
const InstallActivityDashboard = lazy(() => import('./pages/SuperAdmin/InstallActivityDashboard'))
const InstallActivityPage = lazy(() => import('./pages/SuperAdmin/InstallActivityPage'))
const UserAktivitasPage = lazy(() => import('./pages/SuperAdmin/UserAktivitasPage'))
const AuthLeftPanel = lazy(() => import('./components/Auth/AuthLeftPanel'))
const LoginFormCard = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginFormCard })))
const DaftarFormCard = lazy(() => import('./pages/Daftar').then((m) => ({ default: m.DaftarFormCard })))
const LupaPasswordFormCard = lazy(() => import('./pages/LupaPassword').then((m) => ({ default: m.LupaPasswordFormCard })))
const GlobalChatNotifier = lazy(() => import('./components/Chat/GlobalChatNotifier'))
const ChatOffcanvasHost = lazy(() => import('./components/Chat/ChatOffcanvasHost'))
const ChatAiOffcanvasHost = lazy(() => import('./components/Chat/ChatAiOffcanvasHost'))

// Loading component — spinner dari atas (bukan center 50vh) agar selaras saat konten lazy load selesai
const PageLoader = () => (
  <div className="flex w-full justify-center pt-24 sm:pt-32">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
  </div>
)

function UgtLaporanIndexRedirect() {
  const { search } = useLocation()
  const { firstTabPath, noTabAccess } = useUgtLaporanFiturAccess()
  if (noTabAccess) {
    return null
  }
  return <Navigate to={{ pathname: firstTabPath || '/ugt/laporan/koordinator', search }} replace />
}

// Auth: panel kiri 1 (shared), yang flip hanya bagian kanan (form)
const AUTH_PATHS = ['/login', '/daftar', '/lupa-password']

function AuthPagesWrapper() {
  const location = useLocation()
  const pathname = location.pathname
  const isAuthPath = AUTH_PATHS.includes(pathname)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [isMd, setIsMd] = useState(false)
  const calendarDragControls = useDragControls()
  const isMobile = !isMd

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsMd(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Kunci scroll body saat offcanvas kalender terbuka
  useEffect(() => {
    if (!calendarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [calendarOpen])

  const showCalendarButton = Boolean(isAuthenticated)

  let FormCard = null
  if (pathname === '/login') FormCard = LoginFormCard
  else if (pathname === '/daftar') FormCard = DaftarFormCard
  else if (pathname === '/lupa-password') FormCard = LupaPasswordFormCard

  if (!isAuthPath || !FormCard) return null

  return (
    <div className="w-full min-h-screen flex relative overflow-y-auto md:overflow-hidden">
      <Suspense fallback={null}>
        <AuthLeftPanel />
      </Suspense>

      {/* Desktop: tombol tema + kalender di garis vertikal pemisah kiri/kanan, tersusun vertikal, bg bulat sesuai tema */}
      <div
        className="hidden md:flex fixed z-50 flex-col gap-2 p-2 rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg border border-gray-200/60 dark:border-gray-600/60"
        style={{ left: 'calc(100% - 480px)', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <AuthPwaInstallButton variant="icon" />
        <motion.button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
          style={{ perspective: '120px' }}
          whileTap={{ scale: 0.92 }}
          aria-label="Ganti tema gelap/terang"
        >
          <span className="relative w-5 h-5 block">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: 90, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
        {showCalendarButton && (
          <motion.button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
            whileTap={{ scale: 0.92 }}
            aria-label="Buka kalender"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </motion.button>
        )}
      </div>

      <div className="w-full md:w-[480px] flex items-start md:items-center justify-center pt-6 md:pt-0 px-4 pb-16 md:pb-8 md:px-10 relative z-10 login-bg-gradient" style={isMobile ? undefined : { perspective: '1400px' }}>
        {isMobile ? (
          <div className="w-full flex justify-center">
            <Suspense fallback={<PageLoader />}>
              <FormCard />
            </Suspense>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              variants={authPageFlipVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={authPageFlipStyle}
              className="w-full flex justify-center"
            >
              <FormCard />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Mobile: tombol tema + kalender di bawah, berjejer, style sama (icon + label kecil, tanpa BG) */}
      <div className="md:hidden fixed bottom-6 left-0 right-0 flex justify-center items-end gap-8 z-40 px-4">
        <AuthPwaInstallButton variant="bar" />
        <button
          type="button"
          onClick={toggleTheme}
          className="flex flex-col items-center justify-center gap-0.5 text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 active:opacity-80"
          aria-label="Ganti tema gelap/terang"
        >
          <span className="relative w-7 h-7 block">
            <span className="absolute inset-0 flex items-center justify-center">
              {theme === 'dark' ? (
                <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </span>
          </span>
          <span className="text-[10px] font-medium leading-tight">Tema</span>
        </button>
        {showCalendarButton && (
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 active:opacity-80"
            aria-label="Buka kalender"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-medium leading-tight">Kalender</span>
          </button>
        )}
      </div>

      {/* Offcanvas kalender dari bawah: atas bergelombang (air) + animasi */}
      <AnimatePresence>
        {calendarOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setCalendarOpen(false)}
              aria-hidden
            />
            <motion.div
              className="fixed z-[61] flex flex-col bg-white dark:bg-gray-900 shadow-2xl overflow-hidden md:left-0 md:top-0 md:bottom-0 md:w-full md:max-w-md md:rounded-r-2xl md:rounded-t-none left-0 right-0 bottom-0 rounded-t-3xl"
              style={isMd ? { width: 'min(100%, 28rem)' } : { height: '90vh', maxHeight: '90vh' }}
              initial={isMd ? { x: '-100%' } : { y: '100%' }}
              animate={isMd ? { x: 0 } : { y: 0 }}
              exit={isMd ? { x: '-100%' } : { y: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              {...(!isMd
                ? {
                    drag: 'y',
                    dragControls: calendarDragControls,
                    dragListener: false,
                    dragConstraints: { top: 0, bottom: typeof window !== 'undefined' ? window.innerHeight : 900 },
                    dragElastic: 0,
                    dragMomentum: false,
                    onDragEnd: (_e, info) => {
                      const dismissY = 100
                      const dismissVel = 420
                      if (info.offset.y > dismissY || info.velocity.y > dismissVel) {
                        setCalendarOpen(false)
                      }
                    },
                  }
                : {})}
            >
              {/* Atas: strip gelombang air (mobile) */}
              {/* Header desktop: judul + tombol tutup (offcanvas kiri) */}
              <div className="hidden md:flex flex-shrink-0 items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <span className="font-semibold text-gray-800 dark:text-gray-100">Kalender</span>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-teal-600 dark:hover:text-teal-400"
                  aria-label="Tutup kalender"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div
                className="flex-shrink-0 md:hidden flex flex-col items-center pt-2.5 pb-0 bg-white dark:bg-gray-900 touch-none select-none"
                onPointerDown={(e) => calendarDragControls.start(e)}
                role="presentation"
              >
                <span
                  className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mb-2 shrink-0 z-[1]"
                  aria-hidden
                />
                <div className="relative w-full h-10 overflow-hidden text-white dark:text-gray-900">
                  <svg
                    className="absolute left-0 top-0 w-[200%] h-full offcanvas-wave-svg"
                    viewBox="0 0 800 40"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <path
                      fill="currentColor"
                      d="M 0,40 L 800,40 L 800,20 C 750,32 650,8 600,20 C 550,32 450,8 400,20 C 350,32 250,8 200,20 C 150,32 50,8 0,20 Z"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <Suspense fallback={<div className="flex items-center justify-center p-8 text-gray-500">Memuat kalender…</div>}>
                  <div className="flex-1 min-h-0 min-w-0 max-w-full overflow-hidden flex flex-col h-full w-full">
                    <PublicKalender />
                  </div>
                </Suspense>
              </div>
              {/* Bawah: tombol panah ke bawah (mobile saja) — area kosong bisa di-drag ke bawah untuk tutup */}
              <div
                className="flex-shrink-0 flex justify-center py-3 pb-5 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 md:hidden touch-none select-none"
                onPointerDown={(e) => {
                  if (e.target.closest('button')) return
                  calendarDragControls.start(e)
                }}
                role="presentation"
              >
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-teal-600 dark:hover:text-teal-400"
                  aria-label="Tutup kalender"
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Catch-all: jangan arahkan /setup-akun, /ubah-password, /ubah-username, /verifikasi-email ke login (link dari WA/email)
/**
 * Rute tak dikenal pada user yang sudah login sering berarti bundel JS yang berjalan
 * masih versi lama (cache PWA/service worker belum ter-update) sehingga rute halaman
 * baru — mis. /cashless/buku-tamu, /cashless/data-mahrom, /cashless/cetak-kartu —
 * belum terdaftar meski menunya sudah tampil (menu bersumber dari data server).
 * Muat ulang sekali untuk mengambil index.html + chunk terbaru sebelum fallback ke
 * beranda. Dijaga flag sessionStorage agar tidak loop untuk URL yang memang tidak ada.
 */
function StaleBundleReloadOrHome({ fallback = '/beranda' }) {
  const { pathname } = useLocation()
  const [giveUp, setGiveUp] = useState(false)
  const reloadingRef = useRef(false)

  useEffect(() => {
    // Hanya untuk path yang tampak seperti rute aplikasi (bukan file/asset).
    const looksLikeAppRoute =
      /^\/[a-z0-9]/i.test(pathname) && !/\.[a-z0-9]+$/i.test(pathname)
    if (!looksLikeAppRoute) {
      setGiveUp(true)
      return
    }
    const key = 'ebd:stale-bundle-reload'
    let alreadyTried = false
    try {
      const last = Number(sessionStorage.getItem(key) || '0')
      alreadyTried = Number.isFinite(last) && Date.now() - last < 60000
    } catch {
      // Storage bermasalah → jangan reload agar tidak berisiko loop.
      alreadyTried = true
    }
    if (alreadyTried) {
      setGiveUp(true)
      return
    }
    let recorded = false
    try {
      sessionStorage.setItem(key, String(Date.now()))
      recorded = true
    } catch {
      recorded = false
    }
    if (!recorded) {
      setGiveUp(true)
      return
    }
    reloadingRef.current = true
    // Coba dorong update service worker lalu muat ulang; ada timeout agar reload
    // tetap jalan meski registrasi lambat/menggantung.
    let done = false
    const doReload = () => {
      if (done) return
      done = true
      window.location.reload()
    }
    window.setTimeout(doReload, 1500)
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistration()
          .then((reg) => {
            try {
              reg && reg.update()
            } catch {
              /* noop */
            }
          })
          .catch(() => {})
          .finally(doReload)
      } else {
        doReload()
      }
    } catch {
      doReload()
    }
  }, [pathname])

  if (reloadingRef.current || !giveUp) {
    return null
  }
  return <Navigate to={fallback} replace />
}

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
  if (p === '/verifikasi-email' || p.startsWith('/verifikasi-email?')) {
    return <VerifikasiEmail />
  }
  if (isAuthenticated) {
    return <StaleBundleReloadOrHome fallback="/beranda" />
  }
  return <Navigate to="/login" replace />
}

function App() {
  const { isAuthenticated, checkAuth, setPasskeyPromptOpen } = useAuthStore()
  const [isInitialized, setIsInitialized] = useState(false)
  const pwaActivatedRef = useRef(false)
  // Daftarkan SW sejak app siap (termasuk login) agar install PWA tersedia di halaman auth
  useEffect(() => {
    if (!isInitialized || pwaActivatedRef.current) return
    pwaActivatedRef.current = true
    serviceWorkerRegistration.register({
      onUpdate: (registration) => {
        if (registration?.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
      }
    })
  }, [isInitialized])

  // Manifest staff PWA di luar rute /public/* (portal santri punya manifest sendiri)
  const { pathname: appPathname } = useLocation()
  useEffect(() => {
    if (!isInitialized) return undefined
    if (appPathname.toLowerCase().startsWith('/public')) return undefined
    return ensureStaffPwaHead()
  }, [isInitialized, appPathname])

  useEffect(() => {
    try {
      initAuthCrossTabSync()
    } catch (_) { /* noop */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    let initTimer = null
    const initAuth = async () => {
      try {
        await checkAuth()
        if (!cancelled) {
          try {
            if (sessionStorage.getItem(EBEDDIEN_PASSKEY_PROMPT_FLAG) === '1') {
              sessionStorage.removeItem(EBEDDIEN_PASSKEY_PROMPT_FLAG)
              setPasskeyPromptOpen(true)
            }
          } catch (_) { /* noop */ }
        }
      } catch (e) {
        console.error('checkAuth error:', e)
      } finally {
        if (!cancelled) {
          initTimer = window.setTimeout(() => setIsInitialized(true), 100)
        }
      }
    }
    initAuth()
    return () => {
      cancelled = true
      if (initTimer) window.clearTimeout(initTimer)
    }
  }, [checkAuth, setPasskeyPromptOpen])

  // Initialize PWA subscription saat user sudah authenticated
  useEffect(() => {
    if (!isAuthenticated) return undefined
    let subscriptionTimer = null
    let unmounted = false
    if (isAuthenticated) {
      // Initialize subscription dengan delay untuk memastikan service worker sudah ready
      const initSubscription = async () => {
        try {
          // Tunggu service worker ready (bisa lebih lama di production)
          let retries = 0
          const maxRetries = 10
          
          while (retries < maxRetries) {
            if (unmounted) return
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
      subscriptionTimer = window.setTimeout(() => {
        if (!unmounted) initSubscription()
      }, delay)
    }
    return () => {
      unmounted = true
      if (subscriptionTimer) window.clearTimeout(subscriptionTimer)
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
      <AbsenLokasiProvider>
      <GlobalSyncOutboxProvider>
      <LiveSocketProvider>
        <ChatOffcanvasProvider>
        <ChatAiOffcanvasProvider>
        <LiveSocketSync />
        <GlobalSyncOutboxBridge />
        {isAuthenticated ? (
          <Suspense fallback={null}>
            <GlobalChatNotifier />
          </Suspense>
        ) : null}
        <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          isAuthenticated ? <Navigate to="/beranda" replace /> : <AuthPagesWrapper />
        } 
      />
      <Route 
        path="/daftar" 
        element={
          isAuthenticated ? <Navigate to="/beranda" replace /> : <AuthPagesWrapper />
        } 
      />
      <Route 
        path="/lupa-password" 
        element={
          isAuthenticated ? <Navigate to="/beranda" replace /> : <AuthPagesWrapper />
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
      <Route path="/verifikasi-email" element={<VerifikasiEmail />} />

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
        <Route
          path="/public/registrasi"
          element={
            <Suspense fallback={<PageLoader />}>
              <PublicRiwayatRegistrasi />
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
          <Route
            path="/akses-ditolak"
            element={
              <div className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <h1 className="text-lg font-semibold">Akses belum diberikan</h1>
                  <p className="mt-2 text-sm">
                    Menu ini belum aktif untuk role akun Anda. Minta admin mengaktifkannya di Pengaturan Fitur.
                  </p>
                </div>
              </div>
            }
          />

          {/* Semua halaman menu: hak akses dari fiturMenuCodes (DB / JWT). */}
          <Route element={<DatabaseMenuOutlet />}>
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
              path="/mybeddian"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Mybeddian />
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
            <Route
              path="/chat"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Chat />
                </Suspense>
              }
            />
            <Route
              path="/chat-ai"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ChatAiLayout />
                </Suspense>
              }
            >
              <Route
                index
                element={
                  <Suspense fallback={<PageLoader />}>
                    <DeepseekChat />
                  </Suspense>
                }
              />
              <Route
                path="kemampuan"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ChatAiKemampuanPage />
                  </Suspense>
                }
              />
              <Route element={<ChatAiSubRouteGuard />}>
                <Route
                  path="training"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AiTrainingBank />
                    </Suspense>
                  }
                />
                <Route
                  path="training-chat"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AiTrainingChat />
                    </Suspense>
                  }
                />
                <Route
                  path="dashboard"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AiChatDashboard />
                    </Suspense>
                  }
                />
                <Route
                  path="riwayat"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AiChatRiwayat />
                    </Suspense>
                  }
                />
                <Route
                  path="pengaturan"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ChatAiPengaturanPage />
                    </Suspense>
                  }
                />
                <Route
                  path="user-ai"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AiUserSettingsPage />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
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
            <Route
              path="/kalender/jadwal-sholat"
              element={
                <Suspense fallback={<PageLoader />}>
                  <KalenderJadwalSholat />
                </Suspense>
              }
            />
            <Route
              element={
                <Suspense fallback={<PageLoader />}>
                  <TentangPageLayout />
                </Suspense>
              }
            >
              <Route path="/tentang" element={<Tentang />} />
              <Route path="/info-aplikasi" element={<InfoAplikasi />} />
              <Route path="/version" element={<Version />} />
            </Route>
            <Route
              path="/dashboard-pembayaran"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardPembayaran />
                </Suspense>
              }
            />
            <Route
              path="/dashboard-umum"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardUmum />
                </Suspense>
              }
            />
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
              path="/pendaftaran/tes-masuk"
              element={
                <Suspense fallback={<PageLoader />}>
                  <TesMasuk />
                </Suspense>
              }
            />
            <Route
              path="/pendaftaran/analisis"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AnalisisPendaftar />
                </Suspense>
              }
            />
            <Route
              path="/pendaftaran/pengajuan-nis"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PengajuanNis />
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
            <Route path="/pendaftaran/manage-item-set" element={<Navigate to="/pendaftaran/item/set" replace />} />
            <Route path="/pendaftaran/manage-kondisi" element={<Navigate to="/pendaftaran/item/kondisi" replace />} />
            <Route path="/pendaftaran/kondisi-registrasi" element={<Navigate to="/pendaftaran/item/registrasi" replace />} />
            <Route path="/pendaftaran/assign-item" element={<Navigate to="/pendaftaran/item/assign" replace />} />
            <Route path="/pendaftaran/simulasi" element={<Navigate to="/pendaftaran/item/simulasi" replace />} />
            <Route element={<PendaftaranAdminSubRouteGuard />}>
              <Route
                path="/pendaftaran/item"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <PendaftaranItemLayout />
                  </Suspense>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <PendaftaranItem />
                    </Suspense>
                  }
                />
                <Route
                  path="rekap"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ItemRekap />
                    </Suspense>
                  }
                />
                <Route
                  path="set"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ManageItemSet />
                    </Suspense>
                  }
                />
                <Route
                  path="kondisi"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ManageKondisi />
                    </Suspense>
                  }
                />
                <Route
                  path="registrasi"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <KondisiRegistrasi />
                    </Suspense>
                  }
                />
                <Route
                  path="assign"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AssignItemToSet />
                    </Suspense>
                  }
                />
                <Route
                  path="simulasi"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <Simulasi />
                    </Suspense>
                  }
                />
              </Route>
              <Route
                path="/pendaftaran/padukan-data"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <PadukanData />
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
              path="/laporan"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Laporan />
                </Suspense>
              }
            />
            <Route
              path="/converter"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Converter />
                </Suspense>
              }
            />
            <Route
              path="/kalender/pengaturan"
              element={
                <Suspense fallback={<PageLoader />}>
                  <KalenderPengaturan />
                </Suspense>
              }
            />
            <Route
              path="/super-admin/online"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DashboardSuperAdmin />
                </Suspense>
              }
            />
            <Route
              path="/super-admin/dashboard"
              element={
                <Suspense fallback={<PageLoader />}>
                  <InstallActivityDashboard />
                </Suspense>
              }
            />
            <Route
              path="/super-admin/install-activity"
              element={
                <Suspense fallback={<PageLoader />}>
                  <InstallActivityPage />
                </Suspense>
              }
            />
            <Route
              path="/super-admin/user-aktivitas"
              element={
                <Suspense fallback={<PageLoader />}>
                  <UserAktivitasPage />
                </Suspense>
              }
            />
            <Route path="/super-admin/dashboard-online" element={<Navigate to="/super-admin/online" replace />} />
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
              path="/pengurus/excel-editor"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ExcelPengurusEditor />
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
              path="/absen"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AbsenPage />
                </Suspense>
              }
            />
            <Route
              path="/bisyaroh"
              element={
                <Suspense fallback={<PageLoader />}>
                  <BisyarohPage />
                </Suspense>
              }
            />
            {/* Modul Website (admin web publik) */}
            <Route
              path="/website/dashboard"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteDashboard />
                </Suspense>
              }
            />
            <Route
              path="/website/berita"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteBerita />
                </Suspense>
              }
            />
            <Route
              path="/website/berita/editor/:id"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteBeritaEditor />
                </Suspense>
              }
            />
            <Route
              path="/website/berita/editor"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteBeritaEditor />
                </Suspense>
              }
            />
            <Route
              path="/website/berita/kategori"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteKategoriBerita />
                </Suspense>
              }
            />
            <Route
              path="/website/banner"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteBanner />
                </Suspense>
              }
            />
            <Route
              path="/website/halaman"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteHalaman />
                </Suspense>
              }
            />
            <Route
              path="/website/galeri"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteGaleri />
                </Suspense>
              }
            />
            <Route
              path="/website/galeri/kategori"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteKategoriGaleri />
                </Suspense>
              }
            />
            <Route
              path="/website/seo"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebsiteSeo />
                </Suspense>
              }
            />
            <Route
              path="/lttq/santri"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataSantriLttq />
                </Suspense>
              }
            />
            <Route
              path="/lttq/tingkatan"
              element={
                <Suspense fallback={<PageLoader />}>
                  <TingkatanLttq />
                </Suspense>
              }
            />
            <Route path="/kitab" element={<Navigate to="/kurikulum?tab=kitab" replace />} />
            <Route
              path="/kurikulum"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Kurikulum />
                </Suspense>
              }
            />
            <Route
              path="/wirid/nailul-murod"
              element={
                <Suspense fallback={<PageLoader />}>
                  <NailulMurod />
                </Suspense>
              }
            />
            <Route
              path="/wirid/nailul-murod/create"
              element={
                <Suspense fallback={<PageLoader />}>
                  <NailulMurodForm />
                </Suspense>
              }
            />
            <Route
              path="/wirid/nailul-murod/:id/edit"
              element={
                <Suspense fallback={<PageLoader />}>
                  <NailulMurodForm />
                </Suspense>
              }
            />
            <Route path="/mapel" element={<Navigate to="/kurikulum?tab=mapel" replace />} />
            <Route
              path="/ujian"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Ujian />
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
              path="/santri/excel-editor"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ExcelSantriEditor />
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
              path="/alumni"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataAlumni />
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
              path="/domisili/status"
              element={
                <Suspense fallback={<PageLoader />}>
                  <StatusSantriDomisili />
                </Suspense>
              }
            />
            <Route
              path="/domisili/pelanggaran"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PelanggaranDomisili />
                </Suspense>
              }
            />
            <Route
              path="/domisili/pelanggaran/master"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PelanggaranMasterDomisili />
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
              path="/manage-users"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageUsers />
                </Suspense>
              }
            />
            <Route
              path="/manage-users/edit/:id"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ManageUsersEditRedirect />
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
              path="/settings/notifikasi"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Notifikasi />
                </Suspense>
              }
            />
            <Route
              path="/settings/email-otp"
              element={
                <Suspense fallback={<PageLoader />}>
                  <EmailOtp />
                </Suspense>
              }
            />
            <Route
              path="/settings/payment-gateway"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PaymentGatewaySettings />
                </Suspense>
              }
            />
            <Route
              path="/settings/whatsapp"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WhatsAppHub />
                </Suspense>
              }
            />
            <Route
              path="/settings/watzap"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Watzap />
                </Suspense>
              }
            />
            <Route
              path="/settings/evolution-wa"
              element={
                <Suspense fallback={<PageLoader />}>
                  <EvolutionWa />
                </Suspense>
              }
            />
            <Route
              path="/settings/wa-interactive-menu"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WaInteractiveMenu />
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
              path="/whatsapp-koneksi/chat/:sessionId"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WaChatList />
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
            <Route
              path="/umroh/pengeluaran"
              element={
                <Suspense fallback={<PageLoader />}>
                  <UmrohPengeluaran />
                </Suspense>
              }
            />
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
            <Route
              path="/ijin/data-boyong"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataBoyong />
                </Suspense>
              }
            />
            <Route
              path="/ugt/data-madrasah"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataMadrasah />
                </Suspense>
              }
            />
            <Route
              path="/ugt/guru-tugas"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataSantri />
                </Suspense>
              }
            />
            <Route
              path="/ugt/kompas"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Kompas />
                </Suspense>
              }
            />
            <Route
              path="/ugt/laporan"
              element={
                <Suspense fallback={<PageLoader />}>
                  <LaporanUGT />
                </Suspense>
              }
            >
              <Route index element={<UgtLaporanIndexRedirect />} />
              <Route
                path="koordinator"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <LaporanKoordinatorPage />
                  </Suspense>
                }
              />
              <Route
                path="gt"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <LaporanGTPage />
                  </Suspense>
                }
              />
              <Route
                path="pjgt"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <LaporanPJGTPage />
                  </Suspense>
                }
              />
            </Route>
            <Route
              path="/koordinator"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Koordinator />
                </Suspense>
              }
            />
            <Route
              path="/cashless/buku-tamu"
              element={
                <Suspense fallback={<PageLoader />}>
                  <BukuTamu />
                </Suspense>
              }
            />
            <Route
              path="/cashless/data-toko"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataToko />
                </Suspense>
              }
            />
            <Route
              path="/cashless/data-mahrom"
              element={
                <Suspense fallback={<PageLoader />}>
                  <DataMahrom />
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
              path="/cashless/cetak-kartu"
              element={
                <Suspense fallback={<PageLoader />}>
                  <CetakKartuCashlessIndex />
                </Suspense>
              }
            />
            <Route
              path="/cashless/cetak-kartu/santri/:santriId"
              element={
                <Suspense fallback={<PageLoader />}>
                  <CetakKartuCashless />
                </Suspense>
              }
            />
            {/* Jangan pakai /:pembayaranMode — menangkap /alumni, /santri, dll. lalu redirect ke /uwaba */}
            <Route
              path="/uwaba"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PembayaranGate />
                </Suspense>
              }
            />
            <Route
              path="/tunggakan"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PembayaranGate />
                </Suspense>
              }
            />
            <Route
              path="/khusus"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PembayaranGate />
                </Suspense>
              }
            />
          </Route>
        </Route>
      </Route>
      {/* 404 - Jangan arahkan /setup-akun ke login (link WA ke buat username/password) */}
      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
        {isAuthenticated ? (
          <Suspense fallback={null}>
            <ChatOffcanvasHost />
            <ChatAiOffcanvasHost />
          </Suspense>
        ) : null}
        </ChatAiOffcanvasProvider>
        </ChatOffcanvasProvider>
      </LiveSocketProvider>
      </GlobalSyncOutboxProvider>
      </AbsenLokasiProvider>
    </NotificationProvider>
  )
}

export default App

