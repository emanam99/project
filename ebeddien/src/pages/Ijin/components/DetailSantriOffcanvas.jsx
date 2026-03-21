import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { ijinAPI, santriAPI, kalenderAPI } from '../../../services/api'
import { PickDateHijri, formatHijriDateDisplay, compareHijriYmd } from '../../../components/PickDateHijri'
import PrintIjinOffcanvas from './PrintIjinOffcanvas'
import PrintIjinPulanganOffcanvas from './PrintIjinPulanganOffcanvas'

/** Nilai Y-m-d Hijriyah atau null jika format lain / kosong */
function parseHijriYmd(s) {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

function labelTanggalIjin(s) {
  const v = parseHijriYmd(s)
  return v ? formatHijriDateDisplay(v) : s
}

/** Batas atas "Dari": tidak boleh melewati sampai maupun perpanjang (jika ada). */
function minHijriYmd(a, b) {
  if (!a) return b ?? null
  if (!b) return a
  return compareHijriYmd(a, b) <= 0 ? a : b
}

/** Tampilkan Y-m-d Masehi sebagai d/m/Y */
function formatMasehiTampil(yMd) {
  if (!yMd || typeof yMd !== 'string') return ''
  const raw = yMd.trim().split(/\s/)[0]
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return yMd
  return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}`
}

const MS_PER_DAY = 86400000

/**
 * Lama ijin dalam hari kalender Masehi, inklusif: hari pertama (dari) dan hari terakhir (sampai/perpanjang) ikut dihitung.
 * Contoh: Ahad → Senin berurutan = 2 hari. Normalisasi ke tengah malam zona waktu lokal.
 */
function jumlahHariMasehiInklusif(d1, d2) {
  const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate())
  if (b < a) return 0
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY) + 1
}

function DetailSantriOffcanvas({ isOpen, onClose, santri, onSuccess }) {
  const { showNotification } = useNotification()
  const { tahunAjaran } = useTahunAjaranStore()
  const [loading, setLoading] = useState(false)
  const [loadingIjin, setLoadingIjin] = useState(false)
  const [loadingSantri, setLoadingSantri] = useState(false)
  const [ijinList, setIjinList] = useState([])
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [selectedIjinId, setSelectedIjinId] = useState(null)
  const [showPrintPulanganOffcanvas, setShowPrintPulanganOffcanvas] = useState(false)
  const [isEditingSantri, setIsEditingSantri] = useState(false)
  const [santriFormData, setSantriFormData] = useState({})
  /** Semua kamar aktif (daerah___kamar.id = santri.id_kamar), label dari join */
  const [kamarListAll, setKamarListAll] = useState([])
  const [rombelDiniyahOptions, setRombelDiniyahOptions] = useState([])
  const [rombelFormalOptions, setRombelFormalOptions] = useState([])
  const [formData, setFormData] = useState({
    tahun_ajaran: tahunAjaran || '',
    alasan: '',
    dari: '',
    sampai: '',
    perpanjang: '',
    lama: ''
  })
  const [editingIjin, setEditingIjin] = useState(null)
  const [masehiPreview, setMasehiPreview] = useState({ dari: '', sampai: '', perpanjang: '' })
  const [markingKembaliId, setMarkingKembaliId] = useState(null)

  useEffect(() => {
    if (isOpen && santri) {
      // Update tahun ajaran dari store setiap kali store berubah
      setFormData(prev => ({
        ...prev,
        tahun_ajaran: tahunAjaran || ''
      }))
      setSantriFormData({
        nama: santri.nama || '',
        gender: santri.gender || '',
        status_santri: santri.status_santri || '',
        id_kamar: santri.id_kamar ?? '',
        id_diniyah: santri.id_diniyah ?? '',
        id_formal: santri.id_formal ?? '',
        diniyah: santri.diniyah || '',
        kelas_diniyah: santri.kelas_diniyah || '',
        kel_diniyah: santri.kel_diniyah || '',
        formal: santri.formal || '',
        kelas_formal: santri.kelas_formal || '',
        kel_formal: santri.kel_formal || ''
      })
      setIsEditingSantri(false)
      loadIjinList()
      resetForm()
    }
  }, [isOpen, santri, tahunAjaran])

  const resetForm = () => {
    setFormData({
      tahun_ajaran: tahunAjaran || '',
      alasan: '',
      dari: '',
      sampai: '',
      perpanjang: '',
      lama: ''
    })
    setEditingIjin(null)
  }

  const loadIjinList = async () => {
    if (!santri?.id) return

    setLoadingIjin(true)
    try {
      const result = await ijinAPI.get(santri.id, tahunAjaran)
      
      if (result.success) {
        setIjinList(result.data || [])
      } else {
        showNotification(result.message || 'Gagal memuat data ijin', 'error')
      }
    } catch (error) {
      console.error('Error loading ijin list:', error)
      showNotification('Gagal memuat data ijin', 'error')
    } finally {
      setLoadingIjin(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!santri?.id) {
      showNotification('Data santri tidak valid', 'error')
      return
    }

    if (!formData.tahun_ajaran) {
      showNotification('Tahun ajaran harus diisi', 'error')
      return
    }

    setLoading(true)
    try {
      const result = editingIjin
        ? await ijinAPI.update(editingIjin.id, {
            id_santri: santri.id,
            ...formData
          })
        : await ijinAPI.create({
            id_santri: santri.id,
            ...formData
          })

      if (result.success) {
        showNotification(
          editingIjin ? 'Data ijin berhasil diupdate' : 'Data ijin berhasil ditambahkan',
          'success'
        )
        resetForm()
        loadIjinList() // Hanya reload list ijin di offcanvas, tidak reload tabel utama
      } else {
        showNotification(result.message || 'Gagal menyimpan data ijin', 'error')
      }
    } catch (error) {
      console.error('Error saving ijin:', error)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (ijin) => {
    setEditingIjin(ijin)
    setFormData({
      tahun_ajaran: ijin.tahun_ajaran || tahunAjaran || '',
      alasan: ijin.alasan || '',
      dari: ijin.dari != null ? String(ijin.dari) : '',
      sampai: ijin.sampai != null ? String(ijin.sampai) : '',
      perpanjang: ijin.perpanjang != null ? String(ijin.perpanjang) : '',
      lama: ijin.lama || ''
    })
  }

  const handleDelete = async (ijin) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data ijin ini?`)) {
      return
    }

    setLoading(true)
    try {
      const result = await ijinAPI.delete(ijin.id)

      if (result.success) {
        showNotification('Data ijin berhasil dihapus', 'success')
        loadIjinList() // Hanya reload list ijin di offcanvas, tidak reload tabel utama
      } else {
        showNotification(result.message || 'Gagal menghapus data ijin', 'error')
      }
    } catch (error) {
      console.error('Error deleting ijin:', error)
      showNotification('Terjadi kesalahan saat menghapus data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkKembali = async (ijinRow, set) => {
    setMarkingKembaliId(ijinRow.id)
    try {
      const result = await ijinAPI.markKembali(ijinRow.id, set)
      if (result.success) {
        const tanggal = result.data?.tanggal_kembali ?? null
        setIjinList((prev) =>
          prev.map((row) =>
            row.id === ijinRow.id ? { ...row, tanggal_kembali: tanggal } : row
          )
        )
        setEditingIjin((prev) =>
          prev && prev.id === ijinRow.id ? { ...prev, tanggal_kembali: tanggal } : prev
        )
        showNotification(
          set ? 'Tanggal kembali (Masehi) dicatat' : 'Status kembali dibatalkan',
          'success'
        )
      } else {
        showNotification(result.message || 'Gagal memperbarui tanggal kembali', 'error')
      }
    } catch (error) {
      console.error('markKembali:', error)
      showNotification('Gagal memperbarui tanggal kembali', 'error')
    } finally {
      setMarkingKembaliId(null)
    }
  }

  const handleEditSantri = () => {
    setIsEditingSantri(true)
  }

  const handleCancelEditSantri = () => {
    setIsEditingSantri(false)
    if (santri) {
      setSantriFormData({
        nama: santri.nama || '',
        gender: santri.gender || '',
        status_santri: santri.status_santri || '',
        id_kamar: santri.id_kamar ?? '',
        id_diniyah: santri.id_diniyah ?? '',
        id_formal: santri.id_formal ?? '',
        diniyah: santri.diniyah || '',
        kelas_diniyah: santri.kelas_diniyah || '',
        kel_diniyah: santri.kel_diniyah || '',
        formal: santri.formal || '',
        kelas_formal: santri.kelas_formal || '',
        kel_formal: santri.kel_formal || ''
      })
    }
  }

  // Load semua kamar (id_kamar), rombel diniyah/formal saat offcanvas dibuka
  useEffect(() => {
    if (!isOpen || !santri) return
    let cancelled = false
    Promise.all([
      ijinAPI.getKamarOptions({ status: 'aktif' }),
      ijinAPI.getRombelOptions('Diniyah'),
      ijinAPI.getRombelOptions('Formal')
    ]).then(([kRes, dinRes, forRes]) => {
      if (cancelled) return
      if (kRes?.success && Array.isArray(kRes.data)) {
        const sorted = [...kRes.data].sort((a, b) => {
          const kc = String(a.daerah_kategori || '').localeCompare(String(b.daerah_kategori || ''), 'id')
          if (kc !== 0) return kc
          const da = String(a.daerah_nama || '').localeCompare(String(b.daerah_nama || ''), 'id')
          if (da !== 0) return da
          return String(a.kamar || '').localeCompare(String(b.kamar || ''), 'id')
        })
        setKamarListAll(sorted)
      } else {
        setKamarListAll([])
      }
      if (dinRes?.success && Array.isArray(dinRes.data)) setRombelDiniyahOptions(dinRes.data)
      else setRombelDiniyahOptions([])
      if (forRes?.success && Array.isArray(forRes.data)) setRombelFormalOptions(forRes.data)
      else setRombelFormalOptions([])
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, santri?.id])

  const handleSaveSantri = async () => {
    if (!santri?.id) {
      showNotification('Data santri tidak valid', 'error')
      return
    }

    const payload = {
      nama: santriFormData.nama || '',
      gender: santriFormData.gender || '',
      status_santri: santriFormData.status_santri || ''
    }
    if (santriFormData.id_diniyah != null && santriFormData.id_diniyah !== '') payload.id_diniyah = Number(santriFormData.id_diniyah)
    else payload.id_diniyah = null
    if (santriFormData.id_formal != null && santriFormData.id_formal !== '') payload.id_formal = Number(santriFormData.id_formal)
    else payload.id_formal = null
    if (santriFormData.id_kamar != null && santriFormData.id_kamar !== '') payload.id_kamar = Number(santriFormData.id_kamar)
    else payload.id_kamar = null

    setLoadingSantri(true)
    try {
      const result = await santriAPI.update(santri.id, payload)

      if (result.success) {
        showNotification('Data santri berhasil diupdate', 'success')
        setIsEditingSantri(false)
        if (onSuccess) onSuccess()
      } else {
        showNotification(result.message || 'Gagal mengupdate data santri', 'error')
      }
    } catch (error) {
      console.error('Error updating santri:', error)
      showNotification('Terjadi kesalahan saat mengupdate data', 'error')
    } finally {
      setLoadingSantri(false)
    }
  }

  // Prevent body scroll when offcanvas is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  const dariHijriPilih = parseHijriYmd(formData.dari)
  const sampaiHijriPilih = parseHijriYmd(formData.sampai)
  const perpanjangHijriPilih = parseHijriYmd(formData.perpanjang)
  const batasAtasDari = minHijriYmd(sampaiHijriPilih, perpanjangHijriPilih)

  /**
   * Lama = hari kalender inklusif dari "dari" sampai "sampai" (atau sampai "perpanjang" jika diisi).
   * Hitung via Masehi (API to_masehi); hari pertama dan terakhir sama-sama dihitung 1 hari penuh.
   */
  useEffect(() => {
    if (!isOpen) return
    const dari = dariHijriPilih
    const perpanjang = perpanjangHijriPilih
    const sampai = sampaiHijriPilih
    const akhir = perpanjang || sampai
    if (!dari || !akhir) {
      setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
      return
    }
    if (compareHijriYmd(akhir, dari) < 0) {
      setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [r1, r2] = await Promise.all([
          kalenderAPI.get({ action: 'to_masehi', tanggal: dari }),
          kalenderAPI.get({ action: 'to_masehi', tanggal: akhir })
        ])
        if (cancelled) return
        if (!r1?.masehi || !r2?.masehi) {
          setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
          return
        }
        const d1 = new Date(`${r1.masehi}T12:00:00`)
        const d2 = new Date(`${r2.masehi}T12:00:00`)
        if (d2 < d1) {
          setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
          return
        }
        const days = jumlahHariMasehiInklusif(d1, d2)
        const label = `${days} Hari`
        setFormData((prev) => (prev.lama === label ? prev : { ...prev, lama: label }))
      } catch {
        if (!cancelled) setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, dariHijriPilih, sampaiHijriPilih, perpanjangHijriPilih])

  /** Pratinjau konversi ke Masehi untuk form (sama logika dengan penyimpanan server). */
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const conv = async (raw) => {
      const y = parseHijriYmd(raw)
      if (!y) return ''
      try {
        const r = await kalenderAPI.get({ action: 'to_masehi', tanggal: y })
        return r?.masehi && r.masehi !== '0000-00-00' ? r.masehi : ''
      } catch {
        return ''
      }
    }
    ;(async () => {
      const [d, s, p] = await Promise.all([
        conv(formData.dari),
        conv(formData.sampai),
        conv(formData.perpanjang)
      ])
      if (!cancelled) setMasehiPreview({ dari: d, sampai: s, perpanjang: p })
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, formData.dari, formData.sampai, formData.perpanjang])

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="detail-santri-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99998
          }}
        />
      )}
      {isOpen && (
        <motion.div
          key="detail-santri-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-gray-800 shadow-xl flex flex-col"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999
          }}
        >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Detail Santri & Ijin
                </h2>
                {santri && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {santri.nama} (ID: {santri.id} | NIS: {santri.nis ?? '-'})
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                disabled={loading}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {santri ? (
                <>
                  {/* Data Santri */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                        Data Santri
                      </h3>
                      {!isEditingSantri && (
                        <button
                          onClick={handleEditSantri}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                          title="Edit Data Santri"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                      )}
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      {isEditingSantri ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">ID:</span>
                              <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.id}</span>
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Tidak bisa diubah)</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">NIS:</span>
                              <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.nis ?? '-'}</span>
                            </div>
                            <div>
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Nama:</label>
                              <input
                                type="text"
                                value={santriFormData.nama || ''}
                                onChange={(e) => setSantriFormData({ ...santriFormData, nama: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Gender:</label>
                              <select
                                value={santriFormData.gender || ''}
                                onChange={(e) => setSantriFormData({ ...santriFormData, gender: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="">Pilih Gender</option>
                                <option value="Laki-laki">Laki-laki</option>
                                <option value="Perempuan">Perempuan</option>
                              </select>
                            </div>
                            <div>
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Status Santri:</label>
                              <select
                                value={santriFormData.status_santri || ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setSantriFormData(prev => ({
                                    ...prev,
                                    status_santri: v,
                                    ...(v !== 'Mukim' ? { id_kamar: '' } : {})
                                  }))
                                }}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="">Pilih Status</option>
                                <option value="Mukim">Mukim</option>
                                <option value="Khoriji">Khoriji</option>
                                <option value="Alumni">Alumni</option>
                              </select>
                            </div>
                            {santriFormData.status_santri === 'Mukim' && (
                              <div className="col-span-2">
                                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Kamar (id_kamar)
                                </label>
                                <select
                                  value={santriFormData.id_kamar ?? ''}
                                  onChange={(e) => setSantriFormData({ ...santriFormData, id_kamar: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                                >
                                  <option value="">Pilih kamar</option>
                                  {kamarListAll.map((k) => (
                                    <option key={k.id} value={k.id}>
                                      {[k.daerah_kategori, k.daerah_nama, k.kamar].filter(Boolean).join(' — ') || k.id}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Data dari daerah___kamar; penyimpanan hanya id_kamar
                                </p>
                              </div>
                            )}
                            <div className="col-span-2">
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Diniyah (Rombel):</label>
                              <select
                                value={santriFormData.id_diniyah ?? ''}
                                onChange={(e) => setSantriFormData({ ...santriFormData, id_diniyah: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="">Pilih Diniyah</option>
                                {rombelDiniyahOptions.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {[r.lembaga_nama, r.kelas, r.kel].filter(Boolean).join(' · ') || r.id}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Formal (Rombel):</label>
                              <select
                                value={santriFormData.id_formal ?? ''}
                                onChange={(e) => setSantriFormData({ ...santriFormData, id_formal: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="">Pilih Formal</option>
                                {rombelFormalOptions.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {[r.lembaga_nama, r.kelas, r.kel].filter(Boolean).join(' · ') || r.id}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-3 pt-2">
                            <button
                              type="button"
                              onClick={handleCancelEditSantri}
                              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                              disabled={loadingSantri}
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveSantri}
                              disabled={loadingSantri}
                              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loadingSantri ? 'Menyimpan...' : 'Simpan'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">ID:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.id}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">NIS:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.nis ?? '-'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Nama:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.nama || '-'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Gender:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.gender || '-'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.status_santri || '-'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Kamar:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">
                              {santri.id_kamar != null && santri.id_kamar !== ''
                                ? (
                                  <>
                                    {[santri.kamar, santri.daerah].filter(Boolean).join(' — ') || '-'}
                                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                      (id_kamar: {santri.id_kamar})
                                    </span>
                                  </>
                                )
                                : '-'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Diniyah:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">
                              {santri.diniyah || '-'}
                              {(santri.kelas_diniyah || santri.kel_diniyah) && (
                                <span className="ml-1">
                                  {' '}[{santri.kelas_diniyah || ''}{santri.kelas_diniyah && santri.kel_diniyah ? '.' : ''}{santri.kel_diniyah || ''}]
                                </span>
                              )}
                              {santri.id_diniyah != null && santri.id_diniyah !== '' && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                  (id_diniyah: {santri.id_diniyah})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Formal:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">
                              {santri.formal || '-'}
                              {(santri.kelas_formal || santri.kel_formal) && (
                                <span className="ml-1">
                                  {' '}[{santri.kelas_formal || ''}{santri.kelas_formal && santri.kel_formal ? '.' : ''}{santri.kel_formal || ''}]
                                </span>
                              )}
                              {santri.id_formal != null && santri.id_formal !== '' && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                  (id_formal: {santri.id_formal})
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Ijin */}
                  <div className="mb-6">
                    <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      {editingIjin ? 'Edit Data Ijin' : 'Tambah Data Ijin'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tahun Ajaran
                        </label>
                        <input
                          type="text"
                          value={formData.tahun_ajaran}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                          placeholder="1446-1447"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Tahun ajaran diambil otomatis dari header aplikasi
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Alasan
                        </label>
                        <input
                          type="text"
                          value={formData.alasan}
                          onChange={(e) => setFormData({ ...formData, alasan: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          placeholder="Contoh: Sakit, Walimah, dll"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Dari (Hijriyah)
                          </label>
                          <PickDateHijri
                            id="ijin-dari-hijri"
                            name="dari"
                            value={dariHijriPilih}
                            onChange={(ymd) =>
                              setFormData({ ...formData, dari: ymd != null ? ymd : '' })
                            }
                            max={batasAtasDari || undefined}
                            placeholder="Pilih tanggal mulai"
                            className="w-full"
                          />
                          {formData.dari && !dariHijriPilih && (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              Tersimpan (format lama): {formData.dari}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Kalender dari database Hijriyah PSA
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Sampai (Hijriyah)
                          </label>
                          <PickDateHijri
                            id="ijin-sampai-hijri"
                            name="sampai"
                            value={sampaiHijriPilih}
                            onChange={(ymd) =>
                              setFormData({ ...formData, sampai: ymd != null ? ymd : '' })
                            }
                            min={dariHijriPilih || undefined}
                            max={perpanjangHijriPilih || undefined}
                            placeholder="Pilih tanggal selesai"
                            className="w-full"
                          />
                          {formData.sampai && !sampaiHijriPilih && (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              Tersimpan (format lama): {formData.sampai}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Perpanjang (Hijriyah)
                          </label>
                          <PickDateHijri
                            id="ijin-perpanjang-hijri"
                            name="perpanjang"
                            value={perpanjangHijriPilih}
                            onChange={(ymd) =>
                              setFormData({ ...formData, perpanjang: ymd != null ? ymd : '' })
                            }
                            min={sampaiHijriPilih || dariHijriPilih || undefined}
                            placeholder="Opsional — tanggal akhir jika diperpanjang"
                            className="w-full"
                          />
                          {formData.perpanjang && !perpanjangHijriPilih && (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                              Tersimpan (format lama): {formData.perpanjang}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Kosongkan jika tidak ada perpanjang — lama dihitung dari Dari sampai Sampai (hari pertama &amp; terakhir dihitung)
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Lama
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={formData.lama}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                            placeholder="Terisi otomatis"
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {perpanjangHijriPilih
                              ? 'Jumlah hari kalender (inklusif): dari hari Dari sampai hari Perpanjang'
                              : 'Jumlah hari kalender (inklusif): dari hari Dari sampai hari Sampai'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-600 p-3 bg-gray-50/80 dark:bg-gray-800/40">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                          Versi Masehi (otomatis dari konversi Hijriyah)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-700 dark:text-gray-300">
                          <div>
                            Dari (M):{' '}
                            <span className="font-mono">
                              {masehiPreview.dari ? formatMasehiTampil(masehiPreview.dari) : '—'}
                            </span>
                          </div>
                          <div>
                            Sampai (M):{' '}
                            <span className="font-mono">
                              {masehiPreview.sampai ? formatMasehiTampil(masehiPreview.sampai) : '—'}
                            </span>
                          </div>
                          <div>
                            Perpanjang (M):{' '}
                            <span className="font-mono">
                              {masehiPreview.perpanjang ? formatMasehiTampil(masehiPreview.perpanjang) : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        {editingIjin && (
                          <button
                            type="button"
                            onClick={() => {
                              resetForm()
                            }}
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          >
                            Batal Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (santri?.id) {
                              setShowPrintPulanganOffcanvas(true)
                            } else {
                              showNotification('Data santri tidak valid', 'error')
                            }
                          }}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors flex items-center gap-2"
                          title="Print Surat Ijin Pulangan (Libur Ramadhan)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          <span className="hidden sm:inline">Libur Ramadhan</span>
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? 'Menyimpan...' : editingIjin ? 'Update' : 'Simpan'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Daftar Ijin */}
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Daftar Ijin
                    </h3>
                    {loadingIjin ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
                      </div>
                    ) : ijinList.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                        Belum ada data ijin
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {ijinList.map((ijin) => (
                          <div
                            key={ijin.id}
                            className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {ijin.urutan && (
                                    <>
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                        Urutan: {ijin.urutan}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                                    </>
                                  )}
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {ijin.tahun_ajaran}
                                  </span>
                                </div>
                                {ijin.alasan && (
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                    {ijin.alasan}
                                  </p>
                                )}
                                {ijin.dari && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Dari: {labelTanggalIjin(ijin.dari)}
                                  </p>
                                )}
                                {ijin.sampai && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Sampai: {labelTanggalIjin(ijin.sampai)}
                                  </p>
                                )}
                                {ijin.lama && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Lama: {ijin.lama}
                                  </p>
                                )}
                                {ijin.perpanjang && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Perpanjang: {labelTanggalIjin(ijin.perpanjang)}
                                  </p>
                                )}
                                {(ijin.dari_masehi || ijin.sampai_masehi || ijin.perpanjang_masehi) && (
                                  <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-600 space-y-0.5">
                                    {ijin.dari_masehi && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Dari (M): {formatMasehiTampil(String(ijin.dari_masehi))}
                                      </p>
                                    )}
                                    {ijin.sampai_masehi && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Sampai (M): {formatMasehiTampil(String(ijin.sampai_masehi))}
                                      </p>
                                    )}
                                    {ijin.perpanjang_masehi && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Perpanjang (M): {formatMasehiTampil(String(ijin.perpanjang_masehi))}
                                      </p>
                                    )}
                                  </div>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                      checked={Boolean(ijin.tanggal_kembali)}
                                      disabled={markingKembaliId === ijin.id}
                                      onChange={(e) => handleMarkKembali(ijin, e.target.checked)}
                                    />
                                    Sudah kembali
                                  </label>
                                  <button
                                    type="button"
                                    disabled={Boolean(ijin.tanggal_kembali) || markingKembaliId === ijin.id}
                                    onClick={() => handleMarkKembali(ijin, true)}
                                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Kembali
                                  </button>
                                  {ijin.tanggal_kembali && (
                                    <span className="text-xs text-teal-700 dark:text-teal-300">
                                      Tgl kembali (M): {formatMasehiTampil(String(ijin.tanggal_kembali).split(/\s/)[0])}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 ml-4 shrink-0">
                                <button
                                  onClick={() => {
                                    setSelectedIjinId(ijin.id)
                                    setShowPrintOffcanvas(true)
                                  }}
                                  className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                  title="Print"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleEdit(ijin)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                  title="Edit"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDelete(ijin)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                  title="Hapus"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  Tidak ada data santri
                </p>
              )}
            </div>
          </motion.div>
      )}
    </AnimatePresence>
  )

  // Use portal to render offcanvas at document body level
  return (
    <>
      {createPortal(offcanvasContent, document.body)}
      
      {/* Print Ijin Offcanvas */}
      <PrintIjinOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => {
          setShowPrintOffcanvas(false)
          setSelectedIjinId(null)
        }}
        santriId={santri?.id}
        ijinId={selectedIjinId}
      />

      {/* Print Ijin Pulangan Offcanvas */}
      <PrintIjinPulanganOffcanvas
        isOpen={showPrintPulanganOffcanvas}
        onClose={() => {
          setShowPrintPulanganOffcanvas(false)
        }}
        santriId={santri?.id}
      />
    </>
  )
}

export default DetailSantriOffcanvas
