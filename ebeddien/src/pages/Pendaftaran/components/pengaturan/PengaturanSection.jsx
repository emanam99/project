import { forwardRef } from 'react'

/**
 * Komponen Section untuk Pengaturan
 * Menampilkan form fields untuk kategori tertentu
 */
const PengaturanSection = forwardRef(function PengaturanSection({ 
  kategori,
  settings,
  formData,
  focusedField,
  onFieldChange,
  onFocus,
  onBlur,
  getLabelClassName,
  onImageUpload,
  uploading,
  getApiBaseUrl,
  hideTitle = false,
  tahunAjaranHijriyahOptions = [],
  tahunAjaranMasehiOptions = []
}, ref) {
  return (
    <div ref={ref} className="space-y-4">
      {/* Section Title - disembunyikan jika hideTitle */}
      {!hideTitle && (
        <div className="flex items-center gap-3">
          <div className="h-1 w-10 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"></div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
            {kategori}
          </h2>
        </div>
      )}

      {/* Settings Fields */}
      <div className="space-y-4">
        {settings.map((setting) => (
          <div key={setting.id} className="mb-4">
            <label className={getLabelClassName(setting.key)}>
              {setting.label}
            </label>

            {setting.type === 'image' ? (
              <div className="space-y-3">
                {/* Preview gambar saat ini */}
                {formData[setting.key] && (
                  <div className="relative inline-block">
                    <img
                      src={`${getApiBaseUrl()}/pengaturan/image/${setting.key}`}
                      alt={setting.label}
                      className="max-w-xs max-h-48 rounded-lg border-2 border-gray-200 dark:border-gray-700"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  </div>
                )}

                {/* Upload input */}
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        onImageUpload(setting.key, file)
                      }
                    }}
                    disabled={uploading[setting.key]}
                    className="flex-1 text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 dark:file:bg-teal-900/20 dark:file:text-teal-300"
                  />
                  {uploading[setting.key] && (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-teal-600"></div>
                    </div>
                  )}
                </div>
              </div>
            ) : setting.key === 'tahun_hijriyah' && tahunAjaranHijriyahOptions?.length > 0 ? (
              <select
                value={formData[setting.key] || ''}
                onChange={(e) => onFieldChange(setting.key, e.target.value)}
                onFocus={() => onFocus(setting.key)}
                onBlur={onBlur}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              >
                <option value="">-- Pilih Tahun Ajaran Hijriyah --</option>
                {tahunAjaranHijriyahOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : setting.key === 'tahun_masehi' && tahunAjaranMasehiOptions?.length > 0 ? (
              <select
                value={formData[setting.key] || ''}
                onChange={(e) => onFieldChange(setting.key, e.target.value)}
                onFocus={() => onFocus(setting.key)}
                onBlur={onBlur}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              >
                <option value="">-- Pilih Tahun Ajaran Masehi --</option>
                {tahunAjaranMasehiOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={setting.type === 'number' ? 'number' : setting.type === 'date' ? 'date' : 'text'}
                value={formData[setting.key] || ''}
                onChange={(e) => onFieldChange(setting.key, e.target.value)}
                onFocus={() => onFocus(setting.key)}
                onBlur={onBlur}
                placeholder={setting.type === 'date' ? 'Pilih tanggal' : `Masukkan ${setting.label.toLowerCase()}`}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

export default PengaturanSection
