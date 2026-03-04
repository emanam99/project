import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { aktivitasAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'
import PrintLaporanAktivitas, { getMonthName, getHijriyahMonthName } from '../print/PrintLaporanAktivitas'
import '../print/PrintLaporanAktivitas.css'
import '../../../Pembayaran/components/PrintOffcanvas.css'

function PrintLaporanAktivitasOffcanvas({
  isOpen,
  onClose,
  initialMonth = null,
  initialYear = null,
  initialTab = 'masehi',
  initialHijriyahMonth = null,
  initialHijriyahYear = null
}) {
  const { showNotification } = useNotification()
  const [tab, setTab] = useState(initialTab)
  const [currentMonth, setCurrentMonth] = useState(initialMonth ?? new Date().getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(initialYear ?? new Date().getFullYear())
  const [currentHijriyahMonth, setCurrentHijriyahMonth] = useState(initialHijriyahMonth ?? 1)
  const [currentHijriyahYear, setCurrentHijriyahYear] = useState(initialHijriyahYear ?? 1447)
  const [availableMonths, setAvailableMonths] = useState([])
  const [availableHijriyahMonths, setAvailableHijriyahMonths] = useState([])
  const [aktivitas, setAktivitas] = useState([])
  const [saldo, setSaldo] = useState({ saldo_awal: 0, pemasukan: 0, pengeluaran: 0, sisa_saldo: 0 })
  const [loading, setLoading] = useState(false)
  const [fontSize, setFontSize] = useState(10)

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('print-offcanvas-open')
    } else {
      document.body.classList.remove('print-offcanvas-open')
    }
    return () => document.body.classList.remove('print-offcanvas-open')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (tab === 'masehi') {
      aktivitasAPI.getAvailableMonths().then((r) => {
        if (r.success && r.data) setAvailableMonths(r.data)
      }).catch(() => {})
    } else {
      aktivitasAPI.getAvailableHijriyahMonths().then((r) => {
        if (r.success && r.data) setAvailableHijriyahMonths(r.data)
      }).catch(() => {})
    }
  }, [isOpen, tab])

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    const api = tab === 'masehi'
      ? aktivitasAPI.getAktivitasList(currentMonth, currentYear)
      : aktivitasAPI.getAktivitasListHijriyah(currentHijriyahMonth, currentHijriyahYear)
    api
      .then((response) => {
        if (response.success && response.data) {
          setAktivitas(response.data.aktivitas || [])
          setSaldo(response.data.saldo || { saldo_awal: 0, pemasukan: 0, pengeluaran: 0, sisa_saldo: 0 })
        } else {
          showNotification(response.message || 'Gagal memuat data', 'error')
        }
      })
      .catch((err) => {
        showNotification(err.response?.data?.message || 'Gagal memuat aktivitas', 'error')
      })
      .finally(() => setLoading(false))
  }, [isOpen, tab, currentMonth, currentYear, currentHijriyahMonth, currentHijriyahYear])

  const monthLabel = `${getMonthName(currentMonth)} ${currentYear}`
  const hijriyahMonthLabel = `${getHijriyahMonthName(currentHijriyahMonth)} ${currentHijriyahYear}`

  if (!isOpen) return null

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="no-print fixed inset-0 bg-black bg-opacity-50"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
            className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '90vh',
              zIndex: 99999
            }}
          >
            <div className="no-print flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Print Laporan Aktivitas (Bulanan)</h2>
              <button
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="no-print p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/20 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Periode:</span>
                <button
                  type="button"
                  onClick={() => setTab('masehi')}
                  className={`px-2 py-1 rounded text-xs font-medium ${tab === 'masehi' ? 'bg-teal-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  Masehi
                </button>
                <button
                  type="button"
                  onClick={() => setTab('hijriyah')}
                  className={`px-2 py-1 rounded text-xs font-medium ${tab === 'hijriyah' ? 'bg-teal-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                >
                  Hijriyah
                </button>
              </div>

              {tab === 'masehi' ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Bulan:</span>
                  {availableMonths.length === 0 ? (
                    <span className="text-xs text-gray-500">Memuat...</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {availableMonths.map((m) => {
                        const bulan = parseInt(m.bulan)
                        const tahun = parseInt(m.tahun)
                        const active = bulan === currentMonth && tahun === currentYear
                        return (
                          <button
                            key={`${tahun}-${bulan}`}
                            type="button"
                            onClick={() => { setCurrentMonth(bulan); setCurrentYear(tahun) }}
                            className={`px-2 py-1 rounded text-xs whitespace-nowrap ${active ? 'bg-teal-600 text-white' : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}
                          >
                            {getMonthName(bulan)} {tahun}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Bulan Hijriyah:</span>
                  {availableHijriyahMonths.length === 0 ? (
                    <span className="text-xs text-gray-500">Memuat...</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {availableHijriyahMonths.map((m) => {
                        const bulan = parseInt(m.bulan)
                        const tahun = parseInt(m.tahun)
                        const active = bulan === currentHijriyahMonth && tahun === currentHijriyahYear
                        return (
                          <button
                            key={`h-${tahun}-${bulan}`}
                            type="button"
                            onClick={() => { setCurrentHijriyahMonth(bulan); setCurrentHijriyahYear(tahun) }}
                            className={`px-2 py-1 rounded text-xs whitespace-nowrap ${active ? 'bg-teal-600 text-white' : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}
                          >
                            {getHijriyahMonthName(bulan)} {tahun}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
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
                        const value = parseInt(e.target.value, 10) || 10
                        setFontSize(Math.max(6, Math.min(18, value)))
                      }}
                      className="w-10 sm:w-12 h-7 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-xs whitespace-nowrap inline-flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0" style={{ position: 'relative' }}>
              <div className="p-4">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-600" />
                  </div>
                ) : (
                  <PrintLaporanAktivitas
                    aktivitas={aktivitas}
                    saldo={saldo}
                    monthLabel={monthLabel}
                    useHijriyah={tab === 'hijriyah'}
                    hijriyahMonthLabel={hijriyahMonthLabel}
                    fontSize={fontSize}
                  />
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default PrintLaporanAktivitasOffcanvas
