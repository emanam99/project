import { useEffect, useRef, useMemo } from 'react'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import KategoriDomisiliFields from './KategoriDomisiliFields'
import {
  getOpsiStatusMuridForFormal,
  shouldShowStatusMuridForFormal,
} from '../../../pages/PilihanStatusMurid'
import { getOrderedKondisiFieldsForPendaftaran } from '../../../utils/statusPendaftaranFieldOrder'

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
  kondisiFields = [], // [{ field_name, field_label, values: [{ value, label }] }, ...]
  kategoriSelectOptions = [],
  daerahOptions = [],
  kamarOptions = []
}) {
  // Reset prodi hanya ketika daftar_formal berubah (bukan setiap kali user mengetik di prodi)
  const prevFormalRef = useRef(formData.daftar_formal)
  useEffect(() => {
    const prev = prevFormalRef.current
    prevFormalRef.current = formData.daftar_formal
    if (prev === formData.daftar_formal) return
    if (formData.daftar_formal !== 'STAI') {
      onFieldChange('prodi', '')
    }
  }, [formData.daftar_formal, onFieldChange])

  // Selain SMP/MTs/SMAI/SMA/STAI: kosongkan status_murid (field disembunyikan, tidak wajib)
  useEffect(() => {
    const formal = formData.daftar_formal
    if (!shouldShowStatusMuridForFormal(formal)) {
      if (formData.status_murid) onFieldChange('status_murid', '')
      return
    }
    const validValues = getOpsiStatusMuridForFormal(formal).map((o) => o.value)
    if (validValues.length === 0) return
    if (formData.status_murid && !validValues.includes(formData.status_murid)) {
      onFieldChange('status_murid', '')
    }
  }, [formData.daftar_formal, formData.status_murid, onFieldChange])

  const getOptionsForField = (field) => {
    if (field.field_name === 'status_murid') {
      return getOpsiStatusMuridForFormal(formData.daftar_formal)
    }
    return field.values || []
  }

  const statusMuridWajib = shouldShowStatusMuridForFormal(formData.daftar_formal)

  const orderedKondisiFields = useMemo(
    () => getOrderedKondisiFieldsForPendaftaran(kondisiFields),
    [kondisiFields]
  )

  const isWajibKondisi = (fieldName) =>
    ['status_pendaftar', 'status_santri', 'daftar_formal', 'daftar_diniyah'].includes(fieldName)

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Status Pendaftaran
      </h3>

      {/* Urutan: status pendaftar → status santri → diniyah → formal → status murid (lalu prodi, gelombang). */}
      {orderedKondisiFields.map((field) => {
        if (field.field_name === 'status_murid' && !shouldShowStatusMuridForFormal(formData.daftar_formal)) {
          return null
        }
        const options = getOptionsForField(field)
        const wajib =
          field.field_name === 'status_murid'
            ? statusMuridWajib
            : isWajibKondisi(field.field_name)
        return (
          <div key={field.field_name} className="mb-4">
            <label className={getLabelClassName(field.field_name)}>
              {field.field_label}
              {wajib && (
                <span className="text-red-500 dark:text-red-400 ml-0.5" title="Wajib diisi"> *</span>
              )}
            </label>
            <select
              value={formData[field.field_name] ?? ''}
              onChange={(e) => onFieldChange(field.field_name, e.target.value)}
              onFocus={() => onFocus(field.field_name)}
              onBlur={onBlur}
              required={wajib}
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

      <KategoriDomisiliFields
        formData={formData}
        onFieldChange={onFieldChange}
        onFocus={onFocus}
        onBlur={onBlur}
        getLabelClassName={getLabelClassName}
        kategoriSelectOptions={kategoriSelectOptions}
        daerahOptions={daerahOptions}
        kamarOptions={kamarOptions}
      />
    </div>
  )
}

export default StatusPendaftaranSection
