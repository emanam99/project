/**
 * Riwayat Pendidikan Section Component (Reusable untuk Madrasah dan Sekolah)
 * Menampilkan form untuk riwayat pendidikan (Madrasah atau Sekolah)
 * 
 * @param {object} props
 * @param {object} props.sectionRef - Ref untuk section
 * @param {string} props.title - Judul section (Riwayat Madrasah / Riwayat Sekolah)
 * @param {object} props.formData - Data form
 * @param {function} props.onFieldChange - Function untuk handle perubahan field
 * @param {string} props.focusedField - Field yang sedang focused
 * @param {function} props.onFocus - Function untuk handle focus
 * @param {function} props.onBlur - Function untuk handle blur
 * @param {function} props.getLabelClassName - Function untuk mendapatkan className label
 * @param {string} props.type - Type pendidikan ('madrasah' atau 'sekolah')
 */
function RiwayatPendidikanSection({
  sectionRef,
  title,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  type // 'madrasah' atau 'sekolah'
}) {
  const isSekolah = type === 'sekolah'
  const prefix = type

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        {title}
      </h3>

      {/* Jenis (Madrasah untuk madrasah, Sekolah untuk sekolah) */}
      <div className="mb-4">
        <label className={getLabelClassName(prefix)}>
          {isSekolah ? 'Sekolah' : 'Madrasah'}
        </label>
        {isSekolah ? (
          <select
            value={formData.sekolah}
            onChange={(e) => onFieldChange('sekolah', e.target.value)}
            onFocus={() => onFocus('sekolah')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          >
            <option value="">Pilih Sekolah</option>
            <option value="SD">SD</option>
            <option value="SMP">SMP</option>
            <option value="MTs">MTs</option>
            <option value="SMA">SMA</option>
            <option value="SMK">SMK</option>
            <option value="MA">MA</option>
            <option value="S1">S1</option>
            <option value="S2">S2</option>
            <option value="S3">S3</option>
          </select>
        ) : (
          <input
            type="text"
            value={formData.madrasah}
            onChange={(e) => onFieldChange('madrasah', e.target.value)}
            onFocus={() => onFocus('madrasah')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            placeholder="Isi jika pernah sekolah madrasah"
          />
        )}
      </div>

      {/* Nama */}
      <div className="mb-4">
        <label className={getLabelClassName(`nama_${prefix}`)}>
          Nama {isSekolah ? 'Sekolah' : 'Madrasah'}
        </label>
        <input
          type="text"
          value={formData[`nama_${prefix}`]}
          onChange={(e) => onFieldChange(`nama_${prefix}`, e.target.value)}
          onFocus={() => onFocus(`nama_${prefix}`)}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Alamat */}
      <div className="mb-4">
        <label className={getLabelClassName(`alamat_${prefix}`)}>
          Alamat {isSekolah ? 'Sekolah' : 'Madrasah'}
        </label>
        <textarea
          value={formData[`alamat_${prefix}`]}
          onChange={(e) => onFieldChange(`alamat_${prefix}`, e.target.value)}
          onFocus={() => onFocus(`alamat_${prefix}`)}
          onBlur={onBlur}
          rows="2"
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder={`Alamat lengkap ${isSekolah ? 'sekolah' : 'madrasah'}`}
        />
      </div>

      {/* Tahun Lulus */}
      <div className="mb-4">
        <label className={getLabelClassName(`lulus_${prefix}`)}>
          Tahun Lulus
        </label>
        <input
          type="text"
          value={formData[`lulus_${prefix}`]}
          onChange={(e) => onFieldChange(`lulus_${prefix}`, e.target.value)}
          onFocus={() => onFocus(`lulus_${prefix}`)}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Contoh: 2023"
          maxLength={4}
        />
      </div>

      {/* NPSN & NSM (hanya untuk Sekolah) */}
      {isSekolah && (
        <>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className={getLabelClassName('npsn')}>
                NPSN
              </label>
              <input
                type="text"
                value={formData.npsn}
                onChange={(e) => onFieldChange('npsn', e.target.value)}
                onFocus={() => onFocus('npsn')}
                onBlur={onBlur}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                placeholder="Nomor Pokok Sekolah Nasional"
              />
            </div>
            <div className="flex-1">
              <label className={getLabelClassName('nsm')}>
                NSM
              </label>
              <input
                type="text"
                value={formData.nsm}
                onChange={(e) => onFieldChange('nsm', e.target.value)}
                onFocus={() => onFocus('nsm')}
                onBlur={onBlur}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                placeholder="Nomor Statistik Madrasah"
              />
            </div>
          </div>

          {/* Jurusan */}
          <div className="mb-4">
            <label className={getLabelClassName('jurusan')}>
              Jurusan
            </label>
            <input
              type="text"
              value={formData.jurusan || ''}
              onChange={(e) => onFieldChange('jurusan', e.target.value)}
              onFocus={() => onFocus('jurusan')}
              onBlur={onBlur}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              placeholder="Masukkan Jurusan"
            />
          </div>

          {/* Program Sekolah */}
          <div className="mb-4">
            <label className={getLabelClassName('program_sekolah')}>
              Program Sekolah
            </label>
            <input
              type="text"
              value={formData.program_sekolah || ''}
              onChange={(e) => onFieldChange('program_sekolah', e.target.value)}
              onFocus={() => onFocus('program_sekolah')}
              onBlur={onBlur}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              placeholder="Masukkan Program Sekolah"
            />
          </div>
        </>
      )}
    </div>
  )
}

export default RiwayatPendidikanSection

