import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { uwabaAPI, pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import {
  calculateWajibFromBiodata,
  buildUniqueWajibJsonList,
  mapUwabaDbRowsToWajibListInput,
  hijriUwabaBulanList,
} from '../../../utils/uwabaCalculator'

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

/**
 * @param {'lengkapi'|'edit'} mode — lengkapi: tambah bulan; edit: ubah bulan terpilih + redistribusi nominal
 */
function LengkapiDataOffcanvas({ isOpen, onClose, selectedSantriList, uwabaPrices, tahunAjaran, onSuccess, mode = 'lengkapi' }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSantri: null })
  const [failedMessages, setFailedMessages] = useState([])

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
    lttq: '',
    saudara: 'Tidak Ada',
    wajib: 0,
    keterangan: '',
    is_disabled: 0,
    sama: 1,
  })

  const [hargaDetail, setHargaDetail] = useState({
    harga_dasar: 0,
    harga_diniyah: 0,
    harga_formal: 0,
    harga_lttq: 0,
    diskon_saudara: 0,
    diskon_saudara_type: '',
  })

  const [statusSantriOptions, setStatusSantriOptions] = useState([])
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

  const [selectedBulanIds, setSelectedBulanIds] = useState(() => {
    const o = {}
    hijriUwabaBulanList.forEach((b) => { o[b.id] = true })
    return o
  })

  const clearListWajibLock = useCallback(() => setWajibLockedFromList(false), [])

  const uniqueWajibList = useMemo(() => {
    const mapped = mapUwabaDbRowsToWajibListInput(wajibListRawRows)
    return buildUniqueWajibJsonList(mapped)
  }, [wajibListRawRows])

  const statusSantriRenderedOptions = useMemo(() => {
    const base = statusSantriOptions.length > 0 ? statusSantriOptions : ['Mukim']
    const current = String(formData.status_santri || '').trim()
    const merged = current && !base.includes(current) ? [current, ...base] : base
    return [...new Set(merged)]
  }, [statusSantriOptions, formData.status_santri])

  const wajibListSantriKey = selectedSantriList?.[0]?.id ?? selectedSantriList?.[0]?.nis ?? ''

  const loadWajibListAllYears = useCallback(async () => {
    if (wajibListSantriKey === '' || wajibListSantriKey == null) {
      setWajibListRawRows([])
      setWajibListError('Pilih santri')
      return
    }
    setWajibListLoading(true)
    setWajibListError(null)
    try {
      const res = await uwabaAPI.getAllRowsForSantri(wajibListSantriKey)
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
  }, [wajibListSantriKey])

  useEffect(() => {
    if (!isOpen) {
      setShowWajibList(false)
      setWajibListRawRows([])
      setWajibListError(null)
      setWajibListLoading(false)
      setWajibLockedFromList(false)
      setFailedMessages([])
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && showWajibList) {
      loadWajibListAllYears()
    }
  }, [isOpen, showWajibList, loadWajibListAllYears])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    Promise.all([
      uwabaAPI.getStatusSantriOptions(),
      pendaftaranAPI.getLembagaOptions('Diniyah'),
      pendaftaranAPI.getLembagaOptions('Formal'),
    ]).then(([sRes, dRes, fRes]) => {
      if (cancelled) return
      if (sRes?.success && Array.isArray(sRes.data)) setStatusSantriOptions(sRes.data)
      if (dRes?.success && Array.isArray(dRes.data)) setLembagaDiniyahOptions(dRes.data)
      if (fRes?.success && Array.isArray(fRes.data)) setLembagaFormalOptions(fRes.data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    pendaftaranAPI.getKategoriOptions(formData.status_santri).then((kRes) => {
      if (cancelled) return
      if (kRes?.success && Array.isArray(kRes.data)) setKategoriOptions(kRes.data)
      else setKategoriOptions([])
    }).catch(() => {
      if (!cancelled) setKategoriOptions([])
    })
    return () => { cancelled = true }
  }, [isOpen, formData.status_santri])

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
      const lembagaDId = matchLembagaId(lembagaDiniyahOptions, diniyahVal)
      const lembagaFId = matchLembagaId(lembagaFormalOptions, formalVal)
      setFormData({
        status_santri: firstSantri.status_santri || firstSantri.status || 'Mukim',
        kategori: firstSantri.kategori || '',
        lembaga_diniyah: lembagaDId || (diniyahVal != null && diniyahVal !== '' ? String(diniyahVal) : ''),
        kelas_diniyah: '',
        id_diniyah: '',
        tidak_sekolah_diniyah: String(diniyahVal || '').trim() === 'Tidak Sekolah',
        lembaga_formal: lembagaFId || (formalVal != null && formalVal !== '' ? String(formalVal) : ''),
        kelas_formal: '',
        id_formal: '',
        tidak_sekolah_formal: String(formalVal || '').trim() === 'Tidak Sekolah',
        lttq: firstSantri.lttq || '',
        saudara: firstSantri.saudara_di_pesantren || firstSantri.saudara || 'Tidak Ada',
        wajib: firstSantri.wajib_sebulan || 0,
        keterangan: '',
        is_disabled: 0,
        sama: 1,
      })
      setProgress({ current: 0, total: selectedSantriList.length, currentSantri: null })
      setFailedMessages([])
      const o = {}
      hijriUwabaBulanList.forEach((b) => { o[b.id] = true })
      setSelectedBulanIds(o)
    }
  }, [isOpen, selectedSantriList, lembagaDiniyahOptions, lembagaFormalOptions])

  const diniyahPriceKey = formData.tidak_sekolah_diniyah ? 'Tidak Sekolah' : String(formData.lembaga_diniyah ?? '').trim()
  const formalPriceKey = formData.tidak_sekolah_formal ? 'Tidak Sekolah' : String(formData.lembaga_formal ?? '').trim()

  useEffect(() => {
    if (!uwabaPrices) return
    if (wajibLockedFromList) return
    const biodata = {
      status_santri: formData.status_santri,
      kategori: formData.kategori,
      diniyah: diniyahPriceKey,
      formal: formalPriceKey,
      lttq: formData.lttq,
      saudara: formData.saudara,
    }
    const wajib = calculateWajibFromBiodata(biodata, uwabaPrices)
    let hargaDasar = 0
    if (formData.status_santri && formData.kategori && uwabaPrices.status_santri?.[formData.status_santri]?.[formData.kategori]) {
      hargaDasar = uwabaPrices.status_santri[formData.status_santri][formData.kategori].wajib || 0
    }
    const hargaDiniyah = uwabaPrices.diniyah?.[diniyahPriceKey]?.wajib || 0
    const hargaFormal = uwabaPrices.formal?.[formalPriceKey]?.wajib || 0
    const hargaLttq = uwabaPrices.lttq?.[formData.lttq]?.wajib || 0
    const totalSebelumDiskon = hargaDasar + hargaDiniyah + hargaFormal + hargaLttq
    let diskonSaudara = 0
    let diskonSaudaraType = ''
    if (formData.saudara && formData.saudara !== 'Tidak Ada' && uwabaPrices.saudara?.[formData.saudara]) {
      const saudaraConfig = uwabaPrices.saudara[formData.saudara]
      diskonSaudaraType = saudaraConfig.diskon_type || 'fixed'
      diskonSaudara = diskonSaudaraType === 'percentage' ? (totalSebelumDiskon * saudaraConfig.diskon) / 100 : (saudaraConfig.diskon || 0)
    }
    setHargaDetail({
      harga_dasar: hargaDasar,
      harga_diniyah: hargaDiniyah,
      harga_formal: hargaFormal,
      harga_lttq: hargaLttq,
      diskon_saudara: diskonSaudara,
      diskon_saudara_type: diskonSaudaraType,
    })
    if (formData.status_santri && formData.kategori) {
      setFormData(prev => ({ ...prev, wajib }))
    }
  }, [formData.status_santri, formData.kategori, diniyahPriceKey, formalPriceKey, formData.lttq, formData.saudara, uwabaPrices, wajibLockedFromList])

  const wajibSave = wajibLockedFromList ? Number(formData.wajib) : Number(formData.wajib) || 0

  const applyWajibListItem = useCallback((item) => {
    const w = Number(item?.wajib) || 0
    const jd = item?.jsonData
    if (!jd || typeof jd !== 'object') {
      setWajibLockedFromList(true)
      setFormData(prev => ({ ...prev, wajib: w }))
      showNotification('Nominal wajib dipilih dari daftar.', 'success')
      return
    }
    const dStr = jd.diniyah ?? ''
    const fStr = jd.formal ?? ''
    const lembagaDId = matchLembagaId(lembagaDiniyahOptions, dStr)
    const lembagaFId = matchLembagaId(lembagaFormalOptions, fStr)
    const dinKey = String(dStr).trim() === 'Tidak Sekolah' ? 'Tidak Sekolah' : String(lembagaDId || '').trim()
    const forKey = String(fStr).trim() === 'Tidak Sekolah' ? 'Tidak Sekolah' : String(lembagaFId || '').trim()
    setWajibLockedFromList(true)
    setFormData(prev => ({
      ...prev,
      status_santri: jd.status_santri || prev.status_santri,
      kategori: jd.kategori || '',
      tidak_sekolah_diniyah: String(dStr).trim() === 'Tidak Sekolah',
      tidak_sekolah_formal: String(fStr).trim() === 'Tidak Sekolah',
      lembaga_diniyah: dinKey === 'Tidak Sekolah' ? '' : lembagaDId,
      lembaga_formal: forKey === 'Tidak Sekolah' ? '' : lembagaFId,
      kelas_diniyah: '',
      id_diniyah: '',
      kelas_formal: '',
      id_formal: '',
      lttq: jd.lttq || '',
      saudara: jd.saudara || jd.saudara_di_pesantren || 'Tidak Ada',
      wajib: w,
    }))
    setHargaDetail({
      harga_dasar: jd.harga_dasar ?? 0,
      harga_diniyah: jd.harga_diniyah ?? 0,
      harga_formal: jd.harga_formal ?? 0,
      harga_lttq: jd.harga_lttq ?? 0,
      diskon_saudara: jd.diskon_saudara ?? 0,
      diskon_saudara_type: jd.diskon_saudara_type ?? '',
    })
    showNotification('Disimpan dari pilihan daftar wajib.', 'success')
  }, [lembagaDiniyahOptions, lembagaFormalOptions, showNotification])

  const idBulansPicked = useMemo(
    () => hijriUwabaBulanList.filter((b) => selectedBulanIds[b.id]).map((b) => b.id),
    [selectedBulanIds],
  )

  const toggleBulan = (id) => {
    setSelectedBulanIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const selectAllBulan = (on) => {
    const o = {}
    hijriUwabaBulanList.forEach((b) => { o[b.id] = on })
    setSelectedBulanIds(o)
  }

  const runSubmit = async () => {
    if (!formData.status_santri || !formData.kategori) {
      showNotification('Status Santri dan Kategori harus diisi', 'error')
      return
    }
    if (!selectedSantriList || selectedSantriList.length === 0) {
      showNotification('Tidak ada santri yang dipilih', 'error')
      return
    }
    if (idBulansPicked.length === 0) {
      showNotification('Pilih minimal satu bulan', 'error')
      return
    }

    const json_breakdown = {
      harga_dasar: hargaDetail.harga_dasar,
      harga_diniyah: hargaDetail.harga_diniyah,
      harga_formal: hargaDetail.harga_formal,
      harga_lttq: hargaDetail.harga_lttq,
      diskon_saudara: hargaDetail.diskon_saudara,
      diskon_saudara_type: hargaDetail.diskon_saudara_type,
    }

    const payload = {
      status_santri: formData.status_santri,
      kategori: formData.kategori,
      diniyah: diniyahPriceKey || '',
      formal: formalPriceKey || '',
      lttq: formData.lttq || '',
      saudara_di_pesantren: formData.saudara || 'Tidak Ada',
      wajib: wajibSave || 0,
      keterangan: formData.keterangan || '',
      is_disabled: formData.is_disabled ?? 0,
      sama: formData.sama ?? 1,
      json_breakdown,
    }

    setLoading(true)
    setProgress({ current: 0, total: selectedSantriList.length, currentSantri: null })
    setFailedMessages([])

    const errors = []
    let successCount = 0

    try {
      for (let i = 0; i < selectedSantriList.length; i++) {
        const santri = selectedSantriList[i]
        setProgress({ current: i + 1, total: selectedSantriList.length, currentSantri: santri.nama })
        try {
          const result = await uwabaAPI.lengkapiData(santri.id, tahunAjaran, payload, {
            mode: mode === 'edit' ? 'edit' : 'create',
            idBulans: idBulansPicked,
          })
          if (result.success) {
            successCount++
          } else {
            const msg = result.message || 'Gagal'
            errors.push(`${santri.nama} (ID ${santri.id}): ${msg}`)
          }
        } catch (error) {
          errors.push(`${santri.nama} (ID ${santri.id}): ${error.message || 'Terjadi kesalahan'}`)
        }
      }

      setFailedMessages(errors)

      if (successCount > 0) {
        onSuccess()
        showNotification(
          mode === 'edit'
            ? `Berhasil memperbarui ${successCount} santri${errors.length ? `, ${errors.length} gagal` : ''}`
            : `Berhasil menambah bulan UWABA untuk ${successCount} santri${errors.length ? `, ${errors.length} gagal` : ''}`,
          errors.length ? 'warning' : 'success',
        )
        if (errors.length === 0) {
          onClose()
        }
      } else {
        showNotification('Tidak ada data yang tersimpan', 'error')
      }
    } catch (error) {
      console.error(error)
      showNotification('Terjadi kesalahan', 'error')
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0, currentSantri: null })
    }
  }

  const title = mode === 'edit' ? 'Edit UWABA (massal)' : 'Lengkapi UWABA (massal)'
  const subtitle = mode === 'edit'
    ? 'Ubah bulan terpilih, lalu nominal per bulan disesuaikan ulang dari total riwayat pembayaran. Jika pembayaran berlebih terhadap wajib baru, penyimpanan dibatalkan untuk santri tersebut.'
    : 'Tambah baris bulan UWABA yang belum ada sesuai pilihan. Isian mengikuti form edit UWABA per bulan.'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="lengkapi-uwaba-backdrop"
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
          key="lengkapi-uwaba-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex justify-between items-start gap-2">
              <div className="pr-2 min-w-0">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{title}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none shrink-0"
                aria-label="Tutup"
              >
                ×
              </button>
            </div>

            {selectedSantriList && selectedSantriList.length > 0 && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                <span className="font-medium text-gray-700 dark:text-gray-300">{selectedSantriList.length} santri dipilih</span>
                {selectedSantriList.length <= 4 && (
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    {selectedSantriList.map((s) => (
                      <li key={s.id}>{s.nama} · {s.count ?? '?'}/10 bulan</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 min-w-0">Wajib (per bulan dipilih)</label>
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
                  title="Daftar wajib unik (santri pertama)"
                  aria-expanded={showWajibList}
                >
                  <motion.svg className="w-5 h-5 block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} animate={{ rotate: showWajibList ? 180 : 0 }} transition={listAnimTransition}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                  </motion.svg>
                </motion.button>
              </div>
              <input
                type="text"
                readOnly
                value={wajibSave > 0 ? wajibSave.toLocaleString('id-ID') : ''}
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Sebelum potongan: Rp {(hargaDetail.harga_dasar + hargaDetail.harga_diniyah + hargaDetail.harga_formal + hargaDetail.harga_lttq).toLocaleString('id-ID')}
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
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={listAnimTransition} className="overflow-hidden mt-2">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/50 overflow-hidden">
                      <p className="px-2 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                        Berdasarkan santri pertama dalam pilihan. Nominal sama digabung; JSON dari baris terbaru.
                      </p>
                      {wajibListLoading ? <p className="px-2 py-4 text-xs text-center text-gray-500">Memuat…</p> : null}
                      {!wajibListLoading && wajibListError ? <p className="px-2 py-3 text-xs text-red-600 dark:text-red-400">{wajibListError}</p> : null}
                      {!wajibListLoading && !wajibListError && uniqueWajibList.length === 0 ? <p className="px-2 py-3 text-xs text-gray-500">Belum ada data.</p> : null}
                      {!wajibListLoading && !wajibListError && uniqueWajibList.length > 0 ? (
                        <div className="max-h-40 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-600">
                          {uniqueWajibList.map((item) => (
                            <div key={item.wajib} className="px-2 py-2 flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-teal-700 dark:text-teal-300">Rp {item.wajib.toLocaleString('id-ID')}</span>
                              <button type="button" className="shrink-0 px-2 py-1 rounded-md text-[11px] font-medium bg-teal-600 text-white hover:bg-teal-700" onClick={() => applyWajibListItem(item)}>Pilih</button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {loading && progress.total > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <span className="truncate">{progress.currentSantri || '…'}</span>
                  <span>{progress.current}/{progress.total}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-teal-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status Santri</label>
                <select
                  value={formData.status_santri}
                  onChange={(e) => {
                    clearListWajibLock()
                    setFormData(prev => ({ ...prev, status_santri: e.target.value, kategori: '' }))
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                >
                  {statusSantriRenderedOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Pilih Kategori</option>
                  {kategoriOptions.map((opt) => {
                    const harga = uwabaPrices?.status_santri?.[formData.status_santri]?.[opt]?.wajib || 0
                    return (
                      <option key={opt} value={opt}>{opt}{harga > 0 ? ` — Rp ${harga.toLocaleString('id-ID')}` : ''}</option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
                  <input type="checkbox" checked={formData.tidak_sekolah_diniyah} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, tidak_sekolah_diniyah: e.target.checked, ...(e.target.checked ? { lembaga_diniyah: '', kelas_diniyah: '', id_diniyah: '' } : {}) })) }} className="w-3.5 h-3.5 text-teal-600 rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Tidak Sekolah (Diniyah)</span>
                </label>
                <AnimatePresence initial={false}>
                  {!formData.tidak_sekolah_diniyah && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="flex gap-1 flex-wrap">
                        <select value={formData.lembaga_diniyah ?? ''} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, lembaga_diniyah: e.target.value, kelas_diniyah: '', id_diniyah: '' })) }} className="flex-1 min-w-[7rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                          <option value="">Diniyah</option>
                          {lembagaDiniyahOptions.map((l) => (<option key={l.id} value={l.id}>{l.nama || l.id}</option>))}
                        </select>
                        <select value={formData.kelas_diniyah ?? ''} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, kelas_diniyah: e.target.value, id_diniyah: '' })) }} disabled={!formData.lembaga_diniyah} className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                          <option value="">Kelas</option>
                          {kelasDiniyahOptions.map((k) => (<option key={k} value={k}>{k || '-'}</option>))}
                        </select>
                        <select value={formData.id_diniyah ?? ''} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, id_diniyah: e.target.value })) }} disabled={!formData.lembaga_diniyah || !formData.kelas_diniyah} className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                          <option value="">Kel</option>
                          {kelDiniyahOptions.map((r) => (<option key={r.id} value={r.id}>{r.kel ?? '-'}</option>))}
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
                  <input type="checkbox" checked={formData.tidak_sekolah_formal} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, tidak_sekolah_formal: e.target.checked, ...(e.target.checked ? { lembaga_formal: '', kelas_formal: '', id_formal: '' } : {}) })) }} className="w-3.5 h-3.5 text-teal-600 rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Tidak Sekolah (Formal)</span>
                </label>
                <AnimatePresence initial={false}>
                  {!formData.tidak_sekolah_formal && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="flex gap-1 flex-wrap">
                        <select value={formData.lembaga_formal ?? ''} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, lembaga_formal: e.target.value, kelas_formal: '', id_formal: '' })) }} className="flex-1 min-w-[7rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                          <option value="">Formal</option>
                          {lembagaFormalOptions.map((l) => (<option key={l.id} value={l.id}>{l.nama || l.id}</option>))}
                        </select>
                        <select value={formData.kelas_formal ?? ''} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, kelas_formal: e.target.value, id_formal: '' })) }} disabled={!formData.lembaga_formal} className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                          <option value="">Kelas</option>
                          {kelasFormalOptions.map((k) => (<option key={k} value={k}>{k || '-'}</option>))}
                        </select>
                        <select value={formData.id_formal ?? ''} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, id_formal: e.target.value })) }} disabled={!formData.lembaga_formal || !formData.kelas_formal} className="flex-1 min-w-[5rem] p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                          <option value="">Kel</option>
                          {kelFormalOptions.map((r) => (<option key={r.id} value={r.id}>{r.kel ?? '-'}</option>))}
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">LTTQ</label>
                <select value={formData.lttq} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, lttq: e.target.value })) }} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                  <option value="">Pilih LTTQ</option>
                  {['Asfal', 'Ibtidaiyah', 'Tsanawiyah', 'Aliyah', 'Mualim', 'Ngaji Kitab', 'Tidak Mengaji'].map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Saudara di Pesantren</label>
                <select value={formData.saudara} onChange={(e) => { clearListWajibLock(); setFormData(prev => ({ ...prev, saudara: e.target.value })) }} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                  {['Tidak Ada', '1', '2', '3', '4'].map((opt) => (
                    <option key={opt} value={opt}>{opt === 'Tidak Ada' ? opt : `${opt} Saudara`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keterangan</label>
                <input type="text" value={formData.keterangan} onChange={(e) => setFormData(prev => ({ ...prev, keterangan: e.target.value }))} placeholder="Opsional" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="lengkapi_is_disabled" checked={formData.is_disabled === 1} onChange={(e) => setFormData(prev => ({ ...prev, is_disabled: e.target.checked ? 1 : 0 }))} className="w-4 h-4 text-teal-600 rounded" />
                <label htmlFor="lengkapi_is_disabled" className="text-sm text-gray-700 dark:text-gray-300">Tidak masuk (bulan dipilih)</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="lengkapi_sama" checked={formData.sama === 1} onChange={(e) => setFormData(prev => ({ ...prev, sama: e.target.checked ? 1 : 0 }))} className="w-4 h-4 text-teal-600 rounded" />
                <label htmlFor="lengkapi_sama" className="text-sm text-gray-700 dark:text-gray-300">Sama dengan sebelumnya</label>
              </div>

              <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulan {mode === 'edit' ? 'diubah' : 'ditambah'}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => selectAllBulan(true)} className="text-[11px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">Semua</button>
                    <button type="button" onClick={() => selectAllBulan(false)} className="text-[11px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">Kosongkan</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                  {hijriUwabaBulanList.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer rounded border border-gray-200 dark:border-gray-600 px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <input type="checkbox" checked={!!selectedBulanIds[b.id]} onChange={() => toggleBulan(b.id)} className="rounded text-teal-600" />
                      <span className="truncate">{b.nama}</span>
                    </label>
                  ))}
                </div>
              </div>

              {failedMessages.length > 0 && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                  <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-1">Gagal ({failedMessages.length})</p>
                  <ul className="text-[11px] text-red-700 dark:text-red-300 space-y-1 max-h-32 overflow-y-auto list-disc list-inside">
                    {failedMessages.map((m, i) => (<li key={i}>{m}</li>))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={loading || !formData.status_santri || !formData.kategori}
                  onClick={runSubmit}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Memproses…' : (mode === 'edit' ? 'Simpan & alokasi ulang' : 'Tambah bulan UWABA')}
                </button>
                <button type="button" onClick={onClose} disabled={loading} className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Tutup</button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default LengkapiDataOffcanvas
