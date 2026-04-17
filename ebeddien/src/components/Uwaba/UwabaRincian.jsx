import { useState, useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { uwabaAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { useNotification } from '../../contexts/NotificationContext'
import { 
  bulanHijriyah, 
  mapBulanToArrayIndex, 
  mapArrayIndexToBulan,
  calculateWajibFromBiodata,
  formatKeteranganPembayaran,
  compareBiodata
} from '../../utils/uwabaCalculator'
import UwabaEditModal from './UwabaEditModal'
import UnifiedPaymentOffcanvas from '../Payment/UnifiedPaymentOffcanvas'
import UwabaPrintOffcanvas from './UwabaPrintOffcanvas'

function UwabaRincian({ santriId, biodata, prices }) {
  const { tahunAjaran } = useTahunAjaranStore()
  const { showNotification } = useNotification()
  
  // State untuk data bulan (10 bulan)
  const [bulanData, setBulanData] = useState(() => {
    // Initialize dengan 10 bulan
    return Array.from({ length: 10 }, (_, i) => ({
      index: i,
      idBulan: mapArrayIndexToBulan(i),
      namaBulan: bulanHijriyah[i],
      wajib: 0,
      nominal: 0,
      keterangan: 'Belum',
      isDisabled: false, // lock checkbox
      samaSebelumnya: true, // checkbox "sama dengan biodata"
      jsonData: null // Data JSON dari server
    }))
  })
  
  const [summary, setSummary] = useState({
    totalWajib: 0,
    totalBayar: 0,
    kurang: 0
  })
  
  const [loading, setLoading] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [showPaymentOffcanvas, setShowPaymentOffcanvas] = useState(false)
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [masterCheckbox, setMasterCheckbox] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingBulanIndex, setEditingBulanIndex] = useState(null)
  const masterCheckboxRef = useRef(null)
  
  // State untuk menyimpan data awal (untuk tracking perubahan)
  const [originalBulanData, setOriginalBulanData] = useState(null)
  const [originalTotalBayar, setOriginalTotalBayar] = useState(0)
  
  // Hitung wajib dari biodata
  const wajibFromBiodata = useMemo(() => {
    if (!biodata || !prices) return 0
    return calculateWajibFromBiodata(biodata, prices)
  }, [
    biodata?.status_santri,
    biodata?.kategori,
    biodata?.diniyah,
    biodata?.formal,
    biodata?.lembaga_id_diniyah,
    biodata?.lembaga_id_formal,
    biodata?.lttq,
    biodata?.saudara,
    biodata?.saudara_di_pesantren, // Juga deteksi perubahan saudara_di_pesantren
    prices
  ])
  
  // Update wajib untuk bulan yang "sama dengan biodata" ketika biodata berubah
  useEffect(() => {
    // Skip jika belum ada biodata atau prices
    if (!biodata || !prices) return
    
    // Update bulan-bulan yang memiliki checkbox "sama dengan biodata" aktif
    setBulanData(prevBulanData => {
      // Cek apakah ada bulan yang perlu diupdate
      const hasChanges = prevBulanData.some(bulan => 
        !bulan.isDisabled && bulan.samaSebelumnya && bulan.wajib !== wajibFromBiodata
      )
      
      // Jika tidak ada perubahan, return state yang sama untuk menghindari re-render
      if (!hasChanges) return prevBulanData
      
      // Update bulan-bulan yang samaSebelumnya dan tidak disabled
      return prevBulanData.map(bulan => {
        if (!bulan.isDisabled && bulan.samaSebelumnya) {
          return {
            ...bulan,
            wajib: wajibFromBiodata,
            keterangan: formatKeteranganPembayaran(wajibFromBiodata, bulan.nominal)
          }
        }
        return bulan
      })
    })
  }, [
    wajibFromBiodata, 
    biodata?.status_santri, 
    biodata?.kategori, 
    biodata?.diniyah, 
    biodata?.formal, 
    biodata?.lembaga_id_diniyah,
    biodata?.lembaga_id_formal,
    biodata?.lttq, 
    biodata?.saudara,
    biodata?.saudara_di_pesantren, // Juga deteksi perubahan saudara_di_pesantren
    prices
  ])
  
  // Update master checkbox status berdasarkan checkbox bulan
  useEffect(() => {
    const activeBulan = bulanData.filter(b => !b.isDisabled)
    if (activeBulan.length === 0) {
      setMasterCheckbox(false)
      if (masterCheckboxRef.current) {
        masterCheckboxRef.current.indeterminate = false
      }
      return
    }
    
    const checkedCount = activeBulan.filter(b => b.samaSebelumnya).length
    if (checkedCount === 0) {
      setMasterCheckbox(false)
      if (masterCheckboxRef.current) {
        masterCheckboxRef.current.indeterminate = true // Sebagian dicentang
      }
    } else if (checkedCount === activeBulan.length) {
      setMasterCheckbox(true)
      if (masterCheckboxRef.current) {
        masterCheckboxRef.current.indeterminate = false
      }
    } else {
      setMasterCheckbox(false)
      if (masterCheckboxRef.current) {
        masterCheckboxRef.current.indeterminate = true // Sebagian dicentang
      }
    }
  }, [bulanData])
  
  // Handle master checkbox change
  const handleMasterCheckboxChange = (checked) => {
    const newBulanData = bulanData.map(bulan => {
      if (bulan.isDisabled) return bulan // Skip bulan yang di-lock
      
      return {
        ...bulan,
        samaSebelumnya: checked,
        wajib: checked ? wajibFromBiodata : (bulan.jsonData?.total_wajib || bulan.wajib)
      }
    })
    
    // Update keterangan
    newBulanData.forEach(bulan => {
      if (!bulan.isDisabled) {
        bulan.keterangan = formatKeteranganPembayaran(bulan.wajib, bulan.nominal)
      }
    })
    
    setBulanData(newBulanData)
  }
  
  // Load data dari server
  useEffect(() => {
    if (!santriId || !/^\d{7}$/.test(santriId)) {
      // Reset data jika ID tidak valid
      setBulanData(Array.from({ length: 10 }, (_, i) => ({
        index: i,
        idBulan: mapArrayIndexToBulan(i),
        namaBulan: bulanHijriyah[i],
        wajib: 0,
        nominal: 0,
        keterangan: 'Belum',
        isDisabled: false,
        samaSebelumnya: true,
        jsonData: null
      })))
      setSummary({ totalWajib: 0, totalBayar: 0, kurang: 0 })
      setPaymentHistory([])
      return
    }
    
    loadUwabaData()
  }, [santriId, tahunAjaran])
  
  const loadUwabaData = async () => {
    if (!santriId || !/^\d{7}$/.test(santriId)) return
    
    setLoading(true)
    try {
      // Load data UWABA dan payment history secara parallel
      const [uwabaResult, historyResult] = await Promise.all([
        uwabaAPI.getData(santriId, tahunAjaran),
        uwabaAPI.getPaymentHistory(santriId, tahunAjaran)
      ])
      
      // Initialize array baru dengan 10 bulan default
      const newBulanData = Array.from({ length: 10 }, (_, i) => ({
        index: i,
        idBulan: mapArrayIndexToBulan(i),
        namaBulan: bulanHijriyah[i],
        wajib: 0,
        nominal: 0,
        keterangan: 'Belum',
        isDisabled: false,
        samaSebelumnya: true,
        jsonData: null
      }))
      
      if (uwabaResult.success && uwabaResult.data) {
        // Update bulan data dari server
        uwabaResult.data.forEach(item => {
          const arrayIndex = mapBulanToArrayIndex(item.id_bulan)
          if (arrayIndex === null || arrayIndex < 0 || arrayIndex >= 10) return
          
          // Parse JSON data jika ada
          let jsonData = null
          if (item.json_data) {
            try {
              jsonData = typeof item.json_data === 'string' 
                ? JSON.parse(item.json_data) 
                : item.json_data
            } catch (e) {
              console.error('Error parsing JSON data:', e)
            }
          }
          
          // Ambil wajib: prioritas dari jsonData.total_wajib, fallback ke item.wajib
          let wajibValue = 0
          if (jsonData && jsonData.total_wajib !== undefined) {
            wajibValue = parseInt(jsonData.total_wajib) || 0
          } else {
            wajibValue = parseInt(item.wajib) || 0
          }
          
          const nominalValue = parseInt(item.nominal) || 0
          
          // Bandingkan biodata dari JSON dengan biodata saat ini
          const isSamaSebelumnya = jsonData && biodata 
            ? compareBiodata(biodata, jsonData)
            : true
          
          // Set is_disabled: 1 = disabled (dikunci), 0 = enabled
          const isDisabled = item.is_disabled == 1 || item.is_disabled === 1 || item.is_disabled === true
          
          newBulanData[arrayIndex] = {
            index: arrayIndex,
            idBulan: mapArrayIndexToBulan(arrayIndex),
            namaBulan: bulanHijriyah[arrayIndex],
            wajib: wajibValue,
            nominal: nominalValue,
            keterangan: formatKeteranganPembayaran(wajibValue, nominalValue),
            isDisabled: isDisabled,
            samaSebelumnya: isSamaSebelumnya,
            jsonData: jsonData || {
              status_santri: biodata?.status_santri || '',
              kategori: biodata?.kategori || '',
              diniyah: biodata?.diniyah || '',
              formal: biodata?.formal || '',
              lttq: biodata?.lttq || '',
              saudara: biodata?.saudara || '',
              total_wajib: wajibValue
            }
          }
        })
      }
      
      // Update payment history
      if (historyResult.success && historyResult.data) {
        setPaymentHistory(historyResult.data)
        
        // Hitung total bayar dari history
        const totalBayar = historyResult.data.reduce((sum, payment) => {
          return sum + (parseInt(payment.nominal) || 0)
        }, 0)
        
        // Distribusikan pembayaran ke bulan-bulan menggunakan newBulanData
        const bulanDataWithPayment = distributePaymentToBulanData(newBulanData, totalBayar)
        
        // Set bulanData setelah distribusi
        setBulanData(bulanDataWithPayment)
        
        // Update summary setelah bulanData di-set
        const totalWajib = bulanDataWithPayment
          .filter(bulan => !bulan.isDisabled)
          .reduce((sum, bulan) => sum + bulan.wajib, 0)
        
        const kurang = Math.max(totalWajib - totalBayar, 0)
        
        setSummary({
          totalWajib,
          totalBayar,
          kurang
        })
        
        // Simpan data awal setelah load
        setOriginalBulanData(JSON.parse(JSON.stringify(bulanDataWithPayment)))
        setOriginalTotalBayar(totalBayar)
      } else {
        // Jika tidak ada payment history, set bulanData langsung
        setBulanData(newBulanData)
        
        // Update summary
        const totalWajib = newBulanData
          .filter(bulan => !bulan.isDisabled)
          .reduce((sum, bulan) => sum + bulan.wajib, 0)
        
        setSummary({
          totalWajib,
          totalBayar: 0,
          kurang: totalWajib
        })
        
        // Simpan data awal setelah load
        setOriginalBulanData(JSON.parse(JSON.stringify(newBulanData)))
        setOriginalTotalBayar(0)
      }
    } catch (error) {
      console.error('Error loading UWABA data:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Update summary
  const updateSummary = (totalBayar = null) => {
    // Hitung total wajib dari bulan yang tidak disabled
    const totalWajib = bulanData
      .filter(bulan => !bulan.isDisabled)
      .reduce((sum, bulan) => sum + bulan.wajib, 0)
    
    // Gunakan totalBayar dari parameter atau dari state
    const bayar = totalBayar !== null ? totalBayar : summary.totalBayar
    
    const kurang = Math.max(totalWajib - bayar, 0)
    
    setSummary({
      totalWajib,
      totalBayar: bayar,
      kurang
    })
  }
  
  // Update summary ketika bulanData berubah
  useEffect(() => {
    if (paymentHistory.length > 0) {
      const totalBayar = paymentHistory.reduce((sum, payment) => {
        return sum + (parseInt(payment.nominal) || 0)
      }, 0)
      updateSummary(totalBayar)
    } else {
      updateSummary(0)
    }
  }, [bulanData])
  
  // Check apakah ada perubahan (harus sebelum conditional return)
  const hasChanges = useMemo(() => {
    if (!originalBulanData) return false
    
    // Check perubahan di totalBayar
    if (summary.totalBayar !== originalTotalBayar) {
      return true
    }
    
    // Check perubahan di bulanData
    for (let i = 0; i < bulanData.length; i++) {
      const current = bulanData[i]
      const original = originalBulanData[i]
      
      if (!original) return true
      
      // Bandingkan wajib, nominal, isDisabled, samaSebelumnya
      if (current.wajib !== original.wajib ||
          current.nominal !== original.nominal ||
          current.isDisabled !== original.isDisabled ||
          current.samaSebelumnya !== original.samaSebelumnya) {
        return true
      }
    }
    
    return false
  }, [bulanData, summary.totalBayar, originalBulanData, originalTotalBayar])
  
  // Distribusi pembayaran otomatis dari atas ke bawah (menggunakan bulanData yang diberikan)
  const distributePaymentToBulanData = (bulanDataArray, totalPembayaran) => {
    if (totalPembayaran <= 0) {
      // Reset semua nominal jika tidak ada pembayaran
      return bulanDataArray.map(bulan => {
        if (bulan.isDisabled) return bulan
        return {
          ...bulan,
          nominal: 0,
          keterangan: formatKeteranganPembayaran(bulan.wajib, 0)
        }
      })
    }
    
    const newBulanData = [...bulanDataArray]
    let sisaPembayaran = totalPembayaran
    
    // Loop bulan dari atas ke bawah (index 0-9), skip yang disabled
    for (let i = 0; i < 10; i++) {
      if (newBulanData[i].isDisabled) {
        // Reset nominal untuk bulan yang disabled
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: 0,
          keterangan: 'Dikunci'
        }
        continue
      }
      
      const wajib = newBulanData[i].wajib
      if (wajib <= 0) {
        // Reset nominal jika tidak ada wajib
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: 0,
          keterangan: formatKeteranganPembayaran(0, 0)
        }
        continue
      }
      
      if (sisaPembayaran >= wajib) {
        // Jika sisa pembayaran cukup untuk lunasi bulan ini
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: wajib,
          keterangan: 'Lunas'
        }
        sisaPembayaran -= wajib
      } else if (sisaPembayaran > 0) {
        // Jika sisa pembayaran tidak cukup untuk lunasi penuh, tapi masih ada sisa
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: sisaPembayaran,
          keterangan: formatKeteranganPembayaran(wajib, sisaPembayaran)
        }
        sisaPembayaran = 0
      } else {
        // Jika sudah tidak ada sisa pembayaran
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: 0,
          keterangan: formatKeteranganPembayaran(wajib, 0)
        }
      }
    }
    
    return newBulanData
  }
  
  // Distribusi pembayaran otomatis dari atas ke bawah (menggunakan state bulanData)
  const distributePayment = (totalPembayaran) => {
    if (totalPembayaran <= 0) {
      // Reset semua nominal jika tidak ada pembayaran
      const newBulanData = bulanData.map(bulan => {
        if (bulan.isDisabled) return bulan
        return {
          ...bulan,
          nominal: 0,
          keterangan: formatKeteranganPembayaran(bulan.wajib, 0)
        }
      })
      setBulanData(newBulanData)
      return
    }
    
    const newBulanData = [...bulanData]
    let sisaPembayaran = totalPembayaran
    
    // Loop bulan dari atas ke bawah (index 0-9), skip yang disabled
    for (let i = 0; i < 10; i++) {
      if (newBulanData[i].isDisabled) {
        // Reset nominal untuk bulan yang disabled
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: 0,
          keterangan: 'Dikunci'
        }
        continue
      }
      
      const wajib = newBulanData[i].wajib
      if (wajib <= 0) {
        // Reset nominal jika tidak ada wajib
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: 0,
          keterangan: formatKeteranganPembayaran(0, 0)
        }
        continue
      }
      
      if (sisaPembayaran >= wajib) {
        // Lunas
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: wajib,
          keterangan: 'Lunas'
        }
        sisaPembayaran -= wajib
      } else if (sisaPembayaran > 0) {
        // Sebagian
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: sisaPembayaran,
          keterangan: formatKeteranganPembayaran(wajib, sisaPembayaran)
        }
        sisaPembayaran = 0
        // Set nominal bulan berikutnya menjadi 0
        for (let j = i + 1; j < 10; j++) {
          if (!newBulanData[j].isDisabled) {
            newBulanData[j] = {
              ...newBulanData[j],
              nominal: 0,
              keterangan: formatKeteranganPembayaran(newBulanData[j].wajib, 0)
            }
          }
        }
        break // Tidak ada sisa lagi
      } else {
        // Tidak ada pembayaran untuk bulan ini
        newBulanData[i] = {
          ...newBulanData[i],
          nominal: 0,
          keterangan: formatKeteranganPembayaran(wajib, 0)
        }
      }
    }
    
    setBulanData(newBulanData)
  }
  
  // Handle payment success - refresh data dan distribusi
  const handlePaymentSuccess = async () => {
    // Reload payment history
    if (santriId && /^\d{7}$/.test(santriId)) {
      try {
        const historyResult = await uwabaAPI.getPaymentHistory(santriId, tahunAjaran)
        if (historyResult.success && historyResult.data) {
          setPaymentHistory(historyResult.data)
          
          // Hitung total bayar dari history
          const totalBayar = historyResult.data.reduce((sum, payment) => {
            return sum + (parseInt(payment.nominal) || 0)
          }, 0)
          
          // Distribusikan pembayaran
          distributePayment(totalBayar)
          
          // Update summary
          updateSummary(totalBayar)
          
          // Update original data setelah payment berubah
          setOriginalTotalBayar(totalBayar)
          // Reload full data untuk update originalBulanData
          await loadUwabaData()
        }
      } catch (error) {
        console.error('Error refreshing payment data:', error)
      }
    }
  }
  
  // Handle refresh distribusi
  const handleRefresh = () => {
    // Distribusikan ulang berdasarkan total bayar saat ini
    distributePayment(summary.totalBayar)
  }
  
  // Handle save data ke server
  const handleSave = async () => {
    if (!santriId || !/^\d{7}$/.test(santriId)) {
      showNotification('NIS tidak valid', 'error')
      return
    }
    
    setLoading(true)
    try {
      // Kumpulkan data dari semua 10 bulan
      const bulanDataArray = []
      
      for (let i = 0; i < 10; i++) {
        const bulan = bulanData[i]
        const idBulan = mapArrayIndexToBulan(i)
        
        if (idBulan === null) continue
        
        // Siapkan JSON data dengan detail harga
        const jsonData = bulan.jsonData || {
          status_santri: biodata?.status_santri || '',
          kategori: biodata?.kategori || '',
          diniyah: biodata?.diniyah || '',
          formal: biodata?.formal || '',
          lttq: biodata?.lttq || '',
          saudara_di_pesantren: biodata?.saudara || '',
          harga_dasar: 0,
          harga_diniyah: 0,
          harga_formal: 0,
          harga_lttq: 0,
          diskon_saudara: 0,
          diskon_saudara_type: '',
          total_wajib: bulan.wajib,
          timestamp: Date.now()
        }
        
        bulanDataArray.push({
          index: i,
          wajib: bulan.wajib > 0 ? `Rp ${bulan.wajib.toLocaleString('id-ID')}` : '-',
          nominal: bulan.nominal > 0 ? `Rp ${bulan.nominal.toLocaleString('id-ID')}` : '-',
          keterangan: bulan.keterangan,
          is_disabled: bulan.isDisabled ? 1 : 0,
          sama_sebelumnya: bulan.samaSebelumnya,
          json: jsonData
        })
      }
      
      const saveData = {
        id_santri: santriId,
        tahun_ajaran: tahunAjaran,
        bulan_data: bulanDataArray
      }
      
      const result = await uwabaAPI.saveRefresh(saveData)
      
      if (result.success) {
        showNotification('Data UWABA berhasil disimpan!', 'success')
        // Update data awal setelah save berhasil
        setOriginalBulanData(JSON.parse(JSON.stringify(bulanData)))
        setOriginalTotalBayar(summary.totalBayar)
      } else {
        showNotification('Gagal menyimpan data: ' + (result.message || 'Unknown error'), 'error')
      }
    } catch (error) {
      console.error('Error saving UWABA data:', error)
      showNotification('Error menyimpan data: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }
  
  // Handle checkbox "sama dengan biodata"
  const handleSamaSebelumnyaChange = (index, checked) => {
    const newBulanData = [...bulanData]
    
    if (checked) {
      // Jika dicentang, gunakan wajib dari biodata
      newBulanData[index] = {
        ...newBulanData[index],
        samaSebelumnya: true,
        wajib: wajibFromBiodata
      }
    } else {
      // Jika tidak dicentang, gunakan wajib dari JSON data (jika ada)
      const savedWajib = newBulanData[index].jsonData?.total_wajib || newBulanData[index].wajib
      newBulanData[index] = {
        ...newBulanData[index],
        samaSebelumnya: false,
        wajib: savedWajib
      }
    }
    
    // Update keterangan
    newBulanData[index].keterangan = formatKeteranganPembayaran(
      newBulanData[index].wajib,
      newBulanData[index].nominal
    )
    
    setBulanData(newBulanData)
  }
  
  // Handle save dari modal edit
  const handleEditSave = (index, data) => {
    const newBulanData = [...bulanData]
    newBulanData[index] = {
      ...newBulanData[index],
      wajib: data.wajib,
      jsonData: data.jsonData,
      samaSebelumnya: data.samaSebelumnya,
      keterangan: formatKeteranganPembayaran(data.wajib, newBulanData[index].nominal)
    }
    setBulanData(newBulanData)
  }
  
  // Handle checkbox lock
  const handleLockChange = (index, checked) => {
    const newBulanData = [...bulanData]
    
    if (checked) {
      // Jika dikunci, set wajib dan nominal menjadi 0
      newBulanData[index] = {
        ...newBulanData[index],
        isDisabled: true,
        wajib: 0,
        nominal: 0,
        keterangan: 'Dikunci'
      }
    } else {
      // Jika tidak dikunci, kembalikan wajib sesuai checkbox status
      const wajib = newBulanData[index].samaSebelumnya 
        ? wajibFromBiodata 
        : (newBulanData[index].jsonData?.total_wajib || 0)
      
      newBulanData[index] = {
        ...newBulanData[index],
        isDisabled: false,
        wajib: wajib,
        nominal: 0,
        keterangan: formatKeteranganPembayaran(wajib, 0)
      }
    }
    
    setBulanData(newBulanData)
  }
  
  if (!santriId || !/^\d{7}$/.test(santriId)) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-center py-8">
        <p>Masukkan NIS yang valid untuk melihat rincian UWABA.</p>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Memuat data UWABA...</span>
      </div>
    )
  }
  
  return (
    <div className="h-full flex flex-col" style={{ height: '100%', maxHeight: '100%', overflow: 'hidden' }}>
      {/* Summary */}
      <div className="flex justify-between items-start mb-4 pb-2 border-b flex-shrink-0">
        <div className="text-center flex-1 flex flex-col">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm mb-1">Wajib</div>
          <div className="text-blue-600 font-semibold text-sm sm:text-base">Rp {summary.totalWajib.toLocaleString('id-ID')}</div>
        </div>
        <div className="text-center flex-1 flex flex-col">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm mb-1">Bayar</div>
          <div className="text-green-600 font-semibold text-sm sm:text-base">Rp {summary.totalBayar.toLocaleString('id-ID')}</div>
        </div>
        <div className="text-center flex-1 flex flex-col">
          <div className="text-gray-600 dark:text-gray-400 font-medium text-xs sm:text-sm mb-1">Kurang</div>
          <div className="text-red-600 font-semibold text-sm sm:text-base">Rp {summary.kurang.toLocaleString('id-ID')}</div>
        </div>
      </div>
      
      {/* Wajib Perbulan dengan Master Checkbox dan Buttons */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          {wajibFromBiodata > 0 ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                type="checkbox"
                ref={masterCheckboxRef}
                checked={masterCheckbox}
                onChange={(e) => handleMasterCheckboxChange(e.target.checked)}
                className="w-5 h-5 sm:w-4 sm:h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 flex-shrink-0"
              />
              <span className="font-semibold text-sm sm:text-xs text-blue-700 dark:text-blue-300 whitespace-nowrap">
                Rp {wajibFromBiodata.toLocaleString('id-ID')}
              </span>
            </div>
          ) : (
            <div className="flex-1"></div>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPaymentOffcanvas(true)}
              className="px-2 sm:px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-lg text-xs sm:text-sm font-bold hover:from-teal-700 hover:to-teal-800 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
              </svg>
              Bayar
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="p-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              title="Save"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                </svg>
              )}
            </button>
            <button 
              onClick={() => {
                if (santriId && /^\d{7}$/.test(santriId)) {
                  setShowPrintOffcanvas(true)
                }
              }}
              disabled={!santriId || !/^\d{7}$/.test(santriId) || hasChanges}
              className="p-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title={hasChanges ? "Simpan perubahan terlebih dahulu" : "Print"}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* List Bulan */}
      <div 
        className="flex-1" 
        style={{ 
          minHeight: 0, 
          height: 0, 
          overflowY: 'auto', 
          overflowX: 'hidden',
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 #f1f5f9'
        }}
      >
        <style>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
          .dark div::-webkit-scrollbar-track {
            background: #1f2937;
          }
          .dark div::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
          .dark div::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
        `}</style>
        <ul className="space-y-3">
          {bulanData.map((bulan) => (
            <motion.li
              key={bulan.index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 relative border-2 ${
                bulan.isDisabled 
                  ? 'border-red-200 dark:border-red-800 opacity-70' 
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              } transition-all duration-200`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={bulan.isDisabled}
                    onChange={(e) => handleLockChange(bulan.index, e.target.checked)}
                    className="w-5 h-5 text-red-600 bg-white border-2 border-gray-300 rounded focus:ring-2 focus:ring-red-500"
                    title="Kunci bulan ini"
                  />
                  <span
                    className={`text-sm font-bold capitalize tracking-wide ${
                      bulan.isDisabled
                        ? 'text-red-500 dark:text-red-400 line-through'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {bulan.namaBulan}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block font-mono text-gray-800 dark:text-gray-200 text-base font-semibold">
                    {bulan.nominal > 0 
                      ? `Rp ${bulan.nominal.toLocaleString('id-ID')}` 
                      : '-'}
                  </span>
                </div>
              </div>
              
              {!bulan.isDisabled && (
                <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={bulan.samaSebelumnya}
                      onChange={(e) => handleSamaSebelumnyaChange(bulan.index, e.target.checked)}
                      className="w-5 h-5 text-blue-600 bg-white border-2 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      title="Sama dengan biodata"
                    />
                    <span className="wajib-uwaba-label font-semibold text-gray-800 dark:text-gray-200">
                      {bulan.wajib > 0 
                        ? `Rp ${bulan.wajib.toLocaleString('id-ID')}` 
                        : '-'}
                    </span>
                    <button
                      disabled={bulan.samaSebelumnya}
                      onClick={() => {
                        if (!bulan.samaSebelumnya) {
                          setEditingBulanIndex(bulan.index)
                          setShowEditModal(true)
                        }
                      }}
                      className="p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Edit bulan ini"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                  <span className="keterangan-uwaba-label text-gray-700 dark:text-gray-300 font-medium">
                    {bulan.keterangan}
                  </span>
                </div>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
      
      {/* Edit Modal */}
      <UwabaEditModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingBulanIndex(null)
        }}
        bulanIndex={editingBulanIndex}
        bulanData={editingBulanIndex !== null ? bulanData[editingBulanIndex] : null}
        santriId={santriId}
        prices={prices}
        onSave={handleEditSave}
      />
      
      {/* Payment Offcanvas */}
      <UnifiedPaymentOffcanvas
        isOpen={showPaymentOffcanvas}
        onClose={() => setShowPaymentOffcanvas(false)}
        mode="uwaba"
        santriId={santriId}
        totalWajib={summary.totalWajib}
        totalBayar={summary.totalBayar}
        kurang={summary.kurang}
        onPaymentSuccess={handlePaymentSuccess}
      />
      
      {/* Print Offcanvas */}
      <UwabaPrintOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => setShowPrintOffcanvas(false)}
        santriId={santriId}
      />
    </div>
  )
}

export default UwabaRincian

