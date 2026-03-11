import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { dashboardAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import BulkEditOffcanvas from './components/BulkEditOffcanvas'
import DetailSantriOffcanvas from './components/DetailSantriOffcanvas'
import ExportIjinOffcanvas from './components/ExportIjinOffcanvas'
import PrintMultipleModal from './components/PrintMultipleModal'
import PrintMultipleOffcanvas from './components/PrintMultipleOffcanvas'
import PrintDataModal from './components/PrintDataModal'
import PrintDataOffcanvas from './components/PrintDataOffcanvas'

function DataIjin() {
  const { tahunAjaran } = useTahunAjaranStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dataSantri, setDataSantri] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [statusSantriFilter, setStatusSantriFilter] = useState(['Mukim']) // Default: Mukim selected
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false)
  const statusFilterRef = useRef(null)
  const statusFilterButtonRef = useRef(null)
  const statusFilterDropdownRef = useRef(null)
  const [statusFilterPosition, setStatusFilterPosition] = useState({ top: 0, left: 0, width: 0 })
  const [daerahFilter, setDaerahFilter] = useState('')
  const [kamarFilter, setKamarFilter] = useState('')
  const [diniyahFilter, setDiniyahFilter] = useState('')
  const [kelasDiniyahFilter, setKelasDiniyahFilter] = useState('')
  const [kelDiniyahFilter, setKelDiniyahFilter] = useState('')
  const [formalFilter, setFormalFilter] = useState('')
  const [kelasFormalFilter, setKelasFormalFilter] = useState('')
  const [kelFormalFilter, setKelFormalFilter] = useState('')
  const [ketFilter, setKetFilter] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [showBulkEditOffcanvas, setShowBulkEditOffcanvas] = useState(false)
  const [showDetailOffcanvas, setShowDetailOffcanvas] = useState(false)
  const [selectedSantri, setSelectedSantri] = useState(null)
  const closeBulkEditOffcanvas = useOffcanvasBackClose(showBulkEditOffcanvas, () => setShowBulkEditOffcanvas(false))
  const closeDetailSantriOffcanvas = useOffcanvasBackClose(showDetailOffcanvas, () => { setShowDetailOffcanvas(false); setSelectedSantri(null) })
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [printOptions, setPrintOptions] = useState({ pulangan: false, shohifah: false })
  const [showPrintDataModal, setShowPrintDataModal] = useState(false)
  const [showPrintDataOffcanvas, setShowPrintDataOffcanvas] = useState(false)
  const [selectedPrintColumns, setSelectedPrintColumns] = useState([])
  const [showExportOffcanvas, setShowExportOffcanvas] = useState(false)
  const previousUrlParamsRef = useRef('')

  // Baca filter dari URL dan terapkan ke state
  useEffect(() => {
    // Dapatkan string URL params saat ini untuk perbandingan
    const currentUrlParams = searchParams.toString()
    
    // Hanya update jika URL params berubah (untuk menghindari loop)
    if (currentUrlParams === previousUrlParamsRef.current) return
    
    const searchFromUrl = searchParams.get('search')
    const genderFromUrl = searchParams.get('gender')
    const statusFromUrl = searchParams.get('status')
    const daerahFromUrl = searchParams.get('daerah')
    const kamarFromUrl = searchParams.get('kamar')
    const diniyahFromUrl = searchParams.get('diniyah')
    const kelasDiniyahFromUrl = searchParams.get('kelas_diniyah')
    const kelDiniyahFromUrl = searchParams.get('kel_diniyah')
    const formalFromUrl = searchParams.get('formal')
    const kelasFormalFromUrl = searchParams.get('kelas_formal')
    const kelFormalFromUrl = searchParams.get('kel_formal')
    const ketFromUrl = searchParams.get('ket')

    // Terapkan filter dari URL (gunakan null untuk reset jika tidak ada di URL)
    setSearchTerm(searchFromUrl || '')
    setGenderFilter(genderFromUrl || '')
    if (statusFromUrl) {
      // Status bisa berupa string dengan koma (multiple values)
      const statusArray = statusFromUrl.split(',').filter(s => s.trim())
      if (statusArray.length > 0) {
        setStatusSantriFilter(statusArray)
      }
    } else {
      // Jika tidak ada status di URL, gunakan default
      setStatusSantriFilter(['Mukim'])
    }
    setDaerahFilter(daerahFromUrl || '')
    setKamarFilter(kamarFromUrl || '')
    setDiniyahFilter(diniyahFromUrl || '')
    setKelasDiniyahFilter(kelasDiniyahFromUrl || '')
    setKelDiniyahFilter(kelDiniyahFromUrl || '')
    setFormalFilter(formalFromUrl || '')
    setKelasFormalFilter(kelasFormalFromUrl || '')
    setKelFormalFilter(kelFormalFromUrl || '')
    setKetFilter(ketFromUrl || '')

    // Simpan URL params saat ini
    previousUrlParamsRef.current = currentUrlParams
  }, [searchParams])

  // Load data saat tahun ajaran berubah
  useEffect(() => {
    loadData()
  }, [tahunAjaran])

  const loadData = async () => {
    setLoading(true)
    setError('')
    
    try {
      const result = await dashboardAPI.getDataSantri(tahunAjaran)
      
      if (result.success) {
        const newData = result.data || []
        setDataSantri(newData)
        return newData
      } else {
        setError(result.message || 'Gagal memuat data santri')
        return []
      }
    } catch (err) {
      console.error('Error loading data santri:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
      return []
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Get unique values for filters
  const getFilteredDataForOptions = useMemo(() => {
    let filtered = dataSantri

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(santri => 
        santri.id.toString().includes(term) ||
        (santri.nama && santri.nama.toLowerCase().includes(term)) ||
        (santri.gender && santri.gender.toLowerCase().includes(term)) ||
        (santri.status_santri && santri.status_santri.toLowerCase().includes(term)) ||
        (santri.daerah && santri.daerah.toLowerCase().includes(term)) ||
        (santri.kamar && santri.kamar.toLowerCase().includes(term)) ||
        (santri.diniyah && santri.diniyah.toLowerCase().includes(term))
      )
    }

    return filtered
  }, [dataSantri, searchTerm])

  // Dynamic unique values
  const dynamicUniqueGender = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => String(s.id_diniyah) === String(diniyahFilter))
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => String(s.id_formal) === String(formalFilter))
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.gender).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.gender === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueStatusSantri = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => String(s.id_diniyah) === String(diniyahFilter))
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => String(s.id_formal) === String(formalFilter))
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.status_santri).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.status_santri === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, genderFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueDaerah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => s.diniyah === diniyahFilter)
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => s.formal === formalFilter)
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.daerah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.daerah === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueKamar = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (diniyahFilter) filtered = filtered.filter(s => s.diniyah === diniyahFilter)
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => s.formal === formalFilter)
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.kamar).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kamar === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, daerahFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueDiniyah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => String(s.id_formal) === String(formalFilter))
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const byId = {}
    filtered.forEach(s => {
      const id = s.id_diniyah != null && s.id_diniyah !== '' ? String(s.id_diniyah) : ''
      const label = s.diniyah || '-'
      if (!byId[id]) byId[id] = { value: id, label, count: 0 }
      byId[id].count++
    })
    return Object.values(byId).sort((a, b) => String(a.label).localeCompare(String(b.label)))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueKelasDiniyah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => String(s.id_diniyah) === String(diniyahFilter))
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => String(s.id_formal) === String(formalFilter))
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.kelas_diniyah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kelas_diniyah === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueKelDiniyah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => String(s.id_diniyah) === String(diniyahFilter))
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => String(s.id_formal) === String(formalFilter))
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.kel_diniyah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kel_diniyah === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueFormal = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => String(s.id_diniyah) === String(diniyahFilter))
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const byId = {}
    filtered.forEach(s => {
      const id = s.id_formal != null && s.id_formal !== '' ? String(s.id_formal) : ''
      const label = s.formal || '-'
      if (!byId[id]) byId[id] = { value: id, label, count: 0 }
      byId[id].count++
    })
    return Object.values(byId).sort((a, b) => String(a.label).localeCompare(String(b.label)))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, kelasFormalFilter, kelFormalFilter])

  const dynamicUniqueKelasFormal = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => String(s.id_diniyah) === String(diniyahFilter))
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => String(s.id_formal) === String(formalFilter))
    if (kelFormalFilter) filtered = filtered.filter(s => s.kel_formal === kelFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.kelas_formal).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kelas_formal === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelFormalFilter])

  const dynamicUniqueKelFormal = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (genderFilter) filtered = filtered.filter(s => s.gender === genderFilter)
    if (statusSantriFilter.length > 0) filtered = filtered.filter(s => statusSantriFilter.includes(s.status_santri))
    if (daerahFilter) filtered = filtered.filter(s => s.daerah === daerahFilter)
    if (kamarFilter) filtered = filtered.filter(s => s.kamar === kamarFilter)
    if (diniyahFilter) filtered = filtered.filter(s => String(s.id_diniyah) === String(diniyahFilter))
    if (kelasDiniyahFilter) filtered = filtered.filter(s => s.kelas_diniyah === kelasDiniyahFilter)
    if (kelDiniyahFilter) filtered = filtered.filter(s => s.kel_diniyah === kelDiniyahFilter)
    if (formalFilter) filtered = filtered.filter(s => String(s.id_formal) === String(formalFilter))
    if (kelasFormalFilter) filtered = filtered.filter(s => s.kelas_formal === kelasFormalFilter)
    
    const values = [...new Set(filtered.map(s => s.kel_formal).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kel_formal === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter])

  const filteredAndSortedData = useMemo(() => {
    let filtered = dataSantri

    if (genderFilter) {
      filtered = filtered.filter(santri => santri.gender === genderFilter)
    }

    if (statusSantriFilter.length > 0) {
      filtered = filtered.filter(santri => statusSantriFilter.includes(santri.status_santri))
    }

    if (daerahFilter) {
      filtered = filtered.filter(santri => santri.daerah === daerahFilter)
    }

    if (kamarFilter) {
      filtered = filtered.filter(santri => santri.kamar === kamarFilter)
    }

    if (diniyahFilter) {
      filtered = filtered.filter(santri => String(santri.id_diniyah) === String(diniyahFilter))
    }

    if (kelasDiniyahFilter) {
      filtered = filtered.filter(santri => santri.kelas_diniyah === kelasDiniyahFilter)
    }

    if (kelDiniyahFilter) {
      filtered = filtered.filter(santri => santri.kel_diniyah === kelDiniyahFilter)
    }

    if (formalFilter) {
      filtered = filtered.filter(santri => String(santri.id_formal) === String(formalFilter))
    }

    if (kelasFormalFilter) {
      filtered = filtered.filter(santri => santri.kelas_formal === kelasFormalFilter)
    }

    if (kelFormalFilter) {
      filtered = filtered.filter(santri => santri.kel_formal === kelFormalFilter)
    }

    if (ketFilter) {
      filtered = filtered.filter(santri => {
        const wajib = santri.wajib || 0
        const bayar = santri.bayar || 0
        let ket = ''
        
        if (wajib === 0) {
          ket = 'belum'
        } else if (bayar >= wajib) {
          ket = 'lunas'
        } else if (bayar > 0) {
          ket = 'kurang'
        } else {
          ket = 'belum'
        }
        
        return ket === ketFilter
      })
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(santri => 
        santri.id.toString().includes(term) ||
        (santri.nama && santri.nama.toLowerCase().includes(term)) ||
        (santri.gender && santri.gender.toLowerCase().includes(term)) ||
        (santri.status_santri && santri.status_santri.toLowerCase().includes(term)) ||
        (santri.daerah && santri.daerah.toLowerCase().includes(term)) ||
        (santri.kamar && santri.kamar.toLowerCase().includes(term)) ||
        (santri.diniyah && santri.diniyah.toLowerCase().includes(term))
      )
    }

    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        let aVal = a[sortConfig.key]
        let bVal = b[sortConfig.key]
        
        // Handle sorting untuk kolom "ket" (keterangan pembayaran)
        if (sortConfig.key === 'ket') {
          const getKetValue = (santri) => {
            const wajib = santri.wajib || 0
            const bayar = santri.bayar || 0
            if (wajib === 0) return 0 // belum
            if (bayar >= wajib) return 2 // lunas
            if (bayar > 0) return 1 // kurang
            return 0 // belum
          }
          aVal = getKetValue(a)
          bVal = getKetValue(b)
        }
        
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }
        
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    return filtered
  }, [dataSantri, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, ketFilter, searchTerm, sortConfig])

  const dataToExport = useMemo(() => {
    if (selectedItems.size > 0) {
      return filteredAndSortedData.filter(santri => selectedItems.has(santri.id))
    }
    return filteredAndSortedData
  }, [filteredAndSortedData, selectedItems])

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = filteredAndSortedData.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, genderFilter, statusSantriFilter, daerahFilter, kamarFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, ketFilter, sortConfig, itemsPerPage])

  // Calculate position for status filter dropdown
  useEffect(() => {
    const updatePosition = () => {
      if (statusFilterButtonRef.current) {
        const rect = statusFilterButtonRef.current.getBoundingClientRect()
        setStatusFilterPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width
        })
      }
    }

    if (isStatusFilterOpen) {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
    }

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isStatusFilterOpen])

  // Close status filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is inside button
      const isClickInButton = statusFilterButtonRef.current && statusFilterButtonRef.current.contains(event.target)
      
      // Check if click is inside dropdown
      const isClickInDropdown = statusFilterDropdownRef.current && statusFilterDropdownRef.current.contains(event.target)
      
      // Check if click is inside container (for other elements)
      const isClickInContainer = statusFilterRef.current && statusFilterRef.current.contains(event.target)
      
      // Only close if click is outside both button and dropdown
      if (!isClickInButton && !isClickInDropdown && !isClickInContainer) {
        setIsStatusFilterOpen(false)
      }
    }

    if (isStatusFilterOpen) {
      // Use setTimeout to avoid immediate closure on click
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 0)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isStatusFilterOpen])

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
      paginatedData.forEach(santri => newSet.add(santri.id))
      setSelectedItems(newSet)
    }
  }

  const isAllPageSelected = paginatedData.length > 0 && paginatedData.every(santri => selectedItems.has(santri.id))
  const isSomePageSelected = paginatedData.some(santri => selectedItems.has(santri.id))

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
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari ID, Nama, Gender, Status, Daerah, Kamar, atau Diniyah..."
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
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
              <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
            </div>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={genderFilter}
                        onChange={(e) => setGenderFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Gender</option>
                        {dynamicUniqueGender.map(item => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <div className="relative" ref={statusFilterRef}>
                        <button
                          ref={statusFilterButtonRef}
                          type="button"
                          onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 flex items-center justify-between gap-1 px-2"
                          style={{ minWidth: '120px' }}
                        >
                          <span className="truncate">
                            {statusSantriFilter.length === 0 
                              ? 'Status Santri' 
                              : statusSantriFilter.length === 1 
                                ? statusSantriFilter[0]
                                : `${statusSantriFilter.length} dipilih`}
                          </span>
                          <svg 
                            className={`w-3 h-3 transition-transform ${isStatusFilterOpen ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      {isStatusFilterOpen && createPortal(
                        <AnimatePresence>
                          <motion.div
                            ref={statusFilterDropdownRef}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="fixed z-[9999] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg max-h-60 overflow-y-auto"
                            style={{
                              top: `${statusFilterPosition.top}px`,
                              left: `${statusFilterPosition.left}px`,
                              width: `${Math.max(statusFilterPosition.width, 200)}px`
                            }}
                            onClick={(e) => {
                              // Prevent event bubbling to avoid closing dropdown
                              e.stopPropagation()
                            }}
                          >
                            <div className="p-2 space-y-1">
                              {dynamicUniqueStatusSantri.map(item => {
                                const isChecked = statusSantriFilter.includes(item.value)
                                return (
                                  <label
                                    key={item.value}
                                    className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded cursor-pointer text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        e.stopPropagation()
                                        if (e.target.checked) {
                                          setStatusSantriFilter([...statusSantriFilter, item.value])
                                        } else {
                                          setStatusSantriFilter(statusSantriFilter.filter(v => v !== item.value))
                                        }
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                      }}
                                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                                    />
                                    <span className="text-gray-700 dark:text-gray-300 flex-1">
                                      {item.value} ({item.count})
                                    </span>
                                  </label>
                                )
                              })}
                              {statusSantriFilter.length > 0 && (
                                <div className="pt-1 border-t border-gray-200 dark:border-gray-600">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStatusSantriFilter([])
                                      setIsStatusFilterOpen(false)
                                    }}
                                    className="w-full text-left px-1.5 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                  >
                                    Hapus semua
                                  </button>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </AnimatePresence>,
                        document.body
                      )}
                      <select
                        value={daerahFilter}
                        onChange={(e) => setDaerahFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Daerah</option>
                        {dynamicUniqueDaerah.map(item => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={kamarFilter}
                        onChange={(e) => setKamarFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Kamar</option>
                        {dynamicUniqueKamar.map(item => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={diniyahFilter}
                        onChange={(e) => setDiniyahFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Diniyah</option>
                        {dynamicUniqueDiniyah.map(item => (
                          <option key={item.value} value={item.value}>{item.label} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={kelasDiniyahFilter}
                        onChange={(e) => setKelasDiniyahFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Kelas Diniyah</option>
                        {dynamicUniqueKelasDiniyah.map(item => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={kelDiniyahFilter}
                        onChange={(e) => setKelDiniyahFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Kel Diniyah</option>
                        {dynamicUniqueKelDiniyah.map(item => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={formalFilter}
                        onChange={(e) => setFormalFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Formal</option>
                        {dynamicUniqueFormal.map(item => (
                          <option key={item.value} value={item.value}>{item.label} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={kelasFormalFilter}
                        onChange={(e) => setKelasFormalFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Kelas Formal</option>
                        {dynamicUniqueKelasFormal.map(item => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={kelFormalFilter}
                        onChange={(e) => setKelFormalFilter(e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Kel Formal</option>
                        {dynamicUniqueKelFormal.map(item => (
                          <option key={item.value} value={item.value}>{item.value} ({item.count})</option>
                        ))}
                      </select>
                      <select
                        value={ketFilter}
                        onChange={(e) => {
                          setKetFilter(e.target.value)
                          // Update URL dengan filter ket
                          const newParams = new URLSearchParams(searchParams)
                          if (e.target.value) {
                            newParams.set('ket', e.target.value)
                          } else {
                            newParams.delete('ket')
                          }
                          setSearchParams(newParams, { replace: true })
                        }}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Ket</option>
                        <option value="belum">Belum</option>
                        <option value="kurang">Kurang</option>
                        <option value="lunas">Lunas</option>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
                onClick={() => setShowExportOffcanvas(true)}
                disabled={filteredAndSortedData.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={selectedItems.size > 0 ? `Export ${selectedItems.size} data terpilih` : 'Export semua data terfilter'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export {selectedItems.size > 0 && `(${selectedItems.size})`}
              </button>
              <button
                onClick={() => setShowPrintDataModal(true)}
                disabled={filteredAndSortedData.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Print data tabel"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Data
              </button>
              {selectedItems.size > 0 && (
                <>
                  <button
                    onClick={() => setShowBulkEditOffcanvas(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors"
                    title="Edit masal data terpilih"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Masal ({selectedItems.size})
                  </button>
                  <button
                    onClick={() => setShowPrintModal(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                    title="Print data terpilih"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print ({selectedItems.size})
                  </button>
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
                </>
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
                      onClick={() => handleSort('id')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        NIS
                        <SortIcon columnKey="id" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('nama')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Nama
                        <SortIcon columnKey="nama" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('ayah')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Ayah
                        <SortIcon columnKey="ayah" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('ibu')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Ibu
                        <SortIcon columnKey="ibu" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('gender')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Gender
                        <SortIcon columnKey="gender" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('status_santri')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Status
                        <SortIcon columnKey="status_santri" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('daerah')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Daerah
                        <SortIcon columnKey="daerah" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kamar')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Kamar
                        <SortIcon columnKey="kamar" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('diniyah')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Diniyah
                        <SortIcon columnKey="diniyah" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kelas_diniyah')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        KD
                        <SortIcon columnKey="kelas_diniyah" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kel_diniyah')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        KelD
                        <SortIcon columnKey="kel_diniyah" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('formal')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Formal
                        <SortIcon columnKey="formal" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kelas_formal')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        KF
                        <SortIcon columnKey="kelas_formal" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kel_formal')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        KelF
                        <SortIcon columnKey="kel_formal" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('wajib')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Wajib
                        <SortIcon columnKey="wajib" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('bayar')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Bayar
                        <SortIcon columnKey="bayar" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('ket')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Ket
                        <SortIcon columnKey="ket" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan="18" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        {searchTerm || genderFilter || statusSantriFilter.length > 0 || daerahFilter || kamarFilter || diniyahFilter || kelasDiniyahFilter || kelDiniyahFilter || formalFilter || kelasFormalFilter || kelFormalFilter ? 'Tidak ada data yang sesuai dengan pencarian atau filter' : 'Tidak ada data'}
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((santri) => {
                      const isSelected = selectedItems.has(santri.id)
                      return (
                        <tr
                          key={santri.id}
                          onClick={(e) => {
                            // Jangan trigger jika klik pada checkbox
                            if (e.target.type === 'checkbox') return
                            setSelectedSantri(santri)
                            setShowDetailOffcanvas(true)
                          }}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${isSelected ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                        >
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(santri.id)}
                              className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
                            {santri.nis ?? santri.id}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                            {santri.nama || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.ayah || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.ibu || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.gender || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.status_santri || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.daerah || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kamar || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.diniyah || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kelas_diniyah || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kel_diniyah || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.formal || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kelas_formal || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kel_formal || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-right">
                            {santri.wajib ? new Intl.NumberFormat('id-ID').format(santri.wajib) : '0'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-right">
                            {santri.bayar ? new Intl.NumberFormat('id-ID').format(santri.bayar) : '0'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {(() => {
                              const wajib = santri.wajib || 0
                              const bayar = santri.bayar || 0
                              let ket = ''
                              let className = ''
                              
                              if (wajib === 0) {
                                ket = 'belum'
                                className = 'text-gray-500 dark:text-gray-400'
                              } else if (bayar >= wajib) {
                                ket = 'lunas'
                                className = 'text-green-600 dark:text-green-400 font-medium'
                              } else if (bayar > 0) {
                                ket = 'kurang'
                                className = 'text-yellow-600 dark:text-yellow-400 font-medium'
                              } else {
                                ket = 'belum'
                                className = 'text-red-600 dark:text-red-400 font-medium'
                              }
                              
                              return <span className={className}>{ket}</span>
                            })()}
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

      {/* Bulk Edit Offcanvas */}
      <BulkEditOffcanvas
        isOpen={showBulkEditOffcanvas}
        onClose={closeBulkEditOffcanvas}
        selectedSantriList={filteredAndSortedData.filter(s => selectedItems.has(s.id))}
        allDataSantri={dataSantri}
        onSuccess={() => {
          loadData()
          setSelectedItems(new Set())
        }}
      />

      {/* Detail Santri Offcanvas */}
      <DetailSantriOffcanvas
        isOpen={showDetailOffcanvas}
        onClose={closeDetailSantriOffcanvas}
        santri={selectedSantri}
        onSuccess={async () => {
          // Reload data santri setelah update
          const newData = await loadData()
          // Update selectedSantri dengan data terbaru
          if (selectedSantri?.id && newData.length > 0) {
            const updatedSantri = newData.find(s => s.id === selectedSantri.id)
            if (updatedSantri) {
              setSelectedSantri(updatedSantri)
            }
          }
        }}
      />

      {/* Print Multiple Modal */}
      <PrintMultipleModal
        isOpen={showPrintModal}
        onClose={() => {
          setShowPrintModal(false)
          // Jangan reset printOptions di sini, biarkan tetap untuk offcanvas
        }}
        selectedSantriList={filteredAndSortedData.filter(s => selectedItems.has(s.id))}
        printOptions={printOptions}
        onPrintOptionsChange={setPrintOptions}
        onConfirm={() => {
          setShowPrintOffcanvas(true)
        }}
      />

      {/* Print Multiple Offcanvas */}
      <PrintMultipleOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => {
          setShowPrintOffcanvas(false)
          // Reset printOptions saat offcanvas ditutup
          setPrintOptions({ pulangan: false, shohifah: false })
        }}
        selectedSantriList={filteredAndSortedData.filter(s => selectedItems.has(s.id))}
        printOptions={printOptions}
      />

      {/* Print Data Modal */}
      <PrintDataModal
        isOpen={showPrintDataModal}
        onClose={() => setShowPrintDataModal(false)}
        onPrint={(columns) => {
          setSelectedPrintColumns(columns)
          setShowPrintDataModal(false)
          setShowPrintDataOffcanvas(true)
        }}
        data={filteredAndSortedData}
        filters={{
          searchTerm,
          genderFilter,
          statusSantriFilter,
          daerahFilter,
          kamarFilter,
          diniyahFilter,
          kelasDiniyahFilter,
          kelDiniyahFilter,
          formalFilter,
          kelasFormalFilter,
          kelFormalFilter,
          ketFilter
        }}
      />

      {/* Print Data Offcanvas */}
      <PrintDataOffcanvas
        isOpen={showPrintDataOffcanvas}
        onClose={() => {
          setShowPrintDataOffcanvas(false)
          setSelectedPrintColumns([])
        }}
        data={filteredAndSortedData}
        selectedColumns={selectedPrintColumns}
        filters={{
          searchTerm,
          genderFilter,
          statusSantriFilter,
          daerahFilter,
          kamarFilter,
          diniyahFilter,
          kelasDiniyahFilter,
          kelDiniyahFilter,
          formalFilter,
          kelasFormalFilter,
          kelFormalFilter,
          ketFilter
        }}
      />

      {/* Export offcanvas: pilih kolom lalu eksport ke Excel (daerah, kamar, diniyah, formal = nama dari API) */}
      <ExportIjinOffcanvas
        isOpen={showExportOffcanvas}
        onClose={() => setShowExportOffcanvas(false)}
        data={dataToExport}
        tahunAjaran={tahunAjaran}
      />
    </div>
  )
}

export default DataIjin
