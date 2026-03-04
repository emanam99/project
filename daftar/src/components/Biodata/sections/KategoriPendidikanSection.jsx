/**
 * Kategori & Pendidikan Section Component
 */
import { motion, AnimatePresence } from 'framer-motion'

function KategoriPendidikanSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  getKategoriOptions
}) {
  const handleStatusSantriChange = (status) => {
    onFieldChange('status_santri', status)
    // Reset kategori jika status berubah
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

      {/* Status Santri */}
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

      {/* Kategori */}
      <div className="mb-4">
        <label className={getLabelClassName('kategori')}>
          Kategori
        </label>
        <select
          value={formData.kategori}
          onChange={(e) => onFieldChange('kategori', e.target.value)}
          onFocus={() => onFocus('kategori')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Kategori</option>
          {getKategoriOptions(formData.status_santri).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

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
                  value={formData.daerah}
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
                  value={formData.kamar}
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

export default KategoriPendidikanSection
