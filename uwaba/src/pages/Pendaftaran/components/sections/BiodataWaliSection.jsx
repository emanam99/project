/**
 * Biodata Wali Section Component
 * Menampilkan form untuk biodata wali dengan logic copy data dari Ayah/Ibu
 * 
 * @param {object} props
 * @param {object} props.sectionRef - Ref untuk section
 * @param {object} props.formData - Data form
 * @param {function} props.onFieldChange - Function untuk handle perubahan field
 * @param {string} props.focusedField - Field yang sedang focused
 * @param {function} props.onFocus - Function untuk handle focus
 * @param {function} props.onBlur - Function untuk handle blur
 * @param {function} props.getLabelClassName - Function untuk mendapatkan className label
 */
function BiodataWaliSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName
}) {
  const handleHubunganWaliChange = (hubunganWali) => {
    onFieldChange('hubungan_wali', hubunganWali)
    
    // Jika dipilih Ayah, copy data dari Ayah ke Wali
    if (hubunganWali === 'Ayah') {
      onFieldChange('wali', formData.ayah)
      onFieldChange('nik_wali', formData.nik_ayah)
      onFieldChange('tempat_lahir_wali', formData.tempat_lahir_ayah)
      onFieldChange('tanggal_lahir_wali', formData.tanggal_lahir_ayah)
      onFieldChange('pekerjaan_wali', formData.pekerjaan_ayah)
      onFieldChange('pendidikan_wali', formData.pendidikan_ayah)
      onFieldChange('penghasilan_wali', formData.penghasilan_ayah)
    }
    // Jika dipilih Ibu, copy data dari Ibu ke Wali
    else if (hubunganWali === 'Ibu') {
      onFieldChange('wali', formData.ibu)
      onFieldChange('nik_wali', formData.nik_ibu)
      onFieldChange('tempat_lahir_wali', formData.tempat_lahir_ibu)
      onFieldChange('tanggal_lahir_wali', formData.tanggal_lahir_ibu)
      onFieldChange('pekerjaan_wali', formData.pekerjaan_ibu)
      onFieldChange('pendidikan_wali', formData.pendidikan_ibu)
      onFieldChange('penghasilan_wali', formData.penghasilan_ibu)
    }
    // Jika dipilih selain Ayah/Ibu, kosongkan data wali
    else {
      onFieldChange('wali', '')
      onFieldChange('nik_wali', '')
      onFieldChange('tempat_lahir_wali', '')
      onFieldChange('tanggal_lahir_wali', '')
      onFieldChange('pekerjaan_wali', '')
      onFieldChange('pendidikan_wali', '')
      onFieldChange('penghasilan_wali', '')
    }
  }

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Biodata Wali
      </h3>
      
      {/* Hubungan Wali */}
      <div className="mb-4">
        <label className={getLabelClassName('hubungan_wali')}>
          Hubungan Wali
        </label>
        <select
          value={formData.hubungan_wali}
          onChange={(e) => handleHubunganWaliChange(e.target.value)}
          onFocus={() => onFocus('hubungan_wali')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Hubungan Wali</option>
          <option value="Ayah">Ayah</option>
          <option value="Ibu">Ibu</option>
          <option value="Paman">Paman</option>
          <option value="Bibi">Bibi</option>
          <option value="Kakek">Kakek</option>
          <option value="Nenek">Nenek</option>
          <option value="Lainnya">Lainnya</option>
        </select>
      </div>

      {/* Nama Wali */}
      <div className="mb-4">
        <label className={getLabelClassName('wali')}>
          Nama Wali
        </label>
        <input
          type="text"
          value={formData.wali}
          onChange={(e) => onFieldChange('wali', e.target.value)}
          onFocus={() => onFocus('wali')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* NIK Wali */}
      <div className="mb-4">
        <label className={getLabelClassName('nik_wali')}>
          NIK Wali
        </label>
        <input
          type="text"
          value={formData.nik_wali}
          onChange={(e) => onFieldChange('nik_wali', e.target.value)}
          onFocus={() => onFocus('nik_wali')}
          onBlur={onBlur}
          maxLength={16}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="16 digit NIK"
        />
      </div>

      {/* Tempat & Tanggal Lahir Wali */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className={getLabelClassName('tempat_lahir_wali')}>
            Tempat Lahir
          </label>
          <input
            type="text"
            value={formData.tempat_lahir_wali}
            onChange={(e) => onFieldChange('tempat_lahir_wali', e.target.value)}
            onFocus={() => onFocus('tempat_lahir_wali')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex-1">
          <label className={getLabelClassName('tanggal_lahir_wali')}>
            Tanggal Lahir
          </label>
          <input
            type="date"
            value={formData.tanggal_lahir_wali}
            onChange={(e) => onFieldChange('tanggal_lahir_wali', e.target.value)}
            onFocus={() => onFocus('tanggal_lahir_wali')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Pendidikan Wali */}
      <div className="mb-4">
        <label className={getLabelClassName('pendidikan_wali')}>
          Pendidikan
        </label>
        <input
          type="text"
          value={formData.pendidikan_wali}
          onChange={(e) => onFieldChange('pendidikan_wali', e.target.value)}
          onFocus={() => onFocus('pendidikan_wali')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Contoh: SMA, S1, dll"
        />
      </div>

      {/* Pekerjaan Wali */}
      <div className="mb-4">
        <label className={getLabelClassName('pekerjaan_wali')}>
          Pekerjaan
        </label>
        <input
          type="text"
          value={formData.pekerjaan_wali}
          onChange={(e) => onFieldChange('pekerjaan_wali', e.target.value)}
          onFocus={() => onFocus('pekerjaan_wali')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Penghasilan Wali */}
      <div className="mb-4">
        <label className={getLabelClassName('penghasilan_wali')}>
          Penghasilan
        </label>
        <select
          value={formData.penghasilan_wali}
          onChange={(e) => onFieldChange('penghasilan_wali', e.target.value)}
          onFocus={() => onFocus('penghasilan_wali')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Penghasilan</option>
          <option value="Di bawah 1 juta">Di bawah 1 juta</option>
          <option value="1 - 2 juta">1 - 2 juta</option>
          <option value="2 - 3 juta">2 - 3 juta</option>
          <option value="3 - 4 juta">3 - 4 juta</option>
          <option value="4 - 5 juta">4 - 5 juta</option>
          <option value="Di atas 5 juta">Di atas 5 juta</option>
        </select>
      </div>
    </div>
  )
}

export default BiodataWaliSection

