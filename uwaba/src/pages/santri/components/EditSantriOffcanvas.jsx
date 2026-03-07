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

  if (!isOpen) return null

  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[10000]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-[10001] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">
            Edit Santri — {santri?.nama || formData.nama || 'Santri'}
          </h3>
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
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
              </div>
            ) : (
              <>
                {/* Section: Data Diri */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                    Data Diri
                  </h4>
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
                      <label className={labelClass}>Jenis Kelamin</label>
                      <select value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} className={inputClass}>
                        <option value="">Pilih</option>
                        <option value="Laki-laki">Laki-laki</option>
                        <option value="Perempuan">Perempuan</option>
                      </select>
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
                </section>

                {/* Section: Alamat */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                    Alamat
                  </h4>
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
                </section>

                {/* Section: Biodata Ayah (lengkap seperti Pendaftaran) */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                    Biodata Ayah
                  </h4>
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
                </section>

                {/* Section: Biodata Ibu (lengkap) */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                    Biodata Ibu
                  </h4>
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
                </section>

                {/* Section: Biodata Wali (lengkap) */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                    Biodata Wali
                  </h4>
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
                </section>

                {/* Section: Status & Domisili */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                    Status & Domisili
                  </h4>
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
                </section>

                {/* Section: Pendidikan (LTTQ saja; diniyah/formal tidak di-edit di sini) */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-1 border-b border-gray-200 dark:border-gray-600">
                    Pendidikan (LTTQ)
                  </h4>
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
                </section>
              </>
            )}
          </div>

          <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || saving}
              className="flex-1 px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </motion.div>
    </AnimatePresence>
  )
}
