import TahunAjaranPageFilterBar from '../../../components/TahunAjaran/TahunAjaranPageFilterBar'

const iconBtn =
  'p-1.5 h-[34px] w-[34px] rounded-lg transition-colors flex-shrink-0 border-2 flex items-center justify-center'

/**
 * Toolbar halaman Pendaftaran (di luar kotak biodata/pembayaran).
 * Kiri: NIS, cari, tambah santri, simpan, hapus, print | Kanan: tahun hijriyah & masehi sejajar
 */
function PendaftaranPageToolbar({
  bioToolbar,
  payToolbar,
  tahunHijriyah,
  tahunMasehi,
  onTahunHijriyahChange,
  onTahunMasehiChange,
  hijriyahOptions = [],
  masehiOptions = []
}) {
  const bio = bioToolbar || {}
  const pay = payToolbar || {}

  const localId = String(bio.localId ?? '')
  const formDataIdStr = String(bio.formDataId ?? '').trim()
  const formDataIdValid = /^\d{7}$/.test(formDataIdStr)
  const canSave = formDataIdValid && bio.hasChanges && !bio.isSaving && !bio.isLoading

  return (
    <div className="flex-shrink-0 mb-1.5 px-0.5 sm:px-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 justify-between">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
          {typeof bio.setIsSidebarOpen === 'function' ? (
            <button
              type="button"
              onClick={() => bio.setIsSidebarOpen(!bio.isSidebarOpen)}
              className={`${iconBtn} border-transparent hover:bg-gray-200 dark:hover:bg-gray-600`}
              title={bio.isSidebarOpen ? 'Sembunyikan menu section' : 'Tampilkan menu section'}
            >
              <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {bio.isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                )}
              </svg>
            </button>
          ) : null}

          <label className="text-teal-600 dark:text-teal-400 font-semibold whitespace-nowrap text-sm leading-[34px]">
            NIS
          </label>
          <input
            type="text"
            value={localId}
            onChange={(e) => bio.onIdChange?.(e.target.value)}
            className="w-20 min-w-[4.5rem] max-w-[5rem] h-[34px] px-1.5 text-sm border-2 border-teal-500 dark:border-teal-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center"
            placeholder="7 digit"
            maxLength={7}
            inputMode="numeric"
          />

          {bio.onOpenSearch ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                bio.onOpenSearch()
              }}
              className={`${iconBtn} bg-teal-500 hover:bg-teal-600 border-teal-500 dark:border-teal-400 text-white`}
              title="Cari santri"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => bio.onOpenNewModal?.()}
            className={`${iconBtn} bg-green-500 hover:bg-green-600 border-green-500 dark:border-green-400 text-white`}
            title="Tambah santri baru"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => bio.onSave?.()}
            disabled={!canSave}
            className={`${iconBtn} ${
              canSave
                ? 'bg-teal-600 hover:bg-teal-700 border-teal-600 dark:border-teal-500 text-white'
                : 'bg-gray-300 dark:bg-gray-600 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
            title={bio.isSaving ? 'Menyimpan...' : canSave ? 'Simpan biodata' : 'Tidak ada perubahan'}
          >
            {bio.isSaving ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            )}
          </button>

          {/^\d{7}$/.test(localId) && bio.showDeleteButton ? (
            <button
              type="button"
              onClick={() => bio.onOpenDeleteModal?.()}
              className={`${iconBtn} bg-red-500 hover:bg-red-600 border-red-500 dark:border-red-400 text-white`}
              title="Hapus data santri"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => pay.onPrint?.()}
            disabled={!pay.canPrint}
            className={`${iconBtn} ${
              pay.canPrint
                ? 'bg-purple-600 hover:bg-purple-700 border-purple-600 text-white'
                : 'bg-gray-300 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 cursor-not-allowed'
            }`}
            title="Print kwitansi, biodata, atau rapor"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
        </div>

        <TahunAjaranPageFilterBar
          variant="dual"
          hideLabels
          inlineToolbar
          showHint={false}
          selectedHijriyah={tahunHijriyah}
          selectedMasehi={tahunMasehi}
          onHijriyahChange={onTahunHijriyahChange}
          onMasehiChange={onTahunMasehiChange}
          hijriyahOptions={hijriyahOptions}
          masehiOptions={masehiOptions}
        />
      </div>
    </div>
  )
}

export default PendaftaranPageToolbar
