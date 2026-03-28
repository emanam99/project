import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { madrasahAPI, pengurusAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage, compressLogoBeforeUpload } from '../../../utils/imageCompression'

const MAX_FOTO_BYTES = 1024 * 1024 // 1 MB
const MAX_LOGO_BYTES = 1024 * 1024 // hasil kompresi klien sebelum upload (batas server)
/** Batas ukuran file mentah sebelum kompresi (hindari file sangat besar di memori) */
const MAX_FOTO_RAW_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_LOGO_RAW_BYTES = 10 * 1024 * 1024 // 10 MB

function fileExtensionLower(name) {
  if (!name || typeof name !== 'string') return ''
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Validasi foto: MIME atau ekstensi (untuk browser yang mengosongkan type) */
function isAllowedFotoFile(file) {
  const mimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (file.type && mimes.includes(file.type)) return true
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtensionLower(file.name))
}

/** Validasi logo: hanya PNG/JPEG — MIME atau ekstensi */
function isAllowedLogoFile(file) {
  const mimes = ['image/jpeg', 'image/jpg', 'image/png']
  if (file.type && mimes.includes(file.type)) return true
  return ['jpg', 'jpeg', 'png'].includes(fileExtensionLower(file.name))
}

/** Gabung alamat dari dusun sampai provinsi */
function formatAlamat(p) {
  if (!p) return ''
  const parts = [
    p.dusun,
    p.rt ? `RT ${p.rt}` : '',
    p.rw ? `RW ${p.rw}` : '',
    p.desa,
    p.kecamatan,
    p.kabupaten,
    p.provinsi,
    p.kode_pos
  ].filter(Boolean)
  return parts.join(', ')
}

const KATEGORI_OPTIONS = ['Madrasah', 'Pesantren', 'Yayasan', 'Sekolah', 'Lainnya']
const KURIKULUM_OPTIONS = ['Depag', 'Diniyah (Mandiri)']

const TEMPAT_OPTIONS = ['Masjid', 'Musholla', 'Gedung Madrasah', 'Rumah', 'Lainnya']
const BANIN_BANAT_OPTIONS = [{ value: 'kumpul', label: 'Kumpul' }, { value: 'tidak kumpul', label: 'Tidak Kumpul' }]
const ADA_TIDAK_OPTIONS = [{ value: 'ada', label: 'Ada' }, { value: 'tidak ada', label: 'Tidak Ada' }, { value: 'ada tapi tidak aktif', label: 'Ada tapi tidak aktif' }]
const PENGELOLA_OPTIONS = [{ value: 'yayasan', label: 'Yayasan' }, { value: 'pesantren', label: 'Pesantren' }, { value: 'perorangan', label: 'Perorangan' }]
const ADA_PROCES_OPTIONS = [{ value: 'ada', label: 'Ada' }, { value: 'tidak ada', label: 'Tidak Ada' }, { value: 'dalam proses', label: 'Dalam Proses' }]
const KM_BERSIFAT_OPTIONS = [{ value: 'khusus', label: 'Khusus' }, { value: 'umum', label: 'Umum' }]
const KONSUMSI_OPTIONS = [{ value: 'perorangan', label: 'Perorangan' }, { value: 'bergantian', label: 'Bergantian' }]
const KAMAR_GT_JARAK_OPTIONS = [{ value: 'dekat madrasah', label: 'Dekat madrasah' }, { value: 'jauh dari madrasah', label: 'Jauh dari madrasah' }]
const MASYARAKAT_OPTIONS = [{ value: 'kota', label: 'Kota' }, { value: 'desa', label: 'Desa' }, { value: 'pegunungan', label: 'Pegunungan' }]
const ALUMNI_OPTIONS = [{ value: 'ada', label: 'Ada' }, { value: 'tidak ada', label: 'Tidak Ada' }, { value: 'sedikit', label: 'Sedikit' }]
const JARAK_MD_OPTIONS = [{ value: 'dekat', label: 'Dekat' }, { value: 'jauh', label: 'Jauh' }]
const STATUS_OPTIONS = ['Pendaftar Baru', 'Belum Survei', 'Sudah Survei', 'Penerima', 'Tidak Aktif']

