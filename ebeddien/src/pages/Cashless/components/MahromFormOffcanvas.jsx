import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import SearchOffcanvas from '../../../components/Biodata/SearchOffcanvas'
import { mahromAPI, santriAPI } from '../../../services/api'
import {
  emptyMahromForm,
  emptyRelasiRow,
  mahromFormFromDetail,
  mahromBiodataFromSantri,
  MAHROM_HUBUNGAN_OPTIONS,
  MAHROM_FILL_SOURCES,
  relasiRowForSantri,
  santriOptionLabel,
} from '../constants/mahromForm'
import {
  normalizeNikInput,
  isNikValid,
  extractTanggalLahirFromNIK,
  extractGenderFromNIK,
} from '../../../utils/nikUtils'
import MahromBerkasPanel from './MahromBerkasPanel'
import MahromFotoPanel from './MahromFotoPanel'
import Modal from '../../../components/Modal/Modal'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none'
const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'
const sectionClass = 'rounded-xl border border-gray-200 dark:border-gray-600 p-4 space-y-3 bg-gray-50/60 dark:bg-gray-800/40'
const pickBtnClass =
  'w-full px-3 py-2.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors text-left'

function SantriPickButton({ label, value, onPick, onClear, disabled }) {
  return (
    <div>
      {label ? <label className={labelClass}>{label}</label> : null}
      {value ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{value}</span>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-xs text-teal-700 dark:text-teal-300 hover:underline flex-shrink-0 disabled:opacity-50"
          >
            Ubah
          </button>
        </div>
      ) : (
        <button type="button" onClick={onPick} disabled={disabled} className={pickBtnClass}>
          + Cari santri…
        </button>
      )}
    </div>
  )
}

function SantriRelasiRow({ row, index, onChange, onRemove, onOpenPicker, disabled }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2 bg-white dark:bg-gray-900/40">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Santri #{index + 1}</p>
        <button
          type="button"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          Hapus
        </button>
      </div>
      <SantriPickButton
        value={row.santri_id ? row.santri_label : ''}
        onPick={() => onOpenPicker(index)}
        onClear={() => onChange(index, { ...row, santri_id: '', santri_label: '' })}
        disabled={disabled}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Hubungan *</label>
          <select
            value={row.hubungan}
            onChange={(e) => onChange(index, { ...row, hubungan: e.target.value })}
            disabled={disabled}
            className={inputClass}
          >
            {MAHROM_HUBUNGAN_OPTIONS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(row.is_utama)}
              onChange={(e) => onChange(index, { ...row, is_utama: e.target.checked })}
              disabled={disabled}
              className="rounded border-gray-300 text-teal-600"
            />
            Mahrom utama
          </label>
        </div>
      </div>
    </div>
  )
}

