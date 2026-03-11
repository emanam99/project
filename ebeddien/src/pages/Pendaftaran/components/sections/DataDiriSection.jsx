/**
 * Data Diri Section Component
 * Menampilkan form untuk data diri santri
 * 
 * @param {object} props
 * @param {object} props.sectionRef - Ref untuk section (sectionRefs.dataDiri)
 * @param {object} props.formData - Data form
 * @param {function} props.onFieldChange - Function untuk handle perubahan field (handleFieldChange)
 * @param {string} props.focusedField - Field yang sedang focused
 * @param {function} props.onFocus - Function untuk handle focus (setFocusedField)
 * @param {function} props.onBlur - Function untuk handle blur (setFocusedField(null))
 * @param {function} props.getLabelClassName - Function untuk mendapatkan className label
 */
function DataDiriSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName
}) {
  return (
    <div ref={sectionRef}>
      {/* Nama */}
      <div className="mb-4">
        <label className={getLabelClassName('nama')}>
          Nama
        </label>
        <input
          type="text"
          value={formData.nama}
          onChange={(e) => onFieldChange('nama', e.target.value)}
          onFocus={() => onFocus('nama')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* NIK */}
      <div className="mb-4">
        <label className={getLabelClassName('nik')}>
          NIK
        </label>
        <input
          type="text"
          value={formData.nik}
          onChange={(e) => {
            // Hanya terima angka
            const numericValue = e.target.value.replace(/\D/g, '').slice(0, 16)
            onFieldChange('nik', numericValue)
          }}
          onFocus={() => onFocus('nik')}
          onBlur={onBlur}
          maxLength={16}
          inputMode="numeric"
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="16 digit NIK"
        />
      </div>

      {/* Gender */}
      <div className="mb-4">
        <label className={getLabelClassName('gender')}>
          Gender
        </label>
        <select
          value={formData.gender}
          onChange={(e) => onFieldChange('gender', e.target.value)}
          onFocus={() => onFocus('gender')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Gender</option>
          <option value="Laki-laki">Laki-laki</option>
          <option value="Perempuan">Perempuan</option>
        </select>
      </div>

      {/* Tempat & Tanggal Lahir */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className={getLabelClassName('tempat_lahir')}>
            Tempat Lahir
          </label>
          <input
            type="text"
            value={formData.tempat_lahir}
            onChange={(e) => onFieldChange('tempat_lahir', e.target.value)}
            onFocus={() => onFocus('tempat_lahir')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          />
        </div>
        <div className="flex-1">
          <label className={getLabelClassName('tanggal_lahir')}>
            Tanggal Lahir
          </label>
          <input
            type="date"
            value={formData.tanggal_lahir}
            onChange={(e) => onFieldChange('tanggal_lahir', e.target.value)}
            onFocus={() => onFocus('tanggal_lahir')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      {/* NISN */}
      <div className="mb-4">
        <label className={getLabelClassName('nisn')}>
          NISN
        </label>
        <input
          type="text"
          value={formData.nisn}
          onChange={(e) => onFieldChange('nisn', e.target.value)}
          onFocus={() => onFocus('nisn')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Nomor Induk Siswa Nasional"
        />
      </div>

      {/* No KK */}
      <div className="mb-4">
        <label className={getLabelClassName('no_kk')}>
          No. KK
        </label>
        <input
          type="text"
          value={formData.no_kk}
          onChange={(e) => onFieldChange('no_kk', e.target.value)}
          onFocus={() => onFocus('no_kk')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Nomor Kartu Keluarga"
        />
      </div>

      {/* Kepala Keluarga */}
      <div className="mb-4">
        <label className={getLabelClassName('kepala_keluarga')}>
          Kepala Keluarga
        </label>
        <input
          type="text"
          value={formData.kepala_keluarga}
          onChange={(e) => onFieldChange('kepala_keluarga', e.target.value)}
          onFocus={() => onFocus('kepala_keluarga')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Anak Ke & Jumlah Saudara */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className={getLabelClassName('anak_ke')}>
            Anak Ke
          </label>
          <input
            type="number"
            value={formData.anak_ke}
            onChange={(e) => {
              const numericValue = e.target.value.replace(/\D/g, '')
              onFieldChange('anak_ke', numericValue)
            }}
            onFocus={() => onFocus('anak_ke')}
            onBlur={onBlur}
            min="0"
            inputMode="numeric"
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            placeholder="Contoh: 1, 2, 3"
          />
        </div>
        <div className="flex-1">
          <label className={getLabelClassName('jumlah_saudara')}>
            Jumlah Saudara
          </label>
          <input
            type="number"
            value={formData.jumlah_saudara}
            onChange={(e) => {
              const numericValue = e.target.value.replace(/\D/g, '')
              onFieldChange('jumlah_saudara', numericValue)
            }}
            onFocus={() => onFocus('jumlah_saudara')}
            onBlur={onBlur}
            min="0"
            inputMode="numeric"
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            placeholder="Total saudara"
          />
        </div>
      </div>

      {/* Saudara di Pesantren */}
      <div className="mb-4">
        <label className={getLabelClassName('saudara_di_pesantren')}>
          Saudara di Pesantren
        </label>
        <select
          value={formData.saudara_di_pesantren}
          onChange={(e) => onFieldChange('saudara_di_pesantren', e.target.value)}
          onFocus={() => onFocus('saudara_di_pesantren')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih</option>
          <option value="Tidak Ada">Tidak Ada</option>
          <option value="1">1 Saudara</option>
          <option value="2">2 Saudara</option>
          <option value="3">3 Saudara</option>
          <option value="4">4 Saudara</option>
        </select>
      </div>

      {/* Hobi */}
      <div className="mb-4">
        <label className={getLabelClassName('hobi')}>
          Hobi
        </label>
        <input
          type="text"
          value={formData.hobi}
          onChange={(e) => onFieldChange('hobi', e.target.value)}
          onFocus={() => onFocus('hobi')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Contoh: Membaca, Olahraga, dll"
        />
      </div>

      {/* Cita-cita */}
      <div className="mb-4">
        <label className={getLabelClassName('cita_cita')}>
          Cita-cita
        </label>
        <input
          type="text"
          value={formData.cita_cita}
          onChange={(e) => onFieldChange('cita_cita', e.target.value)}
          onFocus={() => onFocus('cita_cita')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Contoh: Dokter, Guru, dll"
        />
      </div>

      {/* Kebutuhan Khusus */}
      <div className="mb-4">
        <label className={getLabelClassName('kebutuhan_khusus')}>
          Kebutuhan Khusus
        </label>
        <select
          value={formData.kebutuhan_khusus || 'Tidak Ada'}
          onChange={(e) => onFieldChange('kebutuhan_khusus', e.target.value)}
          onFocus={() => onFocus('kebutuhan_khusus')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="Tidak Ada">Tidak Ada</option>
          <option value="Kesulitan Belajar">Kesulitan Belajar</option>
          <option value="Tuna Netra">Tuna Netra</option>
          <option value="Tuna Rungu">Tuna Rungu</option>
          <option value="Tuna Grahita">Tuna Grahita</option>
          <option value="Tuna Daksa">Tuna Daksa</option>
          <option value="Tuna Laras">Tuna Laras</option>
          <option value="Tuna Wicara">Tuna Wicara</option>
          <option value="Tuna Luwarbiasa">Tuna Luwarbiasa</option>
        </select>
      </div>
    </div>
  )
}

export default DataDiriSection

