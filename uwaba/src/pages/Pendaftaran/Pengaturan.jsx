import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { pengaturanAPI, getApiBaseUrl, tahunAjaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import PengaturanSidebarNavigation from './components/pengaturan/PengaturanSidebarNavigation'
import PengaturanSection from './components/pengaturan/PengaturanSection'
import PaymentGatewaySection from './components/pengaturan/PaymentGatewaySection'

function Pengaturan() {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pengaturan, setPengaturan] = useState([])
  const [formData, setFormData] = useState({})
  const [originalData, setOriginalData] = useState({}) // Untuk track perubahan
  const [uploading, setUploading] = useState({})
  const [focusedField, setFocusedField] = useState(null)
  // Sidebar state: 'hidden' | 'collapsed' | 'expanded'
  const [sidebarState, setSidebarState] = useState('collapsed')
  const [activeSection, setActiveSection] = useState(null)
  const sectionRefs = useRef({})
  // Opsi tahun ajaran dari master (untuk select di kategori Tahun Ajaran)
  const [tahunAjaranHijriyahOptions, setTahunAjaranHijriyahOptions] = useState([])
  const [tahunAjaranMasehiOptions, setTahunAjaranMasehiOptions] = useState([])

  // Load pengaturan saat mount
  useEffect(() => {
    loadPengaturan()
  }, [])

  // Load opsi tahun ajaran (hijriyah & masehi) untuk select default aplikasi daftar
  useEffect(() => {
    let cancelled = false
    Promise.all([
      tahunAjaranAPI.getAll({ kategori: 'hijriyah' }).then((r) => (r.success && r.data ? r.data : [])),
      tahunAjaranAPI.getAll({ kategori: 'masehi' }).then((r) => (r.success && r.data ? r.data : []))
    ]).then(([hijriyah, masehi]) => {
      if (cancelled) return
      setTahunAjaranHijriyahOptions(hijriyah.map((row) => ({ value: row.tahun_ajaran, label: row.tahun_ajaran })))
      setTahunAjaranMasehiOptions(masehi.map((row) => ({ value: row.tahun_ajaran, label: row.tahun_ajaran })))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const loadPengaturan = async () => {
    setLoading(true)
    try {
      const response = await pengaturanAPI.getAll()
      
      // Handle berbagai format response
      let data = []
      if (response) {
        if (response.success === true && response.data) {
          data = response.data
        } else if (Array.isArray(response)) {
          data = response
        } else if (response.data && Array.isArray(response.data)) {
          data = response.data
        }
      }
      
      // Pastikan data adalah array
      const dataArray = Array.isArray(data) ? data : []
      const settings = {}
      
      dataArray.forEach(setting => {
        if (setting && setting.key) {
          settings[setting.key] = setting.value || ''
        }
      })
      
      setPengaturan(dataArray)
      setFormData(settings)
      setOriginalData({...settings}) // Simpan data original untuk compare
      
      // Jika tidak ada data dan response.success adalah false, tampilkan error
      if (response && response.success === false && response.message) {
        showNotification(response.message, 'error')
      }
    } catch (error) {
      console.error('Error loading pengaturan:', error)
      
      // Extract error message
      let errorMsg = 'Gagal memuat pengaturan'
      if (error.response) {
        if (error.response.data && error.response.data.message) {
          errorMsg = error.response.data.message
        } else if (error.response.status === 500) {
          errorMsg = 'Server error. Pastikan tabel psb___pengaturan sudah dibuat di database.'
        }
      } else if (error.message) {
        errorMsg = error.message
      }
      
      showNotification(errorMsg, 'error')
      // Set empty state jika error
      setPengaturan([])
      setFormData({})
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // Helper function untuk mendapatkan className label berdasarkan focused state
  const getLabelClassName = (fieldName) => {
    const baseClass = "block text-xs mb-1 transition-colors duration-200"
    if (focusedField === fieldName) {
      return `${baseClass} text-teal-600 dark:text-teal-400 font-semibold`
    }
    return `${baseClass} text-gray-500 dark:text-gray-400`
  }

  // Cek apakah ada perubahan
  const hasChanges = () => {
    return Object.keys(formData).some(key => {
      const currentValue = formData[key] || ''
      const originalValue = originalData[key] || ''
      return currentValue !== originalValue
    })
  }

  // Simpan semua perubahan
  const handleSaveAll = async () => {
    if (!hasChanges()) {
      showNotification('Tidak ada perubahan yang perlu disimpan', 'info')
      return
    }

    setSaving(true)
    try {
      // Simpan semua perubahan yang berbeda dari original
      const updates = []
      for (const key in formData) {
        const currentValue = formData[key] || ''
        const originalValue = originalData[key] || ''
        if (currentValue !== originalValue) {
          updates.push(
            pengaturanAPI.updateByKey(key, {
              value: currentValue || null
            })
          )
        }
      }

      // Execute semua update secara parallel
      const results = await Promise.all(updates)
      
      // Cek apakah semua berhasil
      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        showNotification(`Gagal menyimpan ${failed.length} pengaturan`, 'error')
        return
      }

      showNotification('Semua pengaturan berhasil disimpan', 'success')
      // Reload untuk mendapatkan data terbaru
      await loadPengaturan()
    } catch (error) {
      console.error('Error saving pengaturan:', error)
      showNotification('Gagal menyimpan pengaturan: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (key, file) => {
    if (!file) {
      showNotification('Pilih file terlebih dahulu', 'error')
      return
    }

    setUploading(prev => ({ ...prev, [key]: true }))
    try {
      const response = await pengaturanAPI.uploadImage(key, file)

      if (response.success) {
        showNotification('Gambar berhasil diupload', 'success')
        // Update form data dengan path baru
        const newPath = response.data.path
        setFormData(prev => ({
          ...prev,
          [key]: newPath
        }))
        // Update original data juga karena upload langsung tersimpan
        setOriginalData(prev => ({
          ...prev,
          [key]: newPath
        }))
      } else {
        showNotification(response.message || 'Gagal upload gambar', 'error')
      }
    } catch (error) {
      console.error('Error uploading image:', error)
      showNotification('Gagal upload gambar: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }))
    }
  }

  // Toggle sidebar state: hidden -> collapsed -> expanded -> hidden
  const toggleSidebar = () => {
    setSidebarState(prev => {
      if (prev === 'hidden') return 'collapsed'
      if (prev === 'collapsed') return 'expanded'
      return 'hidden'
    })
  }

  // Get margin left untuk content berdasarkan sidebar state
  const getContentMargin = () => {
    if (sidebarState === 'hidden') return 'ml-0'
    if (sidebarState === 'collapsed') return 'ml-12'
    return 'ml-48' // expanded
  }

  // Group pengaturan by kategori dan urutkan
  const groupedSettings = pengaturan.reduce((acc, setting) => {
    const kategori = setting.kategori || 'Lainnya'
    if (!acc[kategori]) {
      acc[kategori] = []
    }
    acc[kategori].push(setting)
    return acc
  }, {})

  // Sort kategori: Tahun Ajaran dulu, lalu Gelombang, lalu Pendaftaran, lalu Payment Gateway, lalu lainnya
  const sortedKategori = Object.keys(groupedSettings).sort((a, b) => {
    if (a === 'Tahun Ajaran') return -1
    if (b === 'Tahun Ajaran') return 1
    if (a === 'Gelombang') return -1
    if (b === 'Gelombang') return 1
    if (a === 'Pendaftaran') return -1
    if (b === 'Pendaftaran') return 1
    if (a === 'Payment Gateway') return -1
    if (b === 'Payment Gateway') return 1
    return a.localeCompare(b)
  })

  // Tambahkan Payment Gateway ke sections jika belum ada
  if (!sortedKategori.includes('Payment Gateway')) {
    sortedKategori.push('Payment Gateway')
  }

  // Sort settings dalam kategori berdasarkan urutan
  sortedKategori.forEach(kategori => {
    if (groupedSettings[kategori] && Array.isArray(groupedSettings[kategori])) {
      groupedSettings[kategori].sort((a, b) => {
        if (a.urutan !== b.urutan) {
          return a.urutan - b.urutan
        }
        return a.id - b.id
      })
    }
  })

  // Function to scroll to a specific section
  const scrollToSection = (kategori) => {
    const ref = sectionRefs.current[kategori]
    if (ref) {
      // Get the scrollable container (parent with overflow-y-auto)
      const scrollContainer = ref.closest('.overflow-y-auto')
      
      if (scrollContainer) {
        // Wait for next frame to ensure layout is stable
        requestAnimationFrame(() => {
          // Get element position relative to scroll container
          const containerRect = scrollContainer.getBoundingClientRect()
          const elementRect = ref.getBoundingClientRect()
          
          // Calculate scroll position: element top - container top + current scroll - offset
          // Offset untuk spacing dari atas (memperhitungkan padding container p-6 = 24px)
          const offset = 24
          const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset
          
          scrollContainer.scrollTo({
            top: Math.max(0, scrollTop), // Ensure non-negative
            behavior: 'smooth'
          })
        })
      } else {
        // Fallback to default scrollIntoView with offset
        ref.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        })
      }
    }
  }

  // Set default active section saat kategori berubah
  useEffect(() => {
    if (sortedKategori.length === 0) {
      setActiveSection(null)
    } else if (!activeSection || !sortedKategori.includes(activeSection)) {
      setActiveSection(sortedKategori[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedKategori])

  // Intersection Observer untuk detect section yang aktif
  useEffect(() => {
    if (sortedKategori.length === 0) return

    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    }

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Cari section key berdasarkan ref
          const sectionKey = Object.keys(sectionRefs.current).find(
            key => sectionRefs.current[key] === entry.target
          )
          if (sectionKey) {
            setActiveSection(sectionKey)
          }
        }
      })
    }

    const observer = new IntersectionObserver(observerCallback, observerOptions)

    // Observe semua sections setelah DOM update
    const timeoutId = setTimeout(() => {
      Object.values(sectionRefs.current).forEach((ref) => {
        if (ref) {
          observer.observe(ref)
        }
      })
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [sortedKategori])

  // Get icon untuk tombol toggle berdasarkan state
  const getToggleIcon = () => {
    if (sidebarState === 'hidden') {
      return (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>
      )
    } else if (sidebarState === 'collapsed') {
      return (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
      )
    } else {
      return (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>
      )
    }
  }

  // Get title untuk tombol toggle
  const getToggleTitle = () => {
    if (sidebarState === 'hidden') return 'Tampilkan Menu (Logo)'
    if (sidebarState === 'collapsed') return 'Tampilkan Menu (Logo + Label)'
    return 'Sembunyikan Menu'
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div className="p-4 sm:p-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-full flex flex-col overflow-hidden relative">
      {/* Sidebar Navigation - Fixed di kiri */}
      {sortedKategori.length > 0 && (
        <PengaturanSidebarNavigation
          sidebarState={sidebarState}
          activeSection={activeSection}
          scrollToSection={scrollToSection}
          sections={sortedKategori}
        />
      )}

      {/* Header */}
      <div className={`flex-shrink-0 bg-gray-200 dark:bg-gray-700/50 p-2 border-b-2 border-gray-300 dark:border-gray-600 transition-all duration-300 ${getContentMargin()}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {sortedKategori.length > 0 && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="p-1 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                title={getToggleTitle()}
              >
                <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {getToggleIcon()}
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasChanges() && (
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                Ada perubahan yang belum disimpan
              </span>
            )}
            <button
              onClick={handleSaveAll}
              disabled={saving || !hasChanges()}
              className={`px-4 py-2 rounded-lg transition-colors font-semibold flex items-center gap-2 ${
                saving || !hasChanges()
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-teal-600 hover:bg-teal-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                  </svg>
                  <span>Simpan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className={`flex-1 overflow-y-auto p-4 sm:p-6 transition-all duration-300 ${getContentMargin()}`}>
        <div className="max-w-4xl mx-auto">
          {sortedKategori.length === 0 ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
              <p className="text-yellow-800 dark:text-yellow-300">
                Belum ada pengaturan. Silakan jalankan migration SQL untuk membuat tabel dan data default.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedKategori.map((kategori) => {
                // Skip Payment Gateway dan Pendaftaran (di-render terpisah)
                if (kategori === 'Payment Gateway' || kategori === 'Pendaftaran') {
                  return null
                }
                
                return (
                  <motion.div
                    key={kategori}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <PengaturanSection
                      ref={(el) => {
                        sectionRefs.current[kategori] = el
                      }}
                      kategori={kategori}
                      settings={groupedSettings[kategori] || []}
                      formData={formData}
                      focusedField={focusedField}
                      onFieldChange={handleInputChange}
                      onFocus={setFocusedField}
                      onBlur={() => setFocusedField(null)}
                      getLabelClassName={getLabelClassName}
                      onImageUpload={handleImageUpload}
                      uploading={uploading}
                      getApiBaseUrl={getApiBaseUrl}
                      tahunAjaranHijriyahOptions={tahunAjaranHijriyahOptions}
                      tahunAjaranMasehiOptions={tahunAjaranMasehiOptions}
                    />
                  </motion.div>
                )
              })}
              
              {/* Catatan Pengaturan - Di atas Payment Gateway */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 p-4 sm:p-5 border border-sky-200/80 dark:border-sky-800/50 shadow-sm">
                  <h3 className="font-semibold text-sky-800 dark:text-sky-300 mb-3 text-sm flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-sky-500"></span>
                    Catatan Pengaturan
                  </h3>
                  <ul className="text-xs sm:text-sm text-sky-700 dark:text-sky-400 space-y-2 list-none">
                    <li className="flex items-start gap-2">
                      <span className="text-sky-500 mt-0.5 flex-shrink-0">•</span>
                      <span>Pengaturan akan langsung diterapkan setelah disimpan</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-500 mt-0.5 flex-shrink-0">•</span>
                      <span>Tahun Hijriyah dan Tahun Masehi untuk identifikasi tahun ajaran pendaftaran</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-500 mt-0.5 flex-shrink-0">•</span>
                      <span>Gelombang 1-5 berisi tanggal mulai masing-masing gelombang</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-500 mt-0.5 flex-shrink-0">•</span>
                      <span>Gelombang aktif ditentukan otomatis berdasarkan tanggal saat ini</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-500 mt-0.5 flex-shrink-0">•</span>
                      <span>Format tanggal: <code className="px-1 py-0.5 rounded bg-sky-100 dark:bg-sky-900/50 font-mono text-[11px] sm:text-xs">YYYY-MM-DD</code></span>
                    </li>
                  </ul>
                </div>
              </motion.div>
              
              {/* Payment Gateway Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <PaymentGatewaySection
                  ref={(el) => {
                    sectionRefs.current['Payment Gateway'] = el
                  }}
                />
              </motion.div>
              
              {/* Pendaftaran (Email Verifikasi Demo dll) - Di bawah Payment Gateway, tanpa judul */}
              {groupedSettings['Pendaftaran']?.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <PengaturanSection
                    ref={(el) => {
                      sectionRefs.current['Pendaftaran'] = el
                    }}
                    kategori="Pendaftaran"
                    settings={groupedSettings['Pendaftaran']}
                    formData={formData}
                    focusedField={focusedField}
                    onFieldChange={handleInputChange}
                    onFocus={setFocusedField}
                    onBlur={() => setFocusedField(null)}
                    getLabelClassName={getLabelClassName}
                    onImageUpload={handleImageUpload}
                    uploading={uploading}
                    getApiBaseUrl={getApiBaseUrl}
                    tahunAjaranHijriyahOptions={tahunAjaranHijriyahOptions}
                    tahunAjaranMasehiOptions={tahunAjaranMasehiOptions}
                    hideTitle
                  />
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Pengaturan
