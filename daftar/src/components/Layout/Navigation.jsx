import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import ProtectedNavLink from './ProtectedNavLink'

const navItems = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  },
  {
    path: '/biodata',
    label: 'Biodata',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  },
  {
    path: '/berkas',
    label: 'Berkas',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    path: '/pembayaran',
    label: 'Pembayaran',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
]

function Navigation() {
  const location = useLocation()
  const navRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const [showScrollbar, setShowScrollbar] = useState(false)
  const scrollTimeoutRef = useRef(null)

  const isActivePath = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/'
    }
    if (path === '/biodata') {
      return location.pathname === '/biodata' || location.pathname.startsWith('/biodata/')
    }
    if (path === '/berkas') {
      return location.pathname === '/berkas' || location.pathname.startsWith('/berkas/')
    }
    if (path === '/pembayaran') {
      return location.pathname === '/pembayaran' || location.pathname.startsWith('/pembayaran/')
    }
    return location.pathname === path
  }

  // Find active index for sliding indicator
  const activeIndex = navItems.findIndex(item => isActivePath(item.path))
  
  // Calculate width per item
  const itemWidth = `${100 / navItems.length}%`

  // Update indicator position when active tab changes
  useEffect(() => {
    if (navRef.current && activeIndex >= 0) {
      const navItems = navRef.current.querySelectorAll('[data-nav-item]')
      if (navItems[activeIndex]) {
        const activeItem = navItems[activeIndex]
        const rect = activeItem.getBoundingClientRect()
        const navRect = navRef.current.getBoundingClientRect()
        setIndicatorStyle({
          left: rect.left - navRect.left,
          width: rect.width
        })
      }
    }
  }, [location.pathname, activeIndex])

  // Handle scroll untuk auto-hide scrollbar
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

  return (
    <nav 
      ref={navRef}
      className="sm:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] flex justify-around z-[100] border-t border-gray-200 dark:border-gray-700 overflow-x-auto"
      style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0,
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
        const isActive = isActivePath(item.path)
        
        return (
          <ProtectedNavLink
            key={item.path}
            to={item.path}
            data-nav-item
            className={`relative flex flex-col items-center justify-center py-1.5 px-2 transition-all duration-300 ${
              isActive 
                ? 'text-teal-600 dark:text-teal-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}
            style={{ width: itemWidth }}
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
          </ProtectedNavLink>
        )
      })}
    </nav>
  )
}

export default Navigation
