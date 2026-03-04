import { useState, useEffect, useCallback } from 'react'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

/**
 * Custom hook untuk mengelola filtering dan pagination draft rencana pengeluaran
 * @param {string} activeTab - Tab yang aktif (harus 'draft')
 * @param {number} itemsPerPage - Jumlah item per halaman
 * @returns {Object} State dan handlers untuk filtering draft
 */
export const useDraftFilters = (activeTab, itemsPerPage = 50) => {
  const { showNotification } = useNotification()
  
  // Data state
  const [allDraft, setAllDraft] = useState([])
  const [filteredDraft, setFilteredDraft] = useState([])
  const [draftList, setDraftList] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Filter state
  const [draftPage, setDraftPage] = useState(1)
  const [draftTotal, setDraftTotal] = useState(0)
  const [draftSearchQuery, setDraftSearchQuery] = useState('')
  const [draftKategoriFilter, setDraftKategoriFilter] = useState('')
  const [draftLembagaFilter, setDraftLembagaFilter] = useState('')
  const [draftTanggalDari, setDraftTanggalDari] = useState('')
  const [draftTanggalSampai, setDraftTanggalSampai] = useState('')
  
  // UI state
  const [isDraftFilterOpen, setIsDraftFilterOpen] = useState(false)
  const [isDraftInputFocused, setIsDraftInputFocused] = useState(false)

  // Load semua data draft dari server
  const loadAllDraft = useCallback(async () => {
    try {
      setLoading(true)
      const response = await pengeluaranAPI.getRencanaList(
        'draft', // status = draft
        null, // kategori
        null, // lembaga
        null, // tanggal_dari
        null, // tanggal_sampai
        1,
        10000 // limit besar untuk mendapatkan semua data
      )
      if (response.success) {
        setAllDraft(response.data.rencana || [])
      } else {
        showNotification(response.message || 'Gagal memuat daftar draft', 'error')
      }
    } catch (error) {
      console.error('Error loading draft:', error)
      showNotification('Gagal memuat daftar draft', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  // Load data saat tab draft aktif
  useEffect(() => {
    if (activeTab === 'draft') {
      loadAllDraft()
    }
  }, [activeTab, loadAllDraft])

  // Apply filters untuk draft (client-side filtering)
  useEffect(() => {
    if (allDraft.length === 0) {
      setFilteredDraft([])
      return
    }

    let filtered = [...allDraft]

    // Filter berdasarkan search query
    if (draftSearchQuery.trim()) {
      const query = draftSearchQuery.toLowerCase().trim()
      filtered = filtered.filter(draft =>
        (draft.keterangan && draft.keterangan.toLowerCase().includes(query)) ||
        (draft.admin_nama && draft.admin_nama.toLowerCase().includes(query)) ||
        (draft.id && draft.id.toString().includes(query))
      )
    }

    // Filter berdasarkan kategori
    if (draftKategoriFilter) {
      filtered = filtered.filter(draft => draft.kategori === draftKategoriFilter)
    }

    // Filter berdasarkan lembaga
    if (draftLembagaFilter) {
      filtered = filtered.filter(draft => draft.lembaga === draftLembagaFilter)
    }

    // Filter berdasarkan tanggal
    if (draftTanggalDari) {
      filtered = filtered.filter(draft => {
        const tanggalDibuat = new Date(draft.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat >= draftTanggalDari
      })
    }

    if (draftTanggalSampai) {
      filtered = filtered.filter(draft => {
        const tanggalDibuat = new Date(draft.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat <= draftTanggalSampai
      })
    }

    setFilteredDraft(filtered)
    setDraftPage(1) // Reset ke halaman pertama saat filter berubah
  }, [draftSearchQuery, draftKategoriFilter, draftLembagaFilter, draftTanggalDari, draftTanggalSampai, allDraft])

  // Pagination untuk draft
  useEffect(() => {
    if (filteredDraft.length === 0) {
      setDraftList([])
      setDraftTotal(0)
      return
    }

    const startIndex = (draftPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedDraft = filteredDraft.slice(startIndex, endIndex)
    
    setDraftList(paginatedDraft)
    setDraftTotal(filteredDraft.length)
  }, [filteredDraft, draftPage, itemsPerPage])

  return {
    // Data
    allDraft,
    draftList,
    loading,
    draftTotal,
    
    // Filter state
    draftPage,
    setDraftPage,
    draftSearchQuery,
    setDraftSearchQuery,
    draftKategoriFilter,
    setDraftKategoriFilter,
    draftLembagaFilter,
    setDraftLembagaFilter,
    draftTanggalDari,
    setDraftTanggalDari,
    draftTanggalSampai,
    setDraftTanggalSampai,
    
    // UI state
    isDraftFilterOpen,
    setIsDraftFilterOpen,
    isDraftInputFocused,
    setIsDraftInputFocused,
    
    // Actions
    loadAllDraft
  }
}

