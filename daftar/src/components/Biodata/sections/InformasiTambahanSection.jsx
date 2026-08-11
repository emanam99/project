import { useState } from 'react'
import InfoModal from '../InfoModal'

function normalizeNomor(v) {
  if (!v) return ''
  const digits = String(v).replace(/\D/g, '')
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  if (!digits.startsWith('62')) return '62' + digits
  return digits
}

/**
 * Informasi Tambahan Section Component
 * Dengan pengecekan WhatsApp untuk No. Telpon (Wali) dan No. WA Santri.
 * Aktifkan notifikasi WA dilakukan dari Dashboard setelah simpan.
 */
function InformasiTambahanSection({
  sectionRef,
  formData,
  onFieldChange,
  focusedField,
  onFocus,
  onBlur,
  getLabelClassName,
  waCheck
}) {
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [infoModalType, setInfoModalType] = useState(null)

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
  } = waCheck || {}

  const handleInfoClick = (fieldType) => {
    setInfoModalType(fieldType)
    setShowInfoModal(true)
  }

  return (
    <div ref={sectionRef} className="mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400">
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Informasi Tambahan
      </h3>

      {/* No Telpon (Nomor Wali) */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <label className={getLabelClassName('no_telpon')}>
            No. Telpon (Nomor Wali) <span className="text-red-500">*</span>
          </label>
          {waCheck && (
            <>
              <button
                type="button"
                onClick={() => checkPhoneNumberTelpon(null, formData)}
                disabled={isCheckingTelpon}
                className="px-1.5 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] rounded transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Cek nomor WhatsApp"
              >
                {isCheckingTelpon ? (
                  <span className="animate-spin text-[10px]">⏳</span>
                ) : (
                  <>
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                    <span className="text-[10px]">Cek WA</span>
                  </>
                )}
              </button>
              {waStatusTelpon && (
                <span className={`text-xs px-2 py-1 rounded ${
                  waStatusTelpon === 'checking'
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                    : waStatusTelpon === 'registered'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                }`}>
                  {waStatusTelpon === 'checking' && 'Sedang mengecek...'}
                  {waStatusTelpon === 'registered' && '✓ Terdaftar WA'}
                  {waStatusTelpon === 'not_registered' && '✗ Tidak terdaftar WA'}
                </span>
              )}
            </>
          )}
        </div>
        <input
          type="text"
          value={formData.no_telpon}
          onChange={(e) => {
            const newValue = e.target.value.replace(/\D/g, '').slice(0, 15)
            onFieldChange('no_telpon', newValue)
            if (waCheck) {
              setWaStatusTelpon(null)
              if (checkTelponTimeoutRef?.current) clearTimeout(checkTelponTimeoutRef.current)
              const digitCount = countDigits(newValue)
              if (digitCount >= 11 && !isCheckingTelpon) {
                checkTelponTimeoutRef.current = setTimeout(() => {
                  checkPhoneNumberTelpon(newValue, formData)
                  checkTelponTimeoutRef.current = null
                }, 1000)
              }
            }
          }}
          onFocus={() => onFocus('no_telpon')}
          onBlur={onBlur}
          required
          inputMode="numeric"
          maxLength={15}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Nomor telepon wali (wajib untuk pembayaran iPayMu)"
        />
      </div>

      {/* No WA Santri */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <label className={getLabelClassName('no_wa_santri')}>
            No. WA Santri
          </label>
          {waCheck && (
            <>
              <button
                type="button"
                onClick={() => checkPhoneNumberWaSantri(null, formData)}
                disabled={isCheckingWaSantri}
                className="px-1.5 py-0.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] rounded transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Cek nomor WhatsApp"
              >
                {isCheckingWaSantri ? (
                  <span className="animate-spin text-[10px]">⏳</span>
                ) : (
                  <>
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                    <span className="text-[10px]">Cek WA</span>
                  </>
                )}
              </button>
              {waStatusWaSantri && (
                <span className={`text-xs px-2 py-1 rounded ${
                  waStatusWaSantri === 'checking'
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                    : waStatusWaSantri === 'registered'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                }`}>
                  {waStatusWaSantri === 'checking' && 'Sedang mengecek...'}
                  {waStatusWaSantri === 'registered' && '✓ Terdaftar WA'}
                  {waStatusWaSantri === 'not_registered' && '✗ Tidak terdaftar WA'}
                </span>
              )}
            </>
          )}
        </div>
        <input
          type="text"
          value={formData.no_wa_santri}
          onChange={(e) => {
            const newValue = e.target.value.replace(/\D/g, '').slice(0, 15)
            onFieldChange('no_wa_santri', newValue)
            if (waCheck) {
              setWaStatusWaSantri(null)
              if (checkWaSantriTimeoutRef?.current) clearTimeout(checkWaSantriTimeoutRef.current)
              const digitCount = countDigits(newValue)
              if (digitCount >= 11 && !isCheckingWaSantri) {
                checkWaSantriTimeoutRef.current = setTimeout(() => {
                  checkPhoneNumberWaSantri(newValue, formData)
                  checkWaSantriTimeoutRef.current = null
                }, 1000)
              }
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

      {/* Email */}
      <div className="mb-4">
        <label className={getLabelClassName('email')}>
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => onFieldChange('email', e.target.value)}
          onFocus={() => onFocus('email')}
          onBlur={onBlur}
          required
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="contoh@email.com"
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
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('kip')}>
            KIP
          </label>
          <button
            type="button"
            onClick={() => handleInfoClick('kip')}
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
        <div className="flex items-center gap-2 mb-1">
          <label className={getLabelClassName('kks')}>
            KKS
          </label>
          <button
            type="button"
            onClick={() => handleInfoClick('kks')}
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
          value={formData.kks}
          onChange={(e) => onFieldChange('kks', e.target.value)}
          onFocus={() => onFocus('kks')}
          onBlur={onBlur}
          className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
          placeholder="Kartu Keluarga Sejahtera"
        />
      </div>

      {/* Info Modal Dinamis */}
      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        fieldType={infoModalType}
      />
    </div>
  )
}

export default InformasiTambahanSection
