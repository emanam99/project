import { formatFileSize, getFileTypeLabel } from '../utils/fileUtils'

/**
 * Berkas Section Component
 * Menampilkan daftar berkas yang sudah diupload
 * 
 * @param {object} props
 * @param {object} props.sectionRef - Ref untuk section
 * @param {string} props.localId - ID santri lokal
 * @param {array} props.berkasList - Daftar berkas
 * @param {boolean} props.loadingBerkas - Status loading berkas
 * @param {function} props.handlePreviewBerkas - Function untuk preview berkas
 * @param {function} props.handleDeleteClickBerkas - Function untuk handle klik hapus
 * @param {function} props.handleGantiClickBerkas - Function untuk handle klik ganti
 * @param {number|null} props.deletingId - ID berkas yang sedang dihapus
 * @param {function} props.setIsBerkasOffcanvasOpen - Function untuk membuka offcanvas
 * @param {function} props.setSelectedJenisBerkas - Function untuk set jenis berkas yang dipilih
 * @param {array} props.berkasNotAvailable - Array jenis berkas yang ditandai tidak ada
 * @param {function} props.toggleBerkasNotAvailable - Function untuk toggle status tidak ada
 * @param {array} props.kkSamaDenganSantri - Array jenis KK yang sama dengan KK Santri
 * @param {function} props.toggleKkSamaDenganSantri - Function untuk toggle "Sama dengan KK Santri"
 */
