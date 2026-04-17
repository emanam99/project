import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useSantriDetailOffcanvas } from '../../contexts/SantriDetailOffcanvasContext'
import { useNotification } from '../../contexts/NotificationContext'
import { kategoriBadgeClass } from './kategoriBadgeClass'
import { tarbiyahDomisiliSantriAPI } from '../../services/api'
import { registerDomisiliPopstateLayer, DOMISILI_POP_PRIORITY } from '../../history/domisiliPopstateStack'

const STACK = {
  daerah: { backdrop: 'z-[192]', panel: 'z-[193]', key: 'daerah-santri' },
  kamar: { backdrop: 'z-[190]', panel: 'z-[191]', key: 'kamar-santri' }
}

const KATEGORI_ORDER = ['Banin', 'Banat']

/** Keterangan sumber catatan: Domisili + daerah.kamar (nama kamar). */
function buildCatatanKeteranganDomisili(kamar) {
  if (!kamar) return 'Domisili'
  const daerah = String(kamar.daerah_nama ?? `Daerah #${kamar.id_daerah ?? ''}`).trim() || '–'
  const km = String(kamar.kamar ?? '–').trim() || '–'
  return `Domisili · ${daerah}.${km}`
}

function normalizeStatus(s) {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

/**
 * Offcanvas daftar santri per kamar — dipakai halaman Daerah & Kamar (satu tampilan).
 */
export function SantriPerKamarOffcanvas({
  variant = 'kamar',
  open,
  kamar,
  rows,
  onClose,
  onEditKamar,
  daerahList = [],
  kamarList = [],
  onSantriListChanged,
  tahunAjaranHijriyah = '',
  tahunAjaranMasehi = ''
}) {
  const { openSantriDetail } = useSantriDetailOffcanvas()
  const { showNotification } = useNotification()
  const stack = STACK[variant] || STACK.kamar
  /** Default Mukim; reset saat panel ditutup */
  const [filterStatusSantri, setFilterStatusSantri] = useState('Mukim')

  /** Sheet dalam panel kanan: menu | pindah | catatan */
  const [sheetMode, setSheetMode] = useState(null)
  const [actionSantri, setActionSantri] = useState(null)
  const [pindahStep, setPindahStep] = useState(0)
  const [pindahKategori, setPindahKategori] = useState('')
  const [pindahDaerahId, setPindahDaerahId] = useState('')
  const [pindahTargetKamar, setPindahTargetKamar] = useState(null)
  const [catatanText, setCatatanText] = useState('')
  const [catatanList, setCatatanList] = useState([])
  const [catatanLoading, setCatatanLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /** Mode pilih massal + sheet opsi massal (pindah/boyong). */
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkSheet, setBulkSheet] = useState(null)

  /** Satu entri history untuk sheet opsi — tombol kembali browser menutup sheet, bukan panel santri (halaman Daerah). */
  const sheetStackPushedRef = useRef(false)
  const ignoreNextSheetPopRef = useRef(false)
  const openRef = useRef(false)
  const sheetOpenRef = useRef(false)
  const resetSheetsRef = useRef(() => {})
  const dismissOverlaySheetsRef = useRef(() => {})
  /** Setelah `window.confirm`, browser sering mengirim klik ke backdrop → menutup panel santri. */
  const suppressPanelBackdropCloseRef = useRef(false)

  const resetSheets = useCallback(() => {
    setSheetMode(null)
    setActionSantri(null)
    setPindahStep(0)
    setPindahKategori('')
    setPindahDaerahId('')
    setPindahTargetKamar(null)
    setCatatanText('')
    setCatatanList([])
    setCatatanLoading(false)
    setSubmitting(false)
  }, [])

  resetSheetsRef.current = resetSheets

  const dismissOverlaySheets = useCallback(() => {
    resetSheets()
    setBulkSheet(null)
  }, [resetSheets])

  dismissOverlaySheetsRef.current = dismissOverlaySheets

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    sheetOpenRef.current = Boolean((sheetMode && actionSantri) || bulkSheet)
  }, [sheetMode, actionSantri, bulkSheet])

  useEffect(() => {
    if (bulkSheet && selectedIds.length === 0) {
      setBulkSheet(null)
    }
  }, [bulkSheet, selectedIds.length])

  /** Sheet / ignore — satu stack Domisili (prioritas di atas panel Daerah). */
  useEffect(() => {
    return registerDomisiliPopstateLayer('santri-per-kamar-sheet', DOMISILI_POP_PRIORITY.santriPerKamar, () => {
      if (ignoreNextSheetPopRef.current) {
        ignoreNextSheetPopRef.current = false
        return true
      }
      if (!openRef.current) return false
      if (!sheetOpenRef.current) return false
      dismissOverlaySheetsRef.current()
      sheetStackPushedRef.current = false
      return true
    })
  }, [])

  useEffect(() => {
    if (!open) {
      if (sheetStackPushedRef.current) {
        sheetStackPushedRef.current = false
        ignoreNextSheetPopRef.current = true
        window.history.back()
      }
      setFilterStatusSantri('Mukim')
      setSelectMode(false)
      setSelectedIds([])
      setBulkSheet(null)
      resetSheets()
      return
    }
    if (((sheetMode && actionSantri) || bulkSheet) && !sheetStackPushedRef.current) {
      window.history.pushState({ santriDomisiliOpsi: 1 }, '', window.location.pathname + window.location.search + (window.location.hash || ''))
      sheetStackPushedRef.current = true
    }
  }, [open, sheetMode, actionSantri, bulkSheet, resetSheets])

  const openMenuFor = useCallback((s, e) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    setBulkSheet(null)
    setActionSantri(s)
    setSheetMode('menu')
  }, [])

  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => {
      resetSheets()
      setBulkSheet(null)
      if (v) {
        setSelectedIds([])
      }
      return !v
    })
  }, [resetSheets])

  const toggleRowSelected = useCallback((id) => {
    if (id == null) return
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const clearRowSelection = useCallback(() => {
    setSelectedIds([])
  }, [])

  const kategoriOptionsPindah = useMemo(() => {
    const set = new Set()
    daerahList.forEach((d) => {
      const k = d.kategori != null ? String(d.kategori).trim() : ''
      if (k) set.add(k)
    })
    return KATEGORI_ORDER.filter((k) => set.has(k))
  }, [daerahList])

  const daerahForPindah = useMemo(() => {
    if (!pindahKategori) return []
    return daerahList
      .filter((d) => String(d.kategori ?? '').trim() === pindahKategori)
      .slice()
      .sort((a, b) => String(a.daerah ?? '').localeCompare(String(b.daerah ?? ''), 'id', { sensitivity: 'base', numeric: true }))
  }, [daerahList, pindahKategori])

  const kamarForPindah = useMemo(() => {
    if (!pindahDaerahId) return []
    const did = String(pindahDaerahId)
    return kamarList
      .filter((km) => String(km.id_daerah) === did && normalizeStatus(km.status) === 'aktif')
      .slice()
      .sort((a, b) => String(a.kamar ?? '').localeCompare(String(b.kamar ?? ''), 'id', { sensitivity: 'base', numeric: true }))
  }, [kamarList, pindahDaerahId])

  const loadCatatan = useCallback(async (idSantri) => {
    if (!idSantri) return
    setCatatanLoading(true)
    try {
      const res = await tarbiyahDomisiliSantriAPI.getCatatan(idSantri)
      if (res?.success && Array.isArray(res.data)) setCatatanList(res.data)
      else setCatatanList([])
    } catch {
      setCatatanList([])
    } finally {
      setCatatanLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sheetMode === 'catatan' && actionSantri?.id != null) {
      loadCatatan(actionSantri.id)
    }
  }, [sheetMode, actionSantri?.id, loadCatatan])

  const title =
    kamar != null
      ? `${(kamar.daerah_nama || `Daerah #${kamar.id_daerah}`).trim()}.${String(kamar.kamar || '-').trim()}`
      : 'Daerah.–'

  const catatanKeteranganAsal = useMemo(() => buildCatatanKeteranganDomisili(kamar), [kamar])

  const ketuaNama =
    kamar?.ketua_aktif_nama != null && String(kamar.ketua_aktif_nama).trim() !== ''
      ? String(kamar.ketua_aktif_nama).trim()
      : null

  const statusSantriOptions = useMemo(() => {
    const uniq = new Set()
    rows.forEach((s) => {
      const v = s.status_santri != null ? String(s.status_santri).trim() : ''
      if (v) uniq.add(v)
    })
    const sorted = [...uniq].sort((a, b) => a.localeCompare(b, 'id'))
    return sorted
  }, [rows])

  const displayRows = useMemo(() => {
    if (filterStatusSantri === '') return rows
    const want = filterStatusSantri.trim().toLowerCase()
    return rows.filter((s) => String(s.status_santri ?? '').trim().toLowerCase() === want)
  }, [rows, filterStatusSantri])

  const selectAllDisplayed = useCallback(() => {
    const ids = displayRows.map((s) => s.id).filter((id) => id != null)
    setSelectedIds(ids)
  }, [displayRows])

  const openBulkOptions = useCallback(() => {
    if (selectedIds.length === 0) return
    resetSheets()
    setBulkSheet('menu')
  }, [resetSheets, selectedIds.length])

  const handleRowActivate = useCallback(
    (s, e) => {
      e?.stopPropagation?.()
      if (selectMode && s?.id != null) {
        toggleRowSelected(s.id)
        return
      }
      if (s?.id != null || s?.nis != null) openSantriDetail(s)
    },
    [openSantriDetail, selectMode, toggleRowSelected]
  )

  /**
   * @param {{ skipHistoryBack?: boolean }} [opts] — setelah boyong: jangan `history.back()` agar tidak mem-pop lapisan panel santri (stack Daerah).
   */
  const closeSheet = useCallback((opts) => {
    const skipHistoryBack = opts?.skipHistoryBack === true
    const needHistoryPop = sheetStackPushedRef.current && !skipHistoryBack
    /** Wajib sebelum dismiss: jika `sheetOpenRef` sudah false saat `popstate` (flush React), handler capture harus tetap memakai branch `ignoreNextSheetPopRef` agar tidak meneruskan ke Daerah (yang menutup panel santri). */
    if (needHistoryPop) {
      ignoreNextSheetPopRef.current = true
      sheetStackPushedRef.current = false
    }
    dismissOverlaySheets()
    if (needHistoryPop && typeof window !== 'undefined' && window.history) {
      window.history.back()
    } else if (skipHistoryBack && sheetStackPushedRef.current) {
      sheetStackPushedRef.current = false
    }
  }, [dismissOverlaySheets])

  const handlePindahKamar = async () => {
    if (!actionSantri?.id || !pindahTargetKamar?.id) return
    setSubmitting(true)
    try {
      const res = await tarbiyahDomisiliSantriAPI.pindahKamar({
        id_santri: actionSantri.id,
        id_kamar: pindahTargetKamar.id
      })
      if (res?.success) {
        showNotification('Santri dipindahkan ke kamar baru.', 'success')
        if (typeof onSantriListChanged === 'function') await onSantriListChanged()
        closeSheet()
        onClose()
      } else {
        showNotification(res?.message || 'Gagal pindah kamar', 'error')
      }
    } catch (err) {
      showNotification(err?.message || 'Gagal pindah kamar', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBoyong = async () => {
    if (!actionSantri?.id) return
    setSubmitting(true)
    try {
      const res = await tarbiyahDomisiliSantriAPI.boyongDomisili({
        id_santri: actionSantri.id,
        tahun_hijriyah: tahunAjaranHijriyah || null,
        tahun_masehi: tahunAjaranMasehi || null
      })
      if (res?.success) {
        showNotification('Boyong tercatat (belum mengurusi).', 'success')
        if (typeof onSantriListChanged === 'function') await onSantriListChanged()
        closeSheet({ skipHistoryBack: true })
      } else {
        showNotification(res?.message || 'Gagal mencatat boyong', 'error')
      }
    } catch (err) {
      showNotification(err?.message || 'Gagal mencatat boyong', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBulkPindahKamar = async () => {
    if (selectedIds.length === 0 || !pindahTargetKamar?.id) return
    setSubmitting(true)
    let ok = 0
    let fail = 0
    try {
      for (const id of selectedIds) {
        try {
          const res = await tarbiyahDomisiliSantriAPI.pindahKamar({
            id_santri: id,
            id_kamar: pindahTargetKamar.id
          })
          if (res?.success) ok += 1
          else fail += 1
        } catch {
          fail += 1
        }
      }
      if (ok > 0) {
        showNotification(
          `${ok} santri dipindahkan.${fail > 0 ? ` ${fail} gagal.` : ''}`,
          fail === 0 ? 'success' : 'warning'
        )
        if (typeof onSantriListChanged === 'function') await onSantriListChanged()
        closeSheet({ skipHistoryBack: true })
        setSelectedIds([])
        setSelectMode(false)
      } else {
        showNotification('Gagal memindahkan santri.', 'error')
      }
    } catch (err) {
      showNotification(err?.message || 'Gagal memindahkan santri.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBulkBoyong = async () => {
    if (selectedIds.length === 0) return
    setSubmitting(true)
    let ok = 0
    let fail = 0
    try {
      for (const id of selectedIds) {
        try {
          const res = await tarbiyahDomisiliSantriAPI.boyongDomisili({
            id_santri: id,
            tahun_hijriyah: tahunAjaranHijriyah || null,
            tahun_masehi: tahunAjaranMasehi || null
          })
          if (res?.success) ok += 1
          else fail += 1
        } catch {
          fail += 1
        }
      }
      if (ok > 0) {
        showNotification(
          `${ok} boyong tercatat.${fail > 0 ? ` ${fail} gagal.` : ''}`,
          fail === 0 ? 'success' : 'warning'
        )
        if (typeof onSantriListChanged === 'function') await onSantriListChanged()
        closeSheet({ skipHistoryBack: true })
        setSelectedIds([])
        setSelectMode(false)
      } else {
        showNotification('Gagal mencatat boyong.', 'error')
      }
    } catch (err) {
      showNotification(err?.message || 'Gagal mencatat boyong.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSimpanCatatan = async () => {
    const t = catatanText.trim()
    if (!actionSantri?.id || !t) return
    setSubmitting(true)
    try {
      const res = await tarbiyahDomisiliSantriAPI.postCatatan({
        id_santri: actionSantri.id,
        catatan: t,
        keterangan: catatanKeteranganAsal
      })
      if (res?.success) {
        setCatatanText('')
        showNotification('Catatan disimpan.', 'success')
        await loadCatatan(actionSantri.id)
      } else {
        showNotification(res?.message || 'Gagal simpan catatan', 'error')
      }
    } catch (err) {
      showNotification(err?.message || 'Gagal simpan catatan', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const onMainBackdropClick = useCallback(
    (e) => {
      if (suppressPanelBackdropCloseRef.current) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      onClose()
    },
    [onClose]
  )

  const sheetTitle =
    bulkSheet === 'menu'
      ? 'Opsi massal'
      : bulkSheet === 'pindah'
        ? 'Pindah kamar (massal)'
        : sheetMode === 'menu'
          ? 'Opsi'
          : sheetMode === 'pindah'
            ? 'Pindah kamar'
            : sheetMode === 'catatan'
              ? 'Catatan'
              : ''

  const showSheetOverlay = Boolean((sheetMode && actionSantri) || (bulkSheet && selectedIds.length > 0))
  const showPindahSteps = Boolean((sheetMode === 'pindah' && actionSantri) || bulkSheet === 'pindah')
  const showSheetBack =
    bulkSheet === 'pindah' || sheetMode === 'catatan' || (sheetMode === 'pindah' && actionSantri)

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key={`${stack.key}-backdrop`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMainBackdropClick}
            className={`fixed inset-0 bg-black/50 ${stack.backdrop}`}
          />
          <motion.div
            key={`${stack.key}-panel`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl ${stack.panel} flex flex-col overflow-hidden`}
          >
            <div className="flex-shrink-0 border-b border-gray-200 p-4 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 flex-1 text-2xl font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
                  {title}
                </h3>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={kategoriBadgeClass(kamar?.daerah_kategori)}>{kamar?.daerah_kategori || '–'}</span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                    aria-label="Tutup"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              {ketuaNama ? (
                <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">{ketuaNama}</p>
              ) : (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">—</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 text-sm dark:border-gray-700">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-gray-600 dark:text-gray-400">Total santri</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{displayRows.length}</span>
                {filterStatusSantri !== '' && displayRows.length !== rows.length && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">(dari {rows.length})</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="sr-only" htmlFor={`santri-per-kamar-status-santri-${variant}`}>
                  Filter status santri
                </label>
                <select
                  id={`santri-per-kamar-status-santri-${variant}`}
                  value={filterStatusSantri}
                  onChange={(e) => setFilterStatusSantri(e.target.value)}
                  className="max-w-[11rem] rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  aria-label="Filter status santri"
                >
                  <option value="">Semua</option>
                  <option value="Mukim">Mukim</option>
                  {statusSantriOptions.filter((v) => v.toLowerCase() !== 'mukim').map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                {kamar && typeof onEditKamar === 'function' && (
                  <button
                    type="button"
                    onClick={onEditKamar}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleSelectMode}
                  aria-pressed={selectMode}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    selectMode
                      ? 'border-teal-500 bg-teal-50 text-teal-800 ring-1 ring-teal-400/60 dark:border-teal-500 dark:bg-teal-900/40 dark:text-teal-100 dark:ring-teal-500/40'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    {selectMode ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 6h16M4 10h16M4 14h16M4 18h16"
                      />
                    )}
                  </svg>
                  Pilih
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {rows.length === 0 ? (
                <p className="py-6 text-sm text-gray-500 dark:text-gray-400">Tidak ada santri di kamar ini.</p>
              ) : displayRows.length === 0 ? (
                <p className="py-6 text-sm text-gray-500 dark:text-gray-400">Tidak ada santri dengan status ini di kamar ini.</p>
              ) : (
                <>
                  {selectMode && (
                    <div className="sticky top-0 z-[5] -mx-1 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-2 py-2 shadow-sm backdrop-blur-sm dark:border-gray-600 dark:bg-gray-800/95">
                      <button
                        type="button"
                        onClick={selectAllDisplayed}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                      >
                        Pilih semua
                      </button>
                      <button
                        type="button"
                        onClick={clearRowSelection}
                        className="rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Kosongkan
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedIds.length} dipilih
                      </span>
                      <button
                        type="button"
                        disabled={selectedIds.length === 0}
                        onClick={openBulkOptions}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-100 dark:hover:bg-teal-900/50"
                      >
                        <svg className="h-3.5 w-3.5 text-current" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                          <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                        </svg>
                        Opsi
                      </button>
                    </div>
                  )}
                  <ul className="space-y-1">
                    {displayRows.map((s) => {
                      const checked = s.id != null && selectedIds.includes(s.id)
                      return (
                        <li
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleRowActivate(s, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleRowActivate(s, e)
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                            selectMode && checked
                              ? 'border-teal-300 bg-teal-50/70 dark:border-teal-700 dark:bg-teal-900/25'
                              : 'border-gray-100 bg-gray-50/50 hover:border-teal-200 hover:bg-teal-50/40 dark:border-gray-600 dark:bg-gray-700/30 dark:hover:border-teal-700 dark:hover:bg-teal-900/20'
                          }`}
                        >
                          {selectMode && (
                            <span
                              className="flex shrink-0 items-center"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRowSelected(s.id)}
                                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 dark:border-gray-500 dark:bg-gray-700 dark:focus:ring-teal-600"
                                aria-label={`Pilih ${s.nama || s.nis || 'santri'}`}
                              />
                            </span>
                          )}
                          <span className="w-16 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-400 sm:w-20">
                            {s.nis ?? '–'}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                            {s.nama || '–'}
                          </span>
                          {filterStatusSantri === '' && (
                            <span className="hidden shrink-0 text-xs text-gray-500 dark:text-gray-400 sm:inline">
                              {s.status_santri || '–'}
                            </span>
                          )}
                          {!selectMode && (
                            <button
                              type="button"
                              onClick={(e) => openMenuFor(s, e)}
                              className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-100"
                              aria-label={`Opsi untuk ${s.nama || s.nis || 'santri'}`}
                            >
                              <svg className="h-5 w-5 text-current" viewBox="0 0 24 24" aria-hidden>
                                <circle cx="12" cy="6" r="1.5" fill="currentColor" />
                                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                <circle cx="12" cy="18" r="1.5" fill="currentColor" />
                              </svg>
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>

            {/* Sheet bawah — lebar = panel (max-w-md), rata kanan, di dalam panel */}
            <AnimatePresence>
              {showSheetOverlay && (
                <>
                  <motion.button
                    key="domisili-sheet-backdrop"
                    type="button"
                    aria-label="Tutup menu"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[210] bg-black/40"
                    onClick={(e) => {
                      if (suppressPanelBackdropCloseRef.current) {
                        e.preventDefault()
                        e.stopPropagation()
                        return
                      }
                      closeSheet()
                    }}
                  />
                  <motion.div
                    key="domisili-sheet-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="santri-kamar-sheet-title"
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
                    className="absolute bottom-0 left-0 right-0 z-[211] max-h-[min(85vh,32rem)] flex flex-col rounded-t-2xl border border-gray-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:border-gray-600 dark:bg-gray-800 dark:shadow-black/40"
                  >
                    <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
                      {showSheetBack && (
                        <button
                          type="button"
                          onClick={() => {
                            const inPindahFlow =
                              (sheetMode === 'pindah' && actionSantri) || bulkSheet === 'pindah'
                            if (inPindahFlow && pindahStep > 0) {
                              if (pindahStep === 2) {
                                setPindahTargetKamar(null)
                                setPindahStep(1)
                              } else if (pindahStep === 1) {
                                setPindahDaerahId('')
                                setPindahStep(0)
                              }
                            } else if (bulkSheet === 'pindah') {
                              setBulkSheet('menu')
                              setPindahStep(0)
                              setPindahKategori('')
                              setPindahDaerahId('')
                              setPindahTargetKamar(null)
                            } else {
                              setSheetMode('menu')
                              setPindahStep(0)
                              setPindahKategori('')
                              setPindahDaerahId('')
                              setPindahTargetKamar(null)
                            }
                          }}
                          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                          aria-label="Kembali"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                      )}
                      <h4 id="santri-kamar-sheet-title" className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {sheetTitle}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeSheet()
                        }}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600"
                        aria-label="Tutup"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                      <p className="mb-2 truncate text-xs text-gray-500 dark:text-gray-400">
                        {bulkSheet
                          ? `${selectedIds.length} santri dipilih`
                          : actionSantri
                            ? `${actionSantri.nis} · ${actionSantri.nama}`
                            : ''}
                      </p>

                      {bulkSheet === 'menu' && (
                        <div className="flex flex-col gap-1 pb-2">
                          <button
                            type="button"
                            onClick={() => {
                              setBulkSheet('pindah')
                              setPindahStep(0)
                              setPindahKategori('')
                              setPindahDaerahId('')
                              setPindahTargetKamar(null)
                            }}
                            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 text-left text-sm font-medium text-gray-900 hover:border-teal-200 hover:bg-teal-50/50 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-100 dark:hover:border-teal-600"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                />
                              </svg>
                            </span>
                            Pindah kamar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Catat boyong untuk ${selectedIds.length} santri sekaligus? Status santri akan diubah menjadi Boyong.`
                                )
                              )
                                return
                              suppressPanelBackdropCloseRef.current = true
                              window.setTimeout(() => {
                                suppressPanelBackdropCloseRef.current = false
                              }, 600)
                              window.requestAnimationFrame(() => {
                                void handleBulkBoyong()
                              })
                            }}
                            disabled={submitting}
                            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 text-left text-sm font-medium text-gray-900 hover:border-amber-200 hover:bg-amber-50/50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-100 dark:hover:border-amber-700"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                              </svg>
                            </span>
                            Boyong
                          </button>
                        </div>
                      )}

                      {sheetMode === 'menu' && actionSantri && (
                        <div className="flex flex-col gap-1 pb-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSheetMode('pindah')
                              setPindahStep(0)
                              setPindahKategori('')
                              setPindahDaerahId('')
                              setPindahTargetKamar(null)
                            }}
                            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 text-left text-sm font-medium text-gray-900 hover:border-teal-200 hover:bg-teal-50/50 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-100 dark:hover:border-teal-600"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                />
                              </svg>
                            </span>
                            Pindah kamar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Catat boyong untuk ${actionSantri.nama || 'santri ini'}? Status santri akan diubah menjadi Boyong.`
                                )
                              )
                                return
                              suppressPanelBackdropCloseRef.current = true
                              window.setTimeout(() => {
                                suppressPanelBackdropCloseRef.current = false
                              }, 600)
                              window.requestAnimationFrame(() => {
                                void handleBoyong()
                              })
                            }}
                            disabled={submitting}
                            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 text-left text-sm font-medium text-gray-900 hover:border-amber-200 hover:bg-amber-50/50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-100 dark:hover:border-amber-700"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                              </svg>
                            </span>
                            Boyong
                          </button>
                          <button
                            type="button"
                            onClick={() => setSheetMode('catatan')}
                            className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 text-left text-sm font-medium text-gray-900 hover:border-sky-200 hover:bg-sky-50/50 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-100 dark:hover:border-sky-600"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </span>
                            Tambah catatan
                          </button>
                        </div>
                      )}

                      {showPindahSteps && (
                        <div className="space-y-3 pb-2">
                          {pindahStep === 0 && (
                            <>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Pilih kategori</p>
                              <ul className="space-y-1">
                                {kategoriOptionsPindah.length === 0 ? (
                                  <li className="text-sm text-gray-500">Tidak ada data daerah.</li>
                                ) : (
                                  kategoriOptionsPindah.map((kat) => (
                                    <li key={kat}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPindahKategori(kat)
                                          setPindahStep(1)
                                        }}
                                        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm hover:border-teal-300 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-teal-600"
                                      >
                                        <span className={kategoriBadgeClass(kat)}>{kat}</span>
                                        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            </>
                          )}
                          {pindahStep === 1 && (
                            <>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Pilih daerah ({pindahKategori})</p>
                              <ul className="max-h-48 space-y-1 overflow-y-auto">
                                {daerahForPindah.length === 0 ? (
                                  <li className="text-sm text-gray-500">Tidak ada daerah.</li>
                                ) : (
                                  daerahForPindah.map((d) => (
                                    <li key={d.id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPindahDaerahId(String(d.id))
                                          setPindahStep(2)
                                        }}
                                        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-teal-300 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-teal-600"
                                      >
                                        <span className="truncate">{d.daerah || `Daerah #${d.id}`}</span>
                                        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            </>
                          )}
                          {pindahStep === 2 && (
                            <>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Pilih kamar (aktif)</p>
                              {!pindahTargetKamar ? (
                                <ul className="max-h-44 space-y-1 overflow-y-auto">
                                  {kamarForPindah.length === 0 ? (
                                    <li className="text-sm text-gray-500">Tidak ada kamar aktif.</li>
                                  ) : (
                                    kamarForPindah.map((km) => {
                                      const same = kamar && String(km.id) === String(kamar.id)
                                      return (
                                        <li key={km.id}>
                                          <button
                                            type="button"
                                            disabled={same}
                                            onClick={() => setPindahTargetKamar(km)}
                                            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-teal-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:border-teal-600"
                                          >
                                            <span className="truncate">
                                              {String(km.kamar || '-').trim()}
                                              {same ? ' (kamar ini)' : ''}
                                            </span>
                                            <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                        </li>
                                      )
                                    })
                                  )}
                                </ul>
                              ) : (
                                <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-800 dark:bg-teal-900/20">
                                  <p className="text-sm text-gray-800 dark:text-gray-100">
                                    Pindahkan ke{' '}
                                    <strong>
                                      {(pindahTargetKamar.daerah_nama || 'Daerah').trim()}.
                                      {String(pindahTargetKamar.kamar || '-').trim()}
                                    </strong>
                                    ?
                                  </p>
                                  <div className="mt-3 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setPindahTargetKamar(null)}
                                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600"
                                    >
                                      Batal
                                    </button>
                                    <button
                                      type="button"
                                      disabled={submitting}
                                      onClick={bulkSheet === 'pindah' ? handleBulkPindahKamar : handlePindahKamar}
                                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                                    >
                                      {submitting ? 'Memproses…' : bulkSheet === 'pindah' ? 'Pindahkan semua' : 'Pindahkan'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {sheetMode === 'catatan' && (
                        <div className="space-y-3 pb-2">
                          <div>
                            <label htmlFor="santri-domisili-catatan" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                              Catatan baru
                            </label>
                            <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
                              <span className="font-medium text-gray-600 dark:text-gray-300">Ket:</span> {catatanKeteranganAsal}
                            </p>
                            <textarea
                              id="santri-domisili-catatan"
                              value={catatanText}
                              onChange={(e) => setCatatanText(e.target.value)}
                              rows={3}
                              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                              placeholder="Tulis catatan…"
                            />
                            <button
                              type="button"
                              disabled={submitting || !catatanText.trim()}
                              onClick={handleSimpanCatatan}
                              className="mt-2 w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              {submitting ? 'Menyimpan…' : 'Simpan catatan'}
                            </button>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Riwayat</p>
                            {catatanLoading ? (
                              <p className="text-sm text-gray-500">Memuat…</p>
                            ) : catatanList.length === 0 ? (
                              <p className="text-sm text-gray-500">Belum ada catatan.</p>
                            ) : (
                              <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                                {catatanList.map((c) => (
                                  <li
                                    key={c.id}
                                    className="rounded border border-gray-100 bg-gray-50/80 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700/40"
                                  >
                                    <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-100">{c.catatan}</p>
                                    {c.keterangan ? (
                                      <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                                        Ket: {c.keterangan}
                                      </p>
                                    ) : null}
                                    <p className="mt-1 text-xs text-gray-500">
                                      {c.pengurus_nama ? `${c.pengurus_nama} · ` : ''}
                                      {c.tanggal_dibuat
                                        ? new Date(c.tanggal_dibuat).toLocaleString('id-ID', {
                                            dateStyle: 'short',
                                            timeStyle: 'short'
                                          })
                                        : ''}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
