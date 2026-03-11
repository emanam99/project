import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { dashboardAPI, uwabaAPI } from '../../../services/api'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { calculateWajibFromBiodata } from '../../../utils/uwabaCalculator'
import LengkapiDataOffcanvas from './LengkapiDataOffcanvas'
import BulkEditOffcanvas from './BulkEditOffcanvas'
import MultiSelectFilter from './MultiSelectFilter'
import ExportManageDataOffcanvas from './ExportManageDataOffcanvas'

function UwabaDataSantri() {
  const { tahunAjaran } = useTahunAjaranStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dataSantri, setDataSantri] = useState([])
  const [uwabaPrices, setUwabaPrices] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState([])
  const [kategoriFilter, setKategoriFilter] = useState([])
  const [countFilter, setCountFilter] = useState([])
  const [ketFilter, setKetFilter] = useState([])
  const [diniyahFilter, setDiniyahFilter] = useState([])
  const [kelasDiniyahFilter, setKelasDiniyahFilter] = useState([])
  const [kelDiniyahFilter, setKelDiniyahFilter] = useState([])
  const [formalFilter, setFormalFilter] = useState([])
  const [kelasFormalFilter, setKelasFormalFilter] = useState([])
  const [kelFormalFilter, setKelFormalFilter] = useState([])
  const [lttqFilter, setLttqFilter] = useState([])
  const [kelasLttqFilter, setKelasLttqFilter] = useState([])
  const [kelLttqFilter, setKelLttqFilter] = useState([])
  const [saudaraFilter, setSaudaraFilter] = useState([])
  const [daerahFilter, setDaerahFilter] = useState([])
  const [kamarFilter, setKamarFilter] = useState([])
  const [dusunFilter, setDusunFilter] = useState([])
  const [rtFilter, setRtFilter] = useState([])
  const [rwFilter, setRwFilter] = useState([])
  const [desaFilter, setDesaFilter] = useState([])
  const [kecamatanFilter, setKecamatanFilter] = useState([])
  const [kabupatenFilter, setKabupatenFilter] = useState([])
  const [openFilterKey, setOpenFilterKey] = useState(null)
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0, width: 200 })
  const filterDropdownRef = useRef(null)
  const filterContainerRef = useRef(null)
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [showLengkapiDataOffcanvas, setShowLengkapiDataOffcanvas] = useState(false)
  const [selectedSantriForLengkapi, setSelectedSantriForLengkapi] = useState(null)
  const [showBulkEditOffcanvas, setShowBulkEditOffcanvas] = useState(false)
  const [isExportOffcanvasOpen, setIsExportOffcanvasOpen] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState(50)

  useEffect(() => {
    loadData()
    loadUwabaPrices()
  }, [tahunAjaran])

  const loadUwabaPrices = async () => {
    try {
      const result = await uwabaAPI.getPrices()
      if (result.success) {
        setUwabaPrices(result.data)
      }
    } catch (err) {
      console.error('Error loading uwaba prices:', err)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError('')
    
    try {
      const result = await dashboardAPI.getDataSantri(tahunAjaran)
      
      if (result.success) {
        setDataSantri(result.data || [])
      } else {
        setError(result.message || 'Gagal memuat data santri')
      }
    } catch (err) {
      console.error('Error loading data santri:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }

  // Calculate wajib sebulan untuk setiap santri
  const dataSantriWithWajibSebulan = useMemo(() => {
    if (!uwabaPrices) return dataSantri
    
    return dataSantri.map(santri => {
      const biodata = {
        status_santri: santri.status,
        kategori: santri.kategori,
        diniyah: santri.diniyah,
        formal: santri.formal,
        lttq: santri.lttq,
        saudara_di_pesantren: santri.saudara_di_pesantren
      }
      const wajibSebulan = calculateWajibFromBiodata(biodata, uwabaPrices)
      return {
        ...santri,
        wajib_sebulan: wajibSebulan
      }
    })
  }, [dataSantri, uwabaPrices])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value)
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // Get unique values for filters
  const uniqueStatuses = useMemo(() => {
    const statuses = [...new Set(dataSantri.map(s => s.status).filter(Boolean))]
    return statuses.sort()
  }, [dataSantri])

  const uniqueDiniyah = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.diniyah).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueKelasDiniyah = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.kelas_diniyah).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueKelDiniyah = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.kel_diniyah).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueFormal = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.formal).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueKelasFormal = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.kelas_formal).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueKelFormal = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.kel_formal).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueLttq = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.lttq).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueKelasLttq = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.kelas_lttq).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueKelLttq = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.kel_lttq).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  const uniqueSaudara = useMemo(() => {
    const values = [...new Set(dataSantri.map(s => s.saudara_di_pesantren).filter(Boolean))]
    return values.sort()
  }, [dataSantri])

  // Filter data step by step untuk mendapatkan unique values yang dinamis
  const getFilteredDataForOptions = useMemo(() => {
    let filtered = dataSantriWithWajibSebulan

    // Apply all filters except the one we're calculating options for
    // Filter by search term first (affects all options)
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(santri => 
        santri.id.toString().includes(term) ||
        santri.nama.toLowerCase().includes(term) ||
        (santri.status && santri.status.toLowerCase().includes(term)) ||
        (santri.kategori && santri.kategori.toLowerCase().includes(term)) ||
        (santri.diniyah && santri.diniyah.toLowerCase().includes(term)) ||
        (santri.kelas_diniyah && santri.kelas_diniyah.toLowerCase().includes(term)) ||
        (santri.kel_diniyah && santri.kel_diniyah.toLowerCase().includes(term)) ||
        (santri.formal && santri.formal.toLowerCase().includes(term)) ||
        (santri.kelas_formal && santri.kelas_formal.toLowerCase().includes(term)) ||
        (santri.kel_formal && santri.kel_formal.toLowerCase().includes(term)) ||
        (santri.lttq && santri.lttq.toLowerCase().includes(term)) ||
        (santri.kelas_lttq && santri.kelas_lttq.toLowerCase().includes(term)) ||
        (santri.kel_lttq && santri.kel_lttq.toLowerCase().includes(term)) ||
        (santri.hijriyah && santri.hijriyah.toLowerCase().includes(term)) ||
        (santri.masehi && santri.masehi.toString().includes(term)) ||
        (santri.saudara_di_pesantren && santri.saudara_di_pesantren.toLowerCase().includes(term)) ||
        (santri.daerah && santri.daerah.toLowerCase().includes(term)) ||
        (santri.kamar && santri.kamar.toString().includes(term)) ||
        (santri.dusun && santri.dusun.toLowerCase().includes(term)) ||
        (santri.rt && santri.rt.toString().includes(term)) ||
        (santri.rw && santri.rw.toString().includes(term)) ||
        (santri.desa && santri.desa.toLowerCase().includes(term)) ||
        (santri.kecamatan && santri.kecamatan.toLowerCase().includes(term)) ||
        (santri.kabupaten && santri.kabupaten.toLowerCase().includes(term))
      )
    }

    // Filter by count (bisa multi)
    if (countFilter.length > 0) {
      filtered = filtered.filter(santri => {
        const isLengkap = santri.count === 10
        const isKurang = santri.count > 0 && santri.count < 10
        const isBelum = santri.count === 0
        return (countFilter.includes('lengkap') && isLengkap) || (countFilter.includes('kurang') && isKurang) || (countFilter.includes('belum') && isBelum)
      })
    }

    return filtered
  }, [dataSantriWithWajibSebulan, searchTerm, countFilter])

  // Dynamic unique values based on filtered data
  const dynamicUniqueStatuses = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.status).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.status === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKategori = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kategori).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kategori === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueDiniyah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.diniyah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.diniyah === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKelasDiniyah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kelas_diniyah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kelas_diniyah === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKelDiniyah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kel_diniyah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kel_diniyah === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueFormal = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.formal).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.formal === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKelasFormal = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kelas_formal).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kelas_formal === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKelFormal = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kel_formal).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kel_formal === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueLttq = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.lttq).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.lttq === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKelasLttq = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kelas_lttq).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kelas_lttq === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKelLttq = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kel_lttq).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kel_lttq === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueSaudara = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.saudara_di_pesantren).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.saudara_di_pesantren === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueDaerah = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.daerah).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.daerah === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKamar = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kamar).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kamar === val).length
    }))
    return counts.sort((a, b) => (a.value || '').toString().localeCompare((b.value || '').toString()))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueDusun = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.dusun).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.dusun === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueRt = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.rt).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.rt === val).length
    }))
    return counts.sort((a, b) => (a.value || '').toString().localeCompare((b.value || '').toString()))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueRw = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.rw).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.rw === val).length
    }))
    return counts.sort((a, b) => (a.value || '').toString().localeCompare((b.value || '').toString()))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, desaFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueDesa = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.desa).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.desa === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, kecamatanFilter, kabupatenFilter])

  const dynamicUniqueKecamatan = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kabupatenFilter.length > 0) filtered = filtered.filter(s => kabupatenFilter.includes(s.kabupaten))
    
    const values = [...new Set(filtered.map(s => s.kecamatan).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kecamatan === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kabupatenFilter])

  const dynamicUniqueKabupaten = useMemo(() => {
    let filtered = getFilteredDataForOptions
    if (statusFilter.length > 0) filtered = filtered.filter(s => statusFilter.includes(s.status))
    if (kategoriFilter.length > 0) filtered = filtered.filter(s => kategoriFilter.includes(s.kategori))
    if (diniyahFilter.length > 0) filtered = filtered.filter(s => diniyahFilter.includes(s.diniyah))
    if (kelasDiniyahFilter.length > 0) filtered = filtered.filter(s => kelasDiniyahFilter.includes(s.kelas_diniyah))
    if (kelDiniyahFilter.length > 0) filtered = filtered.filter(s => kelDiniyahFilter.includes(s.kel_diniyah))
    if (formalFilter.length > 0) filtered = filtered.filter(s => formalFilter.includes(s.formal))
    if (kelasFormalFilter.length > 0) filtered = filtered.filter(s => kelasFormalFilter.includes(s.kelas_formal))
    if (kelFormalFilter.length > 0) filtered = filtered.filter(s => kelFormalFilter.includes(s.kel_formal))
    if (lttqFilter.length > 0) filtered = filtered.filter(s => lttqFilter.includes(s.lttq))
    if (kelasLttqFilter.length > 0) filtered = filtered.filter(s => kelasLttqFilter.includes(s.kelas_lttq))
    if (kelLttqFilter.length > 0) filtered = filtered.filter(s => kelLttqFilter.includes(s.kel_lttq))
    if (saudaraFilter.length > 0) filtered = filtered.filter(s => saudaraFilter.includes(s.saudara_di_pesantren))
    if (daerahFilter.length > 0) filtered = filtered.filter(s => daerahFilter.includes(s.daerah))
    if (kamarFilter.length > 0) filtered = filtered.filter(s => kamarFilter.includes(s.kamar))
    if (dusunFilter.length > 0) filtered = filtered.filter(s => dusunFilter.includes(s.dusun))
    if (rtFilter.length > 0) filtered = filtered.filter(s => rtFilter.includes(s.rt))
    if (rwFilter.length > 0) filtered = filtered.filter(s => rwFilter.includes(s.rw))
    if (desaFilter.length > 0) filtered = filtered.filter(s => desaFilter.includes(s.desa))
    if (kecamatanFilter.length > 0) filtered = filtered.filter(s => kecamatanFilter.includes(s.kecamatan))
    
    const values = [...new Set(filtered.map(s => s.kabupaten).filter(Boolean))]
    const counts = values.map(val => ({
      value: val,
      count: filtered.filter(s => s.kabupaten === val).length
    }))
    return counts.sort((a, b) => a.value.localeCompare(b.value))
  }, [getFilteredDataForOptions, statusFilter, kategoriFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter])

  // Opsi tetap Count & Ket (dengan count dari data yang sudah difilter search saja)
  const dataForCountKet = useMemo(() => {
    let filtered = dataSantriWithWajibSebulan
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(santri =>
        santri.id.toString().includes(term) ||
        (santri.nama && santri.nama.toLowerCase().includes(term)) ||
        (santri.status && santri.status.toLowerCase().includes(term)) ||
        (santri.kategori && santri.kategori.toLowerCase().includes(term)) ||
        (santri.diniyah && santri.diniyah.toLowerCase().includes(term)) ||
        (santri.formal && santri.formal.toLowerCase().includes(term)) ||
        (santri.kamar && santri.kamar.toString().includes(term))
      )
    }
    return filtered
  }, [dataSantriWithWajibSebulan, searchTerm])
  const dynamicUniqueCount = useMemo(() => [
    { value: 'lengkap', count: dataForCountKet.filter(s => s.count === 10).length },
    { value: 'kurang', count: dataForCountKet.filter(s => s.count > 0 && s.count < 10).length },
    { value: 'belum', count: dataForCountKet.filter(s => s.count === 0).length }
  ], [dataForCountKet])
  const dynamicUniqueKet = useMemo(() => {
    const lunas = dataForCountKet.filter(s => { const k = Number(s.kurang) || 0; const b = Number(s.bayar) || 0; const w = Number(s.wajib) || 0; return k <= 0 || b >= w }).length
    const kurang = dataForCountKet.filter(s => { const k = Number(s.kurang) || 0; const b = Number(s.bayar) || 0; return k > 0 && b > 0 }).length
    const belum = dataForCountKet.filter(s => { const k = Number(s.kurang) || 0; const b = Number(s.bayar) || 0; const w = Number(s.wajib) || 0; const isLunas = k <= 0 || b >= w; const isKurang = k > 0 && b > 0; return !isLunas && !isKurang }).length
    return [
      { value: 'lunas', count: lunas },
      { value: 'kurang', count: kurang },
      { value: 'belum', count: belum }
    ]
  }, [dataForCountKet])

  const filteredAndSortedData = useMemo(() => {
    let filtered = dataSantriWithWajibSebulan

    // Filter by status (multi)
    if (statusFilter.length > 0) {
      filtered = filtered.filter(santri => statusFilter.includes(santri.status))
    }

    // Filter by kategori (multi)
    if (kategoriFilter.length > 0) {
      filtered = filtered.filter(santri => kategoriFilter.includes(santri.kategori))
    }

    // Filter by count (multi)
    if (countFilter.length > 0) {
      filtered = filtered.filter(santri => {
        const isLengkap = santri.count === 10
        const isKurang = santri.count > 0 && santri.count < 10
        const isBelum = santri.count === 0
        return (countFilter.includes('lengkap') && isLengkap) || (countFilter.includes('kurang') && isKurang) || (countFilter.includes('belum') && isBelum)
      })
    }

    // Filter by ket (multi: Lunas / Kurang / Belum)
    if (ketFilter.length > 0) {
      filtered = filtered.filter(santri => {
        const wajib = Number(santri.wajib) || 0
        const bayar = Number(santri.bayar) || 0
        const kurang = Number(santri.kurang) || 0
        let ket = 'belum'
        if (kurang <= 0 || bayar >= wajib) ket = 'lunas'
        else if (bayar > 0) ket = 'kurang'
        return ketFilter.includes(ket)
      })
    }

    // Filter by diniyah (multi)
    if (diniyahFilter.length > 0) {
      filtered = filtered.filter(santri => diniyahFilter.includes(santri.diniyah))
    }

    // Filter by kelas_diniyah (multi)
    if (kelasDiniyahFilter.length > 0) {
      filtered = filtered.filter(santri => kelasDiniyahFilter.includes(santri.kelas_diniyah))
    }

    // Filter by kel_diniyah (multi)
    if (kelDiniyahFilter.length > 0) {
      filtered = filtered.filter(santri => kelDiniyahFilter.includes(santri.kel_diniyah))
    }

    // Filter by formal (multi)
    if (formalFilter.length > 0) {
      filtered = filtered.filter(santri => formalFilter.includes(santri.formal))
    }

    // Filter by kelas_formal (multi)
    if (kelasFormalFilter.length > 0) {
      filtered = filtered.filter(santri => kelasFormalFilter.includes(santri.kelas_formal))
    }

    // Filter by kel_formal (multi)
    if (kelFormalFilter.length > 0) {
      filtered = filtered.filter(santri => kelFormalFilter.includes(santri.kel_formal))
    }

    // Filter by lttq (multi)
    if (lttqFilter.length > 0) {
      filtered = filtered.filter(santri => lttqFilter.includes(santri.lttq))
    }

    // Filter by kelas_lttq (multi)
    if (kelasLttqFilter.length > 0) {
      filtered = filtered.filter(santri => kelasLttqFilter.includes(santri.kelas_lttq))
    }

    // Filter by kel_lttq (multi)
    if (kelLttqFilter.length > 0) {
      filtered = filtered.filter(santri => kelLttqFilter.includes(santri.kel_lttq))
    }

    // Filter by saudara di pesantren (multi)
    if (saudaraFilter.length > 0) {
      filtered = filtered.filter(santri => saudaraFilter.includes(santri.saudara_di_pesantren))
    }

    // Filter by daerah (multi)
    if (daerahFilter.length > 0) {
      filtered = filtered.filter(santri => daerahFilter.includes(santri.daerah))
    }

    // Filter by kamar (multi)
    if (kamarFilter.length > 0) {
      filtered = filtered.filter(santri => kamarFilter.includes(santri.kamar))
    }

    // Filter by dusun (multi)
    if (dusunFilter.length > 0) {
      filtered = filtered.filter(santri => dusunFilter.includes(santri.dusun))
    }

    // Filter by rt (multi)
    if (rtFilter.length > 0) {
      filtered = filtered.filter(santri => rtFilter.includes(santri.rt))
    }

    // Filter by rw (multi)
    if (rwFilter.length > 0) {
      filtered = filtered.filter(santri => rwFilter.includes(santri.rw))
    }

    // Filter by desa (multi)
    if (desaFilter.length > 0) {
      filtered = filtered.filter(santri => desaFilter.includes(santri.desa))
    }

    // Filter by kecamatan (multi)
    if (kecamatanFilter.length > 0) {
      filtered = filtered.filter(santri => kecamatanFilter.includes(santri.kecamatan))
    }

    // Filter by kabupaten (multi)
    if (kabupatenFilter.length > 0) {
      filtered = filtered.filter(santri => kabupatenFilter.includes(santri.kabupaten))
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(santri => 
        santri.id.toString().includes(term) ||
        santri.nama.toLowerCase().includes(term) ||
        (santri.status && santri.status.toLowerCase().includes(term)) ||
        (santri.kategori && santri.kategori.toLowerCase().includes(term)) ||
        (santri.diniyah && santri.diniyah.toLowerCase().includes(term)) ||
        (santri.kelas_diniyah && santri.kelas_diniyah.toLowerCase().includes(term)) ||
        (santri.kel_diniyah && santri.kel_diniyah.toLowerCase().includes(term)) ||
        (santri.formal && santri.formal.toLowerCase().includes(term)) ||
        (santri.kelas_formal && santri.kelas_formal.toLowerCase().includes(term)) ||
        (santri.kel_formal && santri.kel_formal.toLowerCase().includes(term)) ||
        (santri.lttq && santri.lttq.toLowerCase().includes(term)) ||
        (santri.kelas_lttq && santri.kelas_lttq.toLowerCase().includes(term)) ||
        (santri.kel_lttq && santri.kel_lttq.toLowerCase().includes(term)) ||
        (santri.hijriyah && santri.hijriyah.toLowerCase().includes(term)) ||
        (santri.masehi && santri.masehi.toString().includes(term)) ||
        (santri.saudara_di_pesantren && santri.saudara_di_pesantren.toLowerCase().includes(term)) ||
        (santri.daerah && santri.daerah.toLowerCase().includes(term)) ||
        (santri.kamar && santri.kamar.toString().includes(term)) ||
        (santri.dusun && santri.dusun.toLowerCase().includes(term)) ||
        (santri.rt && santri.rt.toString().includes(term)) ||
        (santri.rw && santri.rw.toString().includes(term)) ||
        (santri.desa && santri.desa.toLowerCase().includes(term)) ||
        (santri.kecamatan && santri.kecamatan.toLowerCase().includes(term)) ||
        (santri.kabupaten && santri.kabupaten.toLowerCase().includes(term))
      )
    }

    // Sort
    if (sortConfig.key) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key]
        const bVal = b[sortConfig.key]
        
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal)
        }
        
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      })
    }

    return filtered
  }, [dataSantriWithWajibSebulan, statusFilter, kategoriFilter, countFilter, ketFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter, searchTerm, sortConfig])

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = filteredAndSortedData.slice(startIndex, endIndex)

        // Reset to page 1 when search, filters, sort, or itemsPerPage changes
        useEffect(() => {
          setCurrentPage(1)
        }, [searchTerm, statusFilter, kategoriFilter, countFilter, ketFilter, diniyahFilter, kelasDiniyahFilter, kelDiniyahFilter, formalFilter, kelasFormalFilter, kelFormalFilter, lttqFilter, kelasLttqFilter, kelLttqFilter, saudaraFilter, daerahFilter, kamarFilter, dusunFilter, rtFilter, rwFilter, desaFilter, kecamatanFilter, kabupatenFilter, sortConfig, itemsPerPage])

  const handleFilterOpen = (key, rect) => {
    setOpenFilterKey(key)
    if (rect) {
      setFilterPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width || 200, 200)
      })
    }
  }

  useEffect(() => {
    if (!openFilterKey) return
    const handleClickOutside = (e) => {
      const inDropdown = filterDropdownRef.current && filterDropdownRef.current.contains(e.target)
      const inContainer = filterContainerRef.current && filterContainerRef.current.contains(e.target)
      if (!inDropdown && !inContainer) setOpenFilterKey(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openFilterKey])

  // Handle select/deselect individual item
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

  // Handle select/deselect all (master checkbox)
  const handleToggleSelectAll = () => {
    if (selectedItems.size === paginatedData.length && paginatedData.length > 0) {
      // Deselect all
      setSelectedItems(new Set())
    } else {
      // Select all in current page
      const newSet = new Set(selectedItems)
      paginatedData.forEach(santri => newSet.add(santri.id))
      setSelectedItems(newSet)
    }
  }

  // Handle select all filtered data (not just current page)
  const handleSelectAllFiltered = () => {
    if (selectedItems.size === filteredAndSortedData.length && filteredAndSortedData.length > 0) {
      // Deselect all
      setSelectedItems(new Set())
    } else {
      // Select all filtered data
      const newSet = new Set()
      filteredAndSortedData.forEach(santri => newSet.add(santri.id))
      setSelectedItems(newSet)
    }
  }

  // Check if all items in current page are selected
  const isAllPageSelected = paginatedData.length > 0 && paginatedData.every(santri => selectedItems.has(santri.id))
  
  // Check if some items in current page are selected
  const isSomePageSelected = paginatedData.some(santri => selectedItems.has(santri.id))

  const getCountStatus = (count) => {
    if (count === 0) {
      return { label: 'Tidak Ada Data', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' }
    } else if (count < 10) {
      return { label: `Kurang (${count}/10)`, color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' }
    } else if (count === 10) {
      return { label: 'Lengkap', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' }
    } else {
      return { label: `Lebih (${count})`, color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' }
    }
  }

  // Ket pembayaran UWABA (tahun ajaran hijriyah aktif): Lunas, Kurang, Belum
  const getKetPembayaran = (santri) => {
    const wajib = Number(santri.wajib) || 0
    const bayar = Number(santri.bayar) || 0
    const kurang = Number(santri.kurang) || 0
    if (kurang <= 0 || bayar >= wajib) return { label: 'Lunas', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' }
    if (bayar > 0) return { label: 'Kurang', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' }
    return { label: 'Belum', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' }
  }

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
        <div className="px-2 py-3 sm:p-6 lg:p-8">
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
        <div className="px-2 py-3 sm:p-6 lg:p-8">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-2 py-3 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >

          {/* Search & Filter */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            {/* Search Input dengan tombol di kanan */}
            <div className="relative pb-2 px-2 sm:px-4 pt-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari ID, Nama, atau Status Santri..."
                />
                {/* Tombol Filter dan Refresh di kanan */}
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
              {/* Border bawah yang sampai ke kanan */}
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
              <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
            </div>

            {/* Filter Container dengan Accordion */}
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
                    <div className="flex flex-wrap gap-2" ref={filterContainerRef}>
                      <MultiSelectFilter filterKey="status" label="Status" options={dynamicUniqueStatuses} selected={statusFilter} onChange={setStatusFilter} isOpen={openFilterKey === 'status'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'status' ? filterPosition : null} dropdownRef={openFilterKey === 'status' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kategori" label="Kategori" options={dynamicUniqueKategori} selected={kategoriFilter} onChange={setKategoriFilter} isOpen={openFilterKey === 'kategori'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kategori' ? filterPosition : null} dropdownRef={openFilterKey === 'kategori' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="count" label="Count" options={dynamicUniqueCount} selected={countFilter} onChange={setCountFilter} isOpen={openFilterKey === 'count'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'count' ? filterPosition : null} dropdownRef={openFilterKey === 'count' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="ket" label="Ket" options={dynamicUniqueKet} selected={ketFilter} onChange={setKetFilter} isOpen={openFilterKey === 'ket'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'ket' ? filterPosition : null} dropdownRef={openFilterKey === 'ket' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="diniyah" label="Diniyah" options={dynamicUniqueDiniyah} selected={diniyahFilter} onChange={setDiniyahFilter} isOpen={openFilterKey === 'diniyah'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'diniyah' ? filterPosition : null} dropdownRef={openFilterKey === 'diniyah' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kelasDiniyah" label="Kelas Diniyah" options={dynamicUniqueKelasDiniyah} selected={kelasDiniyahFilter} onChange={setKelasDiniyahFilter} isOpen={openFilterKey === 'kelasDiniyah'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kelasDiniyah' ? filterPosition : null} dropdownRef={openFilterKey === 'kelasDiniyah' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kelDiniyah" label="Kel Diniyah" options={dynamicUniqueKelDiniyah} selected={kelDiniyahFilter} onChange={setKelDiniyahFilter} isOpen={openFilterKey === 'kelDiniyah'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kelDiniyah' ? filterPosition : null} dropdownRef={openFilterKey === 'kelDiniyah' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="formal" label="Formal" options={dynamicUniqueFormal} selected={formalFilter} onChange={setFormalFilter} isOpen={openFilterKey === 'formal'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'formal' ? filterPosition : null} dropdownRef={openFilterKey === 'formal' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kelasFormal" label="Kelas Formal" options={dynamicUniqueKelasFormal} selected={kelasFormalFilter} onChange={setKelasFormalFilter} isOpen={openFilterKey === 'kelasFormal'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kelasFormal' ? filterPosition : null} dropdownRef={openFilterKey === 'kelasFormal' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kelFormal" label="Kel Formal" options={dynamicUniqueKelFormal} selected={kelFormalFilter} onChange={setKelFormalFilter} isOpen={openFilterKey === 'kelFormal'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kelFormal' ? filterPosition : null} dropdownRef={openFilterKey === 'kelFormal' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="lttq" label="LTTQ" options={dynamicUniqueLttq} selected={lttqFilter} onChange={setLttqFilter} isOpen={openFilterKey === 'lttq'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'lttq' ? filterPosition : null} dropdownRef={openFilterKey === 'lttq' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kelasLttq" label="Kelas LTTQ" options={dynamicUniqueKelasLttq} selected={kelasLttqFilter} onChange={setKelasLttqFilter} isOpen={openFilterKey === 'kelasLttq'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kelasLttq' ? filterPosition : null} dropdownRef={openFilterKey === 'kelasLttq' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kelLttq" label="Kel LTTQ" options={dynamicUniqueKelLttq} selected={kelLttqFilter} onChange={setKelLttqFilter} isOpen={openFilterKey === 'kelLttq'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kelLttq' ? filterPosition : null} dropdownRef={openFilterKey === 'kelLttq' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="saudara" label="Saudara" options={dynamicUniqueSaudara} selected={saudaraFilter} onChange={setSaudaraFilter} isOpen={openFilterKey === 'saudara'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'saudara' ? filterPosition : null} dropdownRef={openFilterKey === 'saudara' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="daerah" label="Daerah" options={dynamicUniqueDaerah} selected={daerahFilter} onChange={setDaerahFilter} isOpen={openFilterKey === 'daerah'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'daerah' ? filterPosition : null} dropdownRef={openFilterKey === 'daerah' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kamar" label="Kamar" options={dynamicUniqueKamar} selected={kamarFilter} onChange={setKamarFilter} isOpen={openFilterKey === 'kamar'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kamar' ? filterPosition : null} dropdownRef={openFilterKey === 'kamar' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="dusun" label="Dusun" options={dynamicUniqueDusun} selected={dusunFilter} onChange={setDusunFilter} isOpen={openFilterKey === 'dusun'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'dusun' ? filterPosition : null} dropdownRef={openFilterKey === 'dusun' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="rt" label="RT" options={dynamicUniqueRt} selected={rtFilter} onChange={setRtFilter} isOpen={openFilterKey === 'rt'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'rt' ? filterPosition : null} dropdownRef={openFilterKey === 'rt' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="rw" label="RW" options={dynamicUniqueRw} selected={rwFilter} onChange={setRwFilter} isOpen={openFilterKey === 'rw'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'rw' ? filterPosition : null} dropdownRef={openFilterKey === 'rw' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="desa" label="Desa" options={dynamicUniqueDesa} selected={desaFilter} onChange={setDesaFilter} isOpen={openFilterKey === 'desa'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'desa' ? filterPosition : null} dropdownRef={openFilterKey === 'desa' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kecamatan" label="Kecamatan" options={dynamicUniqueKecamatan} selected={kecamatanFilter} onChange={setKecamatanFilter} isOpen={openFilterKey === 'kecamatan'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kecamatan' ? filterPosition : null} dropdownRef={openFilterKey === 'kecamatan' ? filterDropdownRef : null} />
                      <MultiSelectFilter filterKey="kabupaten" label="Kabupaten" options={dynamicUniqueKabupaten} selected={kabupatenFilter} onChange={setKabupatenFilter} isOpen={openFilterKey === 'kabupaten'} onOpen={handleFilterOpen} dropdownPosition={openFilterKey === 'kabupaten' ? filterPosition : null} dropdownRef={openFilterKey === 'kabupaten' ? filterDropdownRef : null} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 md:p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] md:text-xs font-medium text-sky-700 dark:text-sky-300">
                  Total Santri
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
                  Data Lengkap
                </p>
                <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 p-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </div>
              <p className="text-sm md:text-lg font-bold text-emerald-700 dark:text-emerald-200">
                {filteredAndSortedData.filter(s => s.count === 10).length}
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3 md:p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] md:text-xs font-medium text-orange-700 dark:text-orange-300">
                  Data Kurang
                </p>
                <span className="inline-flex items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 p-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              </div>
              <p className="text-sm md:text-lg font-bold text-orange-700 dark:text-orange-200">
                {filteredAndSortedData.filter(s => s.count > 0 && s.count < 10).length}
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3 md:p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] md:text-xs font-medium text-rose-700 dark:text-rose-300">
                  Tidak Ada Data
                </p>
                <span className="inline-flex items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 p-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              </div>
              <p className="text-sm md:text-lg font-bold text-rose-700 dark:text-rose-200">
                {filteredAndSortedData.filter(s => s.count === 0).length}
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
            {/* Action Buttons */}
            <div className="px-2 sm:px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
              {selectedItems.size > 0 && (() => {
                const selectedData = filteredAndSortedData.filter(s => selectedItems.has(s.id))
                const incompleteData = selectedData.filter(s => s.count < 10)
                const hasIncompleteData = incompleteData.length > 0
                
                if (hasIncompleteData) {
                  // Tampilkan tombol lengkapi jika ada item dengan count < 10
                  return (
                    <button
                      onClick={() => {
                        setSelectedSantriForLengkapi(incompleteData)
                        setShowLengkapiDataOffcanvas(true)
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      title={`Lengkapi data uwaba untuk ${incompleteData.length} santri yang dipilih`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Lengkapi ({incompleteData.length})
                    </button>
                  )
                }
                return null
              })()}
              <button
                onClick={() => setIsExportOffcanvasOpen(true)}
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
                <>
                  <button
                    onClick={() => {
                      const selectedData = filteredAndSortedData.filter(s => selectedItems.has(s.id))
                      setShowBulkEditOffcanvas(true)
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                    title="Ubah data massal untuk santri yang dipilih"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Ubah Massal ({selectedItems.size})
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
              <button
                onClick={loadData}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors"
                disabled={loading}
              >
                <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
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
                      onClick={() => handleSort('status')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Status
                        <SortIcon columnKey="status" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kategori')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Kategori
                        <SortIcon columnKey="kategori" />
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
                      onClick={() => handleSort('lttq')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        LTTQ
                        <SortIcon columnKey="lttq" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kelas_lttq')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        KLTTQ
                        <SortIcon columnKey="kelas_lttq" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kel_lttq')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        KelLTTQ
                        <SortIcon columnKey="kel_lttq" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('hijriyah')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Hijriyah
                        <SortIcon columnKey="hijriyah" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('masehi')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Masehi
                        <SortIcon columnKey="masehi" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('saudara_di_pesantren')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Sdr
                        <SortIcon columnKey="saudara_di_pesantren" />
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
                      onClick={() => handleSort('dusun')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Dusun
                        <SortIcon columnKey="dusun" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('rt')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        RT
                        <SortIcon columnKey="rt" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('rw')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        RW
                        <SortIcon columnKey="rw" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('desa')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Desa
                        <SortIcon columnKey="desa" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kecamatan')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Kec
                        <SortIcon columnKey="kecamatan" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kabupaten')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-2">
                        Kab
                        <SortIcon columnKey="kabupaten" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('wajib_sebulan')}
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Wajib Sebulan
                        <SortIcon columnKey="wajib_sebulan" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('wajib')}
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Total Wajib
                        <SortIcon columnKey="wajib" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('bayar')}
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Total Bayar
                        <SortIcon columnKey="bayar" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('kurang')}
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Kurang
                        <SortIcon columnKey="kurang" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('count')}
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-center gap-2">
                        Count
                        <SortIcon columnKey="count" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                      Ket
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan="31" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                        {searchTerm || statusFilter.length > 0 || kategoriFilter.length > 0 || countFilter.length > 0 || ketFilter.length > 0 || diniyahFilter.length > 0 || kelasDiniyahFilter.length > 0 || kelDiniyahFilter.length > 0 || formalFilter.length > 0 || kelasFormalFilter.length > 0 || kelFormalFilter.length > 0 || lttqFilter.length > 0 || kelasLttqFilter.length > 0 || kelLttqFilter.length > 0 || saudaraFilter.length > 0 || daerahFilter.length > 0 || kamarFilter.length > 0 || dusunFilter.length > 0 || rtFilter.length > 0 || rwFilter.length > 0 || desaFilter.length > 0 || kecamatanFilter.length > 0 || kabupatenFilter.length > 0 ? 'Tidak ada data yang sesuai dengan pencarian atau filter' : 'Tidak ada data'}
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((santri) => {
                      const countStatus = getCountStatus(santri.count)
                      const ketPembayaran = getKetPembayaran(santri)
                      const isSelected = selectedItems.has(santri.id)
                      return (
                        <tr
                          key={santri.id}
                          onClick={() => handleToggleSelect(santri.id)}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${isSelected ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
                        >
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                            {santri.nama}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.status || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kategori || '-'}
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
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.lttq || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kelas_lttq || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kel_lttq || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.hijriyah || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.masehi ? new Date(santri.masehi).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.saudara_di_pesantren || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.daerah || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kamar || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.dusun || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.rt || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.rw || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.desa || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kecamatan || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                            {santri.kabupaten || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-blue-600 dark:text-blue-400">
                            {formatCurrency(santri.wajib_sebulan || 0)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">
                            {formatCurrency(santri.wajib)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(santri.bayar)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-orange-600 dark:text-orange-400">
                            {formatCurrency(santri.kurang)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${countStatus.color}`}>
                              {countStatus.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ketPembayaran.color}`}>
                              {ketPembayaran.label}
                            </span>
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
                      Menampilkan {startIndex + 1}-{Math.min(endIndex, filteredAndSortedData.length)} dari {filteredAndSortedData.length} santri
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
                  
                  {/* Pagination Controls */}
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

      {/* Lengkapi Data Offcanvas */}
      <LengkapiDataOffcanvas
        isOpen={showLengkapiDataOffcanvas}
        onClose={() => {
          setShowLengkapiDataOffcanvas(false)
          setSelectedSantriForLengkapi(null)
        }}
        selectedSantriList={selectedSantriForLengkapi}
        uwabaPrices={uwabaPrices}
        tahunAjaran={tahunAjaran}
        onSuccess={() => {
          loadData()
          setSelectedItems(new Set())
        }}
      />

      {/* Bulk Edit Offcanvas */}
      <BulkEditOffcanvas
        isOpen={showBulkEditOffcanvas}
        onClose={() => {
          setShowBulkEditOffcanvas(false)
        }}
        selectedSantriList={filteredAndSortedData.filter(s => selectedItems.has(s.id))}
        allDataSantri={dataSantriWithWajibSebulan}
        onSuccess={() => {
          loadData()
          setSelectedItems(new Set())
        }}
      />

      {/* Export offcanvas: pilih kolom lalu eksport ke Excel */}
      <ExportManageDataOffcanvas
        isOpen={isExportOffcanvasOpen}
        onClose={() => setIsExportOffcanvasOpen(false)}
        data={selectedItems.size > 0 ? filteredAndSortedData.filter(s => selectedItems.has(s.id)) : filteredAndSortedData}
        tahunAjaran={tahunAjaran}
        getCountStatus={getCountStatus}
        getKetPembayaran={getKetPembayaran}
      />
    </div>
  )
}

export default UwabaDataSantri

