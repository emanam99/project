/**
 * Alamat Section Component
 * Menampilkan form untuk alamat santri
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
function AlamatSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName
}) {
  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Alamat
      </h3>

      {/* Dusun */}
      <div className="mb-4">
        <label className={getLabelClassName('dusun')}>
          Dusun
        </label>
        <input
          type="text"
          value={formData.dusun}
          onChange={(e) => onFieldChange('dusun', e.target.value)}
          onFocus={() => onFocus('dusun')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* RT & RW */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className={getLabelClassName('rt')}>
            RT
          </label>
          <input
            type="text"
            value={formData.rt}
            onChange={(e) => onFieldChange('rt', e.target.value)}
            onFocus={() => onFocus('rt')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            maxLength={10}
          />
        </div>
        <div className="flex-1">
          <label className={getLabelClassName('rw')}>
            RW
          </label>
          <input
            type="text"
            value={formData.rw}
            onChange={(e) => onFieldChange('rw', e.target.value)}
            onFocus={() => onFocus('rw')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            maxLength={10}
          />
        </div>
      </div>

      {/* Desa */}
      <div className="mb-4">
        <label className={getLabelClassName('desa')}>
          Desa
        </label>
        <input
          type="text"
          value={formData.desa}
          onChange={(e) => onFieldChange('desa', e.target.value)}
          onFocus={() => onFocus('desa')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Kecamatan & Kode Pos */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className={getLabelClassName('kecamatan')}>
            Kecamatan
          </label>
          <input
            type="text"
            value={formData.kecamatan}
            onChange={(e) => onFieldChange('kecamatan', e.target.value)}
            onFocus={() => onFocus('kecamatan')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className={getLabelClassName('kode_pos')}>
            Kode Pos
          </label>
          <input
            type="text"
            value={formData.kode_pos}
            onChange={(e) => onFieldChange('kode_pos', e.target.value)}
            onFocus={() => onFocus('kode_pos')}
            onBlur={onBlur}
            maxLength={6}
            className="w-24 p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
          />
        </div>
      </div>

      {/* Kabupaten */}
      <div className="mb-4">
        <label className={getLabelClassName('kabupaten')}>
          Kabupaten
        </label>
        <input
          type="text"
          value={formData.kabupaten}
          onChange={(e) => onFieldChange('kabupaten', e.target.value)}
          onFocus={() => onFocus('kabupaten')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Provinsi */}
      <div className="mb-4">
        <label className={getLabelClassName('provinsi')}>
          Provinsi
        </label>
        <input
          type="text"
          value={formData.provinsi}
          onChange={(e) => onFieldChange('provinsi', e.target.value)}
          onFocus={() => onFocus('provinsi')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>
    </div>
  )
}

export default AlamatSection

