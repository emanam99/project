import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import InfoModal from '../InfoModal'

/**
 * Riwayat Pendidikan Section Component (Reusable untuk Madrasah dan Sekolah)
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
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [infoModalType, setInfoModalType] = useState(null)
  
  const handleInfoClick = (fieldType) => {
    setInfoModalType(fieldType)
    setShowInfoModal(true)
  }

  const handleMadrasahChange = (value) => {
    onFieldChange('madrasah', value)
    // Jika "Tidak" dipilih, reset field terkait
    if (value === 'Tidak') {
      onFieldChange('nama_madrasah', '')
      onFieldChange('alamat_madrasah', '')
      onFieldChange('lulus_madrasah', '')
    }
  }

  const handleSekolahChange = (value) => {
    onFieldChange('sekolah', value)
    // Jika "Tidak Pernah Sekolah" dipilih, reset field terkait
    if (value === 'Tidak Pernah Sekolah') {
      onFieldChange('nama_sekolah', '')
      onFieldChange('alamat_sekolah', '')
      onFieldChange('lulus_sekolah', '')
      onFieldChange('npsn', '')
      onFieldChange('nsm', '')
      onFieldChange('jurusan', '')
      onFieldChange('program_sekolah', '')
    }
  }

  // Cek apakah sekolah dipilih dan bukan "Tidak Pernah Sekolah"
  const showSekolahFields = isSekolah && formData.sekolah && formData.sekolah !== 'Tidak Pernah Sekolah'

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        {title}
      </h3>

      {/* Jenis (Madrasah untuk madrasah, Sekolah untuk sekolah) */}
      <div className="mb-4">
        <label className={getLabelClassName(prefix)}>
          {isSekolah ? 'Pendidikan Formal Terakhir?' : 'Pernah Sekolah Madrasah'}
        </label>
        {isSekolah ? (
          <select
            value={formData.sekolah}
            onChange={(e) => onFieldChange('sekolah', e.target.value)}
            onFocus={() => onFocus('sekolah')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          >
            <option value="">Pilih Pendidikan Formal</option>
            <option value="Tidak Pernah Sekolah">Tidak Pernah Sekolah</option>
            <option value="Paud">Paud</option>
            <option value="TK">TK</option>
            <option value="SD">SD</option>
            <option value="MI">MI</option>
            <option value="SMP">SMP</option>
            <option value="MTs">MTs</option>
            <option value="SMA">SMA</option>
            <option value="SMK">SMK</option>
            <option value="MA">MA</option>
            <option value="Paket A">Paket A</option>
            <option value="Paket B">Paket B</option>
            <option value="Paket C">Paket C</option>
            <option value="D1">D1</option>
            <option value="D2">D2</option>
            <option value="D3">D3</option>
            <option value="D4">D4</option>
            <option value="S1">S1</option>
            <option value="S2">S2</option>
            <option value="S3">S3</option>
          </select>
        ) : (
          <select
            value={formData.madrasah}
            onChange={(e) => handleMadrasahChange(e.target.value)}
            onFocus={() => onFocus('madrasah')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          >
            <option value="">Pilih</option>
            <option value="Iya">Iya</option>
            <option value="Tidak">Tidak</option>
          </select>
        )}
      </div>

      {/* Nama - Hanya tampil jika madrasah = "Iya" atau jika sekolah (bukan "Tidak Pernah Sekolah") */}
      <AnimatePresence>
        {((!isSekolah && formData.madrasah === 'Iya') || showSekolahFields) && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alamat - Hanya tampil jika madrasah = "Iya" atau jika sekolah (bukan "Tidak Pernah Sekolah") */}
      <AnimatePresence>
        {((!isSekolah && formData.madrasah === 'Iya') || showSekolahFields) && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tahun Lulus - Hanya tampil jika madrasah = "Iya" atau jika sekolah (bukan "Tidak Pernah Sekolah") */}
      <AnimatePresence>
        {((!isSekolah && formData.madrasah === 'Iya') || showSekolahFields) && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="mb-4 overflow-hidden"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* NPSN & NSM (hanya untuk Sekolah, bukan "Tidak Pernah Sekolah") */}
      <AnimatePresence>
        {showSekolahFields && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: '1rem' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <label className={getLabelClassName('npsn')}>
                  NPSN
                </label>
                <button
                  type="button"
                  onClick={() => handleInfoClick('npsn')}
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors rounded text-[10px] font-bold tracking-wider uppercase border border-amber-100 dark:border-amber-800"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Info</span>
                </button>
              </div>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Modal Dinamis */}
      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        fieldType={infoModalType}
      />
    </div>
  )
}

export default RiwayatPendidikanSection
