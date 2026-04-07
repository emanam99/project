/**
 * Kategori & Pendidikan Section (komponen siap pakai jika dipakai di halaman lain).
 * Status santri di sini; kategori + domisili Mukim memakai blok bersama KategoriDomisiliFields.
 */
import KategoriDomisiliFields from './KategoriDomisiliFields'

function KategoriPendidikanSection({
  sectionRef,
  formData,
  onFieldChange,
  onFocus,
  onBlur,
  getLabelClassName,
  getKategoriOptions,
  kategoriSelectOptions = [],
  daerahOptions = [],
  kamarOptions = []
}) {
  const handleStatusSantriChange = (status) => {
    onFieldChange('status_santri', status)
    const options = getKategoriOptions(status)
    if (options.length > 0 && !options.includes(formData.kategori)) {
      onFieldChange('kategori', '')
    }
  }

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Kategori & Pendidikan
      </h3>

      <div className="mb-4">
        <label className={getLabelClassName('status_santri')}>
          Status Santri
          <span className="text-red-500 dark:text-red-400 ml-0.5" title="Wajib diisi"> *</span>
        </label>
        <select
          value={formData.status_santri}
          onChange={(e) => handleStatusSantriChange(e.target.value)}
          onFocus={() => onFocus('status_santri')}
          onBlur={onBlur}
          required
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Status Santri</option>
          <option value="Mukim">Mukim</option>
          <option value="Khoriji">Khoriji</option>
          <option value="Boyong">Boyong</option>
          <option value="Guru Tugas">Guru Tugas</option>
          <option value="Pengurus">Pengurus</option>
        </select>
      </div>

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

export default KategoriPendidikanSection
