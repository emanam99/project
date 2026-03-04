import { useState, useEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import BiodataJamaah from '../../components/Umroh/BiodataJamaah'
import TabunganList from '../../components/Umroh/TabunganList'
import SearchJamaahOffcanvas from '../../components/Umroh/SearchJamaahOffcanvas'

function Tabungan() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const biodataRef = useRef(null)
  const tabunganRef = useRef(null)
  
  const [currentJamaah, setCurrentJamaah] = useState(null)
  const [activeTab, setActiveTab] = useState('biodata') // 'biodata' atau 'tabungan'
  const [isDesktop, setIsDesktop] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  
  // Track window size untuk menentukan desktop/mobile
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }
    
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])
  
  // Fix display untuk desktop saat mount dan resize
  useEffect(() => {
    if (biodataRef.current) {
      biodataRef.current.style.display = isDesktop ? 'block' : (activeTab === 'biodata' ? 'block' : 'none')
    }
    if (tabunganRef.current) {
      tabunganRef.current.style.display = isDesktop ? 'flex' : (activeTab === 'tabungan' ? 'flex' : 'none')
    }
  }, [activeTab, isDesktop])
  
  // Handle jamaah change
  const handleJamaahChange = (jamaahData) => {
    setCurrentJamaah(jamaahData)
  }
  
  // Handle select jamaah from search
  const handleSelectJamaahFromSearch = (id) => {
    // Simulasi mengetik manual: kosongkan dulu, kemudian isi
    setCurrentJamaah(null)
    setIsSearchOpen(false)
    
    // Set ID baru setelah delay kecil untuk simulasi mengetik
    setTimeout(() => {
      // Trigger fetch di BiodataJamaah melalui externalJamaahId
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.set('id', id)
      setSearchParams(newSearchParams, { replace: true })
    }, 100)
  }
  
  // Extract jamaah ID
  const jamaahId = currentJamaah?.id || currentJamaah?.kode_jamaah || searchParams.get('id') || ''

  return (
    <div className="p-2 sm:p-3 h-full overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="h-full flex flex-col overflow-hidden"
      >
        {/* Tab Navigation untuk Mobile dan Tablet (hingga lg breakpoint) - Fixed */}
        <div className="lg:hidden flex mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex-shrink-0">
          <button
            onClick={() => setActiveTab('biodata')}
            className={`flex-1 py-2 text-center border-b-2 font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'biodata'
                ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            <span>Biodata</span>
          </button>
          <button
            onClick={() => setActiveTab('tabungan')}
            className={`flex-1 py-2 text-center border-b-2 font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'tabungan'
                ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Tabungan</span>
          </button>
        </div>

        {/* Layout: Desktop 2 kolom (lg+), Mobile/Tablet tab-based (< lg) */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Biodata Section */}
          <div 
            ref={biodataRef}
            className="col-span-1 h-full overflow-hidden"
          >
            <BiodataJamaah 
              onJamaahChange={handleJamaahChange}
              onOpenSearch={() => setIsSearchOpen(true)}
              externalJamaahId={searchParams.get('id') || ''}
            />
          </div>

          {/* Tabungan Section */}
          <div 
            ref={tabunganRef}
            className="col-span-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 h-full flex flex-col"
            style={{
              minHeight: 0,
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <TabunganList jamaahId={jamaahId} jamaahData={currentJamaah} />
          </div>
        </div>
      </motion.div>

      {/* Search Offcanvas - Render di luar dengan portal */}
      {createPortal(
        <SearchJamaahOffcanvas
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectJamaah={handleSelectJamaahFromSearch}
        />,
        document.body
      )}
    </div>
  )
}

export default Tabungan

