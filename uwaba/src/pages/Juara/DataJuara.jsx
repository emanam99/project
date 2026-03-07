import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { santriJuaraAPI, lembagaAPI, santriAPI, pendaftaranAPI } from '../../services/api'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import { compressImage } from '../../utils/imageCompression'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import Modal from '../../components/Modal/Modal'

function DataJuara() {
  const { showNotification } = useNotification()
  const { tahunAjaran } = useTahunAjaranStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dataJuara, setDataJuara] = useState([])
  const [lembagaList, setLembagaList] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [juaraFilter, setJuaraFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [showOffcanvas, setShowOffcanvas] = useState(false)
  const [showSearchOffcanvas, setShowSearchOffcanvas] = useState(false)
  const closeSearchOffcanvas = useOffcanvasBackClose(showSearchOffcanvas, () => setShowSearchOffcanvas(false))
  const [editingItem, setEditingItem] = useState(null)
  const [selectedSantri, setSelectedSantri] = useState(null)
  const [loadingSantri, setLoadingSantri] = useState(false)
  const [selectedFotos, setSelectedFotos] = useState([]) // Array untuk multiple foto
  const [previewFotos, setPreviewFotos] = useState([]) // Array untuk preview multiple foto
  const [existingFotos, setExistingFotos] = useState([]) // Array untuk existing foto
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const formDataRef = useRef({
    id_santri: '',
    lembaga: '',
    kelas: '',
    wali_kelas: '',
    nilai: '',
    juara: '',
    keterangan: ''
  })
  const [formData, setFormData] = useState({
    id_santri: '',
    tahun_ajaran: '',
    lembaga: '',
    kelas: '',
    wali_kelas: '',
    nilai: '',
    juara: '',
    keterangan: ''
  })

  useEffect(() => {
    loadData()
    loadLembaga()
  }, [tahunAjaran])

  // Cleanup preview URL saat component unmount
  useEffect(() => {
    return () => {
      previewFotos.forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [previewFotos])

  const loadData = async () => {
    setLoading(true)
    setError('')
    
    try {
      const result = await santriJuaraAPI.getAll({ tahun_ajaran: tahunAjaran })
      
      if (result.success) {
        setDataJuara(result.data || [])
      } else {
        setError(result.message || 'Gagal memuat data juara')
      }
    } catch (err) {
      console.error('Error loading data juara:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }

  const loadLembaga = async () => {
    try {
      const result = await lembagaAPI.getAll()
      if (result.success) {
        setLembagaList(result.data || [])
      }
    } catch (err) {
      console.error('Error loading lembaga:', err)
    }
  }

  const handleExportExcel = () => {
    const dataToExport = selectedItems.size > 0
      ? filteredAndSortedData.filter(item => selectedItems.has(item.id))
      : filteredAndSortedData

    if (dataToExport.length === 0) {
      alert('Tidak ada data untuk di-export')
      return
    }

    const excelData = dataToExport.map((item) => ({
      'NIS': item.nis ?? item.id_santri,
      'Nama Santri': item.nama_santri || '',
      'Lembaga': item.nama_lembaga || item.lembaga || '',
      'Kelas': item.kelas || '',
      'Wali Kelas': item.wali_kelas || '',
      'Nilai': item.nilai || '',
      'Juara': item.juara || '',
      'Keterangan': item.keterangan || ''
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)

    const colWidths = [
      { wch: 12 }, // NIS
      { wch: 30 }, // Nama Santri
      { wch: 20 }, // Lembaga
      { wch: 15 }, // Kelas
      { wch: 20 }, // Wali Kelas
      { wch: 12 }, // Nilai
      { wch: 12 }, // Juara
      { wch: 30 }  // Keterangan
    ]
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, 'Data Juara')

    const filterInfo = []
    if (lembagaFilter) filterInfo.push(`Lembaga-${lembagaFilter}`)
    if (juaraFilter) filterInfo.push(`Juara-${juaraFilter}`)
    if (searchTerm) filterInfo.push(`Search-${searchTerm.substring(0, 10)}`)
    const filterSuffix = filterInfo.length > 0 ? `_${filterInfo.join('_')}` : ''
    const filename = `Data_Juara${filterSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`

    XLSX.writeFile(wb, filename)
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const filteredAndSortedData = useMemo(() => {
    let filtered = dataJuara

    if (lembagaFilter) {
      filtered = filtered.filter(item => item.lembaga === lembagaFilter || item.nama_lembaga === lembagaFilter)
    }

    if (juaraFilter) {
      filtered = filtered.filter(item => item.juara === juaraFilter)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(item => 
        (item.nis && item.nis.toString().includes(term)) ||
        item.id_santri.toString().includes(term) ||
        (item.nama_santri && item.nama_santri.toLowerCase().includes(term)) ||
        (item.kelas && item.kelas.toLowerCase().includes(term)) ||
        (item.wali_kelas && item.wali_kelas.toLowerCase().includes(term)) ||
        (item.juara && item.juara.toLowerCase().includes(term))
      )
    }

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]
        
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }
        
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    return filtered
  }, [dataJuara, lembagaFilter, juaraFilter, searchTerm, sortConfig])

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = filteredAndSortedData.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, lembagaFilter, juaraFilter, sortConfig, itemsPerPage])

  const handleToggleSelect = (id) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleToggleSelectAll = () => {
    if (selectedItems.size === paginatedData.length && paginatedData.length > 0) {
      setSelectedItems(new Set())
    } else {
      const newSet = new Set(selectedItems)
      paginatedData.forEach(item => newSet.add(item.id))
      setSelectedItems(newSet)
    }
  }

  const isAllPageSelected = paginatedData.length > 0 && paginatedData.every(item => selectedItems.has(item.id))
  const isSomePageSelected = paginatedData.some(item => selectedItems.has(item.id))

  // Load data santri berdasarkan NIS atau id (backend resolve otomatis). Mengembalikan result untuk dipakai pemanggil.
  const loadSantriData = async (nisAtauId) => {
    if (!nisAtauId || String(nisAtauId).trim() === '') {
      setSelectedSantri(null)
      return null
    }

    setLoadingSantri(true)
    try {
      const result = await santriAPI.getById(nisAtauId)
      if (result.success && result.data) {
        setSelectedSantri(result.data)
        return result
      }
      setSelectedSantri(null)
      return result
    } catch (error) {
      console.error('Error loading santri data:', error)
      setSelectedSantri(null)
      return null
    } finally {
      setLoadingSantri(false)
    }
  }

  // Handle perubahan NIS (input bisa NIS 7 digit atau id numerik; backend resolve)
  const handleSantriIdChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 7)
    setFormData(prev => ({ ...prev, id_santri: value }))
    formDataRef.current.id_santri = value
    
    if (value) {
      loadSantriData(value)
      loadExistingFoto(value)
    } else {
      setSelectedSantri(null)
      setExistingFotos([])
      setPreviewFotos([])
    }
  }

  // Handle select santri dari SearchOffcanvas (tampilkan NIS di input)
  const handleSelectSantriFromSearch = async (id) => {
    const result = await loadSantriData(id)
    const nis = result?.data?.nis ?? id
    setFormData(prev => ({ ...prev, id_santri: nis }))
    formDataRef.current.id_santri = nis
    loadExistingFoto(nis)
    setShowSearchOffcanvas(false)
  }

  const handleOpenOffcanvas = (item = null) => {
    if (item) {
      const nisAtauId = item.nis ?? item.id_santri ?? ''
      setEditingItem(item)
      setFormData({
        id_santri: nisAtauId,
        tahun_ajaran: item.tahun_ajaran || tahunAjaran,
        lembaga: item.lembaga || '',
        kelas: item.kelas || '',
        wali_kelas: item.wali_kelas || '',
        nilai: item.nilai || '',
        juara: item.juara || '',
        keterangan: item.keterangan || ''
      })
      formDataRef.current = {
        id_santri: nisAtauId,
        tahun_ajaran: item.tahun_ajaran || tahunAjaran,
        lembaga: item.lembaga || '',
        kelas: item.kelas || '',
        wali_kelas: item.wali_kelas || '',
        nilai: item.nilai || '',
        juara: item.juara || '',
        keterangan: item.keterangan || ''
      }
      // Load data santri & foto (backend terima NIS atau id)
      if (nisAtauId) {
        loadSantriData(nisAtauId)
        loadExistingFoto(nisAtauId)
      } else {
        setSelectedSantri(null)
        setExistingFotos([])
        setPreviewFotos([])
      }
    } else {
      setEditingItem(null)
      setFormData({
        id_santri: '',
        tahun_ajaran: tahunAjaran,
        lembaga: '',
        kelas: '',
        wali_kelas: '',
        nilai: '',
        juara: '',
        keterangan: ''
      })
      formDataRef.current = {
        id_santri: '',
        tahun_ajaran: tahunAjaran,
        lembaga: '',
        kelas: '',
        wali_kelas: '',
        nilai: '',
        juara: '',
        keterangan: ''
      }
      setSelectedSantri(null)
      setExistingFotos([])
      setPreviewFotos([])
    }
    setShowOffcanvas(true)
  }

  // Load existing foto juara (multiple)
  const loadExistingFoto = async (idSantri) => {
    if (!idSantri) {
      setExistingFotos([])
      // Cleanup semua preview URL sebelumnya
      previewFotos.forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
      setPreviewFotos([])
      return
    }
    try {
      const result = await pendaftaranAPI.getBerkasList(idSantri, 'foto_juara')
      if (result.success && result.data && result.data.length > 0) {
        // Sort by id untuk konsistensi
        const sortedFotos = [...result.data].sort((a, b) => a.id - b.id)
        setExistingFotos(sortedFotos)
        
        // Cleanup preview URL sebelumnya jika ada
        previewFotos.forEach(url => {
          if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
          }
        })
        
        // Load preview untuk semua foto menggunakan API download
        const previewPromises = sortedFotos.map(async (fotoData) => {
          try {
            const blob = await pendaftaranAPI.downloadBerkas(fotoData.id)
            return URL.createObjectURL(blob)
          } catch (downloadErr) {
            console.error('Error downloading foto for preview:', downloadErr)
            // Fallback: coba gunakan path langsung
            if (fotoData.path_file) {
              const path = fotoData.path_file.startsWith('http') 
                ? fotoData.path_file 
                : `${window.location.origin}/${fotoData.path_file}`
              return path
            }
            return null
          }
        })
        
        const previewUrls = await Promise.all(previewPromises)
        setPreviewFotos(previewUrls.filter(url => url !== null))
      } else {
        setExistingFotos([])
        // Cleanup semua preview URL sebelumnya
        previewFotos.forEach(url => {
          if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
          }
        })
        setPreviewFotos([])
      }
    } catch (err) {
      console.error('Error loading existing foto:', err)
      setExistingFotos([])
      // Cleanup semua preview URL sebelumnya
      previewFotos.forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
      setPreviewFotos([])
    }
  }

  // Handle file select untuk foto (multiple, maksimal 5)
  const handleFotoSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Hitung total foto yang akan ditambahkan (existing + new)
    const currentCount = existingFotos.length + selectedFotos.length
    const maxAllowed = 5
    
    if (currentCount + files.length > maxAllowed) {
      const availableSlots = maxAllowed - currentCount
      showNotification(`Maksimal ${maxAllowed} foto. Anda dapat menambahkan ${availableSlots} foto lagi.`, 'error')
      e.target.value = '' // Reset input
      return
    }

    // Validasi setiap file
    const validFiles = []
    for (const file of files) {
      // Validasi ukuran (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showNotification(`File "${file.name}" terlalu besar. Maksimal 10MB per file`, 'error')
        continue
      }

      // Cek apakah file adalah gambar yang bisa dikompresi
      const compressibleImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      const compressibleExtensions = ['jpg', 'jpeg', 'png', 'webp']
      const isImage = 
        compressibleImageTypes.includes(file.type) || compressibleExtensions.includes(fileExtension)
      
      let fileToUse = file
      
      // Kompres gambar jika lebih dari 1 MB
      if (isImage && file.size > 1 * 1024 * 1024) {
        try {
          showNotification(`Mengompresi "${file.name}"...`, 'info')
          fileToUse = await compressImage(file, 1.0) // Max 1 MB
          const originalSizeKB = (file.size / 1024).toFixed(0)
          const compressedSizeKB = (fileToUse.size / 1024).toFixed(0)
          if (fileToUse.size < file.size) {
            showNotification(`"${file.name}" dikompresi: ${originalSizeKB} KB → ${compressedSizeKB} KB`, 'success')
          }
        } catch (err) {
          console.error('Error compressing image:', err)
          showNotification(`Gagal mengompresi "${file.name}", menggunakan file asli`, 'warning')
          fileToUse = file
        }
      }

      validFiles.push(fileToUse)
    }

    if (validFiles.length === 0) {
      e.target.value = '' // Reset input
      return
    }

    // Tambahkan ke selectedFotos
    setSelectedFotos(prev => [...prev, ...validFiles])
    
    // Generate preview URL untuk semua file baru
    const newPreviewUrls = validFiles.map(file => URL.createObjectURL(file))
    setPreviewFotos(prev => [...prev, ...newPreviewUrls])
    
    // Reset input untuk memungkinkan memilih file yang sama lagi jika perlu
    e.target.value = ''
    
    if (validFiles.length < files.length) {
      showNotification(`${validFiles.length} dari ${files.length} file berhasil ditambahkan`, 'warning')
    } else {
      showNotification(`${validFiles.length} foto berhasil ditambahkan`, 'success')
    }
  }

  // Upload foto (multiple)
  const handleUploadFoto = async () => {
    if (selectedFotos.length === 0 || !formData.id_santri) {
      showNotification('Pilih foto dan pastikan NIS sudah diisi', 'error')
      return
    }

    setUploadingFoto(true)
    try {
      // Upload semua foto secara berurutan
      const uploadPromises = selectedFotos.map((file, index) => 
        pendaftaranAPI.uploadBerkas(
          formData.id_santri,
          'foto_juara',
          file,
          `Foto juara ${index + 1}: ${formData.juara || 'Juara'}`
        )
      )
      
      const results = await Promise.all(uploadPromises)
      const successCount = results.filter(r => r.success).length
      
      if (successCount > 0) {
        showNotification(`${successCount} dari ${selectedFotos.length} foto berhasil di-upload`, 'success')
        
        // Cleanup preview URL untuk foto yang baru di-upload
        const newPreviewUrls = previewFotos.slice(existingFotos.length)
        newPreviewUrls.forEach(url => {
          if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
          }
        })
        
        // Reset selectedFotos dan reload existing fotos
        setSelectedFotos([])
        await loadExistingFoto(formData.id_santri)
      } else {
        showNotification('Gagal meng-upload foto', 'error')
      }
    } catch (err) {
      console.error('Error uploading foto:', err)
      showNotification('Gagal meng-upload foto', 'error')
    } finally {
      setUploadingFoto(false)
    }
  }

  // Hapus foto yang sudah di-upload
  const handleDeleteFoto = async (fotoData, index) => {
    if (!fotoData?.id || !formData.id_santri) return
    
    if (!window.confirm('Apakah Anda yakin ingin menghapus foto ini?')) {
      return
    }

    try {
      const result = await pendaftaranAPI.deleteBerkas(fotoData.id)
      
      if (result.success) {
        showNotification('Foto berhasil dihapus', 'success')
        
        // Cleanup preview URL
        if (previewFotos[index] && previewFotos[index].startsWith('blob:')) {
          URL.revokeObjectURL(previewFotos[index])
        }
        
        // Reload existing fotos
        await loadExistingFoto(formData.id_santri)
      } else {
        showNotification(result.message || 'Gagal menghapus foto', 'error')
      }
    } catch (err) {
      console.error('Error deleting foto:', err)
      showNotification('Gagal menghapus foto', 'error')
    }
  }

  const handleCloseOffcanvas = () => {
    setShowOffcanvas(false)
    setEditingItem(null)
    setSelectedSantri(null)
    // Cleanup semua preview URL untuk selectedFotos
    previewFotos.slice(existingFotos.length).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url)
      }
    })
    setSelectedFotos([])
    setExistingFotos([])
    setPreviewFotos([])
    setFormData({
      id_santri: '',
      tahun_ajaran: tahunAjaran,
      lembaga: '',
      kelas: '',
      wali_kelas: '',
      nilai: '',
      juara: '',
      keterangan: ''
    })
    formDataRef.current = {
      id_santri: '',
      tahun_ajaran: tahunAjaran,
      lembaga: '',
      kelas: '',
      wali_kelas: '',
      nilai: '',
      juara: '',
      keterangan: ''
    }
  }

  const closeFormOffcanvas = useOffcanvasBackClose(showOffcanvas, handleCloseOffcanvas)

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      // Pastikan tahun_ajaran terisi
      const submitData = {
        ...formData,
        tahun_ajaran: formData.tahun_ajaran || tahunAjaran
      }
      
      if (editingItem) {
        await santriJuaraAPI.update(editingItem.id, submitData)
        showNotification('Data juara berhasil diupdate', 'success')
      } else {
        await santriJuaraAPI.create(submitData)
        showNotification('Data juara berhasil ditambahkan', 'success')
      }
      await loadData()
      handleCloseOffcanvas()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan data', 'error')
    }
  }

  const handleDeleteClick = (item) => {
    setItemToDelete(item)
    setShowDeleteModal(true)
  }

  const handleCloseDeleteModal = () => {
    if (!deleting) {
      setShowDeleteModal(false)
      setItemToDelete(null)
    }
  }

  const handleDelete = async () => {
    if (!itemToDelete) return
    
    setDeleting(true)
    try {
      await santriJuaraAPI.delete(itemToDelete.id)
      showNotification('Data berhasil dihapus', 'success')
      await loadData()
      setShowDeleteModal(false)
      setItemToDelete(null)
      // Tutup offcanvas jika sedang edit item yang dihapus
      if (editingItem && editingItem.id === itemToDelete.id) {
        handleCloseOffcanvas()
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menghapus data', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const uniqueJuara = useMemo(() => {
    const values = [...new Set(dataJuara.map(item => item.juara).filter(Boolean))]
    return values.sort()
  }, [dataJuara])

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortConfig.direction === 'asc' ? (
      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {/* Search & Filter */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="relative pb-2 px-4 pt-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari NIS, Nama, Kelas, Wali Kelas, atau Juara..."
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                  <button
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                    title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                    </svg>
                    {isFilterOpen ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={loadData}
                    className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                    title="Refresh"
                    disabled={loading}
                  >
                    <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={lembagaFilter}
                        onChange={(e) => setLembagaFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Lembaga</option>
                        {lembagaList.map(lembaga => (
                          <option key={lembaga.id} value={lembaga.id}>{lembaga.nama}</option>
                        ))}
                      </select>
                      <select
                        value={juaraFilter}
                        onChange={(e) => setJuaraFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Juara</option>
                        {uniqueJuara.map(juara => (
                          <option key={juara} value={juara}>{juara}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 md:p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] md:text-xs font-medium text-sky-700 dark:text-sky-300">
                  Total Data
                </p>
                <span className="inline-flex items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 p-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </span>
              </div>
              <p className="text-sm md:text-lg font-bold text-sky-700 dark:text-sky-200">
                {filteredAndSortedData.length}
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 md:p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] md:text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  Terpilih
                </p>
                <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 p-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </div>
              <p className="text-sm md:text-lg font-bold text-emerald-700 dark:text-emerald-200">
                {selectedItems.size}
              </p>
            </motion.div>
          </div>

          {/* Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-200 dark:border-gray-700"
          >
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleOpenOffcanvas()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors"
                title="Tambah data baru"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Tambah
              </button>
              <button
                onClick={handleExportExcel}
                disabled={filteredAndSortedData.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={selectedItems.size > 0 ? `Export ${selectedItems.size} data terpilih` : 'Export semua data terfilter'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export {selectedItems.size > 0 && `(${selectedItems.size})`}
              </button>
              {selectedItems.size > 0 && (
                <button
                  onClick={() => setSelectedItems(new Set())}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                  title="Hapus semua pilihan"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Hapus
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-center w-12">
                      <input
                        type="checkbox"
                        checked={isAllPageSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = isSomePageSelected && !isAllPageSelected
                        }}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        title="Pilih semua di halaman ini"
                      />
                    </th>
                    <th
                      onClick={() => handleSort('id_santri')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        NIS
                        <SortIcon columnKey="id_santri" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('nama_santri')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Nama Santri
                        <SortIcon columnKey="nama_santri" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('lembaga')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Lembaga
                        <SortIcon columnKey="lembaga" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kelas')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Kelas
                        <SortIcon columnKey="kelas" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('wali_kelas')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Wali Kelas
                        <SortIcon columnKey="wali_kelas" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('nilai')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Nilai
                        <SortIcon columnKey="nilai" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('juara')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Juara
                        <SortIcon columnKey="juara" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('keterangan')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Keterangan
                        <SortIcon columnKey="keterangan" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        {searchTerm || lembagaFilter || juaraFilter ? 'Tidak ada data yang sesuai dengan pencarian atau filter' : 'Tidak ada data'}
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((item) => {
                      const isSelected = selectedItems.has(item.id)
                      return (
                        <tr
                          key={item.id}
                          onClick={() => handleOpenOffcanvas(item)}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${isSelected ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                        >
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(item.id)}
                              className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
                            {item.nis ?? item.id_santri}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                            {item.nama_santri || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {item.nama_lembaga || item.lembaga || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {item.kelas || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {item.wali_kelas || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-right">
                            {item.nilai ? parseFloat(item.nilai).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {item.juara || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {item.keterangan || '-'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Info & Pagination */}
            {filteredAndSortedData.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Menampilkan {startIndex + 1}-{Math.min(endIndex, filteredAndSortedData.length)} dari {filteredAndSortedData.length} data
                      {searchTerm && ` (filtered by "${searchTerm}")`}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        Per halaman:
                      </label>
                      <select
                        value={itemsPerPage >= filteredAndSortedData.length ? 'all' : itemsPerPage}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === 'all') {
                            setItemsPerPage(filteredAndSortedData.length)
                          } else {
                            setItemsPerPage(Number(value))
                          }
                          setCurrentPage(1)
                        }}
                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="500">500</option>
                        <option value="all">Semua</option>
                      </select>
                    </div>
                  </div>
                  
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum
                          if (totalPages <= 5) {
                            pageNum = i + 1
                          } else if (currentPage <= 3) {
                            pageNum = i + 1
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i
                          } else {
                            pageNum = currentPage - 2 + i
                          }
                          
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-teal-600 text-white'
                                  : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </div>
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      {/* Offcanvas untuk Create/Edit */}
      {createPortal(
        <AnimatePresence mode="wait">
          {showOffcanvas && (
            <>
              {/* Backdrop */}
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={closeFormOffcanvas}
                className="fixed inset-0 bg-black bg-opacity-50"
                style={{ zIndex: 9998, willChange: 'opacity' }}
              />
              {/* Offcanvas */}
              <motion.div
                key="offcanvas"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                className="fixed inset-y-0 right-0 w-full sm:w-96 lg:w-[500px] bg-white dark:bg-gray-800 shadow-xl flex flex-col"
                style={{ zIndex: 9999, willChange: 'transform', backfaceVisibility: 'hidden' }}
                onClick={(e) => e.stopPropagation()}
              >
              {/* Header */}
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
                      {editingItem ? 'Edit Data Juara' : 'Tambah Data Juara'}
                    </h2>
                    {editingItem && (editingItem.nama_lembaga || editingItem.lembaga) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Lembaga: {editingItem.nama_lembaga || editingItem.lembaga}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={closeFormOffcanvas}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0 ml-4"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <form onSubmit={handleSubmit}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        NIS <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={formData.id_santri}
                            onChange={handleSantriIdChange}
                            placeholder="Masukkan NIS (7 digit)"
                            maxLength={7}
                            required
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                          {loadingSantri && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowSearchOffcanvas(true)}
                          className="bg-teal-500 text-white p-1.5 rounded-lg hover:bg-teal-600 transition-colors flex-shrink-0 border-2 border-teal-500 dark:border-teal-400"
                          title="Cari Santri"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                          </svg>
                        </button>
                      </div>
                      {selectedSantri && (
                        <div className="mt-2 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
                          <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
                            {selectedSantri.nama || 'Nama tidak tersedia'}
                          </p>
                          <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                            ID: {selectedSantri.id} | Gender: {selectedSantri.gender || '-'}
                          </p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tahun Ajaran <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.tahun_ajaran || tahunAjaran}
                        onChange={(e) => setFormData({ ...formData, tahun_ajaran: e.target.value })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="Tahun Ajaran"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Tahun ajaran saat ini: {tahunAjaran}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Lembaga
                      </label>
                    <select
                      value={formData.lembaga}
                      onChange={(e) => setFormData({ ...formData, lembaga: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="">Pilih Lembaga</option>
                      {lembagaList.map(lembaga => (
                        <option key={lembaga.id} value={lembaga.id}>{lembaga.nama}</option>
                      ))}
                    </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Kelas
                      </label>
                      <input
                        type="text"
                        value={formData.kelas}
                        onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Wali Kelas
                      </label>
                      <input
                        type="text"
                        value={formData.wali_kelas}
                        onChange={(e) => setFormData({ ...formData, wali_kelas: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nilai
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.nilai}
                        onChange={(e) => setFormData({ ...formData, nilai: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Juara
                      </label>
                      <input
                        type="text"
                        value={formData.juara}
                        onChange={(e) => setFormData({ ...formData, juara: e.target.value })}
                        placeholder="Contoh: 1, 2, 3, Harapan, dll"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Keterangan
                      </label>
                      <textarea
                        value={formData.keterangan}
                        onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Foto Juara {existingFotos.length + selectedFotos.length > 0 && `(${existingFotos.length + selectedFotos.length}/5)`}
                      </label>
                      <div className="space-y-3">
                        {/* Preview semua foto (existing + selected) */}
                        {(previewFotos.length > 0 || existingFotos.length > 0) && (
                          <div className="grid grid-cols-2 gap-2">
                            {previewFotos.map((previewUrl, index) => {
                              const isExisting = index < existingFotos.length
                              const isSelected = index >= existingFotos.length
                              const fotoData = isExisting ? existingFotos[index] : null
                              
                              return (
                                <div key={index} className="relative">
                                  <img
                                    src={previewUrl}
                                    alt={`Preview Foto Juara ${index + 1}`}
                                    className="w-full h-32 object-contain border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    onError={(e) => {
                                      console.error('Error loading preview image:', e)
                                      // Jika error, coba reload existing foto
                                      if (fotoData?.id && formData.id_santri) {
                                        loadExistingFoto(formData.id_santri)
                                      }
                                    }}
                                  />
                                  {isSelected && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        // Hapus dari selectedFotos dan previewFotos
                                        const selectedIndex = index - existingFotos.length
                                        const newSelectedFotos = [...selectedFotos]
                                        const newPreviewFotos = [...previewFotos]
                                        
                                        // Cleanup blob URL
                                        if (previewUrl && previewUrl.startsWith('blob:')) {
                                          URL.revokeObjectURL(previewUrl)
                                        }
                                        
                                        newSelectedFotos.splice(selectedIndex, 1)
                                        newPreviewFotos.splice(index, 1)
                                        
                                        setSelectedFotos(newSelectedFotos)
                                        setPreviewFotos(newPreviewFotos)
                                      }}
                                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                                      title="Hapus foto baru"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                      </svg>
                                    </button>
                                  )}
                                  {isExisting && (
                                    <>
                                      <div className="absolute bottom-1 left-1 bg-teal-500 text-white text-xs px-1.5 py-0.5 rounded">
                                        Tersimpan
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteFoto(fotoData, index)}
                                        className="absolute bottom-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                                        title="Hapus foto"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        
                        {/* Input file (multiple) */}
                        <div className="space-y-2">
                          <input
                            type="file"
                            onChange={handleFotoSelect}
                            accept="image/*"
                            multiple
                            disabled={existingFotos.length + selectedFotos.length >= 5}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 dark:file:bg-teal-900/20 dark:file:text-teal-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          {selectedFotos.length > 0 && (
                            <button
                              type="button"
                              onClick={handleUploadFoto}
                              disabled={uploadingFoto || !formData.id_santri}
                              className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {uploadingFoto ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  <span>Uploading {selectedFotos.length} foto...</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                  </svg>
                                  <span>Upload {selectedFotos.length} Foto</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {existingFotos.length + selectedFotos.length >= 5 
                            ? 'Maksimal 5 foto sudah tercapai'
                            : `Anda dapat menambahkan hingga ${5 - (existingFotos.length + selectedFotos.length)} foto lagi`}
                        </p>
                      </div>
                    </div>
                  </div>
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  {editingItem && (
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(editingItem)}
                      disabled={deleting}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Hapus
                    </button>
                  )}
                  <div className="flex justify-end gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={closeFormOffcanvas}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
                    >
                      {editingItem ? 'Update' : 'Simpan'}
                    </button>
                  </div>
                </div>
              </form>
              </div>
            </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Search Offcanvas - z-index lebih tinggi dari offcanvas Tambah Juara */}
      {createPortal(
        <SearchOffcanvas
          isOpen={showSearchOffcanvas}
          onClose={closeSearchOffcanvas}
          onSelectSantri={handleSelectSantriFromSearch}
          zIndex={10000}
        />,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        title="Konfirmasi Hapus Data Juara"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deleting}
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Apakah Anda yakin ingin menghapus data juara ini?
            </p>
            {itemToDelete && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                  NIS: {itemToDelete.nis ?? itemToDelete.id_santri}
                </p>
                {itemToDelete.nama_santri && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Nama: {itemToDelete.nama_santri}
                  </p>
                )}
                {itemToDelete.juara && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Juara: {itemToDelete.juara}
                  </p>
                )}
              </div>
            )}
            <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-medium">
              ⚠️ Tindakan ini tidak dapat dibatalkan!
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleCloseDeleteModal}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Hapus</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default DataJuara