export default function MahromFormOffcanvas({ isOpen, onClose, onSuccess, mahromId = null }) {
  const [persistedMahromId, setPersistedMahromId] = useState(null)
  const editingId = persistedMahromId ?? mahromId
  const isEdit = Boolean(editingId)
  const { showNotification } = useNotification()
  const [form, setForm] = useState(emptyMahromForm())
  const [nim, setNim] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nikError, setNikError] = useState('')
  const [primarySantri, setPrimarySantri] = useState(null)
  const [santriDetail, setSantriDetail] = useState(null)
  const [santriDetailLoading, setSantriDetailLoading] = useState(false)
  const [fillSource, setFillSource] = useState(null)
  const [biodataUnlocked, setBiodataUnlocked] = useState(false)
  const [santriPickerOpen, setSantriPickerOpen] = useState(false)
  const [pickerTarget, setPickerTarget] = useState(null)
  const [existingByNik, setExistingByNik] = useState(null)
  const [linkOnlyMode, setLinkOnlyMode] = useState(false)
  const [checkingNik, setCheckingNik] = useState(false)
  const [showNikLinkModal, setShowNikLinkModal] = useState(false)
  const [nikRegisteredBySource, setNikRegisteredBySource] = useState({ ayah: false, ibu: false, wali: false })
  const [checkingFillNik, setCheckingFillNik] = useState(false)
  const [fotoPath, setFotoPath] = useState(null)
  const detailReqRef = useRef(0)
  const skipNextDetailLoadRef = useRef(false)

  const closeSantriPicker = useOffcanvasBackClose(santriPickerOpen, () => {
    setSantriPickerOpen(false)
    setPickerTarget(null)
  })

  const openSantriPicker = useCallback((target) => {
    setPickerTarget(target)
    setSantriPickerOpen(true)
  }, [])

  const loadSantriDetail = useCallback(async (santriId) => {
    if (!santriId) {
      setSantriDetail(null)
      return
    }
    const reqId = ++detailReqRef.current
    setSantriDetailLoading(true)
    try {
      const res = await santriAPI.getById(santriId)
      if (reqId !== detailReqRef.current) return
      const row = res?.data
      setSantriDetail(row && typeof row === 'object' ? row : null)
    } catch {
      if (reqId === detailReqRef.current) setSantriDetail(null)
    } finally {
      if (reqId === detailReqRef.current) setSantriDetailLoading(false)
    }
  }, [])

  const resetCreateState = useCallback(() => {
    setForm(emptyMahromForm())
    setNim('')
    setNikError('')
    setPrimarySantri(null)
    setSantriDetail(null)
    setFillSource(null)
    setBiodataUnlocked(false)
    setPersistedMahromId(null)
    setExistingByNik(null)
    setLinkOnlyMode(false)
    setShowNikLinkModal(false)
    setNikRegisteredBySource({ ayah: false, ibu: false, wali: false })
    setCheckingFillNik(false)
    setFotoPath(null)
  }, [])

  const applyFillSource = useCallback((source, detail, santri) => {
    const { biodata, hubungan, hasData } = mahromBiodataFromSantri(detail, source)
    if (source !== 'manual' && !hasData) {
      showNotification(`Data ${source} pada biodata santri masih kosong`, 'warning')
      return
    }
    setFillSource(source)
    setBiodataUnlocked(true)
    setForm((prev) => ({
      ...prev,
      ...biodata,
      relasi: santri
        ? [relasiRowForSantri(santri, hubungan || 'Ayah', { is_utama: true })]
        : prev.relasi,
    }))
    if (biodata.nik?.length === 16) {
      setNikError(isNikValid(biodata.nik) ? '' : 'NIK tidak valid. Periksa kembali.')
    } else if (source === 'manual') {
      setNikError('')
    } else {
      setNikError('NIK wajib diisi — lengkapi manual jika kosong di biodata santri')
    }
  }, [showNotification])

  const handlePickPrimarySantri = useCallback(async (s) => {
    if (!s?.id) return
    setPrimarySantri(s)
    setFillSource(null)
    setBiodataUnlocked(false)
    setForm((prev) => ({
      ...emptyMahromForm(),
      relasi: [relasiRowForSantri(s, 'Ayah', { is_utama: true })],
    }))
    setNikError('')
    setNikRegisteredBySource({ ayah: false, ibu: false, wali: false })
    await loadSantriDetail(s.id)
  }, [loadSantriDetail])

  const clearPrimarySantri = useCallback(() => {
    setPrimarySantri(null)
    setSantriDetail(null)
    setFillSource(null)
    setBiodataUnlocked(false)
    setForm(emptyMahromForm())
    setNikError('')
    setNikRegisteredBySource({ ayah: false, ibu: false, wali: false })
  }, [])

  const handleSearchSelect = useCallback(async (santri) => {
    const id = santri?.id != null ? Number(santri.id) : 0
    if (!id) return
    const normalized = {
      id,
      nama: santri.nama || santri.nama_santri || `Santri #${id}`,
      nis: santri.nis ?? null,
    }
    if (pickerTarget === 'primary') {
      await handlePickPrimarySantri(normalized)
    } else if (pickerTarget?.type === 'relasi' && typeof pickerTarget.index === 'number') {
      setForm((prev) => {
        const relasi = [...prev.relasi]
        const row = relasi[pickerTarget.index] || emptyRelasiRow()
        relasi[pickerTarget.index] = {
          ...row,
          santri_id: id,
          santri_label: santriOptionLabel(normalized),
        }
        return { ...prev, relasi }
      })
    }
    setSantriPickerOpen(false)
    setPickerTarget(null)
  }, [pickerTarget, handlePickPrimarySantri])

  const loadDetail = useCallback(async (idOverride = null) => {
    const id = idOverride ?? editingId
    if (!id) return
    setLoading(true)
    try {
      const res = await mahromAPI.getById(id)
      if (res?.success && res.data) {
        setForm(mahromFormFromDetail(res.data))
        setNim(res.data.nim || '')
        setFotoPath(res.data.foto_path || null)
        setBiodataUnlocked(true)
        const first = (res.data.relasi_santri || [])[0]
        if (first) {
          setPrimarySantri({
            id: first.santri_id,
            nama: first.santri_nama,
            nis: first.nis,
          })
          loadSantriDetail(first.santri_id)
        }
      } else {
        showNotification(res?.message || 'Gagal memuat mahrom', 'error')
      }
    } catch {
      showNotification('Gagal memuat mahrom', 'error')
    } finally {
      setLoading(false)
    }
  }, [editingId, showNotification, loadSantriDetail])

  useEffect(() => {
    if (!isOpen) {
      setPersistedMahromId(null)
      return
    }
    if (mahromId) {
      setPersistedMahromId(mahromId)
      if (skipNextDetailLoadRef.current) {
        skipNextDetailLoadRef.current = false
      } else {
        loadDetail(mahromId)
      }
    } else {
      resetCreateState()
    }
    // Hanya saat buka/tutup atau ganti mahromId — jangan ikut loadDetail (hindari reset setelah simpan baru)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mahromId])

  const lookupNik = useCallback(async (nik) => {
    if (mahromId || !nik || nik.length !== 16 || !isNikValid(nik)) {
      setExistingByNik(null)
      setLinkOnlyMode(false)
      return
    }
    setCheckingNik(true)
    try {
      const res = await mahromAPI.checkNik(nik, editingId)
      if (res?.success && res.exists && res.data) {
        setExistingByNik(res.data)
        setLinkOnlyMode(true)
        setNim(res.data.nim || '')
      } else {
        setExistingByNik(null)
        setLinkOnlyMode(false)
      }
    } catch {
      setExistingByNik(null)
      setLinkOnlyMode(false)
    } finally {
      setCheckingNik(false)
    }
  }, [mahromId, editingId])

  useEffect(() => {
    if (mahromId || !isOpen) return
    const nik = form.nik
    if (!nik || nik.length !== 16 || !isNikValid(nik)) {
      setExistingByNik(null)
      setLinkOnlyMode(false)
      return
    }
    const timer = setTimeout(() => lookupNik(nik), 400)
    return () => clearTimeout(timer)
  }, [form.nik, mahromId, isOpen, lookupNik])

  useEffect(() => {
    if (mahromId || !santriDetail) {
      setNikRegisteredBySource({ ayah: false, ibu: false, wali: false })
      setCheckingFillNik(false)
      return
    }
    let cancelled = false
    const run = async () => {
      setCheckingFillNik(true)
      const next = { ayah: false, ibu: false, wali: false }
      for (const key of ['ayah', 'ibu', 'wali']) {
        const { biodata, hasData } = mahromBiodataFromSantri(santriDetail, key)
        const nik = biodata.nik || ''
        if (!hasData || nik.length !== 16 || !isNikValid(nik)) continue
        try {
          const res = await mahromAPI.checkNik(nik)
          if (cancelled) return
          if (res?.success && res.exists) next[key] = true
        } catch {
          // abaikan — tombol tetap bisa diklik
        }
      }
      if (!cancelled) {
        setNikRegisteredBySource(next)
        setCheckingFillNik(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [santriDetail, mahromId])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else {
      document.body.style.overflow = ''
      setSantriPickerOpen(false)
      setPickerTarget(null)
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handleNikChange = (e) => {
    const nik = normalizeNikInput(e.target.value)
    setForm((prev) => {
      const next = { ...prev, nik }
      if (nik.length === 16) {
        const tgl = extractTanggalLahirFromNIK(nik)
        const gender = extractGenderFromNIK(nik)
        if (tgl && !prev.tanggal_lahir) next.tanggal_lahir = tgl
        if (gender) next.gender = gender
      }
      return next
    })
    if (nik.length === 16) {
      setNikError(isNikValid(nik) ? '' : 'NIK tidak valid. Periksa kembali.')
    } else if (nik.length > 0) {
      setNikError('NIK harus 16 digit')
    } else {
      setNikError('NIK wajib diisi')
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const updateRelasi = (index, row) => {
    setForm((prev) => {
      const relasi = [...prev.relasi]
      relasi[index] = row
      return { ...prev, relasi }
    })
  }

  const addRelasi = () => {
    setForm((prev) => ({ ...prev, relasi: [...prev.relasi, emptyRelasiRow()] }))
  }

  const removeRelasi = (index) => {
    setForm((prev) => ({
      ...prev,
      relasi: prev.relasi.filter((_, i) => i !== index),
    }))
  }

  const buildRelasiPayload = () =>
    form.relasi
      .filter((r) => r.santri_id)
      .map((r) => ({
        relasi_id: r.relasi_id || undefined,
        id_santri: Number(r.santri_id),
        hubungan: r.hubungan,
        is_utama: Boolean(r.is_utama),
        keterangan: r.keterangan || undefined,
      }))

  const handleConfirmLinkSantri = async () => {
    if (!existingByNik?.id) return
    const relasiPayload = buildRelasiPayload()
    if (relasiPayload.length === 0) {
      showNotification('Tautkan minimal satu santri', 'error')
      return
    }
    try {
      setSaving(true)
      const res = await mahromAPI.linkSantri(existingByNik.id, relasiPayload)
      if (res?.success) {
        showNotification('Santri ditautkan ke mahrom yang sudah ada', 'success')
        onSuccess?.(res.data)
        setShowNikLinkModal(false)
        onClose?.()
      } else {
        showNotification(res?.message || 'Gagal menautkan santri', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menautkan santri', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isEdit && !primarySantri?.id) {
      showNotification('Pilih santri terlebih dahulu', 'error')
      return
    }
    if (!isEdit && !biodataUnlocked) {
      showNotification('Pilih sumber data (Ayah/Ibu/Wali) atau Isi manual', 'error')
      return
    }

    const relasiPayload = buildRelasiPayload()
    if (relasiPayload.length === 0) {
      showNotification('Tautkan minimal satu santri', 'error')
      return
    }

    if (!isEdit && linkOnlyMode && existingByNik?.id) {
      setShowNikLinkModal(true)
      return
    }

    if (!form.nama.trim()) {
      showNotification('Nama wajib diisi', 'error')
      return
    }
    if (!form.nik || form.nik.length !== 16 || !isNikValid(form.nik)) {
      setNikError(form.nik ? 'NIK tidak valid. Periksa kembali.' : 'NIK wajib diisi')
      showNotification('NIK wajib diisi dan harus valid (16 digit)', 'error')
      return
    }

    if (!form.gender) {
      showNotification('Jenis kelamin wajib diisi (untuk pembuatan NIM)', 'error')
      return
    }

    const payload = { ...form, relasi: relasiPayload }
    delete payload.relasi_santri

    try {
      setSaving(true)
      const wasCreate = !isEdit
      const res = isEdit
        ? await mahromAPI.update(editingId, payload)
        : await mahromAPI.create(payload)
      if (res?.success) {
        showNotification(wasCreate ? 'Mahrom ditambahkan' : 'Mahrom diperbarui', 'success')
        if (wasCreate && res.data?.id) {
          skipNextDetailLoadRef.current = true
          setPersistedMahromId(res.data.id)
          setNim(res.data.nim || '')
          setBiodataUnlocked(true)
          setForm(mahromFormFromDetail(res.data))
          if (res.data.relasi_santri?.[0]) {
            const first = res.data.relasi_santri[0]
            setPrimarySantri({
              id: first.santri_id,
              nama: first.santri_nama,
              nis: first.nis,
            })
          }
          showNotification('Mahrom tersimpan. Unggah KTP & KK di bagian berkas di bawah.', 'info')
        }
        onSuccess?.(res.data)
        if (!wasCreate) onClose?.()
      } else if (res?.code === 'NIK_EXISTS' && res.existing) {
        setExistingByNik(res.existing)
        setLinkOnlyMode(true)
        setNim(res.existing.nim || '')
        setShowNikLinkModal(true)
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      const data = err.response?.data
      if (data?.code === 'NIK_EXISTS' && data.existing) {
        setExistingByNik(data.existing)
        setLinkOnlyMode(true)
        setNim(data.existing.nim || '')
        setShowNikLinkModal(true)
      } else {
        showNotification(data?.message || 'Gagal menyimpan mahrom', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const previewForSource = (key) => {
    if (!santriDetail) return null
    const p = mahromBiodataFromSantri(santriDetail, key)
    return p
  }

  const biodataDisabled = !isEdit && (!primarySantri || !biodataUnlocked)
  const hideBiodataForm = !isEdit && linkOnlyMode && existingByNik

  if (!isOpen) return null

  return createPortal(
    <>
      <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex justify-end bg-black/40"
        onClick={onClose}
      >
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.22 }}
          className="w-full max-w-lg h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {isEdit ? 'Edit Mahrom' : 'Tambah Mahrom'}
              </h2>
              {isEdit && nim ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">NIM {nim}</p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">Mulai dengan pilih santri, lalu isi biodata mahrom</p>
              )}
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {!isEdit && (
                <section className={sectionClass}>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">1. Pilih santri</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Buka panel Cari Santri (indeks lokal) lalu pilih santri yang akan dikaitkan ke mahrom ini.
                  </p>
                  <SantriPickButton
                    label="Santri *"
                    value={primarySantri ? santriOptionLabel(primarySantri) : ''}
                    onPick={() => openSantriPicker('primary')}
                    onClear={clearPrimarySantri}
                    disabled={saving}
                  />
                  {santriDetailLoading && (
                    <p className="text-xs text-gray-500 animate-pulse">Memuat biodata orang tua / wali…</p>
                  )}
                  {primarySantri && santriDetail && !santriDetailLoading && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">2. Isi biodata mahrom dari:</p>
                      {checkingFillNik ? (
                        <p className="text-[11px] text-gray-500 animate-pulse">Memeriksa NIK ayah/ibu/wali di data mahrom…</p>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        {MAHROM_FILL_SOURCES.map((src) => {
                          const preview = src.key === 'manual' ? null : previewForSource(src.key)
                          const empty = src.key !== 'manual' && preview && !preview.hasData
                          const nikSudahMahrom = src.key !== 'manual' && !!nikRegisteredBySource[src.key]
                          const active = fillSource === src.key
                          const disabled = saving || (src.key !== 'manual' && (empty || nikSudahMahrom || checkingFillNik))
                          return (
                            <button
                              key={src.key}
                              type="button"
                              disabled={disabled}
                              onClick={() => applyFillSource(src.key, santriDetail, primarySantri)}
                              className={`text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-40 ${
                                active
                                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-1 ring-teal-500'
                                  : nikSudahMahrom
                                    ? 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 cursor-not-allowed'
                                    : 'border-gray-200 dark:border-gray-600 hover:border-teal-400 hover:bg-white dark:hover:bg-gray-800'
                              }`}
                            >
                              <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{src.label}</span>
                              {src.key === 'manual' ? (
                                <span className="block text-[11px] text-gray-500 mt-0.5">Ketik sendiri di bawah</span>
                              ) : nikSudahMahrom ? (
                                <span className="block text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                                  NIK sudah terdaftar — tautkan santri saja
                                </span>
                              ) : (
                                <span className="block text-[11px] text-gray-500 mt-0.5 truncate">
                                  {preview?.previewLabel || '—'}
                                  {preview?.previewNik && preview.previewNik !== '—'
                                    ? ` · NIK …${String(preview.previewNik).slice(-4)}`
                                    : ''}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {hideBiodataForm && (
                <section className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">NIK sudah terdaftar</h3>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Mahrom <strong>{existingByNik.nama}</strong> (NIM {existingByNik.nim}) sudah ada di sistem.
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Satu mahrom bisa menjadi wali beberapa santri (misalnya saudara). Cukup tautkan santri baru — tidak perlu membuat mahrom baru.
                  </p>
                  {Array.isArray(existingByNik.relasi_santri) && existingByNik.relasi_santri.length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Sudah terhubung ke:{' '}
                      {existingByNik.relasi_santri.map((r) => r.santri_nama || `Santri #${r.santri_id}`).join(', ')}
                    </p>
                  )}
                </section>
              )}

              {!hideBiodataForm && (
              <>
              <section className={`space-y-3 ${biodataDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {isEdit ? 'Biodata mahrom' : '3. Biodata mahrom'}
                </h3>
                {!isEdit && !biodataUnlocked && primarySantri && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Pilih Ayah, Ibu, Wali, atau Isi manual untuk melanjutkan.
                  </p>
                )}
                <div>
                  <label className={labelClass}>NIK * (16 digit)</label>
                  <input
                    name="nik"
                    value={form.nik}
                    onChange={handleNikChange}
                    maxLength={16}
                    inputMode="numeric"
                    required
                    className={`${inputClass} ${nikError ? 'border-red-500' : ''}`}
                    placeholder="Wajib — untuk verifikasi identitas"
                  />
                  {nikError ? <p className="text-xs text-red-600 mt-1">{nikError}</p> : null}
                  {checkingNik ? <p className="text-xs text-gray-500 mt-1">Memeriksa NIK…</p> : null}
                </div>
                <div>
                  <label className={labelClass}>Nama lengkap *</label>
                  <input name="nama" value={form.nama} onChange={handleChange} required className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Tempat lahir</label>
                    <input name="tempat_lahir" value={form.tempat_lahir} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Tanggal lahir</label>
                    <input type="date" name="tanggal_lahir" value={form.tanggal_lahir || ''} onChange={handleChange} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Jenis kelamin *</label>
                  <select name="gender" value={form.gender} onChange={handleChange} required className={inputClass}>
                    <option value="">Pilih</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>No. telepon</label>
                    <input name="no_telpon" value={form.no_telpon} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>WhatsApp</label>
                    <input name="no_wa" value={form.no_wa} onChange={handleChange} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Pekerjaan</label>
                    <input name="pekerjaan" value={form.pekerjaan} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Pendidikan</label>
                    <input name="pendidikan" value={form.pendidikan} onChange={handleChange} className={inputClass} />
                  </div>
                </div>
              </section>

              <section className={`space-y-3 ${biodataDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Alamat</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Diisi otomatis dari alamat santri bila memilih Ayah/Ibu/Wali.</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3">
                    <label className={labelClass}>Dusun / Jalan</label>
                    <input name="dusun" value={form.dusun} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>RT</label>
                    <input name="rt" value={form.rt} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>RW</label>
                    <input name="rw" value={form.rw} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Kode pos</label>
                    <input name="kode_pos" value={form.kode_pos} onChange={handleChange} className={inputClass} />
                  </div>
                  <div className="col-span-3">
                    <label className={labelClass}>Desa / Kelurahan</label>
                    <input name="desa" value={form.desa} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Kecamatan</label>
                    <input name="kecamatan" value={form.kecamatan} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Kabupaten</label>
                    <input name="kabupaten" value={form.kabupaten} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Provinsi</label>
                    <input name="provinsi" value={form.provinsi} onChange={handleChange} className={inputClass} />
                  </div>
                </div>
              </section>
              </>
              )}

              {!hideBiodataForm && (isEdit || biodataUnlocked) && (
              <section className="space-y-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-900/10 p-4">
                <MahromFotoPanel
                  mahromId={editingId}
                  fotoPath={fotoPath}
                  onFotoChange={setFotoPath}
                />
              </section>
              )}

              {!hideBiodataForm && (isEdit || biodataUnlocked) && (
              <section className="space-y-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Berkas KTP & KK</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {editingId
                      ? 'Unggah atau ganti scan KTP dan Kartu Keluarga mahrom.'
                      : 'Simpan biodata mahrom terlebih dahulu, lalu unggah KTP dan KK di sini.'}
                  </p>
                </div>
                <MahromBerkasPanel mahromId={editingId} overlayZIndex={230} />
              </section>
              )}

              {(isEdit || (primarySantri && biodataUnlocked) || hideBiodataForm) && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Relasi ke santri</h3>
                    {isEdit && (
                      <button
                        type="button"
                        onClick={addRelasi}
                        className="text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline"
                      >
                        + Tautkan santri lain
                      </button>
                    )}
                  </div>
                  {form.relasi.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Belum ada santri ditautkan.</p>
                  ) : (
                    form.relasi.map((row, i) => (
                      isEdit ? (
                        <SantriRelasiRow
                          key={row.relasi_id || `new-${i}`}
                          row={row}
                          index={i}
                          onChange={updateRelasi}
                          onRemove={removeRelasi}
                          onOpenPicker={(idx) => openSantriPicker({ type: 'relasi', index: idx })}
                          disabled={saving}
                        />
                      ) : (
                        <div
                          key={row.relasi_id || `new-${i}`}
                          className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/20 px-3 py-2 space-y-2"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.santri_label}</p>
                          <div>
                            <label className={labelClass}>Hubungan dengan santri</label>
                            <select
                              value={row.hubungan}
                              onChange={(e) => updateRelasi(i, { ...row, hubungan: e.target.value })}
                              disabled={saving}
                              className={inputClass}
                            >
                              {MAHROM_HUBUNGAN_OPTIONS.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    ))
                  )}
                </section>
              )}
            </form>
          )}

          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : hideBiodataForm ? 'Tautkan santri' : isEdit ? 'Simpan perubahan' : 'Simpan mahrom'}
            </button>
            {isEdit && !mahromId && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium"
              >
                Selesai
              </button>
            )}
          </div>
        </motion.aside>
      </motion.div>
      </AnimatePresence>

      <SearchOffcanvas
        isOpen={santriPickerOpen}
        onClose={closeSantriPicker}
        onSelectSantriRecord={handleSearchSelect}
        zIndex={220}
      />

      <Modal
        isOpen={showNikLinkModal}
        onClose={() => !saving && setShowNikLinkModal(false)}
        title="NIK sudah terdaftar"
        maxWidth="max-w-md"
        closeOnBackdropClick={!saving}
        preventClose={saving}
        zIndex={230}
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            NIK ini sudah terdaftar sebagai mahrom{' '}
            <strong>{existingByNik?.nama}</strong> (NIM {existingByNik?.nim}).
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tautkan santri yang dipilih ke mahrom yang sudah ada? Tidak perlu membuat mahrom baru.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setShowNikLinkModal(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleConfirmLinkSantri}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Menautkan...' : 'Ya, tautkan santri saja'}
            </button>
          </div>
        </div>
      </Modal>
    </>,
    document.body
  )
}
