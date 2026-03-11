/**
 * Informasi Tambahan Section Component
 * Menampilkan form untuk informasi tambahan dengan WhatsApp checking
 * 
 * @param {object} props
 * @param {object} props.sectionRef - Ref untuk section
 * @param {object} props.formData - Data form
 * @param {function} props.onFieldChange - Function untuk handle perubahan field
 * @param {string} props.focusedField - Field yang sedang focused
 * @param {function} props.onFocus - Function untuk handle focus
 * @param {function} props.onBlur - Function untuk handle blur
 * @param {function} props.getLabelClassName - Function untuk mendapatkan className label
 * @param {object} props.waCheck - Object dari useWhatsAppCheck hook
 * @param {function} [props.onOpenRiwayatChat] - Callback (nomor) => void untuk buka offcanvas riwayat chat
 */
function InformasiTambahanSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  waCheck,
  onOpenRiwayatChat
}) {
  const {
    isCheckingTelpon,
    waStatusTelpon,
    isCheckingWaSantri,
    waStatusWaSantri,
    checkTelponTimeoutRef,
    checkWaSantriTimeoutRef,
    countDigits,
    checkPhoneNumberTelpon,
    checkPhoneNumberWaSantri,
    setWaStatusTelpon,
    setWaStatusWaSantri
  } = waCheck

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Informasi Tambahan
      </h3>

      {/* Email (wajib) */}
      <div className="mb-4">
        <label className={getLabelClassName('email')}>
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={formData.email ?? ''}
          onChange={(e) => onFieldChange('email', e.target.value)}
          onFocus={() => onFocus('email')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="contoh@email.com"
        />
      </div>

      {/* No Telpon (Nomor Wali) */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('no_telpon')}>
            No. Telpon (Nomor Wali)
          </label>
          <button
            type="button"
            onClick={() => checkPhoneNumberTelpon(null, formData)}
            disabled={isCheckingTelpon}
            className="px-1 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] rounded transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Cek nomor WhatsApp"
          >
            {isCheckingTelpon ? (
              <span className="animate-spin text-[10px]">⏳</span>
            ) : (
              <>
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span className="text-[10px]">Cek</span>
              </>
            )}
          </button>
          {waStatusTelpon && (
            <span className={`text-xs px-2 py-1 rounded ${
              waStatusTelpon === 'checking' 
                ? 'bg-yellow-100 text-yellow-800' 
                : waStatusTelpon === 'registered'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {waStatusTelpon === 'checking' && 'Sedang mengecek...'}
              {waStatusTelpon === 'registered' && '✓'}
              {waStatusTelpon === 'not_registered' && '✗'}
            </span>
          )}
          {onOpenRiwayatChat && (formData.no_telpon || '').trim() && (
            <button
              type="button"
              onClick={() => onOpenRiwayatChat((formData.no_telpon || '').trim())}
              className="px-2 py-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors border border-teal-200 dark:border-teal-700"
            >
              Riwayat
            </button>
          )}
        </div>
        <input
          type="text"
          value={formData.no_telpon}
          onChange={(e) => {
            const newValue = e.target.value.replace(/\D/g, '').slice(0, 15)
            onFieldChange('no_telpon', newValue)
            // Reset status saat nomor berubah
            setWaStatusTelpon(null)
            
            // Cancel timeout sebelumnya jika ada
            if (checkTelponTimeoutRef.current) {
              clearTimeout(checkTelponTimeoutRef.current)
            }
            
            // Cek otomatis jika digit >= 11
            const digitCount = countDigits(newValue)
            if (digitCount >= 11 && !isCheckingTelpon) {
              // Delay 1 detik untuk memberi waktu user mengetik angka selanjutnya
              checkTelponTimeoutRef.current = setTimeout(() => {
                checkPhoneNumberTelpon(newValue, formData)
                checkTelponTimeoutRef.current = null
              }, 1000)
            }
          }}
          onFocus={() => onFocus('no_telpon')}
          onBlur={onBlur}
          inputMode="numeric"
          maxLength={15}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Nomor telepon wali"
        />
      </div>

      {/* No WA Santri */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('no_wa_santri')}>
            No. WA Santri
          </label>
          <button
            type="button"
            onClick={() => checkPhoneNumberWaSantri(null, formData)}
            disabled={isCheckingWaSantri}
            className="px-1 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] rounded transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Cek nomor WhatsApp"
          >
            {isCheckingWaSantri ? (
              <span className="animate-spin text-[10px]">⏳</span>
            ) : (
              <>
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span className="text-[10px]">Cek</span>
              </>
            )}
          </button>
          {waStatusWaSantri && (
            <span className={`text-xs px-2 py-1 rounded ${
              waStatusWaSantri === 'checking' 
                ? 'bg-yellow-100 text-yellow-800' 
                : waStatusWaSantri === 'registered'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {waStatusWaSantri === 'checking' && 'Sedang mengecek...'}
              {waStatusWaSantri === 'registered' && '✓'}
              {waStatusWaSantri === 'not_registered' && '✗'}
            </span>
          )}
          {onOpenRiwayatChat && (formData.no_wa_santri || '').trim() && (
            <button
              type="button"
              onClick={() => onOpenRiwayatChat((formData.no_wa_santri || '').trim())}
              className="px-2 py-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors border border-teal-200 dark:border-teal-700"
            >
              Riwayat
            </button>
          )}
        </div>
        <input
          type="text"
          value={formData.no_wa_santri}
          onChange={(e) => {
            const newValue = e.target.value.replace(/\D/g, '').slice(0, 15)
            onFieldChange('no_wa_santri', newValue)
            // Reset status saat nomor berubah
            setWaStatusWaSantri(null)
            
            // Cancel timeout sebelumnya jika ada
            if (checkWaSantriTimeoutRef.current) {
              clearTimeout(checkWaSantriTimeoutRef.current)
            }
            
            // Cek otomatis jika digit >= 11
            const digitCount = countDigits(newValue)
            if (digitCount >= 11 && !isCheckingWaSantri) {
              // Delay 1 detik untuk memberi waktu user mengetik angka selanjutnya
              checkWaSantriTimeoutRef.current = setTimeout(() => {
                checkPhoneNumberWaSantri(newValue, formData)
                checkWaSantriTimeoutRef.current = null
              }, 1000)
            }
          }}
          onFocus={() => onFocus('no_wa_santri')}
          onBlur={onBlur}
          inputMode="numeric"
          maxLength={15}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Nomor WhatsApp santri"
        />
      </div>

      {/* Status Nikah */}
      <div className="mb-4">
        <label className={getLabelClassName('status_nikah')}>
          Status Nikah
        </label>
        <select
          value={formData.status_nikah}
          onChange={(e) => onFieldChange('status_nikah', e.target.value)}
          onFocus={() => onFocus('status_nikah')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Status Nikah</option>
          <option value="Belum Menikah">Belum Menikah</option>
          <option value="Menikah">Menikah</option>
          <option value="Cerai Hidup">Cerai Hidup</option>
          <option value="Cerai Mati">Cerai Mati</option>
        </select>
      </div>

      {/* Pekerjaan */}
      <div className="mb-4">
        <label className={getLabelClassName('pekerjaan')}>
          Pekerjaan
        </label>
        <input
          type="text"
          value={formData.pekerjaan}
          onChange={(e) => onFieldChange('pekerjaan', e.target.value)}
          onFocus={() => onFocus('pekerjaan')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Pekerjaan santri"
        />
      </div>

      {/* Riwayat Sakit */}
      <div className="mb-4">
        <label className={getLabelClassName('riwayat_sakit')}>
          Riwayat Sakit
        </label>
        <textarea
          value={formData.riwayat_sakit}
          onChange={(e) => onFieldChange('riwayat_sakit', e.target.value)}
          onFocus={() => onFocus('riwayat_sakit')}
          onBlur={onBlur}
          rows="3"
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Jelaskan riwayat sakit jika ada, kosongkan jika tidak ada"
        />
      </div>

      {/* Ukuran Baju */}
      <div className="mb-4">
        <label className={getLabelClassName('ukuran_baju')}>
          Ukuran Baju
        </label>
        <select
          value={formData.ukuran_baju}
          onChange={(e) => onFieldChange('ukuran_baju', e.target.value)}
          onFocus={() => onFocus('ukuran_baju')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
        >
          <option value="">Pilih Ukuran Baju</option>
          <option value="XS">XS</option>
          <option value="S">S</option>
          <option value="M">M</option>
          <option value="L">L</option>
          <option value="XL">XL</option>
          <option value="XXL">XXL</option>
          <option value="XXXL">XXXL</option>
        </select>
      </div>

      {/* KIP */}
      <div className="mb-4">
        <label className={getLabelClassName('kip')}>
          KIP
        </label>
        <input
          type="text"
          value={formData.kip}
          onChange={(e) => onFieldChange('kip', e.target.value)}
          onFocus={() => onFocus('kip')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Kartu Indonesia Pintar"
        />
      </div>

      {/* PKH */}
      <div className="mb-4">
        <label className={getLabelClassName('pkh')}>
          PKH
        </label>
        <input
          type="text"
          value={formData.pkh}
          onChange={(e) => onFieldChange('pkh', e.target.value)}
          onFocus={() => onFocus('pkh')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Program Keluarga Harapan"
        />
      </div>

      {/* KKS */}
      <div className="mb-4">
        <label className={getLabelClassName('kks')}>
          KKS
        </label>
        <input
          type="text"
          value={formData.kks}
          onChange={(e) => onFieldChange('kks', e.target.value)}
          onFocus={() => onFocus('kks')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Kartu Keluarga Sejahtera"
        />
      </div>
    </div>
  )
}

export default InformasiTambahanSection

