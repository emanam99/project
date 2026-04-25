import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { buildPengeluaranLembagaFilterOptions } from '../utils/lembagaFilterOptions'

// Memoized Search and Filter Section untuk Pengeluaran
const SearchAndFilterPengeluaran = memo(({
  searchInput,
  onSearchInputChange,
  onSearchInputFocus,
  onSearchInputBlur,
  isInputFocused,
  isFilterOpen,
  onFilterToggle,
  kategoriFilter,
  onKategoriFilterChange,
  lembagaFilter,
  onLembagaFilterChange,
  tanggalDari,
  onTanggalDariChange,
  tanggalSampai,
  onTanggalSampaiChange,
  onRefresh,
  lembagaRows = [],
  allowedLembagaIds = null,
  lembagaFilterDisabled = false
}) => {
  const lembagaOptions = buildPengeluaranLembagaFilterOptions(lembagaRows, allowedLembagaIds)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      {/* Search Input dengan tombol di kanan */}
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari keterangan, admin, atau ID..."
          />
          {/* Tombol Filter dan Refresh di kanan */}
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <button
              onClick={onFilterToggle}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
              title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
              </svg>
              {isFilterOpen ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              )}
            </button>
            <button
              onClick={onRefresh}
              className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
          </div>
        </div>
        {/* Border bawah yang sampai ke kanan */}
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
        <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
      </div>

      {/* Filter Container dengan Accordion */}
      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
          >
            <div className="px-4 py-2">
              <div className="flex flex-wrap gap-2">
                <select
                  value={kategoriFilter}
                  onChange={onKategoriFilterChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Kategori</option>
                  <option value="Bisyaroh">Bisyaroh</option>
                  <option value="Acara">Acara</option>
                  <option value="Pengadaan">Pengadaan</option>
                  <option value="Perbaikan">Perbaikan</option>
                  <option value="ATK">ATK</option>
                  <option value="Listrik">Listrik</option>
                  <option value="Wifi">Wifi</option>
                  <option value="Langganan">Langganan</option>
                  <option value="Rapat">Rapat</option>
                  <option value="Setoran">Setoran</option>
                  <option value="lainnya">Lainnya</option>
                </select>
                <select
                  value={lembagaFilter}
                  onChange={onLembagaFilterChange}
                  disabled={lembagaFilterDisabled}
                  title={lembagaFilterDisabled ? 'Filter lembaga mengikuti akses peran Anda' : undefined}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 disabled:opacity-60"
                >
                  {lembagaOptions.map((o) => (
                    <option key={o.value || '_all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={tanggalDari}
                  onChange={onTanggalDariChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  placeholder="Dari Tanggal"
                />
                <input
                  type="date"
                  value={tanggalSampai}
                  onChange={onTanggalSampaiChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  placeholder="Sampai Tanggal"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

SearchAndFilterPengeluaran.displayName = 'SearchAndFilterPengeluaran'

export default SearchAndFilterPengeluaran

