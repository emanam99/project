import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { uwabaAPI, pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useAuthStore } from '../../../store/authStore'
import { calculateWajibFromBiodata } from '../../../utils/uwabaCalculator'

function LengkapiDataOffcanvas({ isOpen, onClose, selectedSantriList, uwabaPrices, tahunAjaran, onSuccess }) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSantri: null })
  const [formData, setFormData] = useState({
    status_santri: 'Mukim',
    kategori: '',
    id_daerah: '',
    id_kamar: '',
    lembaga_diniyah: '',
    kelas_diniyah: '',
    id_diniyah: '',
    tidak_sekolah_diniyah: false,
    lembaga_formal: '',
    kelas_formal: '',
    id_formal: '',
    tidak_sekolah_formal: false,
    diniyah: '',
    formal: '',
    lttq: '',
    saudara_di_pesantren: 'Tidak Ada',
    wajib: 0,
    keterangan: '',
    is_disabled: 0,
    sama: 1
  })
  const [calculatedWajib, setCalculatedWajib] = useState(0)
  const [kategoriOptions, setKategoriOptions] = useState([])
  const [daerahOptions, setDaerahOptions] = useState([])
  const [kamarOptions, setKamarOptions] = useState([])
  const [lembagaDiniyahOptions, setLembagaDiniyahOptions] = useState([])
  const [lembagaFormalOptions, setLembagaFormalOptions] = useState([])
  const [kelasDiniyahOptions, setKelasDiniyahOptions] = useState([])
  const [kelasFormalOptions, setKelasFormalOptions] = useState([])
  const [kelDiniyahOptions, setKelDiniyahOptions] = useState([])
  const [kelFormalOptions, setKelFormalOptions] = useState([])

  // Load options dari API (sama seperti page pendaftaran)
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      try {
        const [kategoriRes, lembagaDRes, lembagaFRes] = await Promise.all([
          pendaftaranAPI.getKategoriOptions(),
          pendaftaranAPI.getLembagaOptions('Diniyah'),
          pendaftaranAPI.getLembagaOptions('Formal')
        ])
        if (cancelled) return
        if (kategoriRes?.success && Array.isArray(kategoriRes.data)) setKategoriOptions(kategoriRes.data)
        if (lembagaDRes?.success && Array.isArray(lembagaDRes.data)) setLembagaDiniyahOptions(lembagaDRes.data)
        if (lembagaFRes?.success && Array.isArray(lembagaFRes.data)) setLembagaFormalOptions(lembagaFRes.data)
      } catch (e) {
        if (!cancelled) console.error('Load options:', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !formData.kategori) {
      setDaerahOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getDaerahOptions(formData.kategori).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setDaerahOptions(res.data)
      else if (!cancelled) setDaerahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isOpen, formData.kategori])

  useEffect(() => {
    if (!isOpen || !formData.id_daerah) {
      setKamarOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKamarOptions(formData.id_daerah).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKamarOptions(res.data)
      else if (!cancelled) setKamarOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isOpen, formData.id_daerah])

  useEffect(() => {
    if (!formData.lembaga_diniyah) {
      setKelasDiniyahOptions([])
      setKelDiniyahOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(formData.lembaga_diniyah).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelasDiniyahOptions(res.data)
      else if (!cancelled) setKelasDiniyahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_diniyah])

  useEffect(() => {
    if (!formData.lembaga_diniyah || (formData.kelas_diniyah ?? '') === '') {
      setKelDiniyahOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelOptions(formData.lembaga_diniyah, formData.kelas_diniyah).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelDiniyahOptions(res.data)
      else if (!cancelled) setKelDiniyahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_diniyah, formData.kelas_diniyah])

  useEffect(() => {
    if (!formData.lembaga_formal) {
      setKelasFormalOptions([])
      setKelFormalOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(formData.lembaga_formal).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelasFormalOptions(res.data)
      else if (!cancelled) setKelasFormalOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_formal])

  useEffect(() => {
    if (!formData.lembaga_formal || (formData.kelas_formal ?? '') === '') {
      setKelFormalOptions([])
      return
    }
    let cancelled = false
    pendaftaranAPI.getKelOptions(formData.lembaga_formal, formData.kelas_formal).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelFormalOptions(res.data)
      else if (!cancelled) setKelFormalOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_formal, formData.kelas_formal])

  // Inisialisasi form hanya saat offcanvas baru dibuka atau saat santri pertama berganti (jangan tiap selectedSantriList berubah agar pilihan user tidak tertimpa)
  const prevOpenRef = useRef(false)
  const prevFirstIdRef = useRef(null)
  useEffect(() => {
    if (!isOpen || !selectedSantriList?.length) {
      if (!isOpen) prevOpenRef.current = false
      return
    }
    const firstSantri = selectedSantriList[0]
    const firstId = firstSantri.id ?? firstSantri.nis ?? firstSantri.nama
    const justOpened = !prevOpenRef.current && isOpen
    const firstChanged = prevFirstIdRef.current !== firstId
    if (justOpened || firstChanged) {
      prevOpenRef.current = true
      prevFirstIdRef.current = firstId
      const diniyahVal = firstSantri.diniyah
      const formalVal = firstSantri.formal
      setFormData(prev => ({
        ...prev,
        status_santri: firstSantri.status_santri || firstSantri.status || 'Mukim',
        kategori: firstSantri.kategori || '',
        id_daerah: firstSantri.id_daerah ?? '',
        id_kamar: firstSantri.id_kamar ?? '',
        lembaga_diniyah: (diniyahVal != null && diniyahVal !== '') ? String(diniyahVal) : '',
        kelas_diniyah: '',
        id_diniyah: '',
        tidak_sekolah_diniyah: false,
        lembaga_formal: (formalVal != null && formalVal !== '') ? String(formalVal) : '',
        kelas_formal: '',
        id_formal: '',
        tidak_sekolah_formal: false,
        diniyah: '',
        formal: '',
        lttq: firstSantri.lttq || '',
        saudara_di_pesantren: firstSantri.saudara_di_pesantren || firstSantri.saudara || 'Tidak Ada',
        wajib: firstSantri.wajib_sebulan || 0,
        keterangan: '',
        is_disabled: 0,
        sama: 1
      }))
      setProgress({ current: 0, total: selectedSantriList.length, currentSantri: null })
    }
  }, [isOpen, selectedSantriList])

  // Kunci harga uwaba = lembaga.id (bukan nama); "Tidak Sekolah" tetap literal
  const diniyahPriceKey = formData.tidak_sekolah_diniyah ? 'Tidak Sekolah' : String(formData.lembaga_diniyah ?? '').trim()
  const formalPriceKey = formData.tidak_sekolah_formal ? 'Tidak Sekolah' : String(formData.lembaga_formal ?? '').trim()

  // Hitung wajib saat form berubah
  useEffect(() => {
    if (!uwabaPrices) return
    const biodata = {
      status_santri: formData.status_santri,
      kategori: formData.kategori,
      diniyah: diniyahPriceKey,
      formal: formalPriceKey,
      lttq: formData.lttq,
      saudara: formData.saudara_di_pesantren
    }
    const wajib = calculateWajibFromBiodata(biodata, uwabaPrices)
    setFormData(prev => ({ ...prev, wajib }))
  }, [formData.status_santri, formData.kategori, diniyahPriceKey, formalPriceKey, formData.lttq, formData.saudara_di_pesantren, uwabaPrices])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.status_santri || !formData.kategori) {
      showNotification('Status Santri dan Kategori harus diisi', 'error')
      return
    }
    
    if (!selectedSantriList || selectedSantriList.length === 0) {
      showNotification('Tidak ada santri yang dipilih', 'error')
      return
    }
    
    setLoading(true)
    setProgress({ current: 0, total: selectedSantriList.length, currentSantri: null })
    
    let successCount = 0
    let failCount = 0
    const errors = []
    
    try {
      for (let i = 0; i < selectedSantriList.length; i++) {
        const santri = selectedSantriList[i]
        setProgress({ current: i + 1, total: selectedSantriList.length, currentSantri: santri.nama })
        
        try {
          const payload = {
            status_santri: formData.status_santri,
            kategori: formData.kategori,
            id_daerah: formData.id_daerah || undefined,
            id_kamar: formData.id_kamar || undefined,
            diniyah: diniyahPriceKey || '',
            formal: formalPriceKey || '',
            lttq: formData.lttq || '',
            saudara_di_pesantren: formData.saudara_di_pesantren || 'Tidak Ada',
            wajib: formData.wajib || 0,
            keterangan: formData.keterangan || '',
            is_disabled: formData.is_disabled ?? 0,
            sama: formData.sama ?? 1
          }
          const result = await uwabaAPI.lengkapiData(
            santri.id,
            tahunAjaran,
            payload
          )
          
          if (result.success) {
            successCount++
          } else {
            failCount++
            errors.push(`${santri.nama} (${santri.id}): ${result.message || 'Gagal'}`)
          }
        } catch (error) {
          failCount++
          errors.push(`${santri.nama} (${santri.id}): ${error.message || 'Terjadi kesalahan'}`)
        }
      }
      
      if (successCount > 0) {
        showNotification(
          `Berhasil melengkapi data untuk ${successCount} santri${failCount > 0 ? `, ${failCount} gagal` : ''}`,
          failCount > 0 ? 'warning' : 'success'
        )
        if (errors.length > 0 && errors.length <= 5) {
          // Tampilkan error detail jika tidak terlalu banyak
          setTimeout(() => {
            errors.forEach(err => showNotification(err, 'error'))
          }, 500)
        }
        onSuccess()
        onClose()
      } else {
        showNotification('Gagal melengkapi data untuk semua santri', 'error')
        if (errors.length > 0 && errors.length <= 5) {
          errors.forEach(err => showNotification(err, 'error'))
        }
      }
    } catch (error) {
      console.error('Error melengkapi data:', error)
      showNotification('Terjadi kesalahan saat melengkapi data', 'error')
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0, currentSantri: null })
    }
  }

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="lengkapi-data-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black bg-opacity-40 z-50"
        />
      )}
      {isOpen && (
        <motion.div
          key="lengkapi-data-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
        >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  Lengkapi Data Syahriah
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl"
                  disabled={loading}
                >
                  ×
                </button>
              </div>
              {selectedSantriList && selectedSantriList.length > 0 && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p><strong>Jumlah Santri:</strong> {selectedSantriList.length}</p>
                  {selectedSantriList.length <= 5 && (
                    <div className="mt-2 space-y-1">
                      {selectedSantriList.map(santri => (
                        <p key={santri.id}>
                          <strong>{santri.id}</strong> - {santri.nama} ({santri.count}/10)
                        </p>
                      ))}
                    </div>
                  )}
                  {selectedSantriList.length > 5 && (
                    <p className="mt-2">Menampilkan 5 pertama dari {selectedSantriList.length} santri...</p>
                  )}
                </div>
              )}
              {loading && progress.total > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>Memproses: {progress.currentSantri || '...'}</span>
                    <span>{progress.current}/{progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-teal-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status Santri
                  </label>
                  <select
                    value={formData.status_santri}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, status_santri: e.target.value, kategori: '' }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="Mukim">Mukim</option>
                    <option value="Khoriji">Khoriji</option>
                    <option value="Boyong">Boyong</option>
                    <option value="Guru Tugas">Guru Tugas</option>
                    <option value="Pengurus">Pengurus</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Kategori
                  </label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData(prev => ({ ...prev, kategori: e.target.value, id_daerah: '', id_kamar: '' }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">Pilih Kategori</option>
                    {kategoriOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* Daerah & Kamar - hanya tampil jika status santri Mukim */}
                {formData.status_santri === 'Mukim' && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daerah</label>
                      <select
                        value={formData.id_daerah ?? ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, id_daerah: e.target.value, id_kamar: '' }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Pilih Daerah</option>
                        {daerahOptions.map((d) => (
                          <option key={d.id} value={d.id}>{d.daerah}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kamar</label>
                      <select
                        value={formData.id_kamar ?? ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, id_kamar: e.target.value }))}
                        disabled={!formData.id_daerah}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Pilih Kamar</option>
                        {kamarOptions.map((k) => (
                          <option key={k.id} value={k.id}>{k.kamar}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Diniyah: Tidak Sekolah atau Diniyah → Kelas → Kel */}
                <div className="mt-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={formData.tidak_sekolah_diniyah}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        tidak_sekolah_diniyah: e.target.checked,
                        ...(e.target.checked ? { lembaga_diniyah: '', kelas_diniyah: '', id_diniyah: '' } : {})
                      }))}
                      className="w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tidak Sekolah (Diniyah)</span>
                  </label>
                  <AnimatePresence initial={false}>
                    {!formData.tidak_sekolah_diniyah && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Diniyah</label>
                            <select
                              value={String(formData.lembaga_diniyah ?? '')}
                              onChange={(e) => setFormData(prev => ({ ...prev, lembaga_diniyah: e.target.value, kelas_diniyah: '', id_diniyah: '' }))}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="">Pilih Diniyah</option>
                              {lembagaDiniyahOptions.map((l) => (
                                <option key={l.id} value={String(l.id)}>{l.nama || l.id}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kelas</label>
                            <select
                              value={formData.kelas_diniyah ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, kelas_diniyah: e.target.value, id_diniyah: '' }))}
                              disabled={!formData.lembaga_diniyah}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="">Pilih Kelas</option>
                              {kelasDiniyahOptions.map((k) => (
                                <option key={k} value={k}>{k || '-'}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kel</label>
                            <select
                              value={formData.id_diniyah ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, id_diniyah: e.target.value }))}
                              disabled={!formData.lembaga_diniyah || !formData.kelas_diniyah}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="">Pilih Kel</option>
                              {kelDiniyahOptions.map((r) => (
                                <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Formal: Tidak Sekolah atau Formal → Kelas → Kel */}
                <div className="mt-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={formData.tidak_sekolah_formal}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        tidak_sekolah_formal: e.target.checked,
                        ...(e.target.checked ? { lembaga_formal: '', kelas_formal: '', id_formal: '' } : {})
                      }))}
                      className="w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tidak Sekolah (Formal)</span>
                  </label>
                  <AnimatePresence initial={false}>
                    {!formData.tidak_sekolah_formal && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Formal</label>
                            <select
                              value={String(formData.lembaga_formal ?? '')}
                              onChange={(e) => setFormData(prev => ({ ...prev, lembaga_formal: e.target.value, kelas_formal: '', id_formal: '' }))}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="">Pilih Formal</option>
                              {lembagaFormalOptions.map((l) => (
                                <option key={l.id} value={String(l.id)}>{l.nama || l.id}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kelas</label>
                            <select
                              value={formData.kelas_formal ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, kelas_formal: e.target.value, id_formal: '' }))}
                              disabled={!formData.lembaga_formal}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="">Pilih Kelas</option>
                              {kelasFormalOptions.map((k) => (
                                <option key={k} value={k}>{k || '-'}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kel</label>
                            <select
                              value={formData.id_formal ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, id_formal: e.target.value }))}
                              disabled={!formData.lembaga_formal || !formData.kelas_formal}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                            >
                              <option value="">Pilih Kel</option>
                              {kelFormalOptions.map((r) => (
                                <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    LTTQ
                  </label>
                  <select
                    value={formData.lttq}
                    onChange={(e) => setFormData(prev => ({ ...prev, lttq: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    <option value="">Pilih LTTQ</option>
                    {['Asfal', 'Ibtidaiyah', 'Tsanawiyah', 'Aliyah', 'Mualim', 'Ngaji Kitab', 'Tidak Mengaji'].map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Saudara di Pesantren
                  </label>
                  <select
                    value={formData.saudara_di_pesantren}
                    onChange={(e) => setFormData(prev => ({ ...prev, saudara_di_pesantren: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  >
                    {['Tidak Ada', '1', '2', '3', '4'].map(opt => (
                      <option key={opt} value={opt}>
                        {opt === 'Tidak Ada' ? opt : `${opt} Saudara`}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Wajib Sebulan
                  </label>
                  <input
                    type="text"
                    value={calculatedWajib > 0 ? calculatedWajib.toLocaleString('id-ID') : ''}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Keterangan
                  </label>
                  <input
                    type="text"
                    value={formData.keterangan}
                    onChange={(e) => setFormData(prev => ({ ...prev, keterangan: e.target.value }))}
                    placeholder="Opsional"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_disabled"
                    checked={formData.is_disabled === 1}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_disabled: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label htmlFor="is_disabled" className="text-sm text-gray-700 dark:text-gray-300">
                    Tidak Masuk (is_disabled)
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sama"
                    checked={formData.sama === 1}
                    onChange={(e) => setFormData(prev => ({ ...prev, sama: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label htmlFor="sama" className="text-sm text-gray-700 dark:text-gray-300">
                    Sama dengan sebelumnya
                  </label>
                </div>
                
                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    disabled={loading || !formData.status_santri || !formData.kategori}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Menyimpan...' : 'Buat'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
      )}
    </AnimatePresence>
  )
}

export default LengkapiDataOffcanvas

