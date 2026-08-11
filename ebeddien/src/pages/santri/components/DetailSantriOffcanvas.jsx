import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI, rombelAPI, ugtGuruTugasTugasanAPI, tahunAjaranAPI, tarbiyahDomisiliSantriAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import OffcanvasPindahRombel from '../../../components/Modal/OffcanvasPindahRombel'
import RiwayatPembayaranSantriOffcanvas from '../../../components/RiwayatPembayaranSantriOffcanvas'
import CariMadrasahOffcanvas from '../../../components/CariMadrasahOffcanvas'
import { useAuthStore } from '../../../store/authStore'
import {
  SantriCatatanJenisBadge,
  SantriCatatanJenisFilter,
  SantriCatatanJenisToggle,
  normalizeJenisCatatanRow
} from '../../../components/Santri/SantriCatatanJenisFields'
import { userHasTarbiyahSantriCatatanApiAccess } from '../../../utils/tarbiyahSantriCatatanApiAccess'
import {
  userCanUgtGuruTugasTugasan,
  userCanTambahGtTugasan,
  userCanHapusGtTugasan
} from '../../../utils/ugtGuruTugasanAccess'
import { userCanHapusRiwayatRombel } from '../../../utils/santriRiwayatRombelAccess'
import UsernameLinkButton from '../../../components/UserDetailOffcanvas/UsernameLinkButton'

const field = (label, value) => (
  <div key={label} className="flex flex-col gap-0.5">
    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    <span className="text-sm text-gray-900 dark:text-gray-100">{value ?? '-'}</span>
  </div>
)

const formatAlamat = (s) => {
  const parts = [s?.dusun, s?.rt, s?.rw, s?.desa, s?.kecamatan, s?.kabupaten, s?.provinsi].filter(Boolean)
  return parts.length ? parts.join(', ') : '-'
}

const formatTTL = (s) => {
  const tempat = (s?.tempat_lahir || '').trim()
  const tgl = (s?.tanggal_lahir || '').trim()
  if (!tempat && !tgl) return '-'
  return tempat && tgl ? `${tempat}, ${tgl}` : (tempat || tgl)
}

