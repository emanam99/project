import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { OPSI_BY_FORMAL, FORMAL_SHOW_STATUS_MURID } from '../../../pages/PilihanStatusMurid'

/**
 * Gelombang Select Component
 * Menggunakan gelombang aktif dari store (psb___pengaturan)
 * Field ini otomatis diisi dengan gelombang aktif dan tidak bisa diubah (disabled)
 */
function GelombangSelect({ formData, onFieldChange, onFocus, onBlur, getLabelClassName }) {
  const { getGelombangAktif, gelombang } = useTahunAjaranStore()
  const gelombangAktif = getGelombangAktif()

  // Otomatis set gelombang aktif jika belum ada di formData
  useEffect(() => {
    if (gelombangAktif && (!formData.gelombang || formData.gelombang === '')) {
      onFieldChange('gelombang', gelombangAktif)
    }
  }, [gelombangAktif, formData.gelombang, onFieldChange])

  // Format tanggal untuk display
  const formatTanggal = (tanggal) => {
    if (!tanggal) return ''
    try {
      const date = new Date(tanggal)
      return date.toLocaleDateString('id-ID', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    } catch (e) {
      return tanggal
    }
  }

  // Get label untuk gelombang
  const getGelombangLabel = (gelombangNum) => {
    if (!gelombangNum) return ''
    const tanggalGelombang = gelombang[gelombangNum]
    if (tanggalGelombang) {
      return `Gelombang ${gelombangNum} (${formatTanggal(tanggalGelombang)})`
    }
    return `Gelombang ${gelombangNum}`
  }

  // Value yang digunakan: formData.gelombang jika ada, jika tidak gunakan gelombang aktif
  const selectedValue = formData.gelombang || gelombangAktif || ''

  return (
    <div className="mb-4">
      <label className={getLabelClassName('gelombang')}>
        Gelombang
      </label>
      <select
        value={selectedValue}
        onChange={(e) => onFieldChange('gelombang', e.target.value)}
        onFocus={() => onFocus('gelombang')}
        onBlur={onBlur}
        disabled={true}
        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed"
        title="Gelombang otomatis diambil dari pengaturan aplikasi"
      >
        {selectedValue ? (
          <option value={selectedValue}>
            {getGelombangLabel(selectedValue)}
          </option>
        ) : (
          <option value="">Belum ada gelombang aktif</option>
        )}
      </select>
      {(gelombangAktif || selectedValue) && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Gelombang otomatis diambil dari pengaturan aplikasi
        </p>
      )}
    </div>
  )
}

/**
 * Status Pendaftaran Section Component
 *
 * Menampilkan form status pendaftaran dengan select dropdown.
 * Daftar kondisi (field + opsi) diambil dari API: semua field yang ada di
 * psb___kondisi_field + psb___kondisi_value (yang termasuk kolom registrasi).
 */
function StatusPendaftaranSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  kondisiFields = [] // [{ field_name, field_label, values: [{ value, label }] }, ...]
}) {
  // Reset prodi jika daftar_formal bukan STAI
  useEffect(() => {
    if (formData.daftar_formal !== 'STAI' && formData.prodi) {
      onFieldChange('prodi', '')
    }
  }, [formData.daftar_formal, formData.prodi, onFieldChange])

  // Reset status_murid jika daftar_formal berubah dan value saat ini tidak ada di opsi formal yang baru
  useEffect(() => {
    const formal = formData.daftar_formal
    if (!FORMAL_SHOW_STATUS_MURID.includes(formal)) {
      if (formData.status_murid) onFieldChange('status_murid', '')
      return
    }
    const opts = OPSI_BY_FORMAL[formal] || []
    const validValues = opts.map(o => o.value)
    if (formData.status_murid && !validValues.includes(formData.status_murid)) {
      onFieldChange('status_murid', '')
    }
  }, [formData.daftar_formal, formData.status_murid, onFieldChange])

  // Ambil opsi untuk satu field: status_murid di-filter menurut daftar_formal, field lain pakai values dari API
  const getOptionsForField = (field) => {
    if (field.field_name === 'status_murid') {
      const formal = formData.daftar_formal
      if (!FORMAL_SHOW_STATUS_MURID.includes(formal)) return []
      return OPSI_BY_FORMAL[formal] || []
    }
    return field.values || []
  }

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Status Pendaftaran
      </h3>

      {/* Kondisi dinamis: satu select per field dari database. Status murid hanya opsi sesuai daftar formal. */}
      {kondisiFields.map((field) => {
        // Status murid: hanya tampilkan jika daftar formal SMP, MTs, SMAI, atau STAI
        if (field.field_name === 'status_murid') {
          const formal = formData.daftar_formal
          if (!FORMAL_SHOW_STATUS_MURID.includes(formal)) return null
        }
        const options = getOptionsForField(field)
        return (
          <div key={field.field_name} className="mb-4">
            <label className={getLabelClassName(field.field_name)}>
              {field.field_label}
              {['status_pendaftar', 'daftar_formal', 'daftar_diniyah', 'status_murid'].includes(field.field_name) && (
                <span className="text-red-500 dark:text-red-400 ml-0.5" title="Wajib diisi"> *</span>
              )}
            </label>
            <select
              value={formData[field.field_name] ?? ''}
              onChange={(e) => onFieldChange(field.field_name, e.target.value)}
              onFocus={() => onFocus(field.field_name)}
              onBlur={onBlur}
              required={['status_pendaftar', 'daftar_formal', 'daftar_diniyah', 'status_murid'].includes(field.field_name)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            >
              <option value="">Pilih {field.field_label}</option>
              {options.map((item, index) => (
                <option key={index} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )
      })}

      {/* Prodi - Hanya muncul jika Daftar Formal = STAI */}
      {formData.daftar_formal === 'STAI' && (
        <div className="mb-4">
          <label className={getLabelClassName('prodi')}>
            Prodi
          </label>
          <select
            value={formData.prodi || ''}
            onChange={(e) => onFieldChange('prodi', e.target.value)}
            onFocus={() => onFocus('prodi')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          >
            <option value="">Pilih Prodi</option>
            <option value="MPI">MPI (Manajemen Pendidikan Islam)</option>
            <option value="ES">ES (Ekonomi Syariah)</option>
            <option value="PGMI">PGMI (Profesi Guru Madrasah Ibtidaiyah)</option>
          </select>
        </div>
      )}

      {/* Gelombang */}
      <GelombangSelect
        formData={formData}
        onFieldChange={onFieldChange}
        onFocus={onFocus}
        onBlur={onBlur}
        getLabelClassName={getLabelClassName}
      />

      {/* Daerah & Kamar - hanya tampil jika status santri Mukim */}
      <AnimatePresence mode="wait">
        {formData.status_santri === 'Mukim' && (
          <motion.div
            key="daerah-kamar"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex gap-4 mb-4 pt-1">
              <div className="flex-1">
                <label className={getLabelClassName('daerah')}>
                  Daerah
                </label>
                <select
                  value={formData.daerah || ''}
                  onChange={(e) => onFieldChange('daerah', e.target.value)}
                  onFocus={() => onFocus('daerah')}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                >
                  <option value="">Pilih Daerah</option>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className={getLabelClassName('kamar')}>
                  Kamar
                </label>
                <select
                  value={formData.kamar || ''}
                  onChange={(e) => onFieldChange('kamar', e.target.value)}
                  onFocus={() => onFocus('kamar')}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                >
                  <option value="">Pilih Kamar</option>
                  {Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')).map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default StatusPendaftaranSection