function BerkasSection({
  sectionRef,
  localId,
  berkasList,
  loadingBerkas,
  handlePreviewBerkas,
  handleDeleteClickBerkas,
  handleGantiClickBerkas,
  deletingId,
  setIsBerkasOffcanvasOpen,
  setSelectedJenisBerkas,
  berkasNotAvailable = [],
  toggleBerkasNotAvailable,
  kkSamaDenganSantri = [],
  toggleKkSamaDenganSantri,
  standalone = false // true = dipakai di tab/panel sendiri (tanpa margin/border besar)
}) {
  // Daftar semua jenis berkas yang tersedia (tanpa Bukti Pembayaran, karena akan dinamis)
  const jenisBerkasOptionsBase = [
    'Ijazah SD Sederajat',
    'Ijazah SMP Sederajat',
    'Ijazah SMA Sederajat',
    'SKL',
    'KTP Santri',
    'KTP Ayah',
    'KTP Ibu',
    'KTP Wali',
    'KK Santri',
    'KK Ayah',
    'KK Ibu',
    'KK Wali',
    'Akta Lahir',
    'KIP',
    'PKH',
    'KKS',
    'Kartu Bantuan Lain',
    'Surat Pindah',
    'Surat Perjanjian Kapdar',
    'Pakta Integritas'
  ]

  // Buat map untuk memudahkan pencarian berkas yang sudah ada
  const berkasMap = new Map()
  berkasList.forEach(berkas => {
    berkasMap.set(berkas.jenis_berkas, berkas)
  })

  // Sama seperti aplikasi daftar: hanya tampilkan berkas persyaratan (tanpa Bukti Pembayaran).
  // Upload bukti pembayaran hanya di offcanvas Pembayaran.
  const jenisBerkasOptions = jenisBerkasOptionsBase

  // Fungsi untuk mendapatkan warna badge berdasarkan tipe file
  const getFileTypeColor = (tipeFile, namaFile) => {
    if (!tipeFile && !namaFile) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
    
    const extension = namaFile?.split('.').pop()?.toLowerCase() || ''
    
    if (tipeFile?.startsWith('image/')) {
      if (extension === 'jpg' || extension === 'jpeg') {
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      } else if (extension === 'png') {
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      } else if (extension === 'gif') {
        return 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300'
      } else if (extension === 'webp') {
        return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300'
      }
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
    }
    
    if (tipeFile === 'application/pdf' || extension === 'pdf') {
      return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    }
    
    return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  }

  if (!localId || !/^\d{7}$/.test(String(localId).trim())) {
    return null
  }

  return (
    <div
      ref={sectionRef}
      className={standalone ? 'pt-2 scroll-mt-8' : 'mt-16 pt-8 border-t-4 border-teal-600 dark:border-teal-400 scroll-mt-8'}
    >
      <h3 className="text-lg font-semibold text-teal-600 dark:text-teal-400 mb-4">
        Berkas
      </h3>
      <div className="mb-4">
        <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200">
          Daftar Berkas
        </h4>
      </div>
      {loadingBerkas ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        </div>
      ) : (
        <div className="space-y-2">
          {jenisBerkasOptions.map((jenisBerkas) => {
            const existingBerkas = berkasMap.get(jenisBerkas)
            const isNotAvailable = berkasNotAvailable.includes(jenisBerkas)
            const isKkSamaDenganSantri = kkSamaDenganSantri.includes(jenisBerkas)
            const isKkType = ['KK Ayah', 'KK Ibu', 'KK Wali'].includes(jenisBerkas)
            const hasKkSantri = berkasMap.has('KK Santri')
            
            return (
              <div key={jenisBerkas}>
                <div
                  className={`p-3 rounded-lg flex items-center justify-between transition-all ${
                    isNotAvailable
                      ? 'bg-gray-100 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 opacity-50'
                      : existingBerkas 
                      ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600' 
                      : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                  }`}
                  onClick={existingBerkas && !isNotAvailable ? () => handlePreviewBerkas(existingBerkas) : undefined}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Checkbox untuk "Tidak Ada" */}
                      {toggleBerkasNotAvailable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleBerkasNotAvailable(jenisBerkas, existingBerkas)
                          }}
                          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isNotAvailable
                              ? 'bg-orange-500 border-orange-500'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500'
                          }`}
                          title={
                            isNotAvailable 
                              ? 'Klik untuk tandai sebagai tersedia' 
                              : existingBerkas
                              ? 'Klik untuk hapus berkas dan tandai tidak ada'
                              : 'Tandai sebagai tidak ada'
                          }
                        >
                          {isNotAvailable && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      )}

                      <p className={`text-sm font-medium ${
                        isNotAvailable
                          ? 'text-gray-400 dark:text-gray-600 line-through'
                          : existingBerkas 
                          ? 'text-gray-900 dark:text-gray-100' 
                          : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {jenisBerkas}
                      </p>

                      {isNotAvailable && (
                        <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded">
                          Tidak Ada
                        </span>
                      )}

                      {isKkSamaDenganSantri && !isNotAvailable && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded">
                          Sama dengan KK Santri
                        </span>
                      )}
                    </div>
                    
                    {/* Checkbox "Sama dengan KK Santri" untuk KK Ayah, Ibu, Wali */}
                    {isKkType && !isNotAvailable && hasKkSantri && toggleKkSamaDenganSantri && (
                      <div className="flex items-center gap-2 mt-2 ml-7">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isKkSamaDenganSantri}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleKkSamaDenganSantri(jenisBerkas)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            Sama dengan KK Santri
                          </span>
                        </label>
                      </div>
                    )}
                    {!isNotAvailable && existingBerkas ? (
                      <div className="flex items-center gap-2 flex-wrap mt-1 ml-7">
                        {existingBerkas.tipe_file && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getFileTypeColor(existingBerkas.tipe_file, existingBerkas.nama_file)}`}>
                            {getFileTypeLabel(existingBerkas.tipe_file, existingBerkas.nama_file)}
                          </span>
                        )}
                        {existingBerkas.ukuran_file && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatFileSize(existingBerkas.ukuran_file)}
                          </span>
                        )}
                      </div>
                    ) : !isNotAvailable ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-7">Belum diupload</p>
                    ) : null}
                    {existingBerkas?.keterangan && !isNotAvailable && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                        {existingBerkas.keterangan}
                      </p>
                    )}
                  </div>
                  {!isNotAvailable && (
                    <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                      {existingBerkas ? (
                        <>
                          {handleGantiClickBerkas && (
                            <button
                              onClick={() => handleGantiClickBerkas(existingBerkas)}
                              className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900 rounded transition-colors"
                              title="Ganti"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteClickBerkas(existingBerkas)}
                            disabled={deletingId === existingBerkas.id}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded transition-colors disabled:opacity-50"
                            title="Hapus"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedJenisBerkas(jenisBerkas)
                            setIsBerkasOffcanvasOpen(true)
                          }}
                          className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900 rounded transition-colors"
                          title="Upload"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default BerkasSection