function normalizeStatusSantriGt(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const NoTelponField = ({ santri }) => {
  const telp = (santri?.no_telpon || '').trim()
  const wa = (santri?.no_wa_santri || '').trim()
  if (!telp && !wa) return field('No telpon', '-')
  return (
    <div key="No telpon" className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">No telpon</span>
      <div className="text-sm text-gray-900 dark:text-gray-100 flex flex-col gap-0.5">
        {telp && <span>Telpon: {telp}</span>}
        {wa && <span>WA: {wa}</span>}
      </div>
    </div>
  )
}

export default function DetailSantriOffcanvas({ isOpen, onClose, santriRow, onEdit, stackBaseZIndex = null }) {
  const { showNotification } = useNotification()
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const authUser = useAuthStore((s) => s.user)
  const canUgtGuruTugasTugasan = useMemo(
    () => userCanUgtGuruTugasTugasan(fiturMenuCodes, authUser),
    [fiturMenuCodes, authUser]
  )
  const canTambahGtTugasan = useMemo(
    () => userCanTambahGtTugasan(fiturMenuCodes, authUser, canUgtGuruTugasTugasan),
    [fiturMenuCodes, authUser, canUgtGuruTugasTugasan]
  )
  const canHapusGtTugasan = useMemo(
    () => userCanHapusGtTugasan(fiturMenuCodes, authUser, canUgtGuruTugasTugasan),
    [fiturMenuCodes, authUser, canUgtGuruTugasTugasan]
  )
  const canHapusRiwayatRombel = useMemo(
    () => userCanHapusRiwayatRombel(fiturMenuCodes, authUser),
    [fiturMenuCodes, authUser]
  )
  const [loading, setLoading] = useState(false)
  const [santri, setSantri] = useState(null)
  const [riwayatRombel, setRiwayatRombel] = useState([])
  const [riwayatDaerah, setRiwayatDaerah] = useState([])
  /** 'diniyah' | 'formal' = offcanvas pindah rombel untuk kategori mana */
  const [pindahModalKategori, setPindahModalKategori] = useState(null)
  const [lembagaIdDiniyah, setLembagaIdDiniyah] = useState('')
  const [lembagaIdFormal, setLembagaIdFormal] = useState('')
  const [pindahLoading, setPindahLoading] = useState(false)
  const [hapusRombelLoadingId, setHapusRombelLoadingId] = useState(null)
  const [accordionRiwayatDiniyah, setAccordionRiwayatDiniyah] = useState(false)
  const [accordionRiwayatFormal, setAccordionRiwayatFormal] = useState(false)
  const [showRiwayatPembayaran, setShowRiwayatPembayaran] = useState(false)
  const [tugasanList, setTugasanList] = useState([])
  const [tugasanLoading, setTugasanLoading] = useState(false)
  const [showCariMadrasah, setShowCariMadrasah] = useState(false)
  const [tahunAjaranOptions, setTahunAjaranOptions] = useState([])
  const [tugasanFormTa, setTugasanFormTa] = useState('')
  const [tugasanFormKet, setTugasanFormKet] = useState('')
  const [tugasanSaving, setTugasanSaving] = useState(false)
  const canTarbiyahSantriCatatan = useMemo(
    () => userHasTarbiyahSantriCatatanApiAccess(fiturMenuCodes),
    [fiturMenuCodes]
  )
  const [detailCatatanList, setDetailCatatanList] = useState([])
  const [detailCatatanLoading, setDetailCatatanLoading] = useState(false)
  const [detailCatatanText, setDetailCatatanText] = useState('')
  const [detailCatatanJenisBaru, setDetailCatatanJenisBaru] = useState('putih')
  const [detailCatatanFilterJenis, setDetailCatatanFilterJenis] = useState('')
  const [detailCatatanSubmitting, setDetailCatatanSubmitting] = useState(false)
  /** Form tambah catatan di dalam accordion (dibuka lewat tombol Tambah). */
  const [detailCatatanTambahOpen, setDetailCatatanTambahOpen] = useState(false)
  const [selectedMadrasah, setSelectedMadrasah] = useState(null)

  const idSantri = santriRow?.id ?? santriRow?.nis

  const catatanKeteranganDetail = useMemo(() => {
    if (!santri?.id) return 'Detail santri · Data Santri'
    const nis = String(santri.nis || '').trim()
    return nis ? `Detail santri · NIS ${nis}` : 'Detail santri · Data Santri'
  }, [santri?.id, santri?.nis])

  const loadDetailCatatan = useCallback(async () => {
    const sid = santri?.id
    if (!sid || !canTarbiyahSantriCatatan) return
    setDetailCatatanLoading(true)
    try {
      const res = await tarbiyahDomisiliSantriAPI.getCatatan(sid, {
        jenis_catatan: detailCatatanFilterJenis === '' ? undefined : detailCatatanFilterJenis
      })
      if (res?.success && Array.isArray(res.data)) setDetailCatatanList(res.data)
      else setDetailCatatanList([])
    } catch {
      setDetailCatatanList([])
    } finally {
      setDetailCatatanLoading(false)
    }
  }, [santri?.id, canTarbiyahSantriCatatan, detailCatatanFilterJenis])

  useEffect(() => {
    if (!isOpen || !santri?.id || !canTarbiyahSantriCatatan) {
      setDetailCatatanList([])
      setDetailCatatanText('')
      setDetailCatatanJenisBaru('putih')
      setDetailCatatanFilterJenis('')
      setDetailCatatanTambahOpen(false)
      setDetailCatatanLoading(false)
      setDetailCatatanSubmitting(false)
      return
    }
    void loadDetailCatatan()
  }, [isOpen, santri?.id, canTarbiyahSantriCatatan, loadDetailCatatan])

  const handleSimpanDetailCatatan = async () => {
    const sid = santri?.id
    const t = detailCatatanText.trim()
    if (!sid || !t) return
    setDetailCatatanSubmitting(true)
    try {
      const res = await tarbiyahDomisiliSantriAPI.postCatatan({
        id_santri: sid,
        catatan: t,
        keterangan: catatanKeteranganDetail,
        jenis_catatan: detailCatatanJenisBaru === 'hitam' ? 'hitam' : 'putih'
      })
      if (res?.success) {
        setDetailCatatanText('')
        setDetailCatatanJenisBaru('putih')
        setDetailCatatanTambahOpen(false)
        showNotification('Catatan disimpan.', 'success')
        await loadDetailCatatan()
      } else {
        showNotification(res?.message || 'Gagal simpan catatan', 'error')
      }
    } catch (err) {
      showNotification(err?.message || 'Gagal simpan catatan', 'error')
    } finally {
      setDetailCatatanSubmitting(false)
    }
  }

  const isGuruTugasSantri = normalizeStatusSantriGt(santri?.status_santri) === 'guru tugas'

  const loadTugasanGt = useCallback(() => {
    if (!idSantri || !canUgtGuruTugasTugasan) return Promise.resolve()
    setTugasanLoading(true)
    return ugtGuruTugasTugasanAPI
      .listBySantri(idSantri)
      .then((res) => {
        if (res?.success && Array.isArray(res?.data)) setTugasanList(res.data)
        else setTugasanList([])
      })
      .catch(() => setTugasanList([]))
      .finally(() => setTugasanLoading(false))
  }, [idSantri, canUgtGuruTugasTugasan])

  const loadRiwayatRombel = useCallback(() => {
    if (!idSantri) return Promise.resolve()
    return santriAPI.getRiwayatRombel(idSantri).then((res) => {
      if (res?.success && Array.isArray(res?.data)) setRiwayatRombel(res.data)
    })
  }, [idSantri])

  useEffect(() => {
    if (!isOpen || !idSantri) {
      setSantri(null)
      setRiwayatRombel([])
      setRiwayatDaerah([])
      setPindahModalKategori(null)
      setLembagaIdDiniyah('')
      setLembagaIdFormal('')
      setTugasanList([])
      setShowCariMadrasah(false)
      setSelectedMadrasah(null)
      setTugasanFormTa('')
      setTugasanFormKet('')
      setDetailCatatanList([])
      setDetailCatatanText('')
      setDetailCatatanJenisBaru('putih')
      setDetailCatatanFilterJenis('')
      setDetailCatatanTambahOpen(false)
      setDetailCatatanLoading(false)
      setDetailCatatanSubmitting(false)
      return
    }
    setLoading(true)
    Promise.all([
      santriAPI.getById(idSantri),
      santriAPI.getRiwayatRombel(idSantri),
      santriAPI.getRiwayatKamar(idSantri)
    ])
      .then(([resSantri, resRombel, resKamar]) => {
        if (resSantri?.success && resSantri?.data) setSantri(resSantri.data)
        if (resRombel?.success && Array.isArray(resRombel?.data)) setRiwayatRombel(resRombel.data)
        if (resKamar?.success && Array.isArray(resKamar?.data)) setRiwayatDaerah(resKamar.data)
      })
      .catch((err) => console.error('DetailSantri load error:', err))
      .finally(() => setLoading(false))
  }, [isOpen, idSantri])

  useEffect(() => {
    if (!isOpen || !santri?.id || !canUgtGuruTugasTugasan) return
    if (normalizeStatusSantriGt(santri.status_santri) !== 'guru tugas') {
      setTugasanList([])
      return
    }
    loadTugasanGt()
  }, [isOpen, santri?.id, santri?.status_santri, canUgtGuruTugasTugasan, loadTugasanGt])

  useEffect(() => {
    if (!isOpen || !canUgtGuruTugasTugasan || !isGuruTugasSantri || !canTambahGtTugasan) return
    let cancelled = false
    tahunAjaranAPI
      .getAll()
      .then((res) => {
        if (cancelled) return
        const rows = Array.isArray(res?.data) ? res.data : []
        const keys = rows
          .map((r) => (r && r.tahun_ajaran != null ? String(r.tahun_ajaran).trim() : ''))
          .filter(Boolean)
        setTahunAjaranOptions(keys)
        setTugasanFormTa((prev) => {
          if (prev && keys.includes(prev)) return prev
          return keys[0] || ''
        })
      })
      .catch(() => {
        if (!cancelled) {
          setTahunAjaranOptions([])
          setTugasanFormTa('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, canUgtGuruTugasTugasan, isGuruTugasSantri, canTambahGtTugasan])

  // Ambil lembaga_id untuk diniyah/formal (untuk modal pindah rombel)
  useEffect(() => {
    if (!santri) {
      setLembagaIdDiniyah('')
      setLembagaIdFormal('')
      return
    }
    if (santri.id_diniyah == null || santri.id_diniyah === '') setLembagaIdDiniyah('')
    else {
      rombelAPI.getById(santri.id_diniyah).then((r) => {
        setLembagaIdDiniyah(r?.success && r?.data ? (r.data.lembaga_id || '') : '')
      }).catch(() => setLembagaIdDiniyah(''))
    }
    if (santri.id_formal == null || santri.id_formal === '') setLembagaIdFormal('')
    else {
      rombelAPI.getById(santri.id_formal).then((r) => {
        setLembagaIdFormal(r?.success && r?.data ? (r.data.lembaga_id || '') : '')
      }).catch(() => setLembagaIdFormal(''))
    }
  }, [santri?.id_diniyah, santri?.id_formal])

  const handleHapusRiwayatRombel = async (rowR) => {
    if (!rowR?.id || !canHapusRiwayatRombel) return
    const label = [rowR.lembaga_nama, rowR.rombel_label || rowR.kelas, rowR.tahun_ajaran].filter(Boolean).join(' · ')
    if (!window.confirm(`Hapus riwayat rombel${label ? ` «${label}»` : ''}? Tindakan ini tidak dapat dibatalkan.`)) return
    setHapusRombelLoadingId(rowR.id)
    try {
      const res = await santriAPI.deleteRiwayatRombel(rowR.id)
      if (res?.success) {
        showNotification(res?.message || 'Riwayat rombel dihapus', 'success')
        await loadRiwayatRombel()
      } else {
        showNotification(res?.message || 'Gagal menghapus riwayat rombel', 'error')
      }
    } catch (err) {
      console.error('Hapus riwayat rombel error:', err)
      showNotification('Gagal menghapus riwayat rombel', 'error')
    } finally {
      setHapusRombelLoadingId(null)
    }
  }

  const handlePindahRombel = async (role, targetRombelId, tahunAjaran = '') => {
    if (!santri?.id || !targetRombelId) return
    const payload = role === 'diniyah' ? { id_diniyah: targetRombelId } : { id_formal: targetRombelId }
    const ta = (tahunAjaran || '').trim()
    if (ta) {
      if (role === 'diniyah') payload.tahun_ajaran_diniyah = ta
      else payload.tahun_ajaran_formal = ta
    }
    setPindahModalKategori(null)
    setPindahLoading(true)
    try {
      const res = await santriAPI.update(santri.id, payload)
      if (res?.success) {
        showNotification('Santri berhasil dipindah ke rombel baru', 'success')
        await loadRiwayatRombel()
        const resSantri = await santriAPI.getById(idSantri)
        if (resSantri?.success && resSantri?.data) setSantri(resSantri.data)
      } else {
        showNotification(res?.message || 'Gagal memindah santri', 'error')
      }
    } catch (err) {
      console.error('Pindah rombel error:', err)
      showNotification('Gagal memindah santri', 'error')
    } finally {
      setPindahLoading(false)
    }
  }

  const handleSimpanTugasan = async () => {
    if (!santri?.id || !selectedMadrasah?.id || !tugasanFormTa) {
      showNotification('Pilih madrasah dan tahun ajaran', 'error')
      return
    }
    setTugasanSaving(true)
    try {
      const res = await ugtGuruTugasTugasanAPI.create({
        id_santri: santri.id,
        id_madrasah: selectedMadrasah.id,
        id_tahun_ajaran: tugasanFormTa,
        keterangan: tugasanFormKet.trim() || undefined
      })
      if (res?.success) {
        showNotification('Tugasan disimpan', 'success')
        setSelectedMadrasah(null)
        setTugasanFormKet('')
        await loadTugasanGt()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (e) {
      console.error(e)
      showNotification('Gagal menyimpan tugasan', 'error')
    } finally {
      setTugasanSaving(false)
    }
  }

  const handleHapusTugasan = async (rowT) => {
    if (!rowT?.id) return
    if (!window.confirm('Hapus tugasan di madrasah ini untuk tahun ajaran tersebut?')) return
    try {
      const res = await ugtGuruTugasTugasanAPI.delete(rowT.id)
      if (res?.success) {
        showNotification('Tugasan dihapus', 'success')
        await loadTugasanGt()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (e) {
      console.error(e)
      showNotification('Gagal menghapus', 'error')
    }
  }

  const tugasanRowAktif = (rowT) => {
    if (rowT?.is_aktif === undefined || rowT?.is_aktif === null) return true
    return Number(rowT.is_aktif) === 1
  }

  const handleToggleAktifTugasan = (rowT) => {
    if (!rowT?.id || !canTambahGtTugasan) return
    const id = rowT.id
    const prev = tugasanRowAktif(rowT)
    const next = !prev
    setTugasanList((list) =>
      list.map((r) => (r.id === id ? { ...r, is_aktif: next ? 1 : 0 } : r))
    )
    ugtGuruTugasTugasanAPI
      .patch(id, { is_aktif: next ? 1 : 0 })
      .then((res) => {
        if (!res?.success) {
          setTugasanList((list) =>
            list.map((r) => (r.id === id ? { ...r, is_aktif: prev ? 1 : 0 } : r))
          )
          showNotification(res?.message || 'Gagal mengubah status', 'error')
        }
      })
      .catch((e) => {
        console.error(e)
        setTugasanList((list) =>
          list.map((r) => (r.id === id ? { ...r, is_aktif: prev ? 1 : 0 } : r))
        )
        showNotification('Gagal mengubah status', 'error')
      })
  }

  const row = santriRow || {}

  const handleEdit = () => {
    if (onEdit && (santri || row)) {
      onEdit(santri || { ...row, id: idSantri })
    }
  }

  const zb = typeof stackBaseZIndex === 'number' && Number.isFinite(stackBaseZIndex) ? Math.floor(stackBaseZIndex) : null
  const detailBackdropStyle = zb != null ? { zIndex: zb } : undefined
  const detailPanelStyle = zb != null ? { zIndex: zb + 1 } : undefined

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="detail-santri-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm${zb == null ? ' z-[10250]' : ''}`}
            style={detailBackdropStyle}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="detail-santri-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700${zb == null ? ' z-[10251]' : ''}`}
            style={detailPanelStyle}
          >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Detail Santri</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{row.nama || santri?.nama || 'Santri'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {santri && typeof onEdit === 'function' && (
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="animate-spin rounded-full h-11 w-11 border-2 border-teal-500 border-t-transparent" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data...</p>
            </div>
          ) : (
            <>
              {/* Kartu profil */}
              {santri ? (
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-5">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                        {(santri.nama || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{santri.nama || '-'}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">NIS {santri.nis || '-'}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{formatAlamat(santri)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                    <span className="text-gray-700 dark:text-gray-300">{santri.status_santri || '-'}</span>
                    <span className="text-gray-400 dark:text-gray-500">·</span>
                    <span className="text-gray-700 dark:text-gray-300">{santri.kategori || '-'}</span>
                    {(santri.daerah || santri.kamar) && (
                      <>
                        <span className="text-gray-400 dark:text-gray-500">·</span>
                        <span className="text-gray-700 dark:text-gray-300">{santri.daerah && santri.kamar ? `${santri.daerah}.${santri.kamar}` : (santri.daerah || santri.kamar)}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white dark:bg-gray-800 p-8 text-center shadow-sm border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Data santri tidak ditemukan.</p>
                </div>
              )}

              {/* Data Detail Santri */}
              {santri && (
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Data Detail</h4>
                  </div>
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    {field('NIK', santri.nik)}
                    {field('TTL', formatTTL(santri))}
                    {field('Jenis Kelamin', santri.gender)}
                    {field('Ayah', santri.ayah)}
                    {field('Ibu', santri.ibu)}
                    {NoTelponField({ santri })}
                    {field('Email', santri.email)}
                    <div key="Username login" className="flex flex-col gap-0.5 sm:col-span-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Username login</span>
                      <UsernameLinkButton
                        userId={santri.id_user}
                        username={santri.login_username || santri.username}
                        stackBaseZIndex={zb != null ? zb + 30 : 10300}
                        emptyLabel="Belum ada akun login"
                        className="text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline break-all text-left"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Riwayat Pembayaran */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                    </span>
                    Pembayaran
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowRiwayatPembayaran(true)}
                    className="text-xs font-medium px-3 py-2 rounded-xl bg-teal-500 text-white hover:bg-teal-600 transition-colors inline-flex items-center gap-1.5"
                  >
                    Lihat riwayat
                  </button>
                </div>
              </div>

              {/* Riwayat tugas Guru Tugas (madrasah) — hanya status Guru Tugas + akses UGT */}
              {santri && isGuruTugasSantri && canUgtGuruTugasTugasan && (
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Riwayat Tugas (Madrasah)</h4>
                  </div>
                  <div className="p-5 space-y-4">
                    {canTambahGtTugasan && (
                      <div className="rounded-xl border border-gray-200 dark:border-gray-600 p-3 space-y-3 bg-gray-50/80 dark:bg-gray-800/50">
                        <p className="text-xs text-gray-600 dark:text-gray-400">Tambah penugasan ke madrasah untuk tahun ajaran tertentu.</p>
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Madrasah</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setShowCariMadrasah(true)}
                              className="flex-1 text-left px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 hover:border-teal-400 transition-colors"
                            >
                              {selectedMadrasah
                                ? `${selectedMadrasah.nama || ''} (#${selectedMadrasah.id})`
                                : 'Cari madrasah…'}
                            </button>
                            {selectedMadrasah && (
                              <button
                                type="button"
                                onClick={() => setSelectedMadrasah(null)}
                                className="px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Tahun ajaran</label>
                          <select
                            value={tugasanFormTa}
                            onChange={(e) => setTugasanFormTa(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                          >
                            <option value="">— Pilih —</option>
                            {tahunAjaranOptions.map((ta) => (
                              <option key={ta} value={ta}>
                                {ta}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Keterangan (opsional)</label>
                          <input
                            type="text"
                            value={tugasanFormKet}
                            onChange={(e) => setTugasanFormKet(e.target.value)}
                            placeholder="Catatan singkat"
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={tugasanSaving || !selectedMadrasah || !tugasanFormTa}
                          onClick={handleSimpanTugasan}
                          className="w-full py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {tugasanSaving ? 'Menyimpan…' : 'Simpan tugasan'}
                        </button>
                      </div>
                    )}

                    {tugasanLoading ? (
                      <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
                      </div>
                    ) : tugasanList.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada tugasan madrasah.</p>
                    ) : (
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                          <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">TA</th>
                              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Madrasah</th>
                              {canTambahGtTugasan && (
                                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                  Aktif
                                </th>
                              )}
                              {canHapusGtTugasan && (
                                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 w-12">
                                  <span className="sr-only">Hapus</span>
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            {tugasanList.map((t, ti) => (
                              <tr
                                key={t.id != null ? `gt-${t.id}-${ti}` : `gt-x-${ti}`}
                                className={`bg-white dark:bg-gray-800 ${!tugasanRowAktif(t) ? 'opacity-60' : ''}`}
                              >
                                <td className="px-2 py-2 text-gray-900 dark:text-gray-200 whitespace-nowrap">{t.id_tahun_ajaran || '-'}</td>
                                <td className="px-2 py-2 text-gray-700 dark:text-gray-300">
                                  <motion.div className="font-medium">
                                    {t.madrasah_nama || '-'}
                                    {!tugasanRowAktif(t) ? (
                                      <span className="ml-1 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                                        Nonaktif
                                      </span>
                                    ) : null}
                                  </motion.div>
                                  {t.madrasah_kategori && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{t.madrasah_kategori}</div>
                                  )}
                                  {t.keterangan && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.keterangan}</div>
                                  )}
                                </td>
                                {canTambahGtTugasan && (
                                  <td className="px-2 py-2 text-center align-middle">
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={tugasanRowAktif(t)}
                                      aria-label={tugasanRowAktif(t) ? 'Nonaktifkan penugasan' : 'Aktifkan penugasan'}
                                      onClick={() => handleToggleAktifTugasan(t)}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        tugasanRowAktif(t) ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                                          tugasanRowAktif(t) ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                      />
                                    </button>
                                  </td>
                                )}
                                {canHapusGtTugasan && (
                                  <td className="px-2 py-2 text-center align-middle">
                                    <button
                                      type="button"
                                      onClick={() => handleHapusTugasan(t)}
                                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition-colors"
                                      title="Hapus tugasan"
                                      aria-label="Hapus tugasan"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <CariMadrasahOffcanvas
                isOpen={showCariMadrasah}
                onClose={() => setShowCariMadrasah(false)}
                onSelect={(m) => setSelectedMadrasah(m)}
                title="Cari madrasah"
              />

              {/* Riwayat Rombel */}
              {(() => {
                const kat = (k) => (r) => (r.lembaga_kategori || '').toString().trim().toLowerCase() === (k || '').toLowerCase()
                const riwayatDiniyah = riwayatRombel.filter(kat('diniyah'))
                const riwayatFormal = riwayatRombel.filter(kat('formal'))
                const riwayatLainnya = riwayatRombel.filter((r) => !kat('diniyah')(r) && !kat('formal')(r))
                const sameId = (rId, sId) => rId != null && sId != null && String(rId) === String(sId)
                /** id_rombel = lembaga___rombel.id (bukan PK santri___rombel). */
                const aktifDiniyah =
                  riwayatDiniyah.find((r) => sameId(r.id_rombel, santri?.id_diniyah)) ?? riwayatDiniyah[0]
                const riwayatDiniyahLama = aktifDiniyah ? riwayatDiniyah.filter((r) => r.id !== aktifDiniyah.id) : []
                const aktifFormal =
                  riwayatFormal.find((r) => sameId(r.id_rombel, santri?.id_formal)) ?? riwayatFormal[0]
                const riwayatFormalLama = aktifFormal ? riwayatFormal.filter((r) => r.id !== aktifFormal.id) : []
                const TabelRombel = ({ list }) => (
                  list.length === 0 ? null : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tahun Ajaran</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Lembaga</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Rombel</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tanggal</th>
                            {canHapusRiwayatRombel && (
                              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 w-12">
                                <span className="sr-only">Hapus</span>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                          {list.map((r, i) => (
                            <tr
                              key={
                                r.id != null
                                  ? `rr-${r.id}-${r.tahun_ajaran ?? ''}-${r.tanggal_dibuat ?? ''}-${i}`
                                  : `rr-x-${i}`
                              }
                              className="bg-white dark:bg-gray-800"
                            >
                              <td className="px-2 py-2 text-gray-900 dark:text-gray-200">{r.tahun_ajaran || '-'}</td>
                              <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.lembaga_nama || '-'}</td>
                              <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.rombel_label || (r.kelas || '') + (r.kel ? ' ' + r.kel : '') || '-'}</td>
                              <td className="px-2 py-2 text-gray-600 dark:text-gray-400 text-xs">{r.tanggal_dibuat || '-'}</td>
                              {canHapusRiwayatRombel && (
                                <td className="px-2 py-2 text-center align-middle">
                                  <button
                                    type="button"
                                    onClick={() => handleHapusRiwayatRombel(r)}
                                    disabled={hapusRombelLoadingId === r.id || r.id == null}
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition-colors disabled:opacity-50"
                                    title="Hapus riwayat rombel"
                                    aria-label="Hapus riwayat rombel"
                                  >
                                    {hapusRombelLoadingId === r.id ? (
                                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-red-500 border-t-transparent" />
                                    ) : (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    )}
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )
                const RowAktif = ({ r }) => (
                  <div className="text-sm py-2.5 px-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{r.lembaga_nama || '-'}</span>
                    <span className="text-gray-600 dark:text-gray-400"> · {(r.rombel_label || (r.kelas || '') + (r.kel ? ' ' + r.kel : '') || '-')}</span>
                    {(r.tahun_ajaran || r.tanggal_dibuat) && (
                      <span className="text-xs text-gray-500 dark:text-gray-500 block mt-0.5">{[r.tahun_ajaran, r.tanggal_dibuat].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                )
                const btnPindahClass = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-xl border border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 disabled:opacity-50'
                const hasDiniyah = santri && (santri.id_diniyah != null && santri.id_diniyah !== '')
                const hasFormal = santri && (santri.id_formal != null && santri.id_formal !== '')
                return (
                  <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </span>
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Riwayat Rombel</h4>
                    </div>
                    <div className="p-5">
                    {riwayatRombel.length === 0 && !hasDiniyah && !hasFormal ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat rombel.</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Diniyah: aktif + accordion sisanya */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400">Diniyah</h5>
                            {hasDiniyah && (
                              <button
                                type="button"
                                onClick={() => setPindahModalKategori('diniyah')}
                                disabled={pindahLoading || !lembagaIdDiniyah}
                                className={btnPindahClass}
                                aria-label="Pindah rombel diniyah"
                              >
                                {pindahLoading ? (
                                  <span className="animate-spin rounded-full h-3 w-3 border-2 border-teal-500 border-t-transparent" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                  </svg>
                                )}
                                Pindah Rombel
                              </button>
                            )}
                          </div>
                          {aktifDiniyah ? <RowAktif r={aktifDiniyah} /> : riwayatDiniyah.length === 0 ? <p className="text-xs text-gray-500 dark:text-gray-400 py-1">—</p> : null}
                          {riwayatDiniyahLama.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setAccordionRiwayatDiniyah((o) => !o)}
                                className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-lg text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <span>Riwayat sebelumnya ({riwayatDiniyahLama.length})</span>
                                <svg className={`w-4 h-4 shrink-0 transition-transform ${accordionRiwayatDiniyah ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <AnimatePresence>
                                {accordionRiwayatDiniyah && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="pt-1">
                                      <TabelRombel list={riwayatDiniyahLama} />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                        {/* Formal: aktif + accordion sisanya */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400">Formal</h5>
                            {hasFormal && (
                              <button
                                type="button"
                                onClick={() => setPindahModalKategori('formal')}
                                disabled={pindahLoading || !lembagaIdFormal}
                                className={btnPindahClass}
                                aria-label="Pindah rombel formal"
                              >
                                {pindahLoading ? (
                                  <span className="animate-spin rounded-full h-3 w-3 border-2 border-teal-500 border-t-transparent" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                  </svg>
                                )}
                                Pindah Rombel
                              </button>
                            )}
                          </div>
                          {aktifFormal ? <RowAktif r={aktifFormal} /> : riwayatFormal.length === 0 ? <p className="text-xs text-gray-500 dark:text-gray-400 py-1">—</p> : null}
                          {riwayatFormalLama.length > 0 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setAccordionRiwayatFormal((o) => !o)}
                                className="w-full flex items-center justify-between gap-2 py-2 px-2 rounded-lg text-left text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <span>Riwayat sebelumnya ({riwayatFormalLama.length})</span>
                                <svg className={`w-4 h-4 shrink-0 transition-transform ${accordionRiwayatFormal ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <AnimatePresence>
                                {accordionRiwayatFormal && (
                                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="pt-1">
                                      <TabelRombel list={riwayatFormalLama} />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                        {/* Lainnya: semua di accordion */}
                        {(riwayatLainnya.length > 0) && (
                          <div className="mb-4">
                            <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Lainnya</h5>
                            <TabelRombel list={riwayatLainnya} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                )
              })()}

              {/* Offcanvas bawah Pindah Rombel: tahun ajaran + list rombel, tanpa konfirmasi setelah pilih */}
              <OffcanvasPindahRombel
                isOpen={!!pindahModalKategori}
                onClose={() => setPindahModalKategori(null)}
                title={'Pindah Rombel ' + (pindahModalKategori === 'diniyah' ? 'Diniyah' : 'Formal')}
                lembagaId={pindahModalKategori === 'diniyah' ? lembagaIdDiniyah : lembagaIdFormal}
                excludeRombelId={pindahModalKategori === 'diniyah' ? santri?.id_diniyah : santri?.id_formal}
                onSelect={(targetRombelId, tahunAjaran) => handlePindahRombel(pindahModalKategori, targetRombelId, tahunAjaran)}
                skipConfirmAfterSelect
              />

              {/* Offcanvas kanan: Riwayat Pembayaran (global, bisa dipanggil dari mana saja) */}
              <RiwayatPembayaranSantriOffcanvas
                isOpen={showRiwayatPembayaran}
                onClose={() => setShowRiwayatPembayaran(false)}
                idSantri={idSantri}
                namaSantri={santri?.nama || row.nama}
              />

              {/* Riwayat Daerah (Kamar) */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Riwayat Daerah</h4>
                </div>
                <div className="p-5">
                {riwayatDaerah.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada riwayat daerah.</p>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tahun Ajaran</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Daerah.Kamar</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Tanggal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {riwayatDaerah.map((r, i) => (
                          <tr
                            key={r.id != null ? `sk-${r.id}-${i}` : `sk-x-${i}`}
                            className="bg-white dark:bg-gray-800"
                          >
                            <td className="px-2 py-2 text-gray-900 dark:text-gray-200">{r.tahun_ajaran || '-'}</td>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.daerah_kamar || `${r.daerah || ''}.${r.kamar || ''}`.trim() || '-'}</td>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{r.status_santri || r.kategori || '-'}</td>
                            <td className="px-2 py-2 text-gray-600 dark:text-gray-400 text-xs">{r.tanggal_dibuat || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                </div>
              </div>

              {santri && canTarbiyahSantriCatatan && (
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
                      <svg className="h-4 w-4 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </span>
                    <h4 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">Catatan santri</h4>
                  </div>

                  <div className="space-y-3 border-b border-gray-100 p-5 dark:border-gray-700">
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Riwayat</p>
                      <SantriCatatanJenisFilter
                        id="detail-santri-catatan-filter"
                        value={detailCatatanFilterJenis}
                        onChange={setDetailCatatanFilterJenis}
                      />
                      {detailCatatanLoading ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Memuat…</p>
                      ) : detailCatatanList.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada catatan.</p>
                      ) : (
                        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                          {detailCatatanList.map((c, ci) => {
                            const jenis = normalizeJenisCatatanRow(c.jenis_catatan)
                            return (
                              <li
                                key={c.id != null ? `cc-${c.id}-${ci}` : `cc-x-${ci}`}
                                className="rounded border border-gray-100 bg-gray-50/80 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-700/40"
                              >
                                <div className="flex items-start gap-2">
                                  <SantriCatatanJenisBadge jenis={jenis} />
                                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-gray-800 dark:text-gray-100">{c.catatan}</p>
                                </div>
                                {c.keterangan ? (
                                  <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">Ket: {c.keterangan}</p>
                                ) : null}
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {c.pengurus_nama ? `${c.pengurus_nama} · ` : ''}
                                  {c.tanggal_dibuat
                                    ? new Date(c.tanggal_dibuat).toLocaleString('id-ID', {
                                        dateStyle: 'short',
                                        timeStyle: 'short'
                                      })
                                    : ''}
                                </p>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setDetailCatatanTambahOpen((v) => !v)}
                      aria-expanded={detailCatatanTambahOpen}
                      className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/60"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </span>
                        Tambah catatan
                      </span>
                      <svg
                        className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${detailCatatanTambahOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <AnimatePresence initial={false}>
                      {detailCatatanTambahOpen && (
                        <motion.div
                          key="detail-santri-catatan-form"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 border-t border-gray-100 px-5 pb-4 pt-3 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              <span className="font-medium text-gray-600 dark:text-gray-300">Ket:</span> {catatanKeteranganDetail}
                            </p>
                            <SantriCatatanJenisToggle
                              id="detail-santri-catatan-jenis"
                              value={detailCatatanJenisBaru === 'hitam' ? 'hitam' : 'putih'}
                              onChange={setDetailCatatanJenisBaru}
                              disabled={detailCatatanSubmitting}
                            />
                            <div>
                              <label htmlFor="detail-santri-catatan-text" className="sr-only">
                                Isi catatan
                              </label>
                              <textarea
                                id="detail-santri-catatan-text"
                                value={detailCatatanText}
                                onChange={(e) => setDetailCatatanText(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                                placeholder="Tulis catatan…"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={detailCatatanSubmitting || !detailCatatanText.trim()}
                              onClick={() => void handleSimpanDetailCatatan()}
                              className="w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                            >
                              {detailCatatanSubmitting ? 'Menyimpan…' : 'Simpan catatan'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer dengan tombol Edit */}
        {typeof onEdit === 'function' && (
          <div className="flex-shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              type="button"
              onClick={handleEdit}
              disabled={loading || !(santri || row.id || row.nis)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Santri
            </button>
          </div>
        )}
      </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
