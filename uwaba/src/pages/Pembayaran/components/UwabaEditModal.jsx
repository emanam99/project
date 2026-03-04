import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { pendaftaranAPI } from '../../../services/api'
import { calculateWajibFromBiodata } from '../../../utils/uwabaCalculator'
import { useNotification } from '../../../contexts/NotificationContext'

function UwabaEditModal({ isOpen, onClose, bulanIndex, bulanData, prices, onSave }) {
  const { showNotification } = useNotification()
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
    saudara: 'Tidak Ada',
    wajib: 0
  })
  
  const [calculatedWajib, setCalculatedWajib] = useState(0)
  const [hargaDetail, setHargaDetail] = useState({
    harga_dasar: 0,
    harga_diniyah: 0,
    harga_formal: 0,
    harga_lttq: 0,
    diskon_saudara: 0,
    diskon_saudara_type: ''
  })
  const [kategoriOptions, setKategoriOptions] = useState([])
  const [daerahOptions, setDaerahOptions] = useState([])
  const [kamarOptions, setKamarOptions] = useState([])
  const [lembagaDiniyahOptions, setLembagaDiniyahOptions] = useState([])
  const [lembagaFormalOptions, setLembagaFormalOptions] = useState([])
  const [kelasDiniyahOptions, setKelasDiniyahOptions] = useState([])
  const [kelasFormalOptions, setKelasFormalOptions] = useState([])
  const [kelDiniyahOptions, setKelDiniyahOptions] = useState([])
  const [kelFormalOptions, setKelFormalOptions] = useState([])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    Promise.all([
      pendaftaranAPI.getKategoriOptions(),
      pendaftaranAPI.getLembagaOptions('Diniyah'),
      pendaftaranAPI.getLembagaOptions('Formal')
    ]).then(([kRes, dRes, fRes]) => {
      if (cancelled) return
      if (kRes?.success && Array.isArray(kRes.data)) setKategoriOptions(kRes.data)
      if (dRes?.success && Array.isArray(dRes.data)) setLembagaDiniyahOptions(dRes.data)
      if (fRes?.success && Array.isArray(fRes.data)) setLembagaFormalOptions(fRes.data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !formData.kategori) { setDaerahOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getDaerahOptions(formData.kategori).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setDaerahOptions(res.data)
      else if (!cancelled) setDaerahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isOpen, formData.kategori])

  useEffect(() => {
    if (!isOpen || !formData.id_daerah) { setKamarOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKamarOptions(formData.id_daerah).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKamarOptions(res.data)
      else if (!cancelled) setKamarOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isOpen, formData.id_daerah])

  useEffect(() => {
    if (!formData.lembaga_diniyah) { setKelasDiniyahOptions([]); setKelDiniyahOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(formData.lembaga_diniyah).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelasDiniyahOptions(res.data)
      else if (!cancelled) setKelasDiniyahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_diniyah])

  useEffect(() => {
    if (!formData.lembaga_diniyah || (formData.kelas_diniyah ?? '') === '') { setKelDiniyahOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelOptions(formData.lembaga_diniyah, formData.kelas_diniyah).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelDiniyahOptions(res.data)
      else if (!cancelled) setKelDiniyahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_diniyah, formData.kelas_diniyah])

  useEffect(() => {
    if (!formData.lembaga_formal) { setKelasFormalOptions([]); setKelFormalOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(formData.lembaga_formal).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelasFormalOptions(res.data)
      else if (!cancelled) setKelasFormalOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_formal])

  useEffect(() => {
    if (!formData.lembaga_formal || (formData.kelas_formal ?? '') === '') { setKelFormalOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelOptions(formData.lembaga_formal, formData.kelas_formal).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelFormalOptions(res.data)
      else if (!cancelled) setKelFormalOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [formData.lembaga_formal, formData.kelas_formal])

  // Load data bulan saat modal dibuka; map diniyah/formal string ke lembaga id
  useEffect(() => {
    if (isOpen && bulanData) {
      const jsonData = bulanData.jsonData || {}
      const dStr = jsonData.diniyah || ''
      const fStr = jsonData.formal || ''
      const lembagaDId = lembagaDiniyahOptions.find(l => (l.nama || '') === dStr)?.id ?? ''
      const lembagaFId = lembagaFormalOptions.find(l => (l.nama || '') === fStr)?.id ?? ''
      setFormData(prev => ({
        ...prev,
        status_santri: jsonData.status_santri || 'Mukim',
        kategori: jsonData.kategori || '',
        id_daerah: jsonData.id_daerah ?? '',
        id_kamar: jsonData.id_kamar ?? '',
        lembaga_diniyah: lembagaDId || prev.lembaga_diniyah,
        kelas_diniyah: '',
        id_diniyah: '',
        tidak_sekolah_diniyah: dStr === 'Tidak Sekolah',
        lembaga_formal: lembagaFId || prev.lembaga_formal,
        kelas_formal: '',
        id_formal: '',
        tidak_sekolah_formal: fStr === 'Tidak Sekolah',
        diniyah: dStr,
        formal: fStr,
        lttq: jsonData.lttq || '',
        saudara: jsonData.saudara || jsonData.saudara_di_pesantren || 'Tidak Ada',
        wajib: bulanData.wajib || 0
      }))
    }
  }, [isOpen, bulanData, lembagaDiniyahOptions, lembagaFormalOptions])

  const diniyahStr = formData.tidak_sekolah_diniyah ? 'Tidak Sekolah' : (lembagaDiniyahOptions.find(l => String(l.id) === String(formData.lembaga_diniyah))?.nama ?? formData.diniyah ?? '')
  const formalStr = formData.tidak_sekolah_formal ? 'Tidak Sekolah' : (lembagaFormalOptions.find(l => String(l.id) === String(formData.lembaga_formal))?.nama ?? formData.formal ?? '')

  useEffect(() => {
    if (!prices) return
    const biodata = {
      status_santri: formData.status_santri,
      kategori: formData.kategori,
      diniyah: diniyahStr,
      formal: formalStr,
      lttq: formData.lttq,
      saudara: formData.saudara
    }
    const wajib = calculateWajibFromBiodata(biodata, prices)
    setCalculatedWajib(wajib)
    let hargaDasar = 0
    if (formData.status_santri && formData.kategori && prices.status_santri?.[formData.status_santri]?.[formData.kategori]) {
      hargaDasar = prices.status_santri[formData.status_santri][formData.kategori].wajib || 0
    }
    const hargaDiniyah = prices.diniyah?.[diniyahStr]?.wajib || 0
    const hargaFormal = prices.formal?.[formalStr]?.wajib || 0
    const hargaLttq = prices.lttq?.[formData.lttq]?.wajib || 0
    const totalSebelumDiskon = hargaDasar + hargaDiniyah + hargaFormal + hargaLttq
    let diskonSaudara = 0
    let diskonSaudaraType = ''
    if (formData.saudara && formData.saudara !== 'Tidak Ada' && prices.saudara?.[formData.saudara]) {
      const saudaraConfig = prices.saudara[formData.saudara]
      diskonSaudaraType = saudaraConfig.diskon_type || 'fixed'
      diskonSaudara = diskonSaudaraType === 'percentage' ? (totalSebelumDiskon * saudaraConfig.diskon) / 100 : (saudaraConfig.diskon || 0)
    }
    setHargaDetail({
      harga_dasar: hargaDasar,
      harga_diniyah: hargaDiniyah,
      harga_formal: hargaFormal,
      harga_lttq: hargaLttq,
      diskon_saudara: diskonSaudara,
      diskon_saudara_type: diskonSaudaraType
    })
    if (formData.status_santri && formData.kategori) setFormData(prev => ({ ...prev, wajib }))
  }, [formData.status_santri, formData.kategori, diniyahStr, formalStr, formData.lttq, formData.saudara, prices])
  
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.status_santri || !formData.kategori) {
      showNotification('Status Santri dan Kategori harus diisi', 'error')
      return
    }
    const jsonData = {
      status_santri: formData.status_santri,
      kategori: formData.kategori,
      id_daerah: formData.id_daerah || undefined,
      id_kamar: formData.id_kamar || undefined,
      diniyah: diniyahStr || '',
      formal: formalStr || '',
      lttq: formData.lttq || '',
      saudara_di_pesantren: formData.saudara,
      harga_dasar: hargaDetail.harga_dasar,
      harga_diniyah: hargaDetail.harga_diniyah,
      harga_formal: hargaDetail.harga_formal,
      harga_lttq: hargaDetail.harga_lttq,
      diskon_saudara: hargaDetail.diskon_saudara,
      diskon_saudara_type: hargaDetail.diskon_saudara_type,
      total_wajib: calculatedWajib,
      timestamp: Date.now()
    }
    onSave(bulanIndex, { wajib: calculatedWajib, jsonData, samaSebelumnya: false })
    onClose()
  }
  
  if (!isOpen) return null
  
  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-40 z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-sm w-full max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="p-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-start mb-3">
                  <h2 className="text-base font-bold">Edit Uwaba {bulanData?.namaBulan || ''}</h2>
                  <button
                    onClick={onClose}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg"
                  >
                    ×
                  </button>
                </div>
                <div className="mb-3">
                  <label className="block text-gray-700 dark:text-gray-300 font-semibold text-sm">Wajib Bulan Ini:</label>
                  <input
                    type="text"
                    value={formData.wajib > 0 ? formData.wajib.toLocaleString('id-ID') : ''}
                    readOnly
                    className="w-full p-2 text-sm border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 font-mono"
                  />
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Harga asal sebelum potongan: Rp {(
                      hargaDetail.harga_dasar + 
                      hargaDetail.harga_diniyah + 
                      hargaDetail.harga_formal + 
                      hargaDetail.harga_lttq
                    ).toLocaleString('id-ID')}
                    {hargaDetail.diskon_saudara > 0 && (
                      <span>
                        {' | Potongan saudara: '}
                        {hargaDetail.diskon_saudara_type === 'percentage' 
                          ? `${formData.saudara}% (Rp ${hargaDetail.diskon_saudara.toLocaleString('id-ID')})`
                          : `Rp ${hargaDetail.diskon_saudara.toLocaleString('id-ID')}`
                        }
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 pt-3">
                <form onSubmit={handleSubmit}>
                  <div className="mb-2">
                    <label className="block text-gray-700 dark:text-gray-300 mb-1 text-sm">Status Santri</label>
                    <select
                      value={formData.status_santri}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, status_santri: e.target.value, kategori: '' }))
                      }}
                      className="w-full p-2 text-sm border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    >
                      <option value="Mukim">Mukim</option>
                      <option value="Khoriji">Khoriji</option>
                      <option value="Boyong">Boyong</option>
                      <option value="Guru Tugas">Guru Tugas</option>
                      <option value="Pengurus">Pengurus</option>
                    </select>
                  </div>
                  
                  <div className="mb-2">
                    <label className="block text-gray-700 dark:text-gray-300 mb-1 text-sm">Kategori</label>
                    <select
                      value={formData.kategori}
                      onChange={(e) => setFormData(prev => ({ ...prev, kategori: e.target.value, id_daerah: '', id_kamar: '' }))}
                      className="w-full p-2 text-sm border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Pilih Kategori</option>
                      {kategoriOptions.map(opt => {
                        const harga = prices?.status_santri?.[formData.status_santri]?.[opt]?.wajib || 0
                        return (
                          <option key={opt} value={opt}>
                            {opt}{harga > 0 ? ` - Rp ${harga.toLocaleString('id-ID')}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {formData.status_santri === 'Mukim' && (
                    <>
                      <div className="mb-2">
                        <label className="block text-gray-700 dark:text-gray-300 mb-1 text-sm">Daerah</label>
                        <select
                          value={formData.id_daerah ?? ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, id_daerah: e.target.value, id_kamar: '' }))}
                          className="w-full p-2 text-sm border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Pilih Daerah</option>
                          {daerahOptions.map((d) => (
                            <option key={d.id} value={d.id}>{d.daerah}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-2">
                        <label className="block text-gray-700 dark:text-gray-300 mb-1 text-sm">Kamar</label>
                        <select
                          value={formData.id_kamar ?? ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, id_kamar: e.target.value }))}
                          disabled={!formData.id_daerah}
                          className="w-full p-2 text-sm border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Pilih Kamar</option>
                          {kamarOptions.map((k) => (
                            <option key={k.id} value={k.id}>{k.kamar}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  
                  <div className="mb-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
                      <input
                        type="checkbox"
                        checked={formData.tidak_sekolah_diniyah}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          tidak_sekolah_diniyah: e.target.checked,
                          ...(e.target.checked ? { lembaga_diniyah: '', kelas_diniyah: '', id_diniyah: '' } : {})
                        }))}
                        className="w-3.5 h-3.5 text-teal-600 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Tidak Sekolah (Diniyah)</span>
                    </label>
                    <AnimatePresence initial={false}>
                      {!formData.tidak_sekolah_diniyah && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="flex gap-1 flex-wrap">
                            <select
                              value={formData.lembaga_diniyah ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, lembaga_diniyah: e.target.value, kelas_diniyah: '', id_diniyah: '' }))}
                              className="flex-1 min-w-0 p-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="">Diniyah</option>
                              {lembagaDiniyahOptions.map((l) => (
                                <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                              ))}
                            </select>
                            <select
                              value={formData.kelas_diniyah ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, kelas_diniyah: e.target.value, id_diniyah: '' }))}
                              disabled={!formData.lembaga_diniyah}
                              className="flex-1 min-w-0 p-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="">Kelas</option>
                              {kelasDiniyahOptions.map((k) => (
                                <option key={k} value={k}>{k || '-'}</option>
                              ))}
                            </select>
                            <select
                              value={formData.id_diniyah ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, id_diniyah: e.target.value }))}
                              disabled={!formData.lembaga_diniyah || !formData.kelas_diniyah}
                              className="flex-1 min-w-0 p-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="">Kel</option>
                              {kelDiniyahOptions.map((r) => (
                                <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                              ))}
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <div className="mb-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
                      <input
                        type="checkbox"
                        checked={formData.tidak_sekolah_formal}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          tidak_sekolah_formal: e.target.checked,
                          ...(e.target.checked ? { lembaga_formal: '', kelas_formal: '', id_formal: '' } : {})
                        }))}
                        className="w-3.5 h-3.5 text-teal-600 rounded"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Tidak Sekolah (Formal)</span>
                    </label>
                    <AnimatePresence initial={false}>
                      {!formData.tidak_sekolah_formal && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="flex gap-1 flex-wrap">
                            <select
                              value={formData.lembaga_formal ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, lembaga_formal: e.target.value, kelas_formal: '', id_formal: '' }))}
                              className="flex-1 min-w-0 p-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="">Formal</option>
                              {lembagaFormalOptions.map((l) => (
                                <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                              ))}
                            </select>
                            <select
                              value={formData.kelas_formal ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, kelas_formal: e.target.value, id_formal: '' }))}
                              disabled={!formData.lembaga_formal}
                              className="flex-1 min-w-0 p-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="">Kelas</option>
                              {kelasFormalOptions.map((k) => (
                                <option key={k} value={k}>{k || '-'}</option>
                              ))}
                            </select>
                            <select
                              value={formData.id_formal ?? ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, id_formal: e.target.value }))}
                              disabled={!formData.lembaga_formal || !formData.kelas_formal}
                              className="flex-1 min-w-0 p-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                            >
                              <option value="">Kel</option>
                              {kelFormalOptions.map((r) => (
                                <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                              ))}
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <div className="mb-2">
                    <label className="block text-gray-700 dark:text-gray-300 mb-1 text-sm">LTTQ</label>
                    <select
                      value={formData.lttq}
                      onChange={(e) => setFormData(prev => ({ ...prev, lttq: e.target.value }))}
                      className="w-full p-2 text-sm border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Pilih LTTQ</option>
                      {['Asfal', 'Ibtidaiyah', 'Tsanawiyah', 'Aliyah', 'Mualim', 'Ngaji Kitab', 'Tidak Mengaji'].map(opt => {
                        const harga = prices?.lttq?.[opt]?.wajib || 0
                        return (
                          <option key={opt} value={opt}>
                            {opt}{harga > 0 ? ` - Rp ${harga.toLocaleString('id-ID')}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  
                  <div className="mb-3">
                    <label className="block text-gray-700 dark:text-gray-300 mb-1 text-sm">Saudara</label>
                    <select
                      value={formData.saudara}
                      onChange={(e) => setFormData(prev => ({ ...prev, saudara: e.target.value }))}
                      className="w-full p-2 text-sm border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    >
                      {['Tidak Ada', '1', '2', '3', '4'].map(opt => {
                        const saudaraConfig = prices?.saudara?.[opt]
                        let hargaText = ''
                        if (saudaraConfig) {
                          if (saudaraConfig.diskon_type === 'percentage') {
                            hargaText = ` - ${saudaraConfig.diskon}%`
                          } else if (saudaraConfig.diskon > 0) {
                            hargaText = ` - Rp ${saudaraConfig.diskon.toLocaleString('id-ID')}`
                          }
                        }
                        return (
                          <option key={opt} value={opt}>
                            {opt === 'Tidak Ada' ? opt : `${opt} Saudara`}{hargaText}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-teal-600 text-white px-3 py-2 text-sm rounded hover:bg-teal-700"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-2 text-sm rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                    >
                      Batal
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
  
  return createPortal(modalContent, document.body)
}

export default UwabaEditModal

