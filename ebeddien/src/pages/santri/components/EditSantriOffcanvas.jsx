import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI, pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

const LTTQ_OPTIONS = ['Asfal', 'Ibtidaiyah', 'Tsanawiyah', 'Aliyah', 'Mualim', 'Ngaji Kitab', 'Tidak Mengaji']
const SAUDARA_OPTIONS = [
  { value: '', label: 'Pilih' },
  { value: 'Tidak Ada', label: 'Tidak Ada' },
  { value: '1', label: '1 Saudara' },
  { value: '2', label: '2 Saudara' },
  { value: '3', label: '3 Saudara' },
  { value: '4', label: '4 Saudara' }
]
const PENGHASILAN_OPTIONS = ['Di bawah 1 juta', '1 - 2 juta', '2 - 3 juta', '3 - 4 juta', '4 - 5 juta', 'Di atas 5 juta']

const emptyForm = {
  nama: '',
  nik: '',
  nisn: '',
  no_kk: '',
  kepala_keluarga: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  gender: '',
  ayah: '',
  status_ayah: 'Masih Hidup',
  nik_ayah: '',
  tempat_lahir_ayah: '',
  tanggal_lahir_ayah: '',
  pekerjaan_ayah: '',
  pendidikan_ayah: '',
  penghasilan_ayah: '',
  ibu: '',
  status_ibu: 'Masih Hidup',
  nik_ibu: '',
  tempat_lahir_ibu: '',
  tanggal_lahir_ibu: '',
  pekerjaan_ibu: '',
  pendidikan_ibu: '',
  penghasilan_ibu: '',
  hubungan_wali: '',
  wali: '',
  nik_wali: '',
  tempat_lahir_wali: '',
  tanggal_lahir_wali: '',
  pekerjaan_wali: '',
  pendidikan_wali: '',
  penghasilan_wali: '',
  no_telpon_wali: '',
  no_telpon: '',
  no_wa_santri: '',
  dusun: '',
  rt: '',
  rw: '',
  desa: '',
  kecamatan: '',
  kode_pos: '',
  kabupaten: '',
  provinsi: '',
  lttq: '',
  kelas_lttq: '',
  kel_lttq: '',
  id_kamar: '',
  id_daerah: '',
  status_santri: '',
  kategori: '',
  saudara_di_pesantren: ''
}