const initialForm = {
  identitas: '',
  nama: '',
  kategori: '',
  status: '',
  id_alamat: '',
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  provinsi: '',
  kode_pos: '',
  id_koordinator: '',
  sektor: '',
  nama_pengasuh: '',
  id_pengasuh: '',
  no_pengasuh: '',
  kepala: '',
  sekretaris: '',
  bendahara: '',
  kegiatan_pagi: false,
  kegiatan_sore: false,
  kegiatan_malam: false,
  kegiatan_mulai: '',
  kegiatan_sampai: '',
  tempat: '',
  berdiri_tahun: '',
  nama_pjgt: '',
  id_pjgt: '',
  no_pjgt: '',
  tpq: false,
  ula: false,
  wustha: false,
  ulya: false,
  ma_had_ali: false,
  kelas_tertinggi: '',
  kurikulum: '',
  jumlah_murid: '',
  keterangan: '',
  banin_banat: '',
  seragam: '',
  syahriah: '',
  pengelola: '',
  gedung_madrasah: '',
  kantor: '',
  bangku: '',
  kamar_mandi_murid: '',
  kamar_gt: '',
  kamar_mandi_gt: '',
  km_bersifat: '',
  konsumsi: '',
  kamar_gt_jarak: '',
  masyarakat: '',
  alumni: '',
  jarak_md_lain: '',
  foto_path: '',
  logo_path: ''
}

function madrasahToForm(m) {
  if (!m) return initialForm
  return {
    identitas: m.identitas ?? '',
    nama: m.nama ?? '',
    kategori: m.kategori ?? '',
    status: m.status ?? '',
    id_alamat: m.id_alamat ?? '',
    dusun: m.dusun ?? '',
    rt: m.rt ?? '',
    rw: m.rw ?? '',
    desa: m.desa ?? '',
    kecamatan: m.kecamatan ?? '',
    kabupaten: m.kabupaten ?? '',
    provinsi: m.provinsi ?? '',
    kode_pos: m.kode_pos ?? '',
    id_koordinator: (m.koordinator_nip != null && m.koordinator_nip !== '') ? String(m.koordinator_nip) : (m.id_koordinator != null ? String(m.id_koordinator) : ''),
    sektor: m.sektor ?? '',
    nama_pengasuh: m.nama_pengasuh ?? m.pengasuh_nama ?? '',
    id_pengasuh: m.id_pengasuh ?? '',
    no_pengasuh: m.no_pengasuh ?? m.pengasuh_wa ?? '',
    kepala: m.kepala ?? '',
    sekretaris: m.sekretaris ?? '',
    bendahara: m.bendahara ?? '',
    kegiatan_pagi: !!(m.kegiatan_pagi === 1 || m.kegiatan_pagi === true),
    kegiatan_sore: !!(m.kegiatan_sore === 1 || m.kegiatan_sore === true),
    kegiatan_malam: !!(m.kegiatan_malam === 1 || m.kegiatan_malam === true),
    kegiatan_mulai: m.kegiatan_mulai ?? '',
    kegiatan_sampai: m.kegiatan_sampai ?? '',
    tempat: m.tempat ?? '',
    berdiri_tahun: m.berdiri_tahun != null && m.berdiri_tahun !== '' ? String(m.berdiri_tahun) : '',
    nama_pjgt: m.nama_pjgt ?? m.pjgt_nama ?? '',
    id_pjgt: m.id_pjgt ?? '',
    no_pjgt: m.no_pjgt ?? m.pjgt_wa ?? '',
    tpq: !!(m.tpq === 1 || m.tpq === true),
    ula: !!(m.ula === 1 || m.ula === true),
    wustha: !!(m.wustha === 1 || m.wustha === true),
    ulya: !!(m.ulya === 1 || m.ulya === true),
    ma_had_ali: !!(m.ma_had_ali === 1 || m.ma_had_ali === true),
    kelas_tertinggi: m.kelas_tertinggi ?? '',
    kurikulum: m.kurikulum ?? '',
    jumlah_murid: m.jumlah_murid != null && m.jumlah_murid !== '' ? String(m.jumlah_murid) : '',
    keterangan: m.keterangan ?? '',
    banin_banat: m.banin_banat ?? '',
    seragam: m.seragam ?? '',
    syahriah: m.syahriah ?? '',
    pengelola: m.pengelola ?? '',
    gedung_madrasah: m.gedung_madrasah ?? '',
    kantor: m.kantor ?? '',
    bangku: m.bangku ?? '',
    kamar_mandi_murid: m.kamar_mandi_murid ?? '',
    kamar_gt: m.kamar_gt ?? '',
    kamar_mandi_gt: m.kamar_mandi_gt ?? '',
    km_bersifat: m.km_bersifat ?? '',
    konsumsi: m.konsumsi ?? '',
    kamar_gt_jarak: m.kamar_gt_jarak ?? '',
    masyarakat: m.masyarakat ?? '',
    alumni: m.alumni ?? '',
    jarak_md_lain: m.jarak_md_lain ?? '',
    foto_path: m.foto_path ?? '',
    logo_path: m.logo_path ?? ''
  }
}

