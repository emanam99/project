import { motion } from 'framer-motion'

/**
 * Sidebar Navigation Component untuk Pengaturan
 * Memiliki 3 state: hidden, collapsed (logo only), expanded (logo + label)
 */
function PengaturanSidebarNavigation({ 
  sidebarState, // 'hidden' | 'collapsed' | 'expanded'
  activeSection, 
  scrollToSection, 
  sections 
}) {
  // Get icon berdasarkan kategori
  const getIcon = (kategori) => {
    const iconMap = {
      'Tahun Ajaran': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
      ),
      'Gelombang': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
      ),
      'Payment Gateway': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
        </svg>
      ),
      'Lainnya': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
        </svg>
      )
    }
    return iconMap[kategori] || iconMap['Lainnya']
  }

  // Calculate indicator position
  const getIndicatorY = () => {
    if (sidebarState === 'hidden') return 16
    
    const index = sections.indexOf(activeSection)
    if (index === -1) return 16 // Default to first position
    
    // Calculate position to center align with icon
    // Container padding top: py-4 = 16px
    // Button: p-2 (8px top + 8px bottom) = 16px padding, icon w-5 h-5 = 20px
    // Button total height: 16px + 20px = 36px
    // Gap between buttons: gap-3 = 12px
    // Total space per button: 36px + 12px = 48px
    // Center of first button: 16px (container padding) + 18px (half button height) = 34px
    // Center of button at index: 34px + (index * 48px)
    // Bar height: h-6 = 24px, center offset: 12px
    let baseY = 16 + (index * 48) + 18 - 12 - 14
    
    return baseY
  }

  // Get width berdasarkan state
  const getWidth = () => {
    if (sidebarState === 'hidden') return 'w-0'
    if (sidebarState === 'collapsed') return 'w-12'
    return 'w-48' // expanded (12rem = 192px)
  }

  if (sidebarState === 'hidden') {
    return null
  }

  return (
    <div className={`absolute left-0 top-0 bottom-0 ${getWidth()} bg-gray-200 dark:bg-gray-700/50 border-r-2 border-gray-300 dark:border-gray-600 z-10 transition-all duration-300 overflow-hidden`}>
        <div className={`flex flex-col ${sidebarState === 'expanded' ? 'items-start px-3' : 'items-center'} py-4 gap-3 h-full overflow-y-auto relative`}>
          {/* Single moving indicator bar */}
          {sidebarState !== 'hidden' && (
            <motion.div
              layout
              className="absolute left-0 w-1 h-6 bg-teal-600 dark:bg-teal-400 rounded-r-full z-10"
              initial={false}
              animate={{
                y: getIndicatorY()
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          
          {sections.map((kategori) => (
            <button
              key={kategori}
              onClick={() => scrollToSection(kategori)}
              className={`flex items-center gap-2 p-2 rounded-lg transition-all duration-300 ease-in-out relative w-full ${
                activeSection === kategori
                  ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                  : 'hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
              title={sidebarState === 'collapsed' ? kategori : undefined}
            >
              {getIcon(kategori)}
              {sidebarState === 'expanded' && (
                <span className="text-sm font-medium whitespace-nowrap">{kategori}</span>
              )}
            </button>
          ))}
        </div>
      </div>
  )
}

export default PengaturanSidebarNavigation
