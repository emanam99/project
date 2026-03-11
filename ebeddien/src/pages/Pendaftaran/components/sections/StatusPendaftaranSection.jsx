import { useEffect } from 'react'

/**
 * Status Pendaftaran Section Component
 * 
 * Menampilkan form untuk status pendaftaran dengan select dropdown
 * Data untuk select diambil dari tabel psb___kondisi_value berdasarkan:
 * - status_pendaftar: field_name di psb___kondisi_field
 * - daftar_diniyah: field_name di psb___kondisi_field  
 * - daftar_formal: field_name di psb___kondisi_field
 * 
 * Backend akan otomatis mengambil ID field yang tepat dari psb___kondisi_field
 * dan mengambil data dari psb___kondisi_value sesuai dengan id_field tersebut
 * 
 * @param {object} props
 * @param {object} props.sectionRef - Ref untuk section
 * @param {object} props.formData - Data form
 * @param {function} props.onFieldChange - Function untuk handle perubahan field
 * @param {string} props.focusedField - Field yang sedang focused
 * @param {function} props.onFocus - Function untuk handle focus
 * @param {function} props.onBlur - Function untuk handle blur
 * @param {function} props.getLabelClassName - Function untuk mendapatkan className label
 * @param {object} props.kondisiValues - Object berisi array kondisi values untuk setiap field
 */
function StatusPendaftaranSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  kondisiValues = {
    status_pendaftar: [],
    daftar_diniyah: [],
    daftar_formal: [],
    status_murid: []
  }
}) {
  // Reset prodi jika daftar_formal bukan STAI
  useEffect(() => {
    if (formData.daftar_formal !== 'STAI' && formData.prodi) {
      onFieldChange('prodi', '')
    }
  }, [formData.daftar_formal, formData.prodi, onFieldChange])

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Status Pendaftaran
      </h3>

      {/* Status Pendaftar */}
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

      {/* Keterangan Status */}
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

      {/* Daftar Diniyah */}
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

      {/* Daftar Formal */}
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

      {/* Status Murid */}
      <div className="mb-4">
        <label className={getLabelClassName('status_murid')}>
          Status Murid
        </label>
        <select
          value={formData.status_murid}
          onChange={(e) => onFieldChange('status_murid', e.target.value)}
          onFocus={() => onFocus('status_murid')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Status Murid</option>
          {kondisiValues.status_murid.map((item, index) => (
            <option key={index} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

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
    </div>
  )
}

export default StatusPendaftaranSection

