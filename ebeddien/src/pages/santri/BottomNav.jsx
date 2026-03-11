import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'

// Hanya menu yang relevan untuk halaman public santri: biodata, uwaba, khusus, tunggakan, ijin (jin), shohifah
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
  const navRef = useRef(null)
  const [showScrollbar, setShowScrollbar] = useState(false)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 640)
  const scrollTimeoutRef = useRef(null)
  
  const idSantri = searchParams.get('id')
  const currentPath = window.location.pathname
  
  // Track window size untuk responsive
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 640)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // Tentukan item aktif
  const getActiveItem = () => {
    // Mapping path ke item id
    if (currentPath === '/public/santri' || currentPath.startsWith('/public/santri')) {
      return 'biodata'
    }
    if (currentPath === '/public/uwaba' || currentPath.startsWith('/public/uwaba')) {
      return 'uwaba'
    }
    if (currentPath === '/public/khusus' || currentPath.startsWith('/public/khusus')) {
      return 'khusus'
    }
    if (currentPath === '/public/tunggakan' || currentPath.startsWith('/public/tunggakan')) {
      return 'tunggakan'
    }
    if (currentPath === '/public/ijin' || currentPath.startsWith('/public/ijin')) {
      return 'ijin'
    }
    if (currentPath === '/public/shohifah' || currentPath.startsWith('/public/shohifah')) {
      return 'shohifah'
    }
    return 'biodata'
  }
  
  const activeItemId = getActiveItem()
  
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
  
  // Handle click navigation
  const handleNavClick = (item) => {
    if (item.path) {
      const url = idSantri ? `${item.path}?id=${idSantri}` : item.path
      navigate(url)
    }
  }
  
  // Hitung lebar item
  const itemCount = navItems.length
  const itemWidth = `${100 / itemCount}%`
  
  return (
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
        
        return (
          <button
            key={item.id}
            data-nav-item-id={item.id}
            onClick={() => handleNavClick(item)}
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
              className="relative z-10 leading-tight"
            >
              {item.label}
            </motion.span>
          </button>
        )
      })}
    </nav>
  )
}

export default BottomNav
