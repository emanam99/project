import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { useAuthStore } from '../../../store/authStore'
import { usePendaftaranFiturAccess } from '../../../hooks/usePendaftaranFiturAccess'
import PembayaranOffcanvas from './PembayaranOffcanvas'
import AddItemOffcanvas from './AddItemOffcanvas'
import PendaftaranPrintOffcanvas from '../../../components/Pendaftaran/PendaftaranPrintOffcanvas'
import FilePreviewOffcanvas from '../../../components/FilePreview/FilePreviewOffcanvas'

function PembayaranBox({ santriId, refreshKey }) {
  const { showNotification } = useNotification()
  const { tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const { user } = useAuthStore()
  const { pembayaranKelola } = usePendaftaranFiturAccess()
  const [registrasi, setRegistrasi] = useState(null)
  const [registrasiDetail, setRegistrasiDetail] = useState([])
  const [originalDetail, setOriginalDetail] = useState([]) // Untuk tracking perubahan
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingRegistrasi, setCreatingRegistrasi] = useState(false)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [isOffcanvasOpen, setIsOffcanvasOpen] = useState(false)
  const [isAddItemOffcanvasOpen, setIsAddItemOffcanvasOpen] = useState(false)
  const [isAccordionOpen, setIsAccordionOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteItemId, setDeleteItemId] = useState(null)
  const [deleteItemName, setDeleteItemName] = useState('')
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [buktiPembayaranList, setBuktiPembayaranList] = useState([])
  const [previewFile, setPreviewFile] = useState(null)
  // Daftar field kondisi untuk accordion (dari DB, agar fleksibel)
  const [kondisiDisplayFields, setKondisiDisplayFields] = useState([]) // [{ field_name, field_label }, ...]

  // Load daftar field kondisi dari DB (urutan sesuai psb___kondisi_field)
  useEffect(() => {
    const load = async () => {
      try {
        const result = await pendaftaranAPI.getKondisiFields()
        if (!result?.success || !Array.isArray(result.data)) {
          setKondisiDisplayFields([])
          return
        }
        // status_murid tetap di biodata/registrasi; tidak ditampilkan di kondisi penentu auto-assign/harga
        setKondisiDisplayFields(result.data
          .filter((f) => f.field_name !== 'status_murid')
          .map((f) => ({
            field_name: f.field_name,
            field_label: f.field_label || f.field_name
          })))
      } catch (e) {
        console.warn('Load kondisi display fields:', e)
        setKondisiDisplayFields([])
      }
    }
    load()
  }, [])

  const fetchBuktiPembayaran = async () => {
    if (!santriId || !/^\d{7}$/.test(String(santriId).trim())) {
      setBuktiPembayaranList([])
      return
    }

    try {
      const result = await pendaftaranAPI.getBerkasList(santriId)
      if (result.success && result.data && result.data.length > 0) {
        // Filter hanya bukti pembayaran (termasuk "Bukti Pembayaran", "Bukti Pembayaran 1", dst)
        const buktiList = result.data.filter(berkas => 
          berkas.jenis_berkas && (berkas.jenis_berkas.startsWith('Bukti Pembayaran') || berkas.jenis_berkas.startsWith('Bukti TF'))
        )
        
        // Sort berdasarkan nomor (jika ada) atau tanggal
        const getBuktiNumber = (berkas) => {
          if (berkas.jenis_berkas === 'Bukti Pembayaran') {
            return 1
          }
          const match = berkas.jenis_berkas.match(/\d+/)
          return match ? parseInt(match[0]) : 1
        }
        
        const sorted = buktiList.sort((a, b) => {
          const numA = getBuktiNumber(a)
          const numB = getBuktiNumber(b)
          
          if (numA !== numB) {
            return numA - numB // Sort by number
          }
          
          // Jika nomor sama atau tidak ada, sort by date
          const dateA = new Date(a.tanggal_upload || a.tanggal_dibuat || 0)
          const dateB = new Date(b.tanggal_upload || b.tanggal_dibuat || 0)
          return dateB - dateA
        })
        
        setBuktiPembayaranList(sorted)
      } else {
        setBuktiPembayaranList([])
      }
    } catch (error) {
      console.error('Error fetching bukti pembayaran:', error)
      setBuktiPembayaranList([])
    }
  }

  const fetchRegistrasi = async () => {
    if (!santriId || !/^\d{7}$/.test(String(santriId).trim())) {
      setRegistrasi(null)
      setRegistrasiDetail([])
      return
    }

    const th = tahunAjaran != null ? String(tahunAjaran).trim() : ''
    const tm = tahunAjaranMasehi != null ? String(tahunAjaranMasehi).trim() : ''
    if (!th || !tm) {
      setRegistrasi(null)
      setRegistrasiDetail([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await pendaftaranAPI.getRegistrasi(santriId, th, tm)
      console.log('PembayaranBox: fetchRegistrasi result', result)
      if (result.success && result.data) {
        console.log('PembayaranBox: registrasi data received', {
          id: result.data.id,
          status_pendaftar: result.data.status_pendaftar,
          daftar_formal: result.data.daftar_formal,
          status_santri: result.data.status_santri,
          status_murid: result.data.status_murid,
          daftar_diniyah: result.data.daftar_diniyah,
          gender: result.data.gender
        })
        setRegistrasi(result.data)
        // Fetch detail setelah registrasi berhasil
        if (result.data.id) {
          fetchRegistrasiDetail(result.data.id)
        }
      } else {
        console.log('PembayaranBox: no registrasi data found')
        setRegistrasi(null)
        setRegistrasiDetail([])
      }
    } catch (error) {
      console.error('Error fetching registrasi:', error)
      setRegistrasi(null)
      setRegistrasiDetail([])
      showNotification('Gagal mengambil data pembayaran', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Fetch data registrasi detail
  const fetchRegistrasiDetail = async (idRegistrasi) => {
    if (!idRegistrasi) {
      setRegistrasiDetail([])
      return
    }

    setLoadingDetail(true)
    try {
      const result = await pendaftaranAPI.getRegistrasiDetail(idRegistrasi)
      if (result.success && result.data) {
        console.log('Fetched registrasi detail:', result.data)
        // Pastikan setiap item memiliki id
        const validatedData = result.data.map((item, index) => {
          if (!item.id) {
            console.warn(`Item at index ${index} missing id:`, item)
          }
          return item
        })
        setRegistrasiDetail(validatedData)
        // Simpan original data untuk tracking perubahan
        setOriginalDetail(JSON.parse(JSON.stringify(validatedData)))
      } else {
        setRegistrasiDetail([])
        setOriginalDetail([])
      }
    } catch (error) {
      console.error('Error fetching registrasi detail:', error)
      setRegistrasiDetail([])
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    console.log('PembayaranBox: fetchRegistrasi triggered', { santriId, tahunAjaran, tahunAjaranMasehi, refreshKey })
    fetchRegistrasi()
    fetchBuktiPembayaran()
  }, [santriId, tahunAjaran, tahunAjaranMasehi, refreshKey])
  
  // Debug: log registrasi data saat berubah
  useEffect(() => {
    if (registrasi) {
      console.log('PembayaranBox: registrasi data updated', {
        status_pendaftar: registrasi.status_pendaftar,
        daftar_formal: registrasi.daftar_formal,
        status_santri: registrasi.status_santri,
        status_murid: registrasi.status_murid,
        daftar_diniyah: registrasi.daftar_diniyah,
        gender: registrasi.gender
      })
    }
  }, [registrasi])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0)
  }

  const handlePaymentSuccess = () => {
    fetchRegistrasi()
    fetchBuktiPembayaran()
    if (registrasi?.id) {
      fetchRegistrasiDetail(registrasi.id)
    }
  }

  const handleItemAdded = () => {
    // Refresh detail setelah item ditambahkan
    if (registrasi?.id) {
      fetchRegistrasiDetail(registrasi.id)
    }
  }

  // Handle auto-assign items dari item set
  const handleAutoAssignItems = async () => {
    if (!registrasi?.id) {
      showNotification('ID Registrasi tidak ditemukan', 'error')
      return
    }

    setAutoAssigning(true)
    try {
      const idAdmin = user?.id || user?.user_id || null
      const result = await pendaftaranAPI.autoAssignItems(registrasi.id, idAdmin)

      if (result.success) {
        const assigned = result.data?.assigned || 0
        const skipped = result.data?.skipped || 0
        
        if (assigned > 0) {
          showNotification(`${assigned} item berhasil di-assign otomatis`, 'success')
        } else if (skipped > 0) {
          showNotification('Tidak ada item baru yang di-assign (semua item sudah ada)', 'info')
        } else {
          showNotification('Tidak ada item set yang cocok dengan kondisi registrasi ini', 'info')
        }
        
        // Refresh detail setelah auto-assign
        if (registrasi.id) {
          await fetchRegistrasiDetail(registrasi.id)
          await fetchRegistrasi() // Refresh juga data registrasi untuk update total
        }
      } else {
        const errorMessage = result.message || 'Gagal melakukan auto-assign items'
        showNotification(errorMessage, 'error')
      }
    } catch (error) {
      console.error('Error auto-assigning items:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Gagal melakukan auto-assign items'
      showNotification(errorMessage, 'error')
    } finally {
      setAutoAssigning(false)
    }
  }

  // Handle delete item
  const handleDeleteItem = (detail) => {
    if (!detail || !detail.id) {
      showNotification('Data detail tidak valid', 'error')
      return
    }
    setDeleteItemId(detail.id)
    setDeleteItemName(detail.nama_item || `Item ${detail.id_item}`)
    setShowDeleteModal(true)
  }

  // Confirm delete item
  const handleConfirmDelete = async () => {
    if (!deleteItemId) return

    try {
      const result = await pendaftaranAPI.deleteRegistrasiDetail(deleteItemId)
      if (result.success) {
        showNotification('Item berhasil dihapus', 'success')
        // Refresh detail setelah item dihapus
        if (registrasi?.id) {
          fetchRegistrasiDetail(registrasi.id)
        }
        setShowDeleteModal(false)
        setDeleteItemId(null)
        setDeleteItemName('')
      } else {
        showNotification(result.message || 'Gagal menghapus item', 'error')
      }
    } catch (error) {
      console.error('Error deleting item:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Gagal menghapus item'
      showNotification(errorMessage, 'error')
    }
  }

  // Handle checkbox pembayaran - hanya update local state
  const handlePaymentCheckbox = (detail, checked) => {
    if (!pembayaranKelola) return
    if (!detail || !detail.id) {
      console.error('Detail tidak valid:', detail)
      showNotification('Data detail tidak valid', 'error')
      return
    }

    const hargaStandar = parseFloat(detail.harga_standar || 0)
    
    if (checked) {
      // Hitung sisa pembayaran saat ini (sebelum update item ini)
      const totalBayar = parseFloat(registrasi?.bayar || 0)
      const totalDibayarKeItemLain = registrasiDetail.reduce((sum, item) => {
        if (item.id !== detail.id) {
          return sum + parseFloat(item.nominal_dibayar || 0)
        }
        return sum
      }, 0)
      const sisaPembayaran = totalBayar - totalDibayarKeItemLain
      
      // Jika sisa >= harga, bayar full. Jika tidak, bayar sesuai sisa
      const nominalDibayar = sisaPembayaran >= hargaStandar ? hargaStandar : Math.max(0, sisaPembayaran)
      
      // Update local state
      setRegistrasiDetail(prev => 
        prev.map(item => {
          if (item.id === detail.id) {
            let newStatusBayar = 'belum_bayar'
            if (nominalDibayar >= hargaStandar && hargaStandar > 0) {
              newStatusBayar = 'sudah_bayar'
            } else if (nominalDibayar > 0) {
              newStatusBayar = 'sebagian'
            }
            return { ...item, nominal_dibayar: nominalDibayar, status_bayar: newStatusBayar }
          }
          return item
        })
      )
    } else {
      // Jika uncheck, set nominal_dibayar ke 0
      setRegistrasiDetail(prev => 
        prev.map(item => {
          if (item.id === detail.id) {
            return { ...item, nominal_dibayar: 0, status_bayar: 'belum_bayar' }
          }
          return item
        })
      )
    }
  }

  // Handle checkbox status ambil - hanya update local state
  const handleStatusAmbilCheckbox = (detail, checked) => {
    if (!detail || !detail.id) {
      console.error('Detail tidak valid:', detail)
      showNotification('Data detail tidak valid', 'error')
      return
    }

    const statusAmbil = checked ? 'sudah_ambil' : 'belum_ambil'

    // Update local state saja, tidak langsung save
    setRegistrasiDetail(prev => 
      prev.map(item => 
        item.id === detail.id 
          ? { ...item, status_ambil: statusAmbil }
          : item
      )
    )
  }

  // Bulk save semua perubahan
  const handleBulkSave = async () => {
    if (!registrasiDetail.length) {
      showNotification('Tidak ada data untuk disimpan', 'warning')
      return
    }

    setSaving(true)
    try {
      // Siapkan data untuk bulk update
      const detailsToUpdate = registrasiDetail.map(detail => {
        const id = parseInt(detail.id)
        const nominalDibayar = parseFloat(detail.nominal_dibayar || 0)
        const statusAmbil = detail.status_ambil || 'belum_ambil'
        
        // Validasi
        if (isNaN(id) || id <= 0) {
          console.error('Invalid detail ID:', detail.id, detail)
          throw new Error(`ID detail tidak valid: ${detail.id}`)
        }
        
        return {
          id: id,
          nominal_dibayar: nominalDibayar,
          status_ambil: statusAmbil
        }
      })

      console.log('Details to update:', detailsToUpdate)
      console.log('Payload structure:', { details: detailsToUpdate })
      
      const result = await pendaftaranAPI.bulkUpdateRegistrasiDetail(detailsToUpdate)

      if (result.success) {
        showNotification('Data berhasil disimpan', 'success')
        // Update original data setelah save berhasil
        setOriginalDetail(JSON.parse(JSON.stringify(registrasiDetail)))
        // Refresh data registrasi untuk update total
        if (registrasi?.id) {
          fetchRegistrasi()
        }
      } else {
        const errorMessage = result.message || 'Gagal menyimpan data'
        showNotification(errorMessage, 'error')
      }
    } catch (error) {
      console.error('Error bulk saving:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Gagal menyimpan data'
      showNotification(errorMessage, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Cek apakah ada perubahan
  const hasChanges = () => {
    if (registrasiDetail.length !== originalDetail.length) return true
    
    return registrasiDetail.some((detail, index) => {
      const original = originalDetail[index]
      if (!original) return true
      return (
        parseFloat(detail.nominal_dibayar || 0) !== parseFloat(original.nominal_dibayar || 0) ||
        detail.status_ambil !== original.status_ambil
      )
    })
  }

  const hasNominalChanges = () => {
    if (registrasiDetail.length !== originalDetail.length) return true
    return registrasiDetail.some((detail, index) => {
      const original = originalDetail[index]
      if (!original) return true
      return (
        parseFloat(detail.nominal_dibayar || 0) !== parseFloat(original.nominal_dibayar || 0)
      )
    })
  }

  const canSaveBulk = () => {
    if (!hasChanges()) return false
    if (pembayaranKelola) return true
    return !hasNominalChanges()
  }

  // Hitung sisa pembayaran
  const calculateSisaPembayaran = () => {
    if (!registrasi) return 0
    
    const totalBayar = parseFloat(registrasi.bayar || 0)
    const totalDibayarKeItem = registrasiDetail.reduce((sum, detail) => {
      return sum + parseFloat(detail.nominal_dibayar || 0)
    }, 0)
    
    return totalBayar - totalDibayarKeItem
  }

  // Cek apakah semua item yang bisa dibayar sudah dicentang
  const isAllPayableItemsChecked = () => {
    const sisaPembayaran = calculateSisaPembayaran()
    if (sisaPembayaran <= 0) return false
    
    // Simulasi: hitung item yang bisa dibayar berdasarkan sisa pembayaran
    let remainingBalance = sisaPembayaran
    let allChecked = true
    
    for (const detail of registrasiDetail) {
      const hargaStandar = parseFloat(detail.harga_standar || 0)
      const nominalDibayar = parseFloat(detail.nominal_dibayar || 0)
      
      // Jika sudah dibayar penuh, skip
      if (nominalDibayar >= hargaStandar) {
        continue
      }
      
      // Jika sisa pembayaran habis, item ini tidak perlu dicentang
      if (remainingBalance <= 0) {
        // Item ini tidak bisa dibayar, jadi tidak perlu checked
        continue
      }
      
      // Jika masih ada sisa tapi item ini belum dicentang, maka belum semua checked
      if (nominalDibayar === 0) {
        allChecked = false
        break
      }
      
      // Kurangi sisa dengan yang sudah dibayar
      remainingBalance -= nominalDibayar
    }
    
    return allChecked
  }

  // Handle checkbox master - centang semua item yang bisa dibayar
  const handleMasterCheckbox = (checked) => {
    if (!pembayaranKelola) return
    if (!checked) {
      // Jika uncheck, uncheck semua item
      setRegistrasiDetail(prev => 
        prev.map(item => ({
          ...item,
          nominal_dibayar: 0,
          status_bayar: 'belum_bayar'
        }))
      )
      return
    }

    // Jika check, centang semua item yang bisa dibayar berdasarkan sisa pembayaran
    const totalBayar = parseFloat(registrasi?.bayar || 0)
    
    setRegistrasiDetail(prev => {
      let remainingBalance = totalBayar
      
      // Kurangi dengan yang sudah dibayar ke item lain
      prev.forEach(item => {
        remainingBalance -= parseFloat(item.nominal_dibayar || 0)
      })
      
      const updated = prev.map(item => {
        const hargaStandar = parseFloat(item.harga_standar || 0)
        const currentNominal = parseFloat(item.nominal_dibayar || 0)
        
        // Jika sudah dibayar penuh, skip (tapi tetap kurangi dari remainingBalance)
        if (currentNominal >= hargaStandar) {
          return item
        }
        
        // Jika sisa pembayaran habis, set ke 0
        if (remainingBalance <= 0) {
          return {
            ...item,
            nominal_dibayar: 0,
            status_bayar: 'belum_bayar'
          }
        }
        
        // Hitung berapa yang bisa dibayar
        const bisaDibayar = remainingBalance >= hargaStandar ? hargaStandar : remainingBalance
        remainingBalance -= bisaDibayar
        
        // Tentukan status bayar
        let newStatusBayar = 'belum_bayar'
        if (bisaDibayar >= hargaStandar && hargaStandar > 0) {
          newStatusBayar = 'sudah_bayar'
        } else if (bisaDibayar > 0) {
          newStatusBayar = 'sebagian'
        }
        
        return {
          ...item,
          nominal_dibayar: bisaDibayar,
          status_bayar: newStatusBayar
        }
      })
      
      return updated
    })
  }

  const santriIdStr = String(santriId ?? '').trim()
  const validSantriId = /^\d{7}$/.test(santriIdStr)
  if (!validSantriId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="text-lg font-medium">Pembayaran</p>
          <p className="text-sm mt-2">Masukkan NIS (7 digit) untuk melihat data pembayaran</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memuat data pembayaran...</p>
        </div>
      </div>
    )
  }

  const handleCreateRegistrasi = async () => {
    if (!validSantriId) {
      showNotification('NIS harus 7 digit', 'error')
      return
    }

    setCreatingRegistrasi(true)
    try {
      const registrasiData = {
        id_santri: santriIdStr,
        tahun_hijriyah: tahunAjaran || null,
        tahun_masehi: tahunAjaranMasehi || null,
        id_admin: user?.id || user?.user_id || null
      }

      const result = await pendaftaranAPI.saveRegistrasi(registrasiData)

      if (result.success) {
        showNotification('Registrasi berhasil dibuat', 'success')
        // Refresh data registrasi
        await fetchRegistrasi()
      } else {
        const errorMessage = result.message || 'Gagal membuat registrasi'
        showNotification(errorMessage, 'error')
      }
    } catch (error) {
      console.error('Error creating registrasi:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Gagal membuat registrasi'
      showNotification(errorMessage, 'error')
    } finally {
      setCreatingRegistrasi(false)
    }
  }

  if (!registrasi) {
    // Tentukan pesan berdasarkan apakah ada filter tahun
    let message = 'Data registrasi tidak ditemukan'
    if (tahunAjaran || tahunAjaranMasehi) {
      const tahunParts = []
      if (tahunAjaran) {
        tahunParts.push(`tahun hijriyah ${tahunAjaran}`)
      }
      if (tahunAjaranMasehi) {
        tahunParts.push(`tahun masehi ${tahunAjaranMasehi}`)
      }
      message = `Atas Nama tersebut belum registrasi pendaftaran, di ${tahunParts.join(' / ')}.`
    }
    
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="text-lg font-medium">Pembayaran</p>
          <p className="text-sm mt-2">{message}</p>
          <button
            onClick={handleCreateRegistrasi}
            disabled={creatingRegistrasi}
            className={`mt-4 px-4 py-2 rounded-lg font-medium transition-colors ${
              creatingRegistrasi
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {creatingRegistrasi ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                Mendaftarkan...
              </span>
            ) : (
              'Daftarkan'
            )}
          </button>
        </div>
      </div>
    )
  }

  // Hitung wajib dari total harga semua item di registrasi detail
  const calculateWajib = () => {
    if (!registrasiDetail || registrasiDetail.length === 0) return 0
    return registrasiDetail.reduce((total, detail) => {
      const hargaStandar = parseFloat(detail.harga_standar || 0)
      return total + hargaStandar
    }, 0)
  }

  const wajib = calculateWajib()
  const bayar = parseInt(registrasi.bayar || 0)
  const kurang = wajib - bayar
  const isLunas = kurang <= 0

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Summary Wajib | expand detail kondisi | Bayar | Kurang */}
      <div className={`flex items-end justify-between gap-0.5 sm:gap-1 pb-2 flex-shrink-0 ${isAccordionOpen ? 'mb-4' : 'mb-1'}`}>
        <div className="text-center flex-1 min-w-0 flex flex-col">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm mb-1">Wajib</div>
          <div className="text-blue-600 dark:text-blue-400 font-semibold text-sm sm:text-base tabular-nums">Rp {wajib.toLocaleString('id-ID')}</div>
        </div>
        <div className="flex flex-col items-center justify-center flex-shrink-0 px-0.5 sm:px-1 pb-px">
          <button
            type="button"
            onClick={() => setIsAccordionOpen(!isAccordionOpen)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center transition-all duration-200"
            title={isAccordionOpen ? 'Tutup detail kondisi' : 'Tampilkan detail kondisi'}
            aria-expanded={isAccordionOpen}
            aria-label={isAccordionOpen ? 'Tutup detail kondisi' : 'Buka detail kondisi'}
          >
            <svg
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${isAccordionOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        <div className="text-center flex-1 min-w-0 flex flex-col">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm mb-1">Bayar</div>
          <div className="text-green-600 dark:text-green-400 font-semibold text-sm sm:text-base tabular-nums">Rp {bayar.toLocaleString('id-ID')}</div>
        </div>
        <div className="text-center flex-1 min-w-0 flex flex-col">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm mb-1">Kurang</div>
          <div className="text-red-600 dark:text-red-400 font-semibold text-sm sm:text-base tabular-nums">Rp {kurang.toLocaleString('id-ID')}</div>
        </div>
      </div>

      {/* Accordion Data Tambahan */}
      <AnimatePresence>
        {isAccordionOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden mb-4 flex-shrink-0"
          >
            <div className="space-y-2">
              {registrasi.admin && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Admin</span>
                  <span className="text-gray-700 dark:text-gray-300">{registrasi.admin}</span>
                </div>
              )}
              {registrasi.tahun_hijriyah && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Tahun Hijriyah</span>
                  <span className="text-gray-700 dark:text-gray-300">{registrasi.tahun_hijriyah}</span>
                </div>
              )}
              {registrasi.tahun_masehi && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Tahun Masehi</span>
                  <span className="text-gray-700 dark:text-gray-300">{registrasi.tahun_masehi}</span>
                </div>
              )}
              
              {/* Kondisi Field untuk Auto-Assign Items (dinamis dari DB) */}
              <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Kondisi untuk Auto-Assign Items:
                </div>
                <div className="space-y-1.5">
                  {kondisiDisplayFields.map((field) => {
                    const value = registrasi[field.field_name]
                    const filled = value != null && String(value).trim() !== ''
                    return (
                      <div key={field.field_name} className="flex justify-between items-center text-xs">
                        <span className="text-gray-500 dark:text-gray-400">{field.field_label}</span>
                        <span className={`font-medium ${
                          filled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500 italic'
                        }`}>
                          {filled ? value : 'Belum diisi'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Tombol Auto-Assign Items */}
              <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleAutoAssignItems}
                  disabled={autoAssigning}
                  className={`w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    autoAssigning
                      ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title="Isi item otomatis berdasarkan Daftar Item Set yang sesuai dengan kondisi registrasi"
                >
                  {autoAssigning ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Isi Item Otomatis</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List Detail Item */}
      {registrasi?.id && (
        <div className={`border-t flex-1 flex flex-col min-h-0 ${isAccordionOpen ? 'mt-4 pt-4' : 'mt-1 pt-2'}`}>
          <div className="flex justify-between items-center mb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Detail Item</h4>
              <button
                onClick={() => setIsAddItemOffcanvasOpen(true)}
                className="p-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center justify-center"
                title="Tambah Item"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* Tombol Bayar — izin fitur kelola pembayaran */}
              {pembayaranKelola ? (
                <button
                  type="button"
                  onClick={() => setIsOffcanvasOpen(true)}
                  className="px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span>Bayar</span>
                </button>
              ) : null}
              {/* Tombol Simpan */}
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={saving || !canSaveBulk()}
                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                  saving || !canSaveBulk()
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
                title={
                  saving
                    ? 'Menyimpan...'
                    : !hasChanges()
                      ? 'Tidak ada perubahan'
                      : !pembayaranKelola && hasNominalChanges()
                        ? 'Tidak ada izin mengubah alokasi nominal'
                        : 'Simpan'
                }
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              {/* Tombol Print */}
              <button
                onClick={() => {
                  if (validSantriId) {
                    setShowPrintOffcanvas(true)
                  } else {
                    showNotification('NIS harus 7 digit', 'error')
                  }
                }}
                disabled={!validSantriId}
                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                  !validSantriId
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
                title="Print kwitansi, biodata, atau rapor tes Madrasah Diniyah"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Sisa Pembayaran - hanya tampil jika ada detail */}
          {registrasiDetail.length > 0 && (
            <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex-shrink-0">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isAllPayableItemsChecked()}
                  disabled={calculateSisaPembayaran() <= 0 || !pembayaranKelola}
                  onChange={(e) => handleMasterCheckbox(e.target.checked)}
                  className={`w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 ${
                    calculateSisaPembayaran() <= 0 || !pembayaranKelola ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={
                    !pembayaranKelola
                      ? 'Tidak ada izin mengubah alokasi pembayaran'
                      : calculateSisaPembayaran() <= 0
                        ? 'Sisa pembayaran sudah habis'
                        : 'Centang semua item yang bisa dibayar'
                  }
                />
                <span className="text-gray-600 dark:text-gray-400 font-medium">Sisa Pembayaran:</span>
              </div>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                Rp {calculateSisaPembayaran().toLocaleString('id-ID')}
              </span>
            </div>
          </div>
          )}

          {registrasiDetail.length > 0 ? (
            <div className="space-y-2 flex-1 overflow-y-auto min-h-0 pb-24 sm:pb-2">
              {registrasiDetail.map((detail) => {
              // Validasi detail.id sebelum render
              if (!detail || !detail.id) {
                console.error('Detail tanpa ID ditemukan:', detail)
                return null
              }

              const hargaStandar = parseFloat(detail.harga_standar || 0)
              const nominalDibayar = parseFloat(detail.nominal_dibayar || 0)
              const statusBayar = detail.status_bayar || 'belum_bayar'
              const statusAmbil = detail.status_ambil || 'belum_ambil'
              
              // Hitung sisa pembayaran untuk item ini
              const totalBayar = parseFloat(registrasi?.bayar || 0)
              const totalDibayarKeItemLain = registrasiDetail.reduce((sum, item) => {
                if (item.id !== detail.id) {
                  return sum + parseFloat(item.nominal_dibayar || 0)
                }
                return sum
              }, 0)
              const sisaPembayaran = totalBayar - totalDibayarKeItemLain
              
              // Checkbox checked state: checked jika nominal_dibayar > 0
              const isPaymentChecked = nominalDibayar > 0
              const isPaymentDisabled =
                !pembayaranKelola || (sisaPembayaran <= 0 && nominalDibayar === 0)
              const isStatusAmbilChecked = statusAmbil === 'sudah_ambil'
              
              // Tentukan warna status dan text - hanya tampilkan jika status "sebagian" (kurang)
              let statusColor = 'text-yellow-600 dark:text-yellow-400'
              let statusText = null
              if (statusBayar === 'sebagian') {
                const kurang = hargaStandar - nominalDibayar
                statusText = `Kurang ${kurang.toLocaleString('id-ID')}`
              }
              // Jika sudah_bayar atau belum_bayar, statusText tetap null (tidak ditampilkan)
              
              // Warna untuk "Dibayar" - kuning jika sebagian
              const dibayarColor = statusBayar === 'sebagian' 
                ? 'text-yellow-600 dark:text-yellow-400' 
                : statusBayar === 'sudah_bayar'
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-600 dark:text-gray-400'

              return (
                <div 
                  key={detail.id} 
                  className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs"
                >
                  <div className="flex justify-between items-start gap-4">
                    {/* Kiri: Checkbox, Nama [ID] dan Status Ambil */}
                    <div className="flex items-start gap-2 flex-1">
                      {/* Checkbox untuk pembayaran dan status ambil */}
                      <div className="flex flex-col gap-2 pt-1">
                        <input
                          type="checkbox"
                          checked={isPaymentChecked}
                          disabled={isPaymentDisabled}
                          onChange={(e) => {
                            console.log('Payment checkbox clicked, detail:', detail)
                            if (!detail || !detail.id) {
                              console.error('Detail tidak valid saat checkbox diklik:', detail)
                              showNotification('Data detail tidak valid', 'error')
                              return
                            }
                            handlePaymentCheckbox(detail, e.target.checked)
                          }}
                          className={`w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 ${
                            isPaymentDisabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title={
                            !pembayaranKelola
                              ? 'Tidak ada izin mengubah alokasi pembayaran'
                              : isPaymentDisabled
                                ? 'Sisa pembayaran sudah habis'
                                : 'Centang untuk membayar item ini'
                          }
                        />
                        <input
                          type="checkbox"
                          checked={isStatusAmbilChecked}
                          onChange={(e) => {
                            console.log('Status ambil checkbox clicked, detail:', detail)
                            if (!detail || !detail.id) {
                              console.error('Detail tidak valid saat checkbox diklik:', detail)
                              showNotification('Data detail tidak valid', 'error')
                              return
                            }
                            handleStatusAmbilCheckbox(detail, e.target.checked)
                          }}
                          className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                          title="Centang jika sudah diambil"
                        />
                      </div>
                      
                      <div className="flex-1">
                        <div className="font-medium text-gray-700 dark:text-gray-300 mb-2 text-xs">
                          {detail.nama_item || detail.id_item} [{detail.id_item}]
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className={`font-medium ${
                            statusAmbil === 'sudah_ambil' 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {statusAmbil === 'sudah_ambil' ? 'Sudah Ambil' : 'Belum Ambil'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Kanan: Harga, Dibayar, dan Status Bayar */}
                    <div className="text-right space-y-1 text-[10px]">
                      <div className="text-gray-600 dark:text-gray-400 flex items-center justify-end gap-1">
                        <span className="text-gray-500 dark:text-gray-500">Harga:</span>
                        <span className="ml-1 font-medium">Rp {hargaStandar.toLocaleString('id-ID')}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteItem(detail)
                          }}
                          className="ml-1 p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                          title="Hapus item"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <div className={dibayarColor}>
                        <span className="text-gray-500 dark:text-gray-500">Dibayar:</span>
                        <span className="ml-1 font-medium">Rp {nominalDibayar.toLocaleString('id-ID')}</span>
                      </div>
                      {statusText && (
                        <div className={`font-semibold ${statusColor} mt-1`}>
                          {statusText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
              })}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="text-gray-500 dark:text-gray-400 text-center text-sm">
                Belum ada item. Klik tombol "Tambah" untuk menambahkan item.
              </p>
            </div>
          )}
        </div>
      )}

      {loadingDetail && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-center py-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600"></div>
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">Memuat detail...</span>
          </div>
        </div>
      )}

      {/* Offcanvas Pembayaran */}
      {registrasi?.id && (
        <PembayaranOffcanvas
          isOpen={isOffcanvasOpen}
          onClose={() => setIsOffcanvasOpen(false)}
          idRegistrasi={registrasi.id}
          wajib={wajib}
          bayar={bayar}
          kurang={kurang}
          onPaymentSuccess={handlePaymentSuccess}
          buktiPembayaranList={buktiPembayaranList}
          onPreviewBukti={(bukti) => setPreviewFile(bukti)}
          onUploadBuktiSuccess={fetchBuktiPembayaran}
          canKelolaPembayaran={pembayaranKelola}
        />
      )}

      {/* Offcanvas Tambah Item */}
      {registrasi?.id && (
        <AddItemOffcanvas
          isOpen={isAddItemOffcanvasOpen}
          onClose={() => setIsAddItemOffcanvasOpen(false)}
          idRegistrasi={registrasi.id}
          registrasiDetail={registrasiDetail}
          onItemAdded={handleItemAdded}
        />
      )}

      {/* Print Offcanvas */}
      <PendaftaranPrintOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => setShowPrintOffcanvas(false)}
        santriId={santriId}
      />

      {/* File Preview Offcanvas */}
      {previewFile && (
        <FilePreviewOffcanvas
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={async (idBerkas, namaFile) => {
            try {
              const blob = await pendaftaranAPI.downloadBerkas(idBerkas)
              return blob
            } catch (error) {
              console.error('Error loading file for preview:', error)
              showNotification('Gagal memuat preview file', 'error')
              throw error
            }
          }}
        />
      )}

      {/* Delete Item Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowDeleteModal(false)
                setDeleteItemId(null)
                setDeleteItemName('')
              }}
              className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 flex items-center justify-center p-4 z-[9999]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-center mb-4">
                    <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
                      <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
                    Konfirmasi Hapus Item
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    Anda yakin ingin menghapus item{' '}
                    <strong className="text-red-600 dark:text-red-400">{deleteItemName}</strong>?
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-2">
                    Tindakan ini tidak dapat dibatalkan.
                  </p>
                </div>

                {/* Buttons */}
                <div className="p-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteModal(false)
                      setDeleteItemId(null)
                      setDeleteItemName('')
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Hapus
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default PembayaranBox

