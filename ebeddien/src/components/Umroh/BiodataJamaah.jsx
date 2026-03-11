import { useState, useEffect, useRef } from 'react'
import { umrohJamaahAPI } from '../../services/api'
import { motion } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'

function BiodataJamaah({ onJamaahChange, onOpenSearch, externalJamaahId }) {
  const { showNotification } = useNotification()
  const [jamaahId, setJamaahId] = useState('')
  const [biodata, setBiodata] = useState(null)
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState(null)
  
  const isUserTypingRef = useRef(false)
  const prevExternalJamaahIdRef = useRef(externalJamaahId)

  // Helper function untuk mendapatkan className label berdasarkan focused state
  const getLabelClassName = (fieldName) => {
    const baseClass = "block text-xs mb-1 transition-colors duration-200"
    if (focusedField === fieldName) {
      return `${baseClass} text-teal-600 dark:text-teal-400 font-semibold`
    }
    return `${baseClass} text-gray-500 dark:text-gray-400`
  }

  // Validasi ID jamaah (bisa kode_jamaah atau ID)
  const isValidJamaahId = (id) => {
    return id && id.length > 0
  }

  // Fetch data jamaah
  const fetchJamaahData = async (id) => {
    if (!isValidJamaahId(id)) {
      setBiodata(null)
      if (onJamaahChange) onJamaahChange(null)
      return
    }

    setLoading(true)
    try {
      const response = await umrohJamaahAPI.getById(id)
      if (response.success && response.data) {
        setBiodata(response.data)
        if (onJamaahChange) onJamaahChange(response.data)
      } else {
        setBiodata(null)
        if (onJamaahChange) onJamaahChange(null)
        showNotification(response.message || 'Jamaah tidak ditemukan', 'error')
      }
    } catch (error) {
      console.error('Error fetching jamaah data:', error)
      setBiodata(null)
      if (onJamaahChange) onJamaahChange(null)
      showNotification(
        error.response?.data?.message || 'Terjadi kesalahan saat memuat data jamaah',
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  // Sync external jamaahId saat mount (jika tidak ada externalJamaahId)
  useEffect(() => {
    if (externalJamaahId && !jamaahId && isValidJamaahId(externalJamaahId)) {
      setJamaahId(externalJamaahId)
      fetchJamaahData(externalJamaahId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external jamaahId
  useEffect(() => {
    if (isUserTypingRef.current) {
      return
    }
    
    if (prevExternalJamaahIdRef.current !== externalJamaahId) {
      prevExternalJamaahIdRef.current = externalJamaahId
      
      if (externalJamaahId) {
        if (externalJamaahId !== jamaahId) {
          setJamaahId('')
          setBiodata(null)
          if (onJamaahChange) onJamaahChange(null)
          
          setTimeout(() => {
            setJamaahId(externalJamaahId)
            if (isValidJamaahId(externalJamaahId)) {
              fetchJamaahData(externalJamaahId)
            }
          }, 150)
        }
      } else {
        if (jamaahId && isValidJamaahId(jamaahId) && prevExternalJamaahIdRef.current !== null) {
          setJamaahId('')
          setBiodata(null)
          if (onJamaahChange) onJamaahChange(null)
        }
      }
    }
  }, [externalJamaahId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle input change
  const handleIdChange = (e) => {
    const value = e.target.value
    setJamaahId(value)
    isUserTypingRef.current = true
    
    // Reset flag setelah user selesai mengetik
    clearTimeout(window.typingTimeout)
    window.typingTimeout = setTimeout(() => {
      isUserTypingRef.current = false
    }, 1000)
    
    // Auto fetch jika ID valid
    if (isValidJamaahId(value)) {
      fetchJamaahData(value)
    } else {
      setBiodata(null)
      if (onJamaahChange) onJamaahChange(null)
    }
  }

  // Handle enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && isValidJamaahId(jamaahId)) {
      fetchJamaahData(jamaahId)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Biodata Jamaah
        </h2>
        
        {/* Search Input */}
        <div className="relative">
          <label className={getLabelClassName('jamaahId')}>
            Kode Jamaah / ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={jamaahId}
              onChange={handleIdChange}
              onKeyPress={handleKeyPress}
              onFocus={() => setFocusedField('jamaahId')}
              onBlur={() => setFocusedField(null)}
              placeholder="Masukkan kode jamaah atau ID"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={onOpenSearch}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      )}

      {/* Biodata Display */}
      {!loading && biodata && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 overflow-y-auto"
        >
          <div className="space-y-4">
            <div>
              <label className={getLabelClassName('nama')}>Nama Lengkap</label>
              <p className="text-gray-900 dark:text-white font-medium">{biodata.nama_lengkap || '-'}</p>
            </div>
            
            <div>
              <label className={getLabelClassName('kode')}>Kode Jamaah</label>
              <p className="text-gray-900 dark:text-white">{biodata.kode_jamaah || '-'}</p>
            </div>
            
            <div>
              <label className={getLabelClassName('nik')}>NIK</label>
              <p className="text-gray-900 dark:text-white">{biodata.nik || '-'}</p>
            </div>
            
            <div>
              <label className={getLabelClassName('telepon')}>Telepon</label>
              <p className="text-gray-900 dark:text-white">{biodata.telepon || '-'}</p>
            </div>
            
            <div>
              <label className={getLabelClassName('paket')}>Paket Umroh</label>
              <p className="text-gray-900 dark:text-white">{biodata.paket_umroh || '-'}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {!loading && !biodata && jamaahId && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Jamaah tidak ditemukan</p>
        </div>
      )}

      {/* Initial State */}
      {!loading && !biodata && !jamaahId && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Masukkan kode jamaah atau ID untuk melihat biodata</p>
        </div>
      )}
    </div>
  )
}

export default BiodataJamaah

