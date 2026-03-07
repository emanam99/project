import { useState, useEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import BiodataBox from '../../components/Biodata/BiodataBox'
import RincianList from './components/RincianList'
import UwabaRincian from './components/UwabaRincian'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { uwabaAPI } from '../../services/api'

function Pembayaran() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const biodataRef = useRef(null)
  const rincianRef = useRef(null)
  const isUpdatingUrlRef = useRef(false)
  const updateUrlTimeoutRef = useRef(null)
  
  // Tentukan mode berdasarkan path
  const getMode = () => {
    if (location.pathname === '/uwaba') return 'uwaba'
    if (location.pathname === '/khusus') return 'khusus'
    if (location.pathname === '/tunggakan') return 'tunggakan'
    return 'tunggakan' // default fallback
  }
  
  const mode = getMode()
  const isKhusus = mode === 'khusus'
  const isUwaba = mode === 'uwaba'
  
  const [currentSantri, setCurrentSantri] = useState(() => {
    const nisFromUrl = searchParams.get('nis') || searchParams.get('id')
    if (nisFromUrl && /^\d{7}$/.test(nisFromUrl)) {
      return { nis: nisFromUrl }
    }
    return null
  })
  const [activeTab, setActiveTab] = useState('biodata') // 'biodata' atau 'rincian'
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const closeSearchOffcanvas = useOffcanvasBackClose(isSearchOpen, () => setIsSearchOpen(false))
  const [uwabaPrices, setUwabaPrices] = useState(null)
  const [biodata, setBiodata] = useState(null)
  const [isDesktop, setIsDesktop] = useState(false)
  
  // Track window size untuk menentukan desktop/mobile
  // Desktop = >= 1024px (lg breakpoint), sehingga tablet (640-1024px) akan menggunakan tab
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }
    
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])
  
  // Update URL saat currentSantri berubah dengan debounce untuk mencegah loop
  useEffect(() => {
    // Skip jika sedang update URL
    if (isUpdatingUrlRef.current) {
      return
    }

    // Clear timeout sebelumnya jika ada
    if (updateUrlTimeoutRef.current) {
      clearTimeout(updateUrlTimeoutRef.current)
    }

    // Debounce update URL
    updateUrlTimeoutRef.current = setTimeout(() => {
      const nisFromUrl = searchParams.get('nis') || searchParams.get('id')
      const currentNis = currentSantri?.nis
      if (currentNis && /^\d{7}$/.test(currentNis)) {
        if (nisFromUrl !== currentNis) {
          isUpdatingUrlRef.current = true
          const newSearchParams = new URLSearchParams(searchParams)
          newSearchParams.set('nis', currentNis)
          newSearchParams.delete('id')
          setSearchParams(newSearchParams, { replace: true })
          setTimeout(() => { isUpdatingUrlRef.current = false }, 100)
        }
      } else if (!currentNis && nisFromUrl) {
        isUpdatingUrlRef.current = true
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('nis')
        newSearchParams.delete('id')
        setSearchParams(newSearchParams, { replace: true })
        setTimeout(() => { isUpdatingUrlRef.current = false }, 100)
      }
      updateUrlTimeoutRef.current = null
    }, 300)

    // Cleanup timeout saat unmount atau dependency berubah
    return () => {
      if (updateUrlTimeoutRef.current) {
        clearTimeout(updateUrlTimeoutRef.current)
      }
    }
  }, [currentSantri, searchParams, setSearchParams])
  
  // Fix display untuk desktop saat mount dan resize
  useEffect(() => {
    if (biodataRef.current) {
      biodataRef.current.style.display = isDesktop ? 'block' : (activeTab === 'biodata' ? 'block' : 'none')
    }
    if (rincianRef.current) {
      rincianRef.current.style.display = isDesktop ? 'flex' : (activeTab === 'rincian' ? 'flex' : 'none')
    }
  }, [activeTab, isDesktop])
  
  // Load UWABA prices hanya jika mode uwaba
  useEffect(() => {
    if (isUwaba) {
      loadPrices()
    }
  }, [isUwaba])
  
  useEffect(() => {
    if (isUpdatingUrlRef.current) return
    const nisFromUrl = searchParams.get('nis') || searchParams.get('id')
    if (nisFromUrl && /^\d{7}$/.test(nisFromUrl)) {
      if (nisFromUrl !== currentSantri?.nis) {
        isUpdatingUrlRef.current = true
        setCurrentSantri({ nis: nisFromUrl })
        setTimeout(() => { isUpdatingUrlRef.current = false }, 200)
      }
    } else if (!nisFromUrl && currentSantri?.nis) {
      setCurrentSantri(null)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps
  
  const loadPrices = async () => {
    try {
      const result = await uwabaAPI.getPrices()
      if (result.success && result.data) {
        setUwabaPrices(result.data)
      }
    } catch (error) {
      console.error('Error loading UWABA prices:', error)
    }
  }
  
  const santriId = currentSantri?.nis || ''

  const handleSelectSantriFromSearch = (nisOrId) => {
    setCurrentSantri(null)
    setIsSearchOpen(false)
    setTimeout(() => {
      setCurrentSantri({ nis: nisOrId })
    }, 100)
  }

  const handleSantriChange = (santriData) => {
    const nis = santriData?.nis ?? santriData?.id
    if (nis && /^\d{7}$/.test(String(nis))) {
      setCurrentSantri({ nis: String(nis) })
    } else {
      setCurrentSantri(santriData ? { nis: String(santriData.id || santriData.nis || '') } : null)
    }
    if (santriData && isUwaba) {
      // Extract biodata fields untuk UWABA calculation
      // Note: saudara bisa dari field 'saudara' atau 'saudara_di_pesantren'
      setBiodata({
        status_santri: santriData.status_santri || '',
        kategori: santriData.kategori || '',
        diniyah: santriData.diniyah || '',
        formal: santriData.formal || '',
        lttq: santriData.lttq || '',
        saudara: santriData.saudara || santriData.saudara_di_pesantren || ''
      })
    } else {
      setBiodata(null)
    }
  }
  
  // Get label untuk tab rincian
  const getRincianLabel = () => {
    if (isUwaba) return 'UWABA'
    if (isKhusus) return 'Khusus'
    return 'Tunggakan'
  }

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
            onClick={() => setActiveTab('rincian')}
            className={`flex-1 py-2 text-center border-b-2 font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'rincian'
                ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
            </svg>
            <span>{getRincianLabel()}</span>
          </button>
        </div>

        {/* Layout: Desktop 2 kolom (lg+), Mobile/Tablet tab-based (< lg) */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Biodata Section */}
          {/* BiodataBox tidak akan reload saat mode berubah karena menggunakan externalSantriId yang hanya berubah saat santriId berubah */}
          <div 
            ref={biodataRef}
            className="col-span-1 h-full overflow-hidden"
          >
            <BiodataBox 
              onSantriChange={isUwaba ? handleSantriChange : setCurrentSantri} 
              onOpenSearch={() => setIsSearchOpen(true)}
              externalSantriId={currentSantri?.nis}
            />
          </div>

          {/* Rincian Section */}
          <div 
            ref={rincianRef}
            className="col-span-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 h-full flex flex-col"
            style={{
              minHeight: 0,
              height: '100%',
              overflow: 'hidden'
            }}
          >
            {isUwaba ? (
              <div className="flex-1" style={{ minHeight: 0, height: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <UwabaRincian 
                  santriId={santriId}
                  biodata={biodata}
                  prices={uwabaPrices}
                />
              </div>
            ) : (
              <RincianList 
                santriId={santriId} 
                mode={isKhusus ? 'khusus' : 'tunggakan'} 
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* Search Offcanvas - Render di luar dengan portal */}
      {createPortal(
        <SearchOffcanvas
          isOpen={isSearchOpen}
          onClose={closeSearchOffcanvas}
          onSelectSantri={handleSelectSantriFromSearch}
        />,
        document.body
      )}
    </div>
  )
}

export default Pembayaran