export default function EditSantriOffcanvas({ isOpen, onClose, santri, onSaved }) {
  const { showNotification } = useNotification()
  const [formData, setFormData] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [daerahOptions, setDaerahOptions] = useState([])
  const [kamarOptions, setKamarOptions] = useState([])

  const idSantri = santri?.id ?? santri?.nis

  // Load detail santri when open
  useEffect(() => {
    if (!isOpen || !idSantri) {
      setFormData(emptyForm)
      return
    }
    setLoading(true)
    santriAPI.getById(idSantri)
      .then((res) => {
        if (res?.success && res?.data) {
          const d = res.data
          setFormData({
            ...emptyForm,
            nama: d.nama || '',
            nik: d.nik || '',
            nisn: d.nisn || '',
            no_kk: d.no_kk || '',
            kepala_keluarga: d.kepala_keluarga || '',
            tempat_lahir: d.tempat_lahir || '',
            tanggal_lahir: d.tanggal_lahir || '',
            gender: d.gender || '',
            ayah: d.ayah || '',
            status_ayah: d.status_ayah || 'Masih Hidup',
            nik_ayah: d.nik_ayah || '',
            tempat_lahir_ayah: d.tempat_lahir_ayah || '',
            tanggal_lahir_ayah: d.tanggal_lahir_ayah || '',
            pekerjaan_ayah: d.pekerjaan_ayah || '',
            pendidikan_ayah: d.pendidikan_ayah || '',
            penghasilan_ayah: d.penghasilan_ayah || '',
            ibu: d.ibu || '',
            status_ibu: d.status_ibu || 'Masih Hidup',
            nik_ibu: d.nik_ibu || '',
            tempat_lahir_ibu: d.tempat_lahir_ibu || '',
            tanggal_lahir_ibu: d.tanggal_lahir_ibu || '',
            pekerjaan_ibu: d.pekerjaan_ibu || '',
            pendidikan_ibu: d.pendidikan_ibu || '',
            penghasilan_ibu: d.penghasilan_ibu || '',
            hubungan_wali: d.hubungan_wali || '',
            wali: d.wali || '',
            nik_wali: d.nik_wali || '',
            tempat_lahir_wali: d.tempat_lahir_wali || '',
            tanggal_lahir_wali: d.tanggal_lahir_wali || '',
            pekerjaan_wali: d.pekerjaan_wali || '',
            pendidikan_wali: d.pendidikan_wali || '',
            penghasilan_wali: d.penghasilan_wali || '',
            no_telpon_wali: d.no_telpon_wali || '',
            no_telpon: d.no_telpon || '',
            no_wa_santri: d.no_wa_santri || '',
            dusun: d.dusun || '',
            rt: d.rt || '',
            rw: d.rw || '',
            desa: d.desa || '',
            kecamatan: d.kecamatan || '',
            kode_pos: d.kode_pos || '',
            kabupaten: d.kabupaten || '',
            provinsi: d.provinsi || '',
            lttq: d.lttq || '',
            kelas_lttq: d.kelas_lttq || '',
            kel_lttq: d.kel_lttq || '',
            id_kamar: d.id_kamar ?? '',
            id_daerah: d.id_daerah ?? '',
            status_santri: d.status_santri || '',
            kategori: d.kategori || '',
            saudara_di_pesantren: d.saudara_di_pesantren || ''
          })
        }
      })
      .catch((err) => {
        console.error('EditSantri load error:', err)
        showNotification('Gagal memuat data santri', 'error')
      })
      .finally(() => setLoading(false))
  }, [isOpen, idSantri, showNotification])

  // Daerah options by kategori
  useEffect(() => {
    if (!formData.kategori) {
      setDaerahOptions([])
      return
    }
    pendaftaranAPI.getDaerahOptions(formData.kategori).then((res) => {
      if (res?.success && Array.isArray(res?.data)) setDaerahOptions(res.data)
      else setDaerahOptions([])
    }).catch(() => setDaerahOptions([]))
  }, [formData.kategori])

  // Kamar options by id_daerah
  useEffect(() => {
    if (!formData.id_daerah) {
      setKamarOptions([])
      return
    }
    pendaftaranAPI.getKamarOptions(formData.id_daerah).then((res) => {
      if (res?.success && Array.isArray(res?.data)) setKamarOptions(res.data)
      else setKamarOptions([])
    }).catch(() => setKamarOptions([]))
  }, [formData.id_daerah])

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'kategori') {
        next.id_daerah = ''
        next.id_kamar = ''
      }
      if (field === 'id_daerah') next.id_kamar = ''
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!idSantri) return
    setSaving(true)
    try {
      const payload = {
        id: idSantri,
        nama: formData.nama,
        nik: formData.nik || null,
        nisn: formData.nisn || null,
        no_kk: formData.no_kk || null,
        kepala_keluarga: formData.kepala_keluarga || null,
        tempat_lahir: formData.tempat_lahir || null,
        tanggal_lahir: formData.tanggal_lahir || null,
        gender: formData.gender || null,
        ayah: formData.ayah || null,
        status_ayah: formData.status_ayah || null,
        nik_ayah: formData.nik_ayah || null,
        tempat_lahir_ayah: formData.tempat_lahir_ayah || null,
        tanggal_lahir_ayah: formData.tanggal_lahir_ayah || null,
        pekerjaan_ayah: formData.pekerjaan_ayah || null,
        pendidikan_ayah: formData.pendidikan_ayah || null,
        penghasilan_ayah: formData.penghasilan_ayah || null,
        ibu: formData.ibu || null,
        status_ibu: formData.status_ibu || null,
        nik_ibu: formData.nik_ibu || null,
        tempat_lahir_ibu: formData.tempat_lahir_ibu || null,
        tanggal_lahir_ibu: formData.tanggal_lahir_ibu || null,
        pekerjaan_ibu: formData.pekerjaan_ibu || null,
        pendidikan_ibu: formData.pendidikan_ibu || null,
        penghasilan_ibu: formData.penghasilan_ibu || null,
        hubungan_wali: formData.hubungan_wali || null,
        wali: formData.wali || null,
        nik_wali: formData.nik_wali || null,
        tempat_lahir_wali: formData.tempat_lahir_wali || null,
        tanggal_lahir_wali: formData.tanggal_lahir_wali || null,
        pekerjaan_wali: formData.pekerjaan_wali || null,
        pendidikan_wali: formData.pendidikan_wali || null,
        penghasilan_wali: formData.penghasilan_wali || null,
        no_telpon_wali: formData.no_telpon_wali || null,
        no_telpon: formData.no_telpon || null,
        no_wa_santri: formData.no_wa_santri || null,
        dusun: formData.dusun || null,
        rt: formData.rt || null,
        rw: formData.rw || null,
        desa: formData.desa || null,
        kecamatan: formData.kecamatan || null,
        kode_pos: formData.kode_pos || null,
        kabupaten: formData.kabupaten || null,
        provinsi: formData.provinsi || null,
        lttq: formData.lttq || null,
        kelas_lttq: formData.kelas_lttq || null,
        kel_lttq: formData.kel_lttq || null,
        id_kamar: formData.id_kamar === '' ? null : formData.id_kamar,
        status_santri: formData.status_santri || null,
        kategori: formData.kategori || null,
        saudara_di_pesantren: formData.saudara_di_pesantren || null
      }
      const res = await santriAPI.update(idSantri, payload)
      if (res?.success) {
        showNotification(res.message || 'Biodata santri berhasil disimpan', 'success')
        onSaved?.()
        onClose()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      console.error('EditSantri save error:', err)
      showNotification(err?.message || 'Terjadi kesalahan saat menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'
  const inputClass = 'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="edit-santri-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[10020]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="edit-santri-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[10021] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
          >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Edit Santri</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{santri?.nama || formData.nama || 'Santri'}</p>
            </div>
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="animate-spin rounded-full h-11 w-11 border-2 border-teal-500 border-t-transparent" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Memuat data...</p>
              </div>
            ) : (
              <>
                {/* Section: Data Diri */}
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Data Diri</h4>
                  </div>
                  <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Nama</label>
                      <input type="text" value={formData.nama} onChange={(e) => handleChange('nama', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>NIK</label>
                      <input type="text" value={formData.nik} onChange={(e) => handleChange('nik', e.target.value.replace(/\D/g, '').slice(0, 16))} className={inputClass} maxLength={16} />
                    </div>
                    <div>
                      <label className={labelClass}>NISN</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formData.nisn}
                        onChange={(e) => handleChange('nisn', e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className={inputClass}
                        maxLength={10}
                        placeholder="10 digit"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>No. KK</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formData.no_kk}
                        onChange={(e) => handleChange('no_kk', e.target.value.replace(/\D/g, '').slice(0, 16))}
                        className={inputClass}
                        maxLength={16}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Jenis Kelamin</label>
                      <select value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} className={inputClass}>
                        <option value="">Pilih</option>
                        <option value="Laki-laki">Laki-laki</option>
                        <option value="Perempuan">Perempuan</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Kepala keluarga</label>
                      <input
                        type="text"
                        value={formData.kepala_keluarga}
                        onChange={(e) => handleChange('kepala_keluarga', e.target.value)}
                        className={inputClass}
                        placeholder="Nama di KK"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Tempat Lahir</label>
                      <input type="text" value={formData.tempat_lahir} onChange={(e) => handleChange('tempat_lahir', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Tanggal Lahir</label>
                      <input type="date" value={formData.tanggal_lahir} onChange={(e) => handleChange('tanggal_lahir', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>No. Telpon</label>
                      <input type="text" value={formData.no_telpon} onChange={(e) => handleChange('no_telpon', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>No. WA Santri</label>
                      <input type="text" value={formData.no_wa_santri} onChange={(e) => handleChange('no_wa_santri', e.target.value)} className={inputClass} placeholder="08..." />
                    </div>
                  </div>
                  </div>
                </div>

                {/* Section: Alamat */}
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Alamat</h4>
                  </div>
                  <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Dusun</label>
                      <input type="text" value={formData.dusun} onChange={(e) => handleChange('dusun', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>RT</label>
                      <input type="text" value={formData.rt} onChange={(e) => handleChange('rt', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>RW</label>
                      <input type="text" value={formData.rw} onChange={(e) => handleChange('rw', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Desa</label>
                      <input type="text" value={formData.desa} onChange={(e) => handleChange('desa', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Kecamatan</label>
                      <input type="text" value={formData.kecamatan} onChange={(e) => handleChange('kecamatan', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Kabupaten</label>
                      <input type="text" value={formData.kabupaten} onChange={(e) => handleChange('kabupaten', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Provinsi</label>
                      <input type="text" value={formData.provinsi} onChange={(e) => handleChange('provinsi', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Kode Pos</label>
                      <input type="text" value={formData.kode_pos} onChange={(e) => handleChange('kode_pos', e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  </div>
                </div>

                {/* Section: Biodata Ayah */}
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Biodata Ayah</h4>
                  </div>
                  <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Nama Ayah</label>
                      <input type="text" value={formData.ayah} onChange={(e) => handleChange('ayah', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Status</label>
                      <select value={formData.status_ayah} onChange={(e) => handleChange('status_ayah', e.target.value)} className={inputClass}>
                        <option value="Masih Hidup">Masih Hidup</option>
                        <option value="Wafat">Wafat</option>
                      </select>
                    </div>
                    {formData.status_ayah === 'Masih Hidup' && (
                      <>
                        <div>
                          <label className={labelClass}>NIK Ayah</label>
                          <input type="text" value={formData.nik_ayah} onChange={(e) => handleChange('nik_ayah', e.target.value.replace(/\D/g, '').slice(0, 16))} className={inputClass} maxLength={16} />
                        </div>
                        <div>
                          <label className={labelClass}>Tempat Lahir</label>
                          <input type="text" value={formData.tempat_lahir_ayah} onChange={(e) => handleChange('tempat_lahir_ayah', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Tanggal Lahir</label>
                          <input type="date" value={formData.tanggal_lahir_ayah} onChange={(e) => handleChange('tanggal_lahir_ayah', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Pendidikan</label>
                          <input type="text" value={formData.pendidikan_ayah} onChange={(e) => handleChange('pendidikan_ayah', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Pekerjaan</label>
                          <input type="text" value={formData.pekerjaan_ayah} onChange={(e) => handleChange('pekerjaan_ayah', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Penghasilan</label>
                          <select value={formData.penghasilan_ayah} onChange={(e) => handleChange('penghasilan_ayah', e.target.value)} className={inputClass}>
                            <option value="">Pilih</option>
                            {PENGHASILAN_OPTIONS.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </div>

                {/* Section: Biodata Ibu */}
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Biodata Ibu</h4>
                  </div>
                  <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Nama Ibu</label>
                      <input type="text" value={formData.ibu} onChange={(e) => handleChange('ibu', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Status</label>
                      <select value={formData.status_ibu} onChange={(e) => handleChange('status_ibu', e.target.value)} className={inputClass}>
                        <option value="Masih Hidup">Masih Hidup</option>
                        <option value="Wafat">Wafat</option>
                      </select>
                    </div>
                    {formData.status_ibu === 'Masih Hidup' && (
                      <>
                        <div>
                          <label className={labelClass}>NIK Ibu</label>
                          <input type="text" value={formData.nik_ibu} onChange={(e) => handleChange('nik_ibu', e.target.value.replace(/\D/g, '').slice(0, 16))} className={inputClass} maxLength={16} />
                        </div>
                        <div>
                          <label className={labelClass}>Tempat Lahir</label>
                          <input type="text" value={formData.tempat_lahir_ibu} onChange={(e) => handleChange('tempat_lahir_ibu', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Tanggal Lahir</label>
                          <input type="date" value={formData.tanggal_lahir_ibu} onChange={(e) => handleChange('tanggal_lahir_ibu', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Pendidikan</label>
                          <input type="text" value={formData.pendidikan_ibu} onChange={(e) => handleChange('pendidikan_ibu', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Pekerjaan</label>
                          <input type="text" value={formData.pekerjaan_ibu} onChange={(e) => handleChange('pekerjaan_ibu', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Penghasilan</label>
                          <select value={formData.penghasilan_ibu} onChange={(e) => handleChange('penghasilan_ibu', e.target.value)} className={inputClass}>
                            <option value="">Pilih</option>
                            {PENGHASILAN_OPTIONS.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </div>

                {/* Section: Biodata Wali */}
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Biodata Wali</h4>
                  </div>
                  <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Hubungan Wali</label>
                      <select value={formData.hubungan_wali} onChange={(e) => handleChange('hubungan_wali', e.target.value)} className={inputClass}>
                        <option value="">Pilih</option>
                        <option value="Ayah">Ayah</option>
                        <option value="Ibu">Ibu</option>
                        <option value="Paman">Paman</option>
                        <option value="Bibi">Bibi</option>
                        <option value="Kakek">Kakek</option>
                        <option value="Nenek">Nenek</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Nama Wali</label>
                      <input type="text" value={formData.wali} onChange={(e) => handleChange('wali', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>NIK Wali</label>
                      <input type="text" value={formData.nik_wali} onChange={(e) => handleChange('nik_wali', e.target.value.replace(/\D/g, '').slice(0, 16))} className={inputClass} maxLength={16} />
                    </div>
                    <div>
                      <label className={labelClass}>No. Telpon Wali</label>
                      <input type="text" value={formData.no_telpon_wali} onChange={(e) => handleChange('no_telpon_wali', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Tempat Lahir Wali</label>
                      <input type="text" value={formData.tempat_lahir_wali} onChange={(e) => handleChange('tempat_lahir_wali', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Tanggal Lahir Wali</label>
                      <input type="date" value={formData.tanggal_lahir_wali} onChange={(e) => handleChange('tanggal_lahir_wali', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Pendidikan Wali</label>
                      <input type="text" value={formData.pendidikan_wali} onChange={(e) => handleChange('pendidikan_wali', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Pekerjaan Wali</label>
                      <input type="text" value={formData.pekerjaan_wali} onChange={(e) => handleChange('pekerjaan_wali', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Penghasilan Wali</label>
                      <select value={formData.penghasilan_wali} onChange={(e) => handleChange('penghasilan_wali', e.target.value)} className={inputClass}>
                        <option value="">Pilih</option>
                        {PENGHASILAN_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  </div>
                </div>

                {/* Section: Status & Domisili */}
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Status & Domisili</h4>
                  </div>
                  <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Status Santri</label>
                      <select value={formData.status_santri} onChange={(e) => handleChange('status_santri', e.target.value)} className={inputClass}>
                        <option value="">Pilih</option>
                        <option value="Mukim">Mukim</option>
                        <option value="Khoriji">Khoriji</option>
                        <option value="Boyong">Boyong</option>
                        <option value="Guru Tugas">Guru Tugas</option>
                        <option value="Pengurus">Pengurus</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Kategori</label>
                      <select value={formData.kategori} onChange={(e) => handleChange('kategori', e.target.value)} className={inputClass}>
                        <option value="">Pilih</option>
                        <option value="Banin">Banin</option>
                        <option value="Banat">Banat</option>
                      </select>
                    </div>
                    {formData.status_santri === 'Mukim' && (
                      <>
                        <div>
                          <label className={labelClass}>Daerah</label>
                          <select value={formData.id_daerah ?? ''} onChange={(e) => handleChange('id_daerah', e.target.value)} className={inputClass}>
                            <option value="">Pilih Daerah</option>
                            {daerahOptions.map((d) => (
                              <option key={d.id} value={d.id}>{d.daerah}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Kamar</label>
                          <select value={formData.id_kamar ?? ''} onChange={(e) => handleChange('id_kamar', e.target.value)} className={inputClass} disabled={!formData.id_daerah}>
                            <option value="">Pilih Kamar</option>
                            {kamarOptions.map((k) => (
                              <option key={k.id} value={k.id}>{k.kamar}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Saudara di Pesantren</label>
                      <select value={formData.saudara_di_pesantren} onChange={(e) => handleChange('saudara_di_pesantren', e.target.value)} className={inputClass}>
                        {SAUDARA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  </div>
                </div>

                {/* Section: Pendidikan (LTTQ) */}
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Pendidikan (LTTQ)</h4>
                  </div>
                  <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>LTTQ</label>
                      <select value={formData.lttq} onChange={(e) => handleChange('lttq', e.target.value)} className={inputClass}>
                        <option value="">Pilih LTTQ</option>
                        {LTTQ_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Kelas LTTQ</label>
                      <input type="text" value={formData.kelas_lttq} onChange={(e) => handleChange('kelas_lttq', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Kel LTTQ</label>
                      <input type="text" value={formData.kel_lttq} onChange={(e) => handleChange('kel_lttq', e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex-shrink-0 px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || saving}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
