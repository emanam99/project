import { useLocation, Outlet } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Header from './Header'
import Sidebar from './Sidebar'
import Navigation from './Navigation'
import { tahunAjaranAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { WhatsAppTemplateContext } from '../../contexts/WhatsAppTemplateContext'
import WhatsAppTemplateOffcanvas from '../WhatsAppTemplateOffcanvas'

const headerTransition = { type: 'tween', duration: 0.35, ease: [0.4, 0, 0.2, 1] }

const pageVariants = {
  initial: {
    opacity: 0,
    y: 12
  },
  animate: {
    opacity: 1,
    y: 0
  },
  exit: {
    opacity: 0,
    y: -12
  }
}

const pageTransition = {
  type: 'tween',
  ease: [0.25, 0.46, 0.45, 0.94],
  duration: 0.35
}

/** Beranda: tanpa animasi di Layout agar hanya panel kalender (di dalam Beranda) yang animasi */
const berandaInstantVariants = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.2 } }
}

/** Transisi halaman Kalender saja: seperti offcanvas kanan — terbuka/tertutup dari kanan */
const offcanvasRightVariants = {
  initial: { x: '100%' },
  animate: {
    x: 0,
    transition: { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.4 }
  },
  exit: {
    x: '100%',
    transition: { type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.32 }
  }
}

function Layout() {
  const location = useLocation()
  const hideHeader = location.pathname === '/beranda' || location.pathname === '/semua-menu'
  const setOptions = useTahunAjaranStore((s) => s.setOptions)
  const setOptionsMasehi = useTahunAjaranStore((s) => s.setOptionsMasehi)
  const [templateOffcanvasOpen, setTemplateOffcanvasOpen] = useState(false)
  const templateContextValue = {
    isOpen: templateOffcanvasOpen,
    open: useCallback(() => setTemplateOffcanvasOpen(true), []),
    close: useCallback(() => setTemplateOffcanvasOpen(false), [])
  }

  useEffect(() => {
    Promise.all([
      tahunAjaranAPI.getAll({ kategori: 'hijriyah' }).then((r) => (r?.success && r?.data ? r.data : [])),
      tahunAjaranAPI.getAll({ kategori: 'masehi' }).then((r) => (r?.success && r?.data ? r.data : []))
    ]).then(([hijriyah, masehi]) => {
      setOptions(hijriyah.map((row) => ({ value: row.tahun_ajaran, label: row.tahun_ajaran })))
      setOptionsMasehi(masehi.map((row) => ({ value: row.tahun_ajaran, label: row.tahun_ajaran })))
    }).catch(() => { /* tetap pakai fallback dari store */ })
  }, [setOptions, setOptionsMasehi])

  return (
    <WhatsAppTemplateContext.Provider value={templateContextValue}>
    <div className="flex h-screen relative overflow-hidden">
      {/* Background hiasan */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        {/* Pattern overlay */}
        <div 
          className="absolute inset-0 opacity-5 dark:opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
        
        {/* Dekorasi geometris */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-200/20 dark:bg-primary-800/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-300/20 dark:bg-primary-700/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary-400/10 dark:bg-primary-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
        
        {/* Garis dekoratif */}
        <div className="absolute top-20 right-10 w-px h-32 bg-gradient-to-b from-primary-300/50 to-transparent dark:from-primary-600/50"></div>
        <div className="absolute bottom-20 left-10 w-32 h-px bg-gradient-to-r from-primary-300/50 to-transparent dark:from-primary-600/50"></div>
        <div className="absolute top-1/3 right-1/4 w-24 h-24 border-2 border-primary-300/30 dark:border-primary-600/30 rounded-full"></div>
        <div className="absolute bottom-1/4 left-1/3 w-16 h-16 border-2 border-primary-400/30 dark:border-primary-500/30 rounded-full"></div>
      </div>

      {/* Sidebar untuk Desktop */}
      <div className="relative z-10">
        <Sidebar />
      </div>
      
      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden relative z-10">
        {/* Header: tersembunyi di Beranda & Semua Menu, muncul dengan animasi di halaman lain; z-20 agar dropdown di atas main; overflow-visible saat tampil agar menu tidak terpotong */}
        <motion.div
          className={`shrink-0 z-20 ${hideHeader ? 'overflow-hidden' : 'overflow-visible'}`}
          initial={false}
          animate={{
            maxHeight: hideHeader ? 0 : 220,
            opacity: hideHeader ? 0 : 1,
          }}
          transition={headerTransition}
        >
          <motion.div
            initial={false}
            animate={{
              y: hideHeader ? -20 : 0,
            }}
            transition={headerTransition}
          >
            <Header />
          </motion.div>
        </motion.div>
        
        {/* Area main tidak di-scroll; hanya konten di dalam halaman (mis. kotak biodata) yang scroll */}
        <main className="flex-1 min-h-0 overflow-hidden overflow-x-hidden sm:pb-0 pb-16 px-2 sm:px-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={
              location.pathname === '/beranda'
                ? berandaInstantVariants
                : location.pathname.startsWith('/kalender')
                  ? offcanvasRightVariants
                  : pageVariants
            }
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="h-full min-h-0"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      
      {/* Bottom Navigation untuk Mobile */}
      <Navigation />
    </div>
    {createPortal(
      <WhatsAppTemplateOffcanvas
        isOpen={templateOffcanvasOpen}
        onClose={() => setTemplateOffcanvasOpen(false)}
      />,
      document.body
    )}
    </WhatsAppTemplateContext.Provider>
  )
}

export default Layout

