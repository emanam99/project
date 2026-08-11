/**
 * Blok bersama: Kategori + (jika Mukim) Daerah/Kamar lewat id_daerah & id_kamar.
 * Dipakai StatusPendaftaranSection dan KategoriPendidikanSection.
 */
import { motion, AnimatePresence } from 'framer-motion'

export default function KategoriDomisiliFields({
  formData,
  onFieldChange,
  onFocus,
  onBlur,
  getLabelClassName,
  kategoriSelectOptions = [],
  daerahOptions = [],
  kamarOptions = []
}) {
  return (
    <>
      <div className="mb-4">
        <label className={getLabelClassName('kategori')}>
          Kategori
        </label>
        <select
          value={formData.kategori || ''}
          onChange={(e) => onFieldChange('kategori', e.target.value)}
          onFocus={() => onFocus('kategori')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">
            {formData.status_santri ? 'Pilih Kategori' : 'Pilih Status Santri terlebih dahulu'}
          </option>
          {kategoriSelectOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

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
                <label className={getLabelClassName('id_daerah')}>
                  Daerah
                </label>
                <select
                  value={formData.id_daerah ?? ''}
                  onChange={(e) => onFieldChange('id_daerah', e.target.value)}
                  onFocus={() => onFocus('id_daerah')}
                  onBlur={onBlur}
                  disabled={!formData.kategori}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 disabled:opacity-60"
                >
                  <option value="">
                    {formData.kategori ? 'Pilih Daerah' : 'Pilih kategori terlebih dahulu'}
                  </option>
                  {daerahOptions.map((d) => (
                    <option key={d.id} value={String(d.id)}>{d.daerah}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className={getLabelClassName('id_kamar')}>
                  Kamar
                </label>
                <select
                  value={formData.id_kamar ?? ''}
                  onChange={(e) => onFieldChange('id_kamar', e.target.value)}
                  onFocus={() => onFocus('id_kamar')}
                  onBlur={onBlur}
                  disabled={!formData.id_daerah}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 disabled:opacity-60"
                >
                  <option value="">Pilih Kamar</option>
                  {kamarOptions.map((k) => (
                    <option key={k.id} value={String(k.id)}>{k.kamar}</option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