const TambahMadrasahOffcanvas = forwardRef(function TambahMadrasahOffcanvas({ isOpen, onClose, onSuccess, onOpenCariKoordinator, initialData, koordinatorLocked = false, currentUserId, currentUserNip }, ref) {
  const { showNotification } = useNotification()
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [koordinatorDetail, setKoordinatorDetail] = useState(null)
  const [loadingKoordinatorDetail, setLoadingKoordinatorDetail] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null)
  const [existingFotoBlobUrl, setExistingFotoBlobUrl] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null)
  const [existingLogoBlobUrl, setExistingLogoBlobUrl] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const photoInputRef = useRef(null)
  const photoBlobUrlRef = useRef(null)
  const existingBlobUrlRef = useRef(null)
  const logoInputRef = useRef(null)
  const logoBlobUrlRef = useRef(null)
  const existingLogoBlobUrlRef = useRef(null)
  const isEdit = !!initialData?.id

  useImperativeHandle(ref, () => ({
    setKoordinatorFromSelection(p) {
      if (!p) return
      setForm((prev) => ({ ...prev, id_koordinator: String(p.nip ?? p.id ?? '') }))
      setKoordinatorDetail({
        id: p.id,
        nip: p.nip,
        nama: p.nama,
        whatsapp: p.whatsapp,
        dusun: p.dusun,
        rt: p.rt,
        rw: p.rw,
        desa: p.desa,
        kecamatan: p.kecamatan,
        kabupaten: p.kabupaten,
        provinsi: p.provinsi,
        kode_pos: p.kode_pos
      })
    }
  }), [])

  useEffect(() => {
    if (isOpen) {
      if (initialData?.id) {
        const next = madrasahToForm(initialData)
        if (koordinatorLocked && (currentUserNip != null || currentUserId != null)) {
          next.id_koordinator = String(currentUserNip ?? currentUserId ?? '')
        }
        setForm(next)
        setKoordinatorDetail(
          initialData.id_koordinator
            ? {
                id: initialData.id_koordinator,
                nip: initialData.koordinator_nip ?? currentUserNip,
                nama: initialData.koordinator_nama ?? '',
                whatsapp: initialData.koordinator_wa ?? '',
                dusun: initialData.dusun ?? '',
                rt: initialData.rt ?? '',
                rw: initialData.rw ?? '',
                desa: initialData.desa ?? '',
                kecamatan: initialData.kecamatan ?? '',
                kabupaten: initialData.kabupaten ?? '',
                provinsi: initialData.provinsi ?? '',
                kode_pos: initialData.kode_pos ?? ''
              }
            : null
        )
      } else {
        const next = { ...initialForm }
        if (koordinatorLocked && (currentUserNip != null || currentUserId != null)) {
          next.id_koordinator = String(currentUserNip ?? currentUserId ?? '')
        }
        setForm(next)
        setKoordinatorDetail(null)
        setPhotoPreviewUrl(null)
        setLogoPreviewUrl(null)
        setExistingLogoBlobUrl(null)
        existingLogoBlobUrlRef.current = null
      }
    }
  }, [isOpen, initialData?.id, koordinatorLocked, currentUserId, currentUserNip])

  // Load existing foto blob URL untuk preview (saat edit / foto_path dari server). URL dari cache madrasahAPI, jangan revoke.
  useEffect(() => {
    if (!isOpen || !form.foto_path) {
      existingBlobUrlRef.current = null
      setExistingFotoBlobUrl(null)
      return
    }
    let cancelled = false
    madrasahAPI.fetchFotoBlobUrl(form.foto_path).then((url) => {
      if (!cancelled) {
        existingBlobUrlRef.current = url || null
        setExistingFotoBlobUrl(url || null)
      }
    }).catch(() => {
      if (!cancelled) setExistingFotoBlobUrl(null)
    })
    return () => { cancelled = true }
  }, [isOpen, form.foto_path])

  useEffect(() => {
    if (!isOpen || !form.logo_path) {
      existingLogoBlobUrlRef.current = null
      setExistingLogoBlobUrl(null)
      return
    }
    let cancelled = false
    madrasahAPI.fetchFotoBlobUrl(form.logo_path).then((url) => {
      if (!cancelled) {
        existingLogoBlobUrlRef.current = url || null
        setExistingLogoBlobUrl(url || null)
      }
    }).catch(() => {
      if (!cancelled) setExistingLogoBlobUrl(null)
    })
    return () => { cancelled = true }
  }, [isOpen, form.logo_path])

  useEffect(() => {
    return () => {
      if (photoBlobUrlRef.current) {
        URL.revokeObjectURL(photoBlobUrlRef.current)
        photoBlobUrlRef.current = null
      }
      if (logoBlobUrlRef.current) {
        URL.revokeObjectURL(logoBlobUrlRef.current)
        logoBlobUrlRef.current = null
      }
      existingBlobUrlRef.current = null
      existingLogoBlobUrlRef.current = null
    }
  }, [])

  const handlePhotoChange = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    if (!isAllowedFotoFile(file)) {
      showNotification('Hanya file gambar (JPEG, PNG, WebP, GIF) yang diizinkan. Periksa ekstensi file.', 'error')
      return
    }
    if (file.size > MAX_FOTO_RAW_BYTES) {
      showNotification(`Ukuran foto terlalu besar (maks. ${MAX_FOTO_RAW_BYTES / (1024 * 1024)} MB sebelum kompresi).`, 'error')
      return
    }
    let fileToUpload = file
    if (file.size > MAX_FOTO_BYTES) {
      try {
        let maxMB = 1
        for (let i = 0; i < 5; i++) {
          fileToUpload = await compressImage(fileToUpload, maxMB, 1600, 1600)
          if (fileToUpload.size <= MAX_FOTO_BYTES) break
          maxMB -= 0.2
          if (maxMB < 0.2) maxMB = 0.2
        }
      } catch (err) {
        showNotification('Gagal mengompresi gambar: ' + (err?.message || ''), 'error')
        return
      }
    }
    setUploadingPhoto(true)
    if (photoBlobUrlRef.current) {
      URL.revokeObjectURL(photoBlobUrlRef.current)
      photoBlobUrlRef.current = null
    }
    const blobUrl = URL.createObjectURL(fileToUpload)
    photoBlobUrlRef.current = blobUrl
    setPhotoPreviewUrl(blobUrl)
    try {
      const res = await madrasahAPI.uploadFoto(fileToUpload)
      if (res?.success && res?.foto_path) {
        setForm((prev) => ({ ...prev, foto_path: res.foto_path }))
        existingBlobUrlRef.current = null
        setExistingFotoBlobUrl(null)
      } else {
        showNotification(res?.message || 'Gagal mengunggah foto', 'error')
      }
    } catch (err) {
      showNotification('Gagal mengunggah foto: ' + (err?.response?.data?.message || err?.message || ''), 'error')
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const clearPhoto = () => {
    setForm((prev) => ({ ...prev, foto_path: '' }))
    if (photoBlobUrlRef.current) {
      URL.revokeObjectURL(photoBlobUrlRef.current)
      photoBlobUrlRef.current = null
    }
    setPhotoPreviewUrl(null)
    existingBlobUrlRef.current = null
    setExistingFotoBlobUrl(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleLogoChange = async (e) => {
    const file = e.target?.files?.[0]
    if (!file) return
    if (!isAllowedLogoFile(file)) {
      showNotification('Logo hanya boleh PNG atau JPEG (.png, .jpg, .jpeg). Periksa ekstensi file.', 'error')
      return
    }
    if (file.size > MAX_LOGO_RAW_BYTES) {
      showNotification(`Ukuran file logo terlalu besar (maks. ${MAX_LOGO_RAW_BYTES / (1024 * 1024)} MB sebelum kompresi).`, 'error')
      return
    }
    let fileToUpload
    try {
      fileToUpload = await compressLogoBeforeUpload(file, 512, 0.45)
    } catch (err) {
      showNotification('Gagal mengompresi logo: ' + (err?.message || ''), 'error')
      return
    }
    if (fileToUpload.size > MAX_LOGO_BYTES) {
      try {
        let maxMB = 0.45
        for (let i = 0; i < 6; i++) {
          fileToUpload = await compressImage(fileToUpload, maxMB, 512, 512)
          if (fileToUpload.size <= MAX_LOGO_BYTES) break
          maxMB -= 0.08
          if (maxMB < 0.12) maxMB = 0.12
        }
      } catch (err2) {
        showNotification('Gagal mengompresi logo: ' + (err2?.message || ''), 'error')
        return
      }
    }
    if (fileToUpload.size > MAX_LOGO_BYTES) {
      showNotification('Logo masih di atas 1 MB setelah kompresi. Coba gambar lebih kecil.', 'error')
      return
    }
    setUploadingLogo(true)
    if (logoBlobUrlRef.current) {
      URL.revokeObjectURL(logoBlobUrlRef.current)
      logoBlobUrlRef.current = null
    }
    const blobUrl = URL.createObjectURL(fileToUpload)
    logoBlobUrlRef.current = blobUrl
    setLogoPreviewUrl(blobUrl)
    try {
      const res = await madrasahAPI.uploadLogo(fileToUpload)
      if (res?.success && res?.logo_path) {
        setForm((prev) => ({ ...prev, logo_path: res.logo_path }))
        existingLogoBlobUrlRef.current = null
        setExistingLogoBlobUrl(null)
      } else {
        showNotification(res?.message || 'Gagal mengunggah logo', 'error')
      }
    } catch (err) {
      showNotification('Gagal mengunggah logo: ' + (err?.response?.data?.message || err?.message || ''), 'error')
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const clearLogo = () => {
    setForm((prev) => ({ ...prev, logo_path: '' }))
    if (logoBlobUrlRef.current) {
      URL.revokeObjectURL(logoBlobUrlRef.current)
      logoBlobUrlRef.current = null
    }
    setLogoPreviewUrl(null)
    existingLogoBlobUrlRef.current = null
    setExistingLogoBlobUrl(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  // Saat id_koordinator sudah 7 angka, fetch detail pengurus (hanya ketika ketik manual)
  useEffect(() => {
    const id = String(form.id_koordinator || '').trim()
    if (id.length !== 7) {
      if (!id) setKoordinatorDetail(null)
      return
    }
    let cancelled = false
    setLoadingKoordinatorDetail(true)
    pengurusAPI.getById(id)
      .then((res) => {
        if (cancelled || !res?.success || !res?.data) return
        setKoordinatorDetail(res.data)
      })
      .catch(() => {
        if (!cancelled) setKoordinatorDetail(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingKoordinatorDetail(false)
      })
    return () => { cancelled = true }
  }, [form.id_koordinator])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
  }, [isOpen])

  useEffect(() => {
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === 'id_koordinator') setKoordinatorDetail(null)
  }

  const handleIdKoordinatorChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 7)
    handleChange('id_koordinator', digits)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nama = (form.nama || '').trim()
    if (!nama) {
      showNotification('Nama madrasah wajib diisi', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        identitas: form.identitas || null,
        nama,
        kategori: form.kategori || null,
        status: form.status || null,
        id_alamat: form.id_alamat || null,
        dusun: form.dusun || null,
        rt: form.rt || null,
        rw: form.rw || null,
        desa: form.desa || null,
        kecamatan: form.kecamatan || null,
        kabupaten: form.kabupaten || null,
        provinsi: form.provinsi || null,
        kode_pos: form.kode_pos || null,
        id_koordinator: koordinatorDetail?.id != null ? koordinatorDetail.id : (form.id_koordinator !== '' ? parseInt(form.id_koordinator, 10) : null),
        sektor: form.sektor || null,
        nama_pengasuh: form.nama_pengasuh || null,
        id_pengasuh: form.id_pengasuh ? parseInt(form.id_pengasuh, 10) : null,
        no_pengasuh: form.no_pengasuh || null,
        kepala: form.kepala || null,
        sekretaris: form.sekretaris || null,
        bendahara: form.bendahara || null,
        kegiatan_pagi: !!form.kegiatan_pagi,
        kegiatan_sore: !!form.kegiatan_sore,
        kegiatan_malam: !!form.kegiatan_malam,
        kegiatan_mulai: form.kegiatan_mulai || null,
        kegiatan_sampai: form.kegiatan_sampai || null,
        tempat: form.tempat || null,
        berdiri_tahun: form.berdiri_tahun !== '' ? parseInt(form.berdiri_tahun, 10) : null,
        nama_pjgt: form.nama_pjgt || null,
        id_pjgt: form.id_pjgt ? parseInt(form.id_pjgt, 10) : null,
        no_pjgt: form.no_pjgt || null,
        tpq: !!form.tpq,
        ula: !!form.ula,
        wustha: !!form.wustha,
        ulya: !!form.ulya,
        ma_had_ali: !!form.ma_had_ali,
        kelas_tertinggi: form.kelas_tertinggi || null,
        kurikulum: form.kurikulum || null,
        jumlah_murid: form.jumlah_murid !== '' ? parseInt(form.jumlah_murid, 10) : null,
        keterangan: form.keterangan || null,
        banin_banat: form.banin_banat || null,
        seragam: form.seragam || null,
        syahriah: form.syahriah || null,
        pengelola: form.pengelola || null,
        gedung_madrasah: form.gedung_madrasah || null,
        kantor: form.kantor || null,
        bangku: form.bangku || null,
        kamar_mandi_murid: form.kamar_mandi_murid || null,
        kamar_gt: form.kamar_gt || null,
        kamar_mandi_gt: form.kamar_mandi_gt || null,
        km_bersifat: form.km_bersifat || null,
        konsumsi: form.konsumsi || null,
        kamar_gt_jarak: form.kamar_gt_jarak || null,
        masyarakat: form.masyarakat || null,
        alumni: form.alumni || null,
        jarak_md_lain: form.jarak_md_lain || null,
        foto_path: form.foto_path || null,
        logo_path: form.logo_path || null
      }
      const res = isEdit
        ? await madrasahAPI.update(initialData.id, payload)
        : await madrasahAPI.create(payload)
      if (res.success) {
        showNotification(isEdit ? 'Madrasah berhasil diupdate' : 'Madrasah berhasil ditambahkan', 'success')
        onSuccess?.()
        onClose()
      } else {
        showNotification(res.message || (isEdit ? 'Gagal mengupdate madrasah' : 'Gagal menambahkan madrasah'), 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || (isEdit ? 'Gagal mengupdate madrasah' : 'Gagal menambahkan madrasah'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        document.body.style.overflow = ''
      }}
    >
      {isOpen && (
        <>
          <motion.div
            key="tambah-madrasah-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="tambah-madrasah-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
          >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{isEdit ? 'Edit Madrasah' : 'Tambah Madrasah'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Foto madrasah - di bagian atas offcanvas */}
            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Foto Madrasah</label>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="w-full sm:w-40 h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden shrink-0">
                  {(photoPreviewUrl || existingFotoBlobUrl) ? (
                    <img
                      src={photoPreviewUrl || existingFotoBlobUrl}
                      alt="Preview foto madrasah"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">Belum ada foto</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                    onChange={handlePhotoChange}
                    disabled={uploadingPhoto}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    {uploadingPhoto ? 'Mengunggah...' : 'Pilih Foto'}
                  </button>
                  {(form.foto_path || photoPreviewUrl) && (
                    <button
                      type="button"
                      onClick={clearPhoto}
                      disabled={uploadingPhoto}
                      className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Hapus Foto
                    </button>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">Hanya gambar (JPEG, PNG, WebP, GIF). File mentah maks. 10 MB; setelah kompresi unggah maks. 1 MB.</p>
                </div>
              </div>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Logo Madrasah</label>
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden shrink-0 p-1">
                  {(logoPreviewUrl || existingLogoBlobUrl) ? (
                    <img
                      src={logoPreviewUrl || existingLogoBlobUrl}
                      alt="Preview logo"
                      className="max-w-full max-h-full w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center px-1">Belum ada logo</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={handleLogoChange}
                    disabled={uploadingLogo}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    {uploadingLogo ? 'Mengunggah...' : 'Pilih Logo'}
                  </button>
                  {(form.logo_path || logoPreviewUrl) && (
                    <button
                      type="button"
                      onClick={clearLogo}
                      disabled={uploadingLogo}
                      className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Hapus Logo
                    </button>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">Hanya PNG atau JPEG. File mentah maks. 10 MB; diperkecil dan dikompres di perangkat (sisi maks. 512 px, unggah maks. 1 MB).</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.nama}
                onChange={(e) => handleChange('nama', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                placeholder="Nama madrasah / pesantren"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Identitas (NSPN/NSM)</label>
              <input
                type="text"
                value={form.identitas}
                onChange={(e) => handleChange('identitas', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
              <select
                value={form.kategori}
                onChange={(e) => handleChange('kategori', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Pilih --</option>
                {KATEGORI_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Pilih --</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Alamat – urutan: Dusun, RT/RW, Desa, Kecamatan & Kode Pos, Kabupaten, Provinsi. Style input sama dengan Nama. */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Alamat</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dusun</label>
                  <input
                    type="text"
                    value={form.dusun}
                    onChange={(e) => handleChange('dusun', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                    placeholder="Dusun (opsional)"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RT</label>
                    <input
                      type="text"
                      value={form.rt}
                      onChange={(e) => handleChange('rt', e.target.value)}
                      maxLength={10}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                      placeholder="RT"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RW</label>
                    <input
                      type="text"
                      value={form.rw}
                      onChange={(e) => handleChange('rw', e.target.value)}
                      maxLength={10}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                      placeholder="RW"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desa</label>
                  <input
                    type="text"
                    value={form.desa}
                    onChange={(e) => handleChange('desa', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                    placeholder="Desa"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kecamatan</label>
                    <input
                      type="text"
                      value={form.kecamatan}
                      onChange={(e) => handleChange('kecamatan', e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                      placeholder="Kecamatan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kode Pos</label>
                    <input
                      type="text"
                      value={form.kode_pos}
                      onChange={(e) => handleChange('kode_pos', e.target.value)}
                      maxLength={10}
                      className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 text-center"
                      placeholder="Kode Pos"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kabupaten</label>
                  <input
                    type="text"
                    value={form.kabupaten}
                    onChange={(e) => handleChange('kabupaten', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                    placeholder="Kabupaten"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provinsi</label>
                  <input
                    type="text"
                    value={form.provinsi}
                    onChange={(e) => handleChange('provinsi', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
                    placeholder="Provinsi"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pengasuh</h4>
              {form.id_pengasuh && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Username: <span className="font-medium text-gray-900 dark:text-gray-100">{initialData?.pengasuh_nama ?? '—'}</span>
                </p>
              )}
              <div className="space-y-2">
                <input
                  type="text"
                  value={form.nama_pengasuh}
                  onChange={(e) => handleChange('nama_pengasuh', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  placeholder="Nama pengasuh"
                />
                <input
                  type="text"
                  value={form.no_pengasuh}
                  onChange={(e) => handleChange('no_pengasuh', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  placeholder="No WA / telp pengasuh"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Struktural</h4>
              <div className="space-y-2">
                <input
                  type="text"
                  value={form.kepala}
                  onChange={(e) => handleChange('kepala', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  placeholder="Kepala"
                />
                <input
                  type="text"
                  value={form.sekretaris}
                  onChange={(e) => handleChange('sekretaris', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  placeholder="Sekretaris"
                />
                <input
                  type="text"
                  value={form.bendahara}
                  onChange={(e) => handleChange('bendahara', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  placeholder="Bendahara"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PJGT</h4>
              {form.id_pjgt && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Username: <span className="font-medium text-gray-900 dark:text-gray-100">{initialData?.pjgt_nama ?? '—'}</span>
                </p>
              )}
              <div className="space-y-2">
                <input
                  type="text"
                  value={form.nama_pjgt}
                  onChange={(e) => handleChange('nama_pjgt', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  placeholder="Nama PJGT"
                />
                <input
                  type="text"
                  value={form.no_pjgt}
                  onChange={(e) => handleChange('no_pjgt', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  placeholder="No WA / telp PJGT"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kegiatan Belajar</h4>
              <div className="flex flex-wrap gap-3 mb-3">
                {[
                  { key: 'kegiatan_pagi', label: 'Pagi' },
                  { key: 'kegiatan_sore', label: 'Sore' },
                  { key: 'kegiatan_malam', label: 'Malam' }
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form[key]}
                      onChange={(e) => handleChange(key, e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Mulai (jam)</label>
                  <input
                    type="time"
                    value={form.kegiatan_mulai}
                    onChange={(e) => handleChange('kegiatan_mulai', e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Sampai (jam)</label>
                  <input
                    type="time"
                    value={form.kegiatan_sampai}
                    onChange={(e) => handleChange('kegiatan_sampai', e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Tempat (bisa pilih atau isi sendiri)</label>
                <input
                  type="text"
                  list="tempat-list"
                  value={form.tempat}
                  onChange={(e) => handleChange('tempat', e.target.value)}
                  placeholder="Masjid, Musholla, Gedung Madrasah, Rumah, ..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                />
                <datalist id="tempat-list">
                  {TEMPAT_OPTIONS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tingkatan</h4>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'tpq', label: 'TPQ' },
                  { key: 'ula', label: 'Ula' },
                  { key: 'wustha', label: 'Wustha' },
                  { key: 'ulya', label: 'Ulya' },
                  { key: 'ma_had_ali', label: "Ma'had Ali" }
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!form[key]}
                      onChange={(e) => handleChange(key, e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kelas tertinggi</label>
                <input
                  type="text"
                  value={form.kelas_tertinggi}
                  onChange={(e) => handleChange('kelas_tertinggi', e.target.value)}
                  placeholder="Contoh: 3 Wustha"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Berdiri tahun</label>
              <input
                type="number"
                min="1900"
                max="2100"
                value={form.berdiri_tahun}
                onChange={(e) => handleChange('berdiri_tahun', e.target.value)}
                placeholder="Tahun"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kurikulum</label>
              <select
                value={form.kurikulum}
                onChange={(e) => handleChange('kurikulum', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Pilih --</option>
                {KURIKULUM_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jumlah murid</label>
              <input
                type="number"
                min="0"
                value={form.jumlah_murid}
                onChange={(e) => handleChange('jumlah_murid', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keterangan (Hal-hal yang perlu diinformasikan)</label>
              <textarea
                value={form.keterangan}
                onChange={(e) => handleChange('keterangan', e.target.value)}
                rows={3}
                placeholder="Keterangan tambahan..."
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 resize-y"
              />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keterangan Lain</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Banin Banat</label>
                  <select value={form.banin_banat} onChange={(e) => handleChange('banin_banat', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {BANIN_BANAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Seragam</label>
                  <select value={form.seragam} onChange={(e) => handleChange('seragam', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_TIDAK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Syahriah</label>
                  <select value={form.syahriah} onChange={(e) => handleChange('syahriah', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_TIDAK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Pengelola</label>
                  <select value={form.pengelola} onChange={(e) => handleChange('pengelola', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {PENGELOLA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Gedung Madrasah</label>
                  <select value={form.gedung_madrasah} onChange={(e) => handleChange('gedung_madrasah', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_PROCES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kantor</label>
                  <select value={form.kantor} onChange={(e) => handleChange('kantor', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_PROCES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Bangku</label>
                  <select value={form.bangku} onChange={(e) => handleChange('bangku', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_PROCES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kamar mandi murid</label>
                  <select value={form.kamar_mandi_murid} onChange={(e) => handleChange('kamar_mandi_murid', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_PROCES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Persiapan untuk Guru Tugas</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kamar GT</label>
                  <select value={form.kamar_gt} onChange={(e) => handleChange('kamar_gt', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_PROCES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kamar mandi GT</label>
                  <select value={form.kamar_mandi_gt} onChange={(e) => handleChange('kamar_mandi_gt', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ADA_PROCES_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">KM bersifat</label>
                  <select value={form.km_bersifat} onChange={(e) => handleChange('km_bersifat', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {KM_BERSIFAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Konsumsi</label>
                  <select value={form.konsumsi} onChange={(e) => handleChange('konsumsi', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {KONSUMSI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kamar GT (jarak)</label>
                  <select value={form.kamar_gt_jarak} onChange={(e) => handleChange('kamar_gt_jarak', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {KAMAR_GT_JARAK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Lingkungan Madrasah</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Masyarakat</label>
                  <select value={form.masyarakat} onChange={(e) => handleChange('masyarakat', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {MASYARAKAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Alumni</label>
                  <select value={form.alumni} onChange={(e) => handleChange('alumni', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {ALUMNI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Jarak MD lain</label>
                  <select value={form.jarak_md_lain} onChange={(e) => handleChange('jarak_md_lain', e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm">
                    <option value="">-- Pilih --</option>
                    {JARAK_MD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Koordinator & Sektor</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">NIP Koordinator (pengurus)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={7}
                      value={form.id_koordinator}
                      onChange={(e) => !koordinatorLocked && handleIdKoordinatorChange(e.target.value)}
                      readOnly={koordinatorLocked}
                      disabled={koordinatorLocked}
                      className={`w-24 min-w-[7rem] border rounded-lg px-3 py-2 text-sm font-mono tabular-nums ${koordinatorLocked ? 'border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 cursor-not-allowed' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500'}`}
                      placeholder="7 digit"
                      title={koordinatorLocked ? 'Koordinator terkunci (Anda)' : ''}
                    />
                    {!koordinatorLocked && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onOpenCariKoordinator?.()
                        }}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium focus:ring-2 focus:ring-teal-500 shrink-0"
                      >
                        Cari
                      </button>
                    )}
                  </div>
                  {koordinatorLocked && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Terkunci: koordinator adalah Anda.</p>
                  )}
                  {String(form.id_koordinator || '').length === 7 && loadingKoordinatorDetail && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Memuat...</p>
                  )}
                  {String(form.id_koordinator || '').length === 7 && !loadingKoordinatorDetail && koordinatorDetail && (
                    <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-sm">
                      <p className="font-medium text-gray-800 dark:text-gray-200">{koordinatorDetail.nama || '-'}</p>
                      {koordinatorDetail.id != null && (
                        <p className="text-gray-600 dark:text-gray-400 text-xs">ID (untuk FK): {koordinatorDetail.id}</p>
                      )}
                      <p className="text-gray-600 dark:text-gray-400">{koordinatorDetail.whatsapp ? `No WA: ${koordinatorDetail.whatsapp}` : ''}</p>
                      <p className="text-gray-600 dark:text-gray-400 mt-0.5">{formatAlamat(koordinatorDetail) || '-'}</p>
                    </div>
                  )}
                  {String(form.id_koordinator || '').length === 7 && !loadingKoordinatorDetail && !koordinatorDetail && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">NIP tidak ditemukan.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Sektor</label>
                  <input
                    type="text"
                    value={form.sektor}
                    onChange={(e) => handleChange('sektor', e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-teal-500"
                    placeholder="Sektor (opsional)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {saving ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
})

export default TambahMadrasahOffcanvas
