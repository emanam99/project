import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI, uwabaAPI } from '../../../services/api'
import {
  calculateWajibFromBiodata,
  buildUniqueWajibJsonList,
  mapUwabaDbRowsToWajibListInput
} from '../../../utils/uwabaCalculator'
import { useNotification } from '../../../contexts/NotificationContext'

const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }
const listAnimTransition = { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

function matchLembagaId(list, val) {
  if (val == null || String(val).trim() === '') return ''
  const v = String(val).trim()
  const byId = list.find((l) => String(l.id) === v)
  if (byId) return String(byId.id)
  const byNama = list.find((l) => (l.nama || '') === v)
  if (byNama) return String(byNama.id)
  return v
}

function UwabaEditOffcanvas({ isOpen, onClose, bulanIndex, bulanData, prices, onSave, santriId }) {
  const { showNotification } = useNotification()
  const [formData, setFormData] = useState({
    status_santri: 'Mukim',
    kategori: '',
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
  const [lembagaDiniyahOptions, setLembagaDiniyahOptions] = useState([])
  const [lembagaFormalOptions, setLembagaFormalOptions] = useState([])
  const [kelasDiniyahOptions, setKelasDiniyahOptions] = useState([])
  const [kelasFormalOptions, setKelasFormalOptions] = useState([])
  const [kelDiniyahOptions, setKelDiniyahOptions] = useState([])
  const [kelFormalOptions, setKelFormalOptions] = useState([])
  const [showWajibList, setShowWajibList] = useState(false)
  const [wajibListRawRows, setWajibListRawRows] = useState([])
  const [wajibListLoading, setWajibListLoading] = useState(false)
  const [wajibListError, setWajibListError] = useState(null)
  const [wajibLockedFromList, setWajibLockedFromList] = useState(false)

  const clearListWajibLock = useCallback(() => setWajibLockedFromList(false), [])

  const uniqueWajibList = useMemo(() => {
    const mapped = mapUwabaDbRowsToWajibListInput(wajibListRawRows)
    return buildUniqueWajibJsonList(mapped)
  }, [wajibListRawRows])

  const loadWajibListAllYears = useCallback(async () => {
    if (!santriId || !/^\d{7}$/.test(String(santriId))) {
      setWajibListRawRows([])
      setWajibListError('NIS tidak valid')
      return
    }
    setWajibListLoading(true)
    setWajibListError(null)
    try {
      const res = await uwabaAPI.getAllRowsForSantri(santriId)
      if (res?.success && Array.isArray(res.data)) {
        setWajibListRawRows(res.data)
      } else {
        setWajibListRawRows([])
        setWajibListError(res?.message || 'Gagal memuat data')
      }
    } catch (e) {
      setWajibListRawRows([])
      setWajibListError(e?.message || 'Gagal memuat data')
    } finally {
      setWajibListLoading(false)
    }
  }, [santriId])

  useEffect(() => {
    if (!isOpen) {
      setShowWajibList(false)
      setWajibListRawRows([])
      setWajibListError(null)
      setWajibListLoading(false)
      setWajibLockedFromList(false)
    }
  }, [isOpen])

  useEffect(() => {
    setWajibLockedFromList(false)
  }, [bulanIndex])

  useEffect(() => {
    if (isOpen && showWajibList) {
      loadWajibListAllYears()
    }
  }, [isOpen, showWajibList, loadWajibListAllYears])

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

  useEffect(() => {
    if (isOpen && bulanData && !wajibLockedFromList) {
      const jsonData = bulanData.jsonData || {}
      const dStr = jsonData.diniyah || ''
      const fStr = jsonData.formal || ''
      const lembagaDId = matchLembagaId(lembagaDiniyahOptions, dStr)
      const lembagaFId = matchLembagaId(lembagaFormalOptions, fStr)
      setFormData(prev => ({
        ...prev,
        status_santri: jsonData.status_santri || 'Mukim',
        kategori: jsonData.kategori || '',
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
  }, [isOpen, bulanData, lembagaDiniyahOptions, lembagaFormalOptions, wajibLockedFromList])

  const diniyahPriceKey = formData.tidak_sekolah_diniyah ? 'Tidak Sekolah' : String(formData.lembaga_diniyah ?? '').trim()
  const formalPriceKey = formData.tidak_sekolah_formal ? 'Tidak Sekolah' : String(formData.lembaga_formal ?? '').trim()

  useEffect(() => {
    if (!prices) return
    if (wajibLockedFromList) return
    const biodata = {
      status_santri: formData.status_santri,
      kategori: formData.kategori,
      diniyah: diniyahPriceKey,
      formal: formalPriceKey,
      lttq: formData.lttq,
      saudara: formData.saudara
    }
    const wajib = calculateWajibFromBiodata(biodata, prices)
    setCalculatedWajib(wajib)
    let hargaDasar = 0
    if (formData.status_santri && formData.kategori && prices.status_santri?.[formData.status_santri]?.[formData.kategori]) {
      hargaDasar = prices.status_santri[formData.status_santri][formData.kategori].wajib || 0
    }
    const hargaDiniyah = prices.diniyah?.[diniyahPriceKey]?.wajib || 0
    const hargaFormal = prices.formal?.[formalPriceKey]?.wajib || 0
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
  }, [formData.status_santri, formData.kategori, diniyahPriceKey, formalPriceKey, formData.lttq, formData.saudara, prices, wajibLockedFromList])

  const persistUwaba = useCallback(
    ({
      status_santri,
      kategori,
      diniyahKey,
      formalKey,
      lttq,
      saudara,
      hargaDetail: hd,
      wajibSave
    }) => {
      if (!status_santri || !kategori) {
        showNotification('Status Santri dan Kategori harus diisi', 'error')
        return false
      }
      const jsonData = {
        status_santri,
        kategori,
        diniyah: diniyahKey || '',
        formal: formalKey || '',
        lttq: lttq || '',
        saudara_di_pesantren: saudara,
        harga_dasar: hd.harga_dasar,
        harga_diniyah: hd.harga_diniyah,
        harga_formal: hd.harga_formal,
        harga_lttq: hd.harga_lttq,
        diskon_saudara: hd.diskon_saudara,
        diskon_saudara_type: hd.diskon_saudara_type,
        total_wajib: wajibSave,
        timestamp: Date.now()
      }
      onSave(bulanIndex, { wajib: wajibSave, jsonData, samaSebelumnya: false })
      onClose()
      return true
    },
    [bulanIndex, onSave, onClose, showNotification]
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    const wajibSave = wajibLockedFromList ? Number(formData.wajib) : calculatedWajib
    persistUwaba({
      status_santri: formData.status_santri,
      kategori: formData.kategori,
      diniyahKey: diniyahPriceKey || '',
      formalKey: formalPriceKey || '',
      lttq: formData.lttq,
      saudara: formData.saudara,
      hargaDetail,
      wajibSave
    })
  }

  const applyWajibListItem = useCallback(
    (item) => {
      const w = Number(item?.wajib) || 0
      const jd = item?.jsonData
      if (!jd || typeof jd !== 'object') {
        const ok = persistUwaba({
          status_santri: formData.status_santri,
          kategori: formData.kategori,
          diniyahKey: diniyahPriceKey || '',
          formalKey: formalPriceKey || '',
          lttq: formData.lttq,
          saudara: formData.saudara,
          hargaDetail,
          wajibSave: w
        })
        if (ok) showNotification('Nominal disimpan dari daftar.', 'success')
        else showNotification('Nominal tidak disimpan: lengkapi Status dan Kategori terlebih dahulu.', 'warning')
        return
      }
      const dStr = jd.diniyah ?? ''
      const fStr = jd.formal ?? ''
      const lembagaDId = matchLembagaId(lembagaDiniyahOptions, dStr)
      const lembagaFId = matchLembagaId(lembagaFormalOptions, fStr)
      const diniyahKey = String(dStr).trim() === 'Tidak Sekolah' ? 'Tidak Sekolah' : String(lembagaDId || '').trim()
      const formalKey = String(fStr).trim() === 'Tidak Sekolah' ? 'Tidak Sekolah' : String(lembagaFId || '').trim()
      const hd = {
        harga_dasar: jd.harga_dasar ?? 0,
        harga_diniyah: jd.harga_diniyah ?? 0,
        harga_formal: jd.harga_formal ?? 0,
        harga_lttq: jd.harga_lttq ?? 0,
        diskon_saudara: jd.diskon_saudara ?? 0,
        diskon_saudara_type: jd.diskon_saudara_type ?? ''
      }
      const ok = persistUwaba({
        status_santri: jd.status_santri || 'Mukim',
        kategori: jd.kategori || '',
        diniyahKey,
        formalKey,
        lttq: jd.lttq || '',
        saudara: jd.saudara || jd.saudara_di_pesantren || 'Tidak Ada',
        hargaDetail: hd,
        wajibSave: w
      })
      if (ok) showNotification('Disimpan dari pilihan daftar.', 'success')
    },
    [
      formData.status_santri,
      formData.kategori,
      diniyahPriceKey,
      formalPriceKey,
      formData.lttq,
      formData.saudara,
      hargaDetail,
      lembagaDiniyahOptions,
      lembagaFormalOptions,
      persistUwaba,
      showNotification
    ]
  )

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="uwaba-edit-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black bg-opacity-40 z-[60]"
        />
      )}
      {isOpen && (
        <motion.div
          key="uwaba-edit-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[60] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex justify-between items-start gap-2">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 pr-2">
                Edit Uwaba {bulanData?.namaBulan || ''}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none shrink-0"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 min-w-0">Wajib bulan ini</label>
                <motion.button
                  type="button"
                  onClick={() => setShowWajibList((v) => !v)}
                  whileTap={{ scale: 0.9 }}
                  transition={listAnimTransition}
                  className={`shrink-0 p-2 rounded-lg border text-teal-700 dark:text-teal-300 transition-colors duration-300 ${
                    showWajibList
                      ? 'bg-teal-50 dark:bg-teal-900/40 border-teal-600 dark:border-teal-500 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/80 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={showWajibList ? 'Tutup daftar wajib' : 'Daftar wajib unik (semua tahun)'}
                  aria-expanded={showWajibList}
                  aria-label={showWajibList ? 'Tutup daftar wajib' : 'Buka daftar wajib unik semua tahun'}
                >
                  <motion.svg
                    className="w-5 h-5 block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    animate={{ rotate: showWajibList ? 180 : 0 }}
                    transition={listAnimTransition}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                  </motion.svg>
                </motion.button>
              </div>
              <input
                type="text"
                value={formData.wajib > 0 ? formData.wajib.toLocaleString('id-ID') : ''}
                readOnly
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Sebelum potongan: Rp {(
                  hargaDetail.harga_dasar +
                  hargaDetail.harga_diniyah +
                  hargaDetail.harga_formal +
                  hargaDetail.harga_lttq
                ).toLocaleString('id-ID')}
                {hargaDetail.diskon_saudara > 0 && (
                  <span>
                    {' · Potongan saudara: '}
                    {hargaDetail.diskon_saudara_type === 'percentage'
                      ? `${formData.saudara}% (Rp ${hargaDetail.diskon_saudara.toLocaleString('id-ID')})`
                      : `Rp ${hargaDetail.diskon_saudara.toLocaleString('id-ID')}`}
                  </span>
                )}
              </p>
              <AnimatePresence initial={false}>
                {showWajibList && (
                  <motion.div
                    key="wajib-unique-list"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={listAnimTransition}
                    className="overflow-hidden mt-2"
                  >
                    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/50 overflow-hidden">
                      <p className="px-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                        Nilai wajib unik dari semua tahun ajaran (urut termurah). Nominal sama digabung; JSON dari baris terbaru (id terbesar).
                      </p>
                      {wajibListLoading ? (
                        <p className="px-2 py-4 text-xs text-center text-gray-500 dark:text-gray-400">Memuat…</p>
                      ) : wajibListError ? (
                        <p className="px-2 py-3 text-xs text-red-600 dark:text-red-400">{wajibListError}</p>
                      ) : uniqueWajibList.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-gray-500 dark:text-gray-400">Belum ada data wajib di uwaba.</p>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ ...listAnimTransition, delay: 0.05 }}
                          className="max-h-52 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-600"
                        >
                          {uniqueWajibList.map((item) => (
                            <details key={item.wajib} className="group">
                              <summary className="cursor-pointer list-none px-2 py-2 text-xs font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 marker:text-gray-400 flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 align-middle min-w-0">
                                  <span className="font-mono text-teal-700 dark:text-teal-300">Rp {item.wajib.toLocaleString('id-ID')}</span>
                                  {item.namaBulan ? (
                                    <span className="text-gray-500 dark:text-gray-400 font-normal">· sumber terakhir: {item.namaBulan}</span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  className="shrink-0 px-2 py-1 rounded-md text-[11px] font-medium bg-teal-600 text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    applyWajibListItem(item)
                                  }}
                                >
                                  Pilih
                                </button>
                              </summary>
                              <div className="px-2 pb-2 pt-0">
                                {item.jsonData ? (
                                  <pre className="text-[10px] leading-snug p-2 rounded bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 overflow-x-auto text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
                                    {JSON.stringify(item.jsonData, null, 2)}
                                  </pre>
                                ) : (
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400 px-1">Tidak ada JSON untuk nilai ini.</p>
                                )}
                              </div>
                            </details>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status Santri</label>
                <select
                  value={formData.status_santri}
                  onChange={(e) => {
                    clearListWajibLock()
                    setFormData(prev => ({ ...prev, status_santri: e.target.value, kategori: '' }))
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="Mukim">Mukim</option>
                  <option value="Khoriji">Khoriji</option>
                  <option value="Boyong">Boyong</option>
                  <option value="Guru Tugas">Guru Tugas</option>
                  <option value="Pengurus">Pengurus</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
                <select
                  value={formData.kategori}
                  onChange={(e) => {
                    clearListWajibLock()
                    setFormData(prev => ({ ...prev, kategori: e.target.value }))
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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

              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
                  <input
                    type="checkbox"
                    checked={formData.tidak_sekolah_diniyah}
                    onChange={(e) => {
                      clearListWajibLock()
                      setFormData(prev => ({
                        ...prev,
                        tidak_sekolah_diniyah: e.target.checked,
                        ...(e.target.checked ? { lembaga_diniyah: '', kelas_diniyah: '', id_diniyah: '' } : {})
                      }))
                    }}
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
                          onChange={(e) => {
                            clearListWajibLock()
                            setFormData(prev => ({ ...prev, lembaga_diniyah: e.target.value, kelas_diniyah: '', id_diniyah: '' }))
                          }}
                          className="flex-1 min-w-[7rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                        >
                          <option value="">Diniyah</option>
                          {lembagaDiniyahOptions.map((l) => (
                            <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                          ))}
                        </select>
                        <select
                          value={formData.kelas_diniyah ?? ''}
                          onChange={(e) => {
                            clearListWajibLock()
                            setFormData(prev => ({ ...prev, kelas_diniyah: e.target.value, id_diniyah: '' }))
                          }}
                          disabled={!formData.lembaga_diniyah}
                          className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                        >
                          <option value="">Kelas</option>
                          {kelasDiniyahOptions.map((k) => (
                            <option key={k} value={k}>{k || '-'}</option>
                          ))}
                        </select>
                        <select
                          value={formData.id_diniyah ?? ''}
                          onChange={(e) => {
                            clearListWajibLock()
                            setFormData(prev => ({ ...prev, id_diniyah: e.target.value }))
                          }}
                          disabled={!formData.lembaga_diniyah || !formData.kelas_diniyah}
                          className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
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

              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
                  <input
                    type="checkbox"
                    checked={formData.tidak_sekolah_formal}
                    onChange={(e) => {
                      clearListWajibLock()
                      setFormData(prev => ({
                        ...prev,
                        tidak_sekolah_formal: e.target.checked,
                        ...(e.target.checked ? { lembaga_formal: '', kelas_formal: '', id_formal: '' } : {})
                      }))
                    }}
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
                          onChange={(e) => {
                            clearListWajibLock()
                            setFormData(prev => ({ ...prev, lembaga_formal: e.target.value, kelas_formal: '', id_formal: '' }))
                          }}
                          className="flex-1 min-w-[7rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                        >
                          <option value="">Formal</option>
                          {lembagaFormalOptions.map((l) => (
                            <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                          ))}
                        </select>
                        <select
                          value={formData.kelas_formal ?? ''}
                          onChange={(e) => {
                            clearListWajibLock()
                            setFormData(prev => ({ ...prev, kelas_formal: e.target.value, id_formal: '' }))
                          }}
                          disabled={!formData.lembaga_formal}
                          className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                        >
                          <option value="">Kelas</option>
                          {kelasFormalOptions.map((k) => (
                            <option key={k} value={k}>{k || '-'}</option>
                          ))}
                        </select>
                        <select
                          value={formData.id_formal ?? ''}
                          onChange={(e) => {
                            clearListWajibLock()
                            setFormData(prev => ({ ...prev, id_formal: e.target.value }))
                          }}
                          disabled={!formData.lembaga_formal || !formData.kelas_formal}
                          className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">LTTQ</label>
                <select
                  value={formData.lttq}
                  onChange={(e) => {
                    clearListWajibLock()
                    setFormData(prev => ({ ...prev, lttq: e.target.value }))
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Saudara</label>
                <select
                  value={formData.saudara}
                  onChange={(e) => {
                    clearListWajibLock()
                    setFormData(prev => ({ ...prev, saudara: e.target.value }))
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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

              <div className="flex gap-2 pt-2 pb-6">
                <button
                  type="submit"
                  className="flex-1 bg-teal-600 text-white px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-teal-700"
                >
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
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

export default UwabaEditOffcanvas
