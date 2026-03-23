/**
 * Header Section Component
 * Menampilkan ID input, tombol simpan, progress bar, dan toggle sidebar
 */
function HeaderSection({
  isSidebarOpen,
  setIsSidebarOpen,
  onSave,
  isSaving,
  dataReady,
  formDataId,
  hasChanges,
  formData,
  readOnly = false
}) {
  // Tampilkan ID atau "-" jika kosong
  // Handle case dimana formDataId bisa string, number, null, atau undefined
  const displayId = formDataId && String(formDataId).trim() !== '' ? String(formDataId) : '-'

  // Hitung progress pengisian: hanya field yang benar-benar ada di formData dan visible di form
  const calculateProgress = () => {
    if (!formData) return 0

    // Daftar field yang selalu ditampilkan (key harus sama persis dengan formData)
    let allFields = [
      // Data Diri (tanpa id/nis - itu dari server, bukan input user)
      'nik', 'nama', 'gender', 'tempat_lahir', 'tanggal_lahir',
      'no_kk', 'kepala_keluarga', 'anak_ke', 'jumlah_saudara',
      'saudara_di_pesantren', 'nisn',
      'hobi', 'cita_cita', 'kebutuhan_khusus',
      // KIP, PKH, KKS di form pakai key: kip, pkh, kks (bukan no_kip dll)
      'kip', 'pkh', 'kks',
      // Biodata Ayah & Ibu (nama + status selalu visible)
      'ayah', 'status_ayah', 'ibu', 'status_ibu',
      // Biodata Wali
      'hubungan_wali', 'wali', 'nik_wali', 'tempat_lahir_wali', 'tanggal_lahir_wali',
      'pendidikan_wali', 'pekerjaan_wali', 'penghasilan_wali',
      // Alamat (hanya yang ada di form: tidak ada alamat_lengkap, jarak_tempuh, transportasi)
      'provinsi', 'kabupaten', 'kecamatan', 'desa', 'dusun', 'rt', 'rw', 'kode_pos',
      // Riwayat
      'madrasah', 'sekolah',
      // Informasi Tambahan
      'no_telpon', 'email', 'status_nikah', 'pekerjaan', 'riwayat_sakit', 'ukuran_baju', 'no_wa_santri',
      // Status Pendaftaran:
      // - status_pendaftar, daftar_diniyah, daftar_formal, status_murid bisa berasal dari flow lama
      //   atau tidak selalu tampil/diisi di halaman Biodata, jadi TIDAK ikut menentukan 100%.
      // - Yang benar-benar terlihat dan wajib diisi di sini adalah status_santri saja.
      'status_santri',
      // Kategori Pendidikan (key di form: kategori)
      'kategori'
    ]

    // Tambahkan field Ayah jika status "Masih Hidup"
    if (formData.status_ayah === 'Masih Hidup') {
      allFields.push(
        'nik_ayah', 'tempat_lahir_ayah', 'tanggal_lahir_ayah',
        'pendidikan_ayah', 'pekerjaan_ayah', 'penghasilan_ayah'
      )
    }

    // Tambahkan field Ibu jika status "Masih Hidup"
    if (formData.status_ibu === 'Masih Hidup') {
      allFields.push(
        'nik_ibu', 'tempat_lahir_ibu', 'tanggal_lahir_ibu',
        'pendidikan_ibu', 'pekerjaan_ibu', 'penghasilan_ibu'
      )
    }

    // Tambahkan field Madrasah jika "Iya"
    if (formData.madrasah === 'Iya') {
      allFields.push('nama_madrasah', 'alamat_madrasah', 'lulus_madrasah')
    }

    // Tambahkan field Sekolah jika bukan "Tidak Pernah Sekolah"
    if (formData.sekolah && formData.sekolah !== 'Tidak Pernah Sekolah') {
      allFields.push(
        'nama_sekolah', 'alamat_sekolah', 'lulus_sekolah',
        'npsn', 'nsm', 'jurusan', 'program_sekolah'
      )
    }

    // Prodi hanya tampil jika daftar_formal STAI
    if (formData.daftar_formal === 'STAI') {
      allFields.push('prodi')
    }

    // Daerah & Kamar hanya tampil jika status_santri Mukim
    if (formData.status_santri === 'Mukim') {
      allFields.push('daerah', 'kamar')
    }

    // Hitung field yang terisi (value ada dan tidak kosong)
    const filledCount = allFields.filter(fieldKey => {
      const value = formData[fieldKey]
      if (value === null || value === undefined) return false
      if (typeof value === 'string') return value.trim() !== ''
      if (typeof value === 'number') return true
      return false
    }).length

    const total = allFields.length
    if (total === 0) return 100
    return Math.round((filledCount / total) * 100)
  }

  const progress = calculateProgress()

  return (
    <div className={`flex-shrink-0 bg-gray-200 dark:bg-gray-700/50 p-2 border-b-2 border-gray-300 dark:border-gray-600 transition-all duration-300 ${
      isSidebarOpen ? 'ml-12' : 'ml-0'
    }`}>
      <div className="flex gap-1.5 items-center justify-between min-w-0">
        <div className="flex gap-1.5 items-center flex-shrink-0">
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
          <span className="text-sm text-gray-900 dark:text-gray-100 font-medium min-w-[4.5rem] text-center">
            {displayId}
          </span>
          {readOnly ? (
            <span
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-gray-300/80 dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-400/50 dark:border-gray-500 whitespace-nowrap"
              title="Mode baca — gunakan tombol Ubah di header untuk mengedit"
            >
              Mode baca
            </span>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || !dataReady || !hasChanges}
              className={`px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 border-2 flex items-center gap-2 ${
                isSaving || !dataReady || !hasChanges
                  ? 'bg-gray-300 dark:bg-gray-600 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-teal-600 hover:bg-teal-700 border-teal-600 dark:border-teal-500 text-white'
              }`}
              title={
                isSaving
                  ? 'Menyimpan...'
                  : !dataReady
                    ? 'Memuat data...'
                    : hasChanges
                      ? 'Simpan perubahan'
                      : 'Data tersimpan'
              }
            >
              {isSaving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
              <span className="text-sm font-semibold whitespace-nowrap">
                {isSaving ? 'Menyimpan...' : 'Simpan'}
              </span>
            </button>
          )}

          {/* Progress Bar & Persentase */}
          <div className="flex items-center gap-1.5 md:gap-2 ml-1 md:ml-2 flex-1 min-w-0">
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              {/* Mobile: Hanya persentase, Desktop: Label + Persentase */}
              <div className="flex items-center gap-1.5">
                <span className="hidden md:inline text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  Progress:
                </span>
                <span className={`text-xs font-bold whitespace-nowrap ${
                  progress === 100 
                    ? 'text-green-600 dark:text-green-400' 
                    : progress >= 50 
                    ? 'text-yellow-600 dark:text-yellow-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {progress}%
                </span>
              </div>
              {/* Progress Bar - Responsive width */}
              <div className="w-full md:w-32 h-2 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${
                    progress === 100 
                      ? 'bg-green-500 dark:bg-green-400' 
                      : progress >= 50 
                      ? 'bg-yellow-500 dark:bg-yellow-400' 
                      : 'bg-red-500 dark:bg-red-400'
                  }`}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HeaderSection
