import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PrintAbsenTable from './PrintAbsenTable'
import {
  startOfWeekMonday,
  formatYmdLocal,
  buildHarianColumns,
  HARI_ID_OPTIONS,
} from './printAbsenHelpers'

/**
 * Offcanvas bawah preview cetak absensi — mode TTD / harian / jam, ukuran font seperti print data Ijin.
 */
function PrintAbsenOffcanvas({ isOpen, onClose, rombel, santriList = [], waliNama = '' }) {
  const [fontSize, setFontSize] = useState(9)
  const [absenMode, setAbsenMode] = useState('simple')
  const [harianTanggalMulai, setHarianTanggalMulai] = useState('')
  const [harianTanggalSelesai, setHarianTanggalSelesai] = useState('')
  const [harianHariMulai, setHarianHariMulai] = useState(1)
  const [harianHariSelesai, setHarianHariSelesai] = useState(6)
  const [jamTanggal, setJamTanggal] = useState('')
  const [jumlahJam, setJumlahJam] = useState(8)
  /** Ribbon Office-style: panel opsi bisa dilipat */
  const [ribbonExpanded, setRibbonExpanded] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    const mon = startOfWeekMonday()
    const sat = new Date(mon)
    sat.setDate(mon.getDate() + 5)
    const today = new Date()
    setHarianTanggalMulai(formatYmdLocal(mon))
    setHarianTanggalSelesai(formatYmdLocal(sat))
    setHarianHariMulai(1)
    setHarianHariSelesai(6)
    setJamTanggal(formatYmdLocal(today))
    setJumlahJam(8)
    setAbsenMode('simple')
    setFontSize(9)
    setRibbonExpanded(true)
  }, [isOpen])

  const harianColCount = useMemo(
    () =>
      buildHarianColumns(harianTanggalMulai, harianTanggalSelesai, harianHariMulai, harianHariSelesai).length,
    [harianTanggalMulai, harianTanggalSelesai, harianHariMulai, harianHariSelesai]
  )

  useEffect(() => {
    if (!isOpen) return

    const oldStyle = document.getElementById('dynamic-print-absen-page')
    if (oldStyle) oldStyle.remove()

    const style = document.createElement('style')
    style.id = 'dynamic-print-absen-page'
    style.textContent = '@page { size: A4 landscape; margin: 10mm; }'
    document.head.appendChild(style)
    document.body.classList.add('print-data-active')

    return () => {
      document.body.classList.remove('print-data-active')
      const el = document.getElementById('dynamic-print-absen-page')
      if (el) el.remove()
    }
  }, [isOpen])

  const handlePrint = () => {
    if (absenMode === 'harian' && harianColCount === 0) {
      return
    }
    document.body.classList.add('print-offcanvas-open')
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.body.classList.remove('print-offcanvas-open')
      }, 1000)
    }, 200)
  }

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  const printDisabled = absenMode === 'harian' && harianColCount === 0

  const modeLabel =
    absenMode === 'simple' ? 'Absen TTD' : absenMode === 'harian' ? 'Absen harian' : 'Absen jam'

  const ribbonTabs = [
    { id: 'simple', label: 'Absen TTD' },
    { id: 'harian', label: 'Absen harian' },
    { id: 'jam', label: 'Absen jam' },
  ]

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="print-absen-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="no-print fixed inset-0 bg-black bg-opacity-50"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99998,
          }}
        />
      )}
      {isOpen && (
        <motion.div
          key="print-absen-panel"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={offcanvasTransition}
          className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '90vh',
            zIndex: 99999,
          }}
        >
          <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold text-teal-600 dark:text-teal-400 truncate">
                Preview Print Absen
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {santriList.length} santri
                {absenMode === 'harian' && ` · ${harianColCount} kolom tanggal`}
                {absenMode === 'jam' && ` · ${Math.min(20, Math.max(1, Number(jumlahJam) || 1))} jam`}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap hidden sm:inline">
                  Ukuran Font:
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFontSize((prev) => Math.max(6, prev - 1))}
                    className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    title="Kurangi ukuran font"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={6}
                    max={18}
                    value={fontSize}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10) || 9
                      setFontSize(Math.max(6, Math.min(18, value)))
                    }}
                    className="w-10 sm:w-12 h-7 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">px</span>
                  <button
                    type="button"
                    onClick={() => setFontSize((prev) => Math.min(18, prev + 1))}
                    className="w-7 h-7 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    title="Tambah ukuran font"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePrint}
                disabled={printDisabled}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                title={printDisabled ? 'Sesuaikan periode / hari' : 'Cetak absen'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                <span className="hidden sm:inline">Print</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Ribbon bergaya Office: tab + panel tinggi tetap, lipat kanan atas */}
          <div className="no-print flex-shrink-0 border-b border-gray-300 dark:border-gray-600 bg-[#ececec] dark:bg-[#252526]">
            {ribbonExpanded ? (
              <>
                {/* Baris tab + tombol lipat (pojok kanan ribbon) */}
                <div className="flex items-stretch min-h-[34px]">
                  <div className="flex flex-1 items-end gap-0 px-1 pt-1 overflow-x-auto">
                    {ribbonTabs.map((tab) => {
                      const active = absenMode === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setAbsenMode(tab.id)}
                          className={`shrink-0 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-t-md border border-b-0 transition-colors ${
                            active
                              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 border-b-white dark:border-b-gray-800 relative z-[1] mb-[-1px] shadow-[0_-1px_0_0_rgba(255,255,255,1)] dark:shadow-[0_-1px_0_0_rgb(31,41,55)]'
                              : 'bg-transparent text-gray-600 dark:text-gray-400 border-transparent hover:bg-white/60 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center border-l border-gray-300/80 dark:border-gray-600 pl-1 pr-1 shrink-0 bg-[#e4e4e4] dark:bg-[#2d2d30]">
                    <button
                      type="button"
                      onClick={() => setRibbonExpanded(false)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300/60 dark:hover:bg-gray-600/50"
                      title="Sembunyikan opsi"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                      <span className="hidden sm:inline max-w-[7rem] truncate">Sembunyikan</span>
                    </button>
                  </div>
                </div>

                {/* Panel konten — tinggi tetap (~Office ribbon) */}
                <div className="bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600 px-2 sm:px-3 py-2 h-[104px] sm:h-[96px] overflow-x-auto overflow-y-hidden">
                  {absenMode === 'simple' && (
                    <div className="flex h-full items-stretch gap-0">
                      <div className="flex flex-col justify-center pr-4 border-r border-gray-200 dark:border-gray-600 min-w-[140px]">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          Format
                        </span>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
                          Kolom paraf &amp; keterangan untuk tanda tangan.
                        </p>
                      </div>
                    </div>
                  )}

                  {absenMode === 'harian' && (
                    <div className="flex h-full items-stretch gap-0 flex-nowrap min-w-min">
                      <div className="flex flex-col justify-end pr-3 sm:pr-4 border-r border-gray-200 dark:border-gray-600 shrink-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          Periode
                        </span>
                        <div className="flex flex-wrap gap-2 items-end">
                          <div>
                            <label className="sr-only">Tanggal mulai</label>
                            <input
                              type="date"
                              value={harianTanggalMulai}
                              onChange={(e) => setHarianTanggalMulai(e.target.value)}
                              className="px-2 py-1 text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-[128px] sm:w-[140px]"
                            />
                          </div>
                          <span className="text-gray-400 text-xs pb-1">s/d</span>
                          <div>
                            <label className="sr-only">Tanggal selesai</label>
                            <input
                              type="date"
                              value={harianTanggalSelesai}
                              onChange={(e) => setHarianTanggalSelesai(e.target.value)}
                              className="px-2 py-1 text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-[128px] sm:w-[140px]"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col justify-end px-3 sm:px-4 border-r border-gray-200 dark:border-gray-600 shrink-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          Hari
                        </span>
                        <div className="flex flex-wrap gap-2 items-end">
                          <select
                            value={harianHariMulai}
                            onChange={(e) => setHarianHariMulai(Number(e.target.value))}
                            className="px-2 py-1 text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 max-w-[108px]"
                            aria-label="Dari hari"
                          >
                            {HARI_ID_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <span className="text-gray-400 text-xs pb-1">–</span>
                          <select
                            value={harianHariSelesai}
                            onChange={(e) => setHarianHariSelesai(Number(e.target.value))}
                            className="px-2 py-1 text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 max-w-[108px]"
                            aria-label="Sampai hari"
                          >
                            {HARI_ID_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center pl-3 min-w-0 flex-1">
                        {harianColCount === 0 ? (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight">
                            Tidak ada kolom tanggal. Sesuaikan periode &amp; hari.
                          </p>
                        ) : (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-teal-700 dark:text-teal-400">{harianColCount}</span>{' '}
                            kolom tanggal
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {absenMode === 'jam' && (
                    <div className="flex h-full items-stretch gap-0 flex-nowrap">
                      <div className="flex flex-col justify-end pr-4 border-r border-gray-200 dark:border-gray-600 shrink-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          Tanggal
                        </span>
                        <input
                          type="date"
                          value={jamTanggal}
                          onChange={(e) => setJamTanggal(e.target.value)}
                          className="px-2 py-1 text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-[140px]"
                        />
                      </div>
                      <div className="flex flex-col justify-end pl-4 shrink-0">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          Jam / hari
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={jumlahJam}
                            onChange={(e) =>
                              setJumlahJam(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))
                            }
                            className="w-16 px-2 py-1 text-xs sm:text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-center"
                            aria-label="Jumlah jam sehari"
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            jam pelajaran
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 min-h-[36px] bg-[#e4e4e4] dark:bg-[#2d2d30] border-t border-gray-300/50 dark:border-gray-600">
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate pl-1">
                  <span className="font-medium text-gray-800 dark:text-gray-200">Opsi:</span>{' '}
                  {modeLabel}
                  {absenMode === 'harian' && ` · ${harianColCount} kolom`}
                  {absenMode === 'jam' &&
                    ` · ${Math.min(20, Math.max(1, Number(jumlahJam) || 1))} jam`}
                </p>
                <button
                  type="button"
                  onClick={() => setRibbonExpanded(true)}
                  className="flex items-center gap-1 shrink-0 px-2 py-1 rounded text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300/60 dark:hover:bg-gray-600/50"
                  title="Tampilkan opsi"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="hidden sm:inline">Tampilkan</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto" style={{ position: 'relative', minHeight: 0 }}>
            <div style={{ padding: '10px', minHeight: '100%' }}>
              {!santriList || santriList.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <p>Tidak ada santri untuk dicetak</p>
                </div>
              ) : (
                <PrintAbsenTable
                  rombel={rombel}
                  santriList={santriList}
                  fontSize={fontSize}
                  waliNama={waliNama}
                  mode={absenMode}
                  harianTanggalMulai={harianTanggalMulai}
                  harianTanggalSelesai={harianTanggalSelesai}
                  harianHariMulai={harianHariMulai}
                  harianHariSelesai={harianHariSelesai}
                  jamTanggal={jamTanggal}
                  jumlahJam={jumlahJam}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default PrintAbsenOffcanvas
