import { motion, AnimatePresence } from 'framer-motion'

/**
 * Biodata Orang Tua Section Component (Reusable untuk Ayah dan Ibu)
 * Menampilkan form untuk biodata orang tua (Ayah atau Ibu)
 * 
 * @param {object} props
 * @param {object} props.sectionRef - Ref untuk section
 * @param {string} props.title - Judul section (Biodata Ayah / Biodata Ibu)
 * @param {object} props.formData - Data form
 * @param {function} props.onFieldChange - Function untuk handle perubahan field
 * @param {string} props.focusedField - Field yang sedang focused
 * @param {function} props.onFocus - Function untuk handle focus
 * @param {function} props.onBlur - Function untuk handle blur
 * @param {function} props.getLabelClassName - Function untuk mendapatkan className label
 * @param {string} props.prefix - Prefix untuk field (ayah atau ibu)
 */
function BiodataOrangTuaSection({
  sectionRef,
  title,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  prefix // 'ayah' atau 'ibu'
}) {
  // Cek apakah status masih hidup (untuk menampilkan field detail)
  const isAlive = formData[`status_${prefix}`] === 'Masih Hidup'

  // Handle status change - clear fields jika status "Wafat"
  const handleStatusChange = (value) => {
    onFieldChange(`status_${prefix}`, value)
    
    // Jika status "Wafat", reset field detail
    if (value === 'Wafat') {
      onFieldChange(`nik_${prefix}`, '')
      onFieldChange(`tempat_lahir_${prefix}`, '')
      onFieldChange(`tanggal_lahir_${prefix}`, '')
      onFieldChange(`pendidikan_${prefix}`, '')
      onFieldChange(`pekerjaan_${prefix}`, '')
      onFieldChange(`penghasilan_${prefix}`, '')
    }
  }

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        {title}
      </h3>
      
      {/* Nama */}
      <div className="mb-4">
        <label className={getLabelClassName(prefix)}>
          Nama {title.split(' ')[1]} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData[prefix]}
          onChange={(e) => onFieldChange(prefix, e.target.value)}
          onFocus={() => onFocus(prefix)}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Status */}
      <div className="mb-4">
        <label className={getLabelClassName(`status_${prefix}`)}>
          Status <span className="text-red-500">*</span>
        </label>
        <select
          value={formData[`status_${prefix}`]}
          onChange={(e) => handleStatusChange(e.target.value)}
          onFocus={() => onFocus(`status_${prefix}`)}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="Masih Hidup">Masih Hidup</option>
          <option value="Wafat">Wafat</option>
        </select>
      </div>

      {/* NIK - Hanya tampil jika status "Masih Hidup" */}
      <AnimatePresence>
        {isAlive && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
            <label className={getLabelClassName(`nik_${prefix}`)}>
              NIK {title.split(' ')[1]}
            </label>
            <input
              type="text"
              value={formData[`nik_${prefix}`]}
              onChange={(e) => {
                const numericValue = e.target.value.replace(/\D/g, '').slice(0, 16)
                onFieldChange(`nik_${prefix}`, numericValue)
              }}
              onFocus={() => onFocus(`nik_${prefix}`)}
              onBlur={onBlur}
              maxLength={16}
              inputMode="numeric"
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              placeholder="16 digit NIK"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tempat & Tanggal Lahir - Hanya tampil jika status "Masih Hidup" */}
      <AnimatePresence>
        {isAlive && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex gap-4">
              <div className="flex-1">
                <label className={getLabelClassName(`tempat_lahir_${prefix}`)}>
                  Tempat Lahir
                </label>
                <input
                  type="text"
                  value={formData[`tempat_lahir_${prefix}`]}
                  onChange={(e) => onFieldChange(`tempat_lahir_${prefix}`, e.target.value)}
                  onFocus={() => onFocus(`tempat_lahir_${prefix}`)}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex-1">
                <label className={getLabelClassName(`tanggal_lahir_${prefix}`)}>
                  Tanggal Lahir
                </label>
                <input
                  type="date"
                  value={formData[`tanggal_lahir_${prefix}`]}
                  onChange={(e) => onFieldChange(`tanggal_lahir_${prefix}`, e.target.value)}
                  onFocus={() => onFocus(`tanggal_lahir_${prefix}`)}
                  onBlur={onBlur}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pendidikan - Hanya tampil jika status "Masih Hidup" */}
      <AnimatePresence>
        {isAlive && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
            <label className={getLabelClassName(`pendidikan_${prefix}`)}>
              Pendidikan
            </label>
            <input
              type="text"
              value={formData[`pendidikan_${prefix}`]}
              onChange={(e) => onFieldChange(`pendidikan_${prefix}`, e.target.value)}
              onFocus={() => onFocus(`pendidikan_${prefix}`)}
              onBlur={onBlur}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              placeholder="Contoh: SMA, S1, dll"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pekerjaan - Hanya tampil jika status "Masih Hidup" */}
      <AnimatePresence>
        {isAlive && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
            <label className={getLabelClassName(`pekerjaan_${prefix}`)}>
              Pekerjaan
            </label>
            <input
              type="text"
              value={formData[`pekerjaan_${prefix}`]}
              onChange={(e) => onFieldChange(`pekerjaan_${prefix}`, e.target.value)}
              onFocus={() => onFocus(`pekerjaan_${prefix}`)}
              onBlur={onBlur}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Penghasilan - Hanya tampil jika status "Masih Hidup" */}
      <AnimatePresence>
        {isAlive && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
            <label className={getLabelClassName(`penghasilan_${prefix}`)}>
              Penghasilan
            </label>
            <select
              value={formData[`penghasilan_${prefix}`]}
              onChange={(e) => onFieldChange(`penghasilan_${prefix}`, e.target.value)}
              onFocus={() => onFocus(`penghasilan_${prefix}`)}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default BiodataOrangTuaSection

