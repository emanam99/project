import { useEffect, useMemo } from 'react'
import {
  getOpsiStatusMuridForFormal,
  shouldShowStatusMuridForFormal,
} from '../../constants/statusMuridByFormal'

const STATUS_SANTRI_FALLBACK = [
  { value: 'Mukim', label: 'Mukim' },
  { value: 'Khoriji', label: 'Khoriji' },
]

/**
 * Urutan field: status pendaftar → status santri → diniyah → formal → status murid → prodi → gelombang → keterangan status.
 */
function StatusPendaftaranSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField: _focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  kondisiValues = {
    status_pendaftar: [],
    status_santri: [],
    daftar_diniyah: [],
    daftar_formal: [],
  },
}) {
  useEffect(() => {
    if (formData.daftar_formal !== 'STAI' && formData.prodi) {
      onFieldChange('prodi', '')
    }
  }, [formData.daftar_formal, formData.prodi, onFieldChange])

  useEffect(() => {
    const formal = formData.daftar_formal
    if (!shouldShowStatusMuridForFormal(formal)) {
      if (formData.status_murid) onFieldChange('status_murid', '')
      return
    }
    const valid = getOpsiStatusMuridForFormal(formal).map((o) => o.value)
    if (valid.length && formData.status_murid && !valid.includes(formData.status_murid)) {
      onFieldChange('status_murid', '')
    }
  }, [formData.daftar_formal, formData.status_murid, onFieldChange])

  const showStatusMurid = shouldShowStatusMuridForFormal(formData.daftar_formal)
  const opsiStatusMurid = getOpsiStatusMuridForFormal(formData.daftar_formal)

  const opsiStatusSantri = useMemo(() => {
    const fromApi = kondisiValues.status_santri
    return fromApi && fromApi.length > 0 ? fromApi : STATUS_SANTRI_FALLBACK
  }, [kondisiValues.status_santri])

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Status Pendaftaran
      </h3>

      {/* 1. Status Pendaftar */}
      <div className="mb-4">
        <label className={getLabelClassName('status_pendaftar')}>
          Status Pendaftar
        </label>
        <select
          value={formData.status_pendaftar}
          onChange={(e) => onFieldChange('status_pendaftar', e.target.value)}
          onFocus={() => onFocus('status_pendaftar')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Status Pendaftar</option>
          {kondisiValues.status_pendaftar.map((item, index) => (
            <option key={index} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Status Santri */}
      <div className="mb-4">
        <label className={getLabelClassName('status_santri')}>
          Status Santri
          <span className="text-red-500 dark:text-red-400 ml-0.5" title="Wajib diisi"> *</span>
        </label>
        <select
          value={formData.status_santri || ''}
          onChange={(e) => onFieldChange('status_santri', e.target.value)}
          onFocus={() => onFocus('status_santri')}
          onBlur={onBlur}
          required
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Status Santri</option>
          {opsiStatusSantri.map((item, index) => (
            <option key={index} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* 3. Daftar Diniyah */}
      <div className="mb-4">
        <label className={getLabelClassName('daftar_diniyah')}>
          Daftar Diniyah
        </label>
        <select
          value={formData.daftar_diniyah}
          onChange={(e) => onFieldChange('daftar_diniyah', e.target.value)}
          onFocus={() => onFocus('daftar_diniyah')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Diniyah</option>
          {kondisiValues.daftar_diniyah.map((item, index) => (
            <option key={index} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* 4. Daftar Formal */}
      <div className="mb-4">
        <label className={getLabelClassName('daftar_formal')}>
          Daftar Formal
        </label>
        <select
          value={formData.daftar_formal}
          onChange={(e) => onFieldChange('daftar_formal', e.target.value)}
          onFocus={() => onFocus('daftar_formal')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Formal</option>
          {kondisiValues.daftar_formal.map((item, index) => (
            <option key={index} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* 5. Status Murid */}
      {showStatusMurid && (
        <div className="mb-4">
          <label className={getLabelClassName('status_murid')}>
            Status Murid
            <span className="text-red-500 dark:text-red-400 ml-0.5" title="Wajib diisi"> *</span>
          </label>
          <select
            value={formData.status_murid || ''}
            onChange={(e) => onFieldChange('status_murid', e.target.value)}
            onFocus={() => onFocus('status_murid')}
            onBlur={onBlur}
            required
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          >
            <option value="">Pilih Status Murid</option>
            {opsiStatusMurid.map((item, index) => (
              <option key={index} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 6. Prodi */}
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

      {/* 7. Gelombang */}
      <div className="mb-4">
        <label className={getLabelClassName('gelombang')}>
          Gelombang
        </label>
        <select
          value={formData.gelombang || ''}
          onChange={(e) => onFieldChange('gelombang', e.target.value)}
          onFocus={() => onFocus('gelombang')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Gelombang</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
      </div>

      {/* Keterangan status (admin) — setelah gelombang */}
      <div className="mb-4">
        <label className={getLabelClassName('keterangan_status')}>
          Keterangan Status
        </label>
        <select
          value={formData.keterangan_status || ''}
          onChange={(e) => onFieldChange('keterangan_status', e.target.value)}
          onFocus={() => onFocus('keterangan_status')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Keterangan Status</option>
          <option value="Belum Upload">Belum Upload</option>
          <option value="Belum Bayar">Belum Bayar</option>
          <option value="Belum Diverifikasi">Belum Diverifikasi</option>
          <option value="Sudah Diverifikasi">Sudah Diverifikasi</option>
          <option value="Melengkapi Data">Melengkapi Data</option>
          <option value="Upload Berkas">Upload Berkas</option>
          <option value="Belum Aktif">Belum Aktif</option>
          <option value="Aktif">Aktif</option>
        </select>
      </div>
    </div>
  )
}

export default StatusPendaftaranSection
