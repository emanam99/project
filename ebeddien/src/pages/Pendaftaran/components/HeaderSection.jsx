/**
 * Header Section Component
 * Menampilkan NIS input, tombol simpan, cari, hapus, dan tambah santri baru
 * 
 * @param {object} props
 * @param {boolean} props.isSidebarOpen - Status sidebar terbuka/tutup
 * @param {function} props.setIsSidebarOpen - Function untuk toggle sidebar
 * @param {string} props.localId - NIS santri yang sedang ditampilkan
 * @param {function} props.onIdChange - Function untuk handle perubahan NIS
 * @param {function} props.onSave - Function untuk handle save
 * @param {boolean} props.isSaving - Status sedang menyimpan
 * @param {boolean} props.isLoading - Status sedang loading
 * @param {string} props.formDataId - NIS dari formData
 * @param {boolean} props.hasChanges - Status ada perubahan data
 * @param {function} props.onOpenSearch - Function untuk membuka search modal
 * @param {function} props.onOpenNewModal - Function untuk membuka modal tambah santri baru
 * @param {function} props.onOpenDeleteModal - Function untuk membuka modal hapus registrasi
 * @param {boolean} props.showDeleteButton - Apakah tombol hapus ditampilkan (berdasarkan role)
 */
function HeaderSection({
  isSidebarOpen,
  setIsSidebarOpen,
  localId,
  onIdChange,
  onSave,
  isSaving,
  isLoading,
  formDataId,
  hasChanges,
  onOpenSearch,
  onOpenNewModal,
  onOpenDeleteModal,
  showDeleteButton = false
}) {
  const formDataIdStr = String(formDataId ?? '').trim()
  const formDataIdValid = /^\d{7}$/.test(formDataIdStr)
  return (
    <div className={`flex-shrink-0 bg-gray-200 dark:bg-gray-700/50 p-2 border-b-2 border-gray-300 dark:border-gray-600 transition-all duration-300 ${
      isSidebarOpen ? 'ml-12' : 'ml-0'
    }`}>
      {/* NIS Input, Tombol Simpan, dan Tombol Cari */}
      <div className="flex gap-1.5 items-center justify-between">
        <div className="flex gap-1.5 items-center">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
            title={isSidebarOpen ? 'Sembunyikan Menu' : 'Tampilkan Menu'}
          >
            <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isSidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>
              )}
            </svg>
          </button>
          <label className="text-teal-600 dark:text-teal-400 font-semibold whitespace-nowrap text-sm">
            NIS
          </label>
          <input
            type="text"
            value={localId}
            onChange={(e) => onIdChange(e.target.value)}
            className="w-20 min-w-[4.5rem] max-w-[5rem] p-1.5 text-sm border-2 border-teal-500 dark:border-teal-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 bg-transparent text-gray-900 dark:text-gray-100 text-center"
            placeholder="NIS (7 digit)"
            maxLength={7}
            inputMode="numeric"
          />
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || isLoading || !formDataIdValid || !hasChanges}
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 border-2 ${
              isSaving || isLoading || !formDataIdValid || !hasChanges
                ? 'bg-gray-300 dark:bg-gray-600 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 border-teal-600 dark:border-teal-500 text-white'
            }`}
            title={
              isSaving ? 'Menyimpan...' 
              : !formDataIdValid ? 'NIS harus 7 digit' 
              : hasChanges ? 'Simpan' 
              : 'Data tersimpan'
            }
          >
            {isSaving ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : !formDataIdValid ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            ) : hasChanges ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (onOpenSearch) {
                onOpenSearch()
              }
            }}
            className="bg-teal-500 text-white p-1.5 rounded-lg hover:bg-teal-600 transition-colors flex-shrink-0 border-2 border-teal-500 dark:border-teal-400"
            title="Cari Santri"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </button>
        </div>
        <div className="flex gap-1.5 items-center">
          {/^\d{7}$/.test(localId) && showDeleteButton && (
            <button
              type="button"
              onClick={onOpenDeleteModal}
              className="bg-red-500 text-white p-1.5 rounded-lg hover:bg-red-600 transition-colors flex-shrink-0 border-2 border-red-500 dark:border-red-400"
              title="Hapus Data Santri"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenNewModal}
            className="bg-green-500 text-white p-1.5 rounded-lg hover:bg-green-600 transition-colors flex-shrink-0 border-2 border-green-500 dark:border-green-400"
            title="Tambah Santri Baru"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default HeaderSection

