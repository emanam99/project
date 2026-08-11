import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'

const paymentSubItems = [
  {
    id: 'uwaba',
    label: 'UWABA',
    path: '/public/uwaba',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  },
  {
    id: 'khusus',
    label: 'Khusus',
    path: '/public/khusus',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
      </svg>
    )
  },
  {
    id: 'tunggakan',
    label: 'Tunggakan',
    path: '/public/tunggakan',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    )
  }
]

// Hanya menu yang relevan untuk halaman public santri: biodata, PSB, pembayaran (uwaba/khusus/tunggakan), ijin, shohifah
const navItems = [
  {
    id: 'biodata',
    label: 'Biodata',
    path: '/public/santri',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  },
  {
    id: 'registrasi',
    label: 'PSB',
    path: '/public/registrasi',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    id: 'pembayaran',
    label: 'Pembayaran',
    path: null,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    )
  },
  {
    id: 'ijin',
    label: 'Ijin',
    path: '/public/ijin',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    id: 'shohifah',
    label: 'Shohifah',
    path: '/public/shohifah',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }
]

function BottomNav() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { pathname: currentPath } = useLocation()
  const navRef = useRef(null)
  const paymentWrapRef = useRef(null)
  const [showScrollbar, setShowScrollbar] = useState(false)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 640)
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false)
  const scrollTimeoutRef = useRef(null)

  const idSantri = searchParams.get('id')

  // Track window size untuk responsive
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 640)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    setPaymentMenuOpen(false)
  }, [currentPath])

  useEffect(() => {
    if (!paymentMenuOpen) return
    const close = (e) => {
      const t = e.target
      if (paymentWrapRef.current && !paymentWrapRef.current.contains(t)) {
        setPaymentMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [paymentMenuOpen])

  // Tentukan item aktif (uwaba/khusus/tunggakan → slot "pembayaran")
  const getActiveItem = () => {
    if (currentPath === '/public/santri' || currentPath.startsWith('/public/santri')) {
      return 'biodata'
    }
    if (currentPath === '/public/registrasi' || currentPath.startsWith('/public/registrasi')) {
      return 'registrasi'
    }
    if (currentPath === '/public/uwaba' || currentPath.startsWith('/public/uwaba')) {
      return 'pembayaran'
    }
    if (currentPath === '/public/khusus' || currentPath.startsWith('/public/khusus')) {
      return 'pembayaran'
    }
    if (currentPath === '/public/tunggakan' || currentPath.startsWith('/public/tunggakan')) {
      return 'pembayaran'
    }
    if (currentPath === '/public/ijin' || currentPath.startsWith('/public/ijin')) {
      return 'ijin'
    }
    if (currentPath === '/public/shohifah' || currentPath.startsWith('/public/shohifah')) {
      return 'shohifah'
    }
    return 'biodata'
  }

  const getPaymentSubActiveId = () => {
    if (currentPath === '/public/uwaba' || currentPath.startsWith('/public/uwaba')) return 'uwaba'
    if (currentPath === '/public/khusus' || currentPath.startsWith('/public/khusus')) return 'khusus'
    if (currentPath === '/public/tunggakan' || currentPath.startsWith('/public/tunggakan')) return 'tunggakan'
    return null
  }

  const activeItemId = getActiveItem()
  const paymentSubActiveId = getPaymentSubActiveId()
  
  // Hitung posisi dan lebar indicator
  const calculateIndicatorStyle = () => {
    const nav = navRef.current
    if (!nav) return { left: 0, width: 0 }
    
    const activeItem = nav.querySelector(`[data-nav-item-id="${activeItemId}"]`)
    if (!activeItem) return { left: 0, width: 0 }
    
    const navRect = nav.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    
    return {
      left: itemRect.left - navRect.left,
      width: itemRect.width
    }
  }
  
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  
  useEffect(() => {
    const updateIndicator = () => {
      setIndicatorStyle(calculateIndicatorStyle())
    }
    
    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    
    return () => {
      window.removeEventListener('resize', updateIndicator)
    }
  }, [activeItemId])
  
  // Handle scroll untuk show/hide scrollbar
  const handleNavScroll = () => {
    setShowScrollbar(true)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setShowScrollbar(false)
    }, 1500)
  }
  
  useEffect(() => {
    const nav = navRef.current
    if (nav) {
      nav.addEventListener('scroll', handleNavScroll)
      return () => {
        nav.removeEventListener('scroll', handleNavScroll)
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
      }
    }
  }, [])
  
  const buildUrlWithQuery = (path) => {
    const params = new URLSearchParams(searchParams)
    if (idSantri) params.set('id', idSantri)
    const q = params.toString()
    return q ? `${path}?${q}` : path
  }

  // Handle click navigation
  const handleNavClick = (item) => {
    if (item.path) {
      navigate(buildUrlWithQuery(item.path))
      setPaymentMenuOpen(false)
    }
  }

  const handlePaymentSubClick = (sub) => {
    navigate(buildUrlWithQuery(sub.path))
    setPaymentMenuOpen(false)
  }

  const handlePembayaranMainClick = () => {
    setPaymentMenuOpen((o) => !o)
  }
  
  // Hitung lebar item
  const itemCount = navItems.length
  const itemWidth = `${100 / itemCount}%`
  
  const submenuBottom = isDesktop
    ? 'calc(1.5rem + 64px + env(safe-area-inset-bottom, 0px))'
    : 'calc(64px + env(safe-area-inset-bottom, 0px))'

  return (
    <>
      <AnimatePresence>
        {paymentMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[99] bg-black/25 dark:bg-black/40"
            aria-hidden
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {paymentMenuOpen && (
          /*
           * Wrapper pusat: transform translate-X tidak boleh di elemen yang dianimasikan motion (scale/y),
           * karena motion menimpa transform Tailwind — submenu tampak geser ke kanan di tablet/desktop.
           */
          <div
            ref={paymentWrapRef}
            className="fixed left-1/2 z-[101] w-[min(28rem,calc(100vw-1rem))] -translate-x-1/2 pointer-events-none"
            style={{ bottom: submenuBottom }}
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="pointer-events-auto w-full"
              role="menu"
              aria-label="Menu pembayaran"
            >
              <div className="rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl dark:shadow-2xl px-2.5 py-2.5 sm:px-3 sm:py-3">
                <p className="text-center text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2">
                  Pilih jenis pembayaran
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {paymentSubItems.map((sub) => {
                    const subActive = paymentSubActiveId === sub.id
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handlePaymentSubClick(sub)}
                        className={`flex flex-col items-center justify-center rounded-xl py-2 px-1.5 sm:py-2.5 sm:px-2 transition-colors ${
                          subActive
                            ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500/50'
                            : 'bg-gray-50 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/25'
                        }`}
                      >
                        <span className="mb-0.5 flex h-5 w-5 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">
                          {sub.icon}
                        </span>
                        <span className="text-[10px] font-semibold leading-tight text-center">{sub.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    <nav 
      ref={navRef}
      className="public-bottom-nav fixed bottom-0 left-0 right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-6 bg-white dark:bg-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] sm:shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:sm:shadow-[0_4px_20px_rgba(0,0,0,0.4)] flex justify-around z-[100] border-t sm:border border-gray-200 dark:border-gray-700 sm:rounded-2xl sm:max-w-md overflow-x-auto"
      style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: isDesktop ? '50%' : 0, 
        right: isDesktop ? 'auto' : 0,
        transform: isDesktop ? 'translateX(-50%)' : 'none',
        height: '64px',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        scrollbarWidth: showScrollbar ? 'thin' : 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch'
      }}
      onScroll={handleNavScroll}
    >
      <style>{`
        nav::-webkit-scrollbar {
          height: ${showScrollbar ? '3px' : '0px'};
          transition: height 0.3s ease;
        }
        nav::-webkit-scrollbar-track {
          background: transparent;
        }
        nav::-webkit-scrollbar-thumb {
          background: ${showScrollbar ? 'rgba(156, 163, 175, 0.4)' : 'transparent'};
          border-radius: 3px;
          transition: background 0.3s ease;
        }
        nav::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.6);
        }
        .dark nav::-webkit-scrollbar-thumb {
          background: ${showScrollbar ? 'rgba(107, 114, 128, 0.4)' : 'transparent'};
        }
        .dark nav::-webkit-scrollbar-thumb:hover {
          background: rgba(107, 114, 128, 0.6);
        }
      `}</style>
      
      {/* Sliding Indicator */}
      <motion.div
        className="absolute top-0 h-1 bg-gradient-to-r from-teal-500 to-teal-600 rounded-b-full pointer-events-none"
        initial={false}
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30
        }}
        style={{
          boxShadow: '0 2px 8px rgba(20, 184, 166, 0.4)',
          zIndex: 10
        }}
      />
      
      {/* Nav Items */}
      {navItems.map((item) => {
        const isActive = activeItemId === item.id
        const isPembayaran = item.id === 'pembayaran'

        return (
          <button
            key={item.id}
            data-nav-item-id={item.id}
            type="button"
            onClick={() => (isPembayaran ? handlePembayaranMainClick() : handleNavClick(item))}
            aria-expanded={isPembayaran ? paymentMenuOpen : undefined}
            aria-haspopup={isPembayaran ? 'menu' : undefined}
            className={`relative flex flex-col items-center justify-center py-1.5 px-2 transition-all duration-300 ${
              isActive 
                ? 'text-teal-600 dark:text-teal-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}
            style={{ width: itemWidth }}
            disabled={item.isCurrent}
          >
            {/* Active Background */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="absolute left-0 right-0 top-0 bottom-0 bg-teal-50 dark:bg-teal-900/20 rounded-t-2xl pointer-events-none overflow-hidden"
                  style={{
                    marginLeft: '8px',
                    marginRight: '8px',
                    zIndex: 1
                  }}
                />
              )}
            </AnimatePresence>
            
            {/* Icon */}
            <motion.div
              animate={{ 
                scale: isActive ? 1.15 : 1,
                y: isActive ? -2 : 0
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="mb-0.5 relative z-10"
            >
              <div className="w-5 h-5">
                {item.icon}
              </div>
            </motion.div>
            
            {/* Label */}
            <motion.span 
              animate={{ 
                fontSize: isActive ? '0.625rem' : '0.5625rem',
                fontWeight: isActive ? 600 : 500
              }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 25 
              }}
              className="relative z-10 leading-tight flex items-center gap-0.5"
            >
              {item.label}
              {isPembayaran && (
                <svg
                  className={`w-3 h-3 shrink-0 transition-transform duration-200 ${paymentMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </motion.span>
          </button>
        )
      })}
    </nav>
    </>
  )
}

export default BottomNav
