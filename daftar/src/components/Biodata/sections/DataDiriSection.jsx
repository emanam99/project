import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import InfoModal from '../InfoModal'

/**
 * Data Diri Section Component
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
  const [showNisnInfoModal, setShowNisnInfoModal] = useState(false)
  const [showNisnWebsite, setShowNisnWebsite] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [infoModalType, setInfoModalType] = useState(null)
  
  const handleInfoClick = (fieldType) => {
    setInfoModalType(fieldType)
    setShowInfoModal(true)
  }
  return (
    <div ref={sectionRef}>
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Data Santri
      </h3>

      {/* Nama */}
      <div className="mb-4">
        <label className={getLabelClassName('nama')}>
          Nama <span className="text-red-500">*</span>
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
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('nik')}>
            NIK <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => handleInfoClick('nik')}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors rounded text-[10px] font-bold tracking-wider uppercase border border-amber-100 dark:border-amber-800 shrink-0"
            title="Info NIK"
          >
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="whitespace-nowrap">Info</span>
          </button>
        </div>
        <input
          type="text"
          value={formData.nik}
          onChange={(e) => {
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
          Gender <span className="text-red-500">*</span>
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
            Tempat Lahir <span className="text-red-500">*</span>
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
            Tanggal Lahir <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.tanggal_lahir}
            onChange={(e) => onFieldChange('tanggal_lahir', e.target.value)}
            onFocus={() => onFocus('tanggal_lahir')}
            onBlur={onBlur}
            className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
      </div>

      {/* NISN */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('nisn')}>
            NISN
          </label>
          <button
            type="button"
            onClick={() => setShowNisnInfoModal(true)}
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
          value={formData.nisn}
          onChange={(e) => {
            const numericValue = e.target.value.replace(/\D/g, '').slice(0, 10)
            onFieldChange('nisn', numericValue)
          }}
          onFocus={() => onFocus('nisn')}
          onBlur={onBlur}
          maxLength={10}
          inputMode="numeric"
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="10 digit NISN"
        />
      </div>

      {/* No KK */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('no_kk')}>
            No. KK <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => handleInfoClick('no_kk')}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors rounded text-[10px] font-bold tracking-wider uppercase border border-amber-100 dark:border-amber-800 shrink-0"
            title="Info No. KK"
          >
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="whitespace-nowrap">Info</span>
          </button>
        </div>
        <input
          type="text"
          value={formData.no_kk}
          onChange={(e) => {
            const numericValue = e.target.value.replace(/\D/g, '').slice(0, 16)
            onFieldChange('no_kk', numericValue)
          }}
          onFocus={() => onFocus('no_kk')}
          onBlur={onBlur}
          maxLength={16}
          inputMode="numeric"
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="16 digit Nomor Kartu Keluarga"
        />
      </div>

      {/* Kepala Keluarga */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('kepala_keluarga')}>
            Kepala Keluarga <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => handleInfoClick('kepala_keluarga')}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors rounded text-[10px] font-bold tracking-wider uppercase border border-amber-100 dark:border-amber-800 shrink-0"
            title="Info Kepala Keluarga"
          >
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="whitespace-nowrap">Info</span>
          </button>
        </div>
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
          Saudara di Pesantren <span className="text-red-500">*</span>
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

      {/* NISN Info Modal */}
      <AnimatePresence>
        {showNisnInfoModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNisnInfoModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col my-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  {showNisnWebsite && (
                    <button
                      onClick={() => setShowNisnWebsite(false)}
                      className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Kembali"
                    >
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </button>
                  )}
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                    {showNisnWebsite ? 'Website NISN Kemdikbud' : 'Informasi NISN'}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowNisnInfoModal(false)
                    setShowNisnWebsite(false)
                  }}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body - Scrollable */}
              <div className="p-4 overflow-y-auto flex-1">
                {showNisnWebsite ? (
                  /* Iframe Website NISN */
                  <div className="w-full h-full min-h-[500px]">
                    <iframe
                      src="https://nisn.data.kemdikbud.go.id/index.php/Cindex/formcaribynama/"
                      className="w-full h-full min-h-[500px] border-0 rounded-lg"
                      title="Website NISN Kemdikbud"
                      allow="fullscreen"
                    />
                  </div>
                ) : (
                  /* Konten Info NISN */
                  <>
                    <img
                      src="/images/info/nisn.jpg"
                      alt="Info NISN"
                      className="w-full h-auto rounded-lg shadow-sm"
                      onError={(e) => {
                        // Fallback jika gambar tidak ada
                        e.target.style.display = 'none'
                      }}
                    />
                    <div className="mt-4 space-y-2">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        <b>NISN (Nomor Induk Siswa Nasional)</b> adalah kode pengenal identitas siswa yang bersifat unik, standar dan berlaku sepanjang masa.
                      </p>
                      <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3 mt-3">
                        <p className="text-xs font-semibold text-teal-800 dark:text-teal-200 mb-1">Contoh NISN:</p>
                        <p className="text-sm text-teal-700 dark:text-teal-300 font-mono">
                          0012345678
                        </p>
                        <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
                          NISN terdiri dari 10 digit angka yang dapat ditemukan di:
                        </p>
                        <ul className="text-xs text-teal-600 dark:text-teal-400 mt-1 list-disc list-inside space-y-1">
                          <li>Rapor atau Ijazah</li>
                          <li>Kartu NISN</li>
                          <li>
                            <button
                              onClick={() => setShowNisnWebsite(true)}
                              className="text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200 underline font-medium cursor-pointer"
                            >
                              Website NISN Kemdikbud
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              {!showNisnWebsite && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end flex-shrink-0">
                  <button
                    onClick={() => {
                      setShowNisnInfoModal(false)
                      setShowNisnWebsite(false)
                    }}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Mengerti
                  </button>
                </div>
              )}
            </motion.div>
          </div>
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

export default DataDiriSection
