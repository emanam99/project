import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'

/** Portal publik eBeddien: hanya PSB + Kalender (biodata/pembayaran/ijin/shohifah → myBeddien). */
const navItems = [
  {
    id: 'registrasi',
    label: 'PSB',
    path: '/public/registrasi',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'kalender',
    label: 'Kalender',
    path: '/public/kalender',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
]

function BottomNav() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { pathname: currentPath } = useLocation()
  const navRef = useRef(null)
  const [showScrollbar, setShowScrollbar] = useState(false)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 640)
  const scrollTimeoutRef = useRef(null)

  const idSantri = searchParams.get('id')

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 640)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getActiveItem = () => {
    if (currentPath === '/public/kalender' || currentPath.startsWith('/public/kalender')) {
      return 'kalender'
    }
    return 'registrasi'
  }

  const activeItemId = getActiveItem()

  const calculateIndicatorStyle = () => {
    const nav = navRef.current
    if (!nav) return { left: 0, width: 0 }
    const activeItem = nav.querySelector(`[data-nav-item-id="${activeItemId}"]`)
    if (!activeItem) return { left: 0, width: 0 }
    const navRect = nav.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    return {
      left: itemRect.left - navRect.left,
      width: itemRect.width,
    }
  }

  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const updateIndicator = () => setIndicatorStyle(calculateIndicatorStyle())
    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [activeItemId, isDesktop])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const handleScroll = () => {
      setShowScrollbar(true)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => setShowScrollbar(false), 1000)
    }
    nav.addEventListener('scroll', handleScroll)
    return () => {
      nav.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  const handleNavClick = (item) => {
    if (!item.path) return
    const params = new URLSearchParams()
    if (idSantri) params.set('id', idSantri)
    const qs = params.toString()
    navigate(qs ? `${item.path}?${qs}` : item.path)
  }

  const itemCount = navItems.length
  const itemWidth = isDesktop ? `${100 / itemCount}%` : '80px'

  return (
    <nav
      ref={navRef}
      className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 flex items-stretch ${
        showScrollbar ? 'scrollbar-visible' : 'scrollbar-hidden'
      }`}
      style={{
        height: '64px',
        paddingBottom: 'env(safe-area-inset-bottom)',
        overflowX: isDesktop ? 'hidden' : 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <motion.div
        className="absolute top-0 h-1 bg-teal-500 rounded-full"
        initial={false}
        animate={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ boxShadow: '0 2px 8px rgba(20, 184, 166, 0.4)', zIndex: 10 }}
      />

      {navItems.map((item) => {
        const isActive = activeItemId === item.id
        return (
          <button
            key={item.id}
            data-nav-item-id={item.id}
            type="button"
            onClick={() => handleNavClick(item)}
            className={`relative flex flex-col items-center justify-center py-1.5 px-2 transition-all duration-300 shrink-0 ${
              isActive ? 'text-teal-600 dark:text-teal-400' : 'text-gray-500 dark:text-gray-400'
            }`}
            style={{ width: itemWidth, minWidth: isDesktop ? undefined : '80px' }}
          >
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="absolute left-0 right-0 top-0 bottom-0 bg-teal-50 dark:bg-teal-900/20 rounded-t-2xl pointer-events-none overflow-hidden"
                  style={{ marginLeft: '8px', marginRight: '8px', zIndex: 1 }}
                />
              )}
            </AnimatePresence>
            <span className="relative z-10 mb-0.5">{item.icon}</span>
            <span className="relative z-10 text-[10px] font-medium leading-tight">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default BottomNav
