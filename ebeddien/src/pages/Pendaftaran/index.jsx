import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import BiodataPendaftaran from './components/BiodataPendaftaran'
import BerkasTabPanel from './components/BerkasTabPanel'
import PembayaranBox from './components/PembayaranBox'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'

const VALID_TABS = ['biodata', 'berkas', 'pembayaran']

function parseTabFromSearch(searchString) {
  const t = new URLSearchParams(searchString).get('tab')
  return VALID_TABS.includes(t) ? t : 'biodata'
}

function Pendaftaran() {
  const [searchParams, setSearchParams] = useSearchParams()
  const biodataRef = useRef(null)
  const rightColumnRef = useRef(null)
  const berkasRef = useRef(null)
  const pembayaranRef = useRef(null)
  const isUpdatingUrlRef = useRef(false)
  const previousIdRef = useRef(null)
  const updateUrlTimeoutRef = useRef(null)

  // Load NIS dari URL (kotak input = NIS 7 digit; link pakai nis, fallback id agar link lama tetap jalan)
  const [currentSantri, setCurrentSantri] = useState(() => {
    const nisFromUrl = searchParams.get('nis') || searchParams.get('id')
    if (nisFromUrl && /^\d{7}$/.test(nisFromUrl)) {
      previousIdRef.current = nisFromUrl
      return { nis: nisFromUrl }
    }
    return null
  })
  const [activeTab, setActiveTab] = useState(() =>
    typeof window !== 'undefined' ? parseTabFromSearch(window.location.search) : 'biodata'
  ) // HP
  const [rightColumnTab, setRightColumnTab] = useState(() => {
    if (typeof window === 'undefined') return 'berkas'
    const t = parseTabFromSearch(window.location.search)
    return t === 'pembayaran' ? 'pembayaran' : 'berkas'
  }) // PC: 'berkas' | 'pembayaran'
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0) // Key untuk trigger refresh PembayaranBox
  
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

  // Load NIS dari URL saat mount atau URL berubah (untuk handle reload)
  useEffect(() => {
    const nisFromUrl = searchParams.get('nis') || searchParams.get('id')
    if (nisFromUrl && /^\d{7}$/.test(nisFromUrl)) {
      if (nisFromUrl !== currentSantri?.nis) {
        isUpdatingUrlRef.current = true
        previousIdRef.current = nisFromUrl
        setCurrentSantri({ nis: nisFromUrl })
        setTimeout(() => { isUpdatingUrlRef.current = false }, 200)
      }
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update URL saat currentSantri berubah (kecuali saat load dari URL)
  // Gunakan debounce untuk mencegah update berulang saat user mengetik
  useEffect(() => {
    // Skip jika sedang update URL atau load dari URL
    if (isUpdatingUrlRef.current) {
      return
    }

    // Clear timeout sebelumnya jika ada
    if (updateUrlTimeoutRef.current) {
      clearTimeout(updateUrlTimeoutRef.current)
    }

    updateUrlTimeoutRef.current = setTimeout(() => {
      const nisFromUrl = searchParams.get('nis') || searchParams.get('id')
      const currentNis = currentSantri?.nis
      if (currentNis && /^\d{7}$/.test(currentNis)) {
        if (nisFromUrl !== currentNis) {
          isUpdatingUrlRef.current = true
          previousIdRef.current = currentNis
          const newSearchParams = new URLSearchParams(searchParams)
          newSearchParams.set('nis', currentNis)
          setSearchParams(newSearchParams, { replace: true })
          setTimeout(() => { isUpdatingUrlRef.current = false }, 100)
        } else {
          previousIdRef.current = currentNis
        }
      } else if (!currentNis && nisFromUrl) {
        isUpdatingUrlRef.current = true
        previousIdRef.current = null
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('nis')
        setSearchParams(newSearchParams, { replace: true })
        setTimeout(() => { isUpdatingUrlRef.current = false }, 100)
      } else if (!currentNis && !nisFromUrl) {
        previousIdRef.current = null
      }
    }, 300)

    // Cleanup timeout saat unmount atau dependency berubah
    return () => {
      if (updateUrlTimeoutRef.current) {
        clearTimeout(updateUrlTimeoutRef.current)
      }
    }
  }, [currentSantri, searchParams, setSearchParams])

  // Sinkron tab dari URL (?tab=biodata|berkas|pembayaran)
  useEffect(() => {
    const t = searchParams.get('tab')
    if (!VALID_TABS.includes(t)) return
    setActiveTab(t)
    if (t === 'pembayaran') setRightColumnTab('pembayaran')
    else if (t === 'berkas') setRightColumnTab('berkas')
  }, [searchParams])

  const persistTabToUrl = useCallback(
    (tab) => {
      const next = new URLSearchParams(searchParams)
      next.set('tab', tab)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )
  
  // Tampilkan konten sesuai tab (HP) atau kolom (PC)
  useEffect(() => {
    if (biodataRef.current) {
      biodataRef.current.style.display = isDesktop ? 'block' : (activeTab === 'biodata' ? 'block' : 'none')
    }
    if (rightColumnRef.current) {
      rightColumnRef.current.style.display = isDesktop ? 'flex' : (activeTab !== 'biodata' ? 'flex' : 'none')
    }
    if (berkasRef.current) {
      berkasRef.current.style.display = isDesktop ? (rightColumnTab === 'berkas' ? 'flex' : 'none') : (activeTab === 'berkas' ? 'flex' : 'none')
    }
    if (pembayaranRef.current) {
      pembayaranRef.current.style.display = isDesktop ? (rightColumnTab === 'pembayaran' ? 'flex' : 'none') : (activeTab === 'pembayaran' ? 'flex' : 'none')
    }
  }, [activeTab, isDesktop, rightColumnTab])
  
  const santriId = currentSantri?.nis || ''
  
  // Handle select santri from search
  const handleSelectSantriFromSearch = (id) => {
    // Tutup offcanvas dulu
    setIsSearchOpen(false)
    
    // Set NIS (search mengembalikan nis untuk tampilan/URL)
    setCurrentSantri({ nis: id })
  }

  return (
    <div className="p-2 sm:p-3 h-full min-h-0 overflow-hidden flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="h-full min-h-0 flex flex-col overflow-hidden flex-1"
      >
        {/* Tab Navigation HP/Tablet: 3 tab Biodata | Berkas | Pembayaran */}
        <div className="lg:hidden flex mb-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden flex-shrink-0">
          <button
            onClick={() => {
              setActiveTab('biodata')
              persistTabToUrl('biodata')
            }}
            className={`flex-1 py-1.5 text-sm text-center border-b-2 font-medium flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'biodata'
                ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Biodata</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('berkas')
              persistTabToUrl('berkas')
            }}
            className={`flex-1 py-1.5 text-sm text-center border-b-2 font-medium flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'berkas'
                ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>Berkas</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('pembayaran')
              persistTabToUrl('pembayaran')
            }}
            className={`flex-1 py-1.5 text-sm text-center border-b-2 font-medium flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'pembayaran'
                ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span>Pembayaran</span>
          </button>
        </div>

        {/* Layout: PC 2 kolom (kiri Biodata, kanan tab Berkas|Pembayaran); HP 1 kolom dengan 3 tab */}
        <div className="flex flex-col lg:grid lg:grid-cols-2 lg:grid-rows-1 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Kolom kiri: Biodata (PC selalu tampil; HP hanya saat tab Biodata) */}
          <div
            ref={biodataRef}
            className="col-span-1 min-h-0 h-full overflow-hidden flex flex-col"
          >
            <BiodataPendaftaran
              externalSantriId={currentSantri?.nis}
              onOpenSearch={() => setIsSearchOpen(true)}
              hideBerkasSection
              onBiodataSaved={() => setRefreshKey((prev) => prev + 1)}
              onDataChange={(data) => {
                const isInvalid =
                  data.invalid ||
                  !data.id ||
                  data.id === '' ||
                  (data.id && !/^\d{7}$/.test(data.id))
                if (isInvalid) {
                  // Jangan kosongkan pilihan saat NIS "0" (trigger hilang) agar user tidak dilontarkan setelah simpan
                  if (data.id === '0' || data.id === 0) {
                    return
                  }
                  if (currentSantri?.nis) {
                    setCurrentSantri(null)
                    previousIdRef.current = null
                  }
                  return
                }
                if (data.id && /^\d{7}$/.test(data.id) && data.id !== currentSantri?.nis) {
                  setCurrentSantri({ nis: data.id })
                }
              }}
            />
          </div>

          {/* Kolom kanan PC: tab Berkas | Pembayaran; HP: tampil hanya saat tab Berkas atau Pembayaran */}
          <div ref={rightColumnRef} className="col-span-1 flex flex-col min-h-0 overflow-hidden">
            {/* Tab Berkas | Pembayaran (hanya tampil di PC) */}
            <div className="hidden lg:flex mb-1.5 bg-white dark:bg-gray-800 rounded-t-lg shadow-sm overflow-hidden flex-shrink-0 border-b border-gray-200 dark:border-gray-600">
              <button
                onClick={() => {
                  setRightColumnTab('berkas')
                  persistTabToUrl('berkas')
                }}
                className={`flex-1 py-1.5 text-sm text-center border-b-2 font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  rightColumnTab === 'berkas'
                    ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Berkas
              </button>
              <button
                onClick={() => {
                  setRightColumnTab('pembayaran')
                  persistTabToUrl('pembayaran')
                }}
                className={`flex-1 py-1.5 text-sm text-center border-b-2 font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  rightColumnTab === 'pembayaran'
                    ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Pembayaran
              </button>
            </div>

            {/* Kotak Berkas (HP: saat tab Berkas; PC: saat tab Berkas) */}
            <div
              ref={berkasRef}
              className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-gray-800 rounded-lg lg:rounded-t-none shadow-md p-4 lg:p-6"
            >
              <BerkasTabPanel santriId={currentSantri?.nis} />
            </div>

            {/* Kotak Pembayaran (HP: saat tab Pembayaran; PC: saat tab Pembayaran) */}
            <div
              ref={pembayaranRef}
              className="flex-1 min-h-0 overflow-hidden flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md p-6"
              style={{ minHeight: 0 }}
            >
              <PembayaranBox santriId={currentSantri?.nis} refreshKey={refreshKey} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Search Offcanvas - Render di luar dengan portal */}
      {createPortal(
        <SearchOffcanvas
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectSantri={handleSelectSantriFromSearch}
        />,
        document.body
      )}
    </div>
  )
}

export default Pendaftaran

