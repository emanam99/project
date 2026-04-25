import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { pembayaranAPI } from '../../../services/api'
import { formatCurrency, formatDate, uniqueHistoryById } from '../../../utils/riwayatPembayaran'
import HistoryList from '../../../components/riwayat/HistoryList'
import BayarOffcanvas from '../../../components/riwayat/BayarOffcanvas'

const defaultYearData = () => ({ total: { total: 0, bayar: 0, kurang: 0 }, rincian: [], history: [] })

export default function RiwayatUwaba() {
  const { user } = useAuthStore()
  const idSantri = user?.santri_id || user?.id
  const [tahunList, setTahunList] = useState([])
  const [dataByYear, setDataByYear] = useState({})
  const [openYear, setOpenYear] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bayarFor, setBayarFor] = useState(null)

  useEffect(() => {
    if (!idSantri) {
      setLoading(false)
      return
    }
    // Prioritaskan list tahun dari tabel uwaba (format 1447-1448) agar insert bayar pakai tahun_ajaran benar
    pembayaranAPI.getUwabaTahunList().then((res) => {
      const list = res?.success && Array.isArray(res.data?.tahun_ajaran) ? res.data.tahun_ajaran : []
      if (list.length > 0) {
        setTahunList(list)
        return list
      }
      return pembayaranAPI.getTahunAjaranList().then((r) => {
        const fallback = r?.success && Array.isArray(r.data?.tahun_hijriyah) ? r.data.tahun_hijriyah : []
        setTahunList(fallback)
        return fallback
      })
    }).then((list) => {
      if (!list || list.length === 0) {
        setLoading(false)
        return
      }
      setOpenYear(list[0])
      Promise.all(
        list.map((tahun) =>
          Promise.all([
            pembayaranAPI.getRincian(idSantri, 'uwaba', tahun),
            pembayaranAPI.getHistory(idSantri, 'uwaba', tahun),
          ]).then(([r1, r2]) => ({
            tahun,
            total: r1?.success && r1?.data?.total
              ? { total: r1.data.total.total ?? 0, bayar: r1.data.total.bayar ?? 0, kurang: r1.data.total.kurang ?? 0 }
              : { total: 0, bayar: 0, kurang: 0 },
            rincian: r1?.success && Array.isArray(r1?.data?.rincian) ? r1.data.rincian : [],
            history: r2?.success && Array.isArray(r2?.data) ? uniqueHistoryById(r2.data) : [],
          }))
        )
      )
        .then((arr) => {
          const byYear = {}
          arr.forEach(({ tahun, total, rincian, history }) => {
            byYear[tahun] = { total, rincian, history }
          })
          setDataByYear(byYear)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }).catch(() => setLoading(false))
  }, [idSantri])

  if (!idSantri) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">Anda harus login sebagai santri.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-8">
      <Link
        to="/santri/riwayat-pembayaran"
        className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline mb-4 sm:mb-6"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
        Kembali ke Riwayat Pembayaran
      </Link>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 sm:mb-6 tracking-tight">UWABA</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 dark:border-primary-400 border-t-transparent" />
        </div>
      ) : tahunList.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada data tahun ajaran.</p>
      ) : (
        <div className="space-y-2">
          {tahunList.map((tahun) => {
            const data = dataByYear[tahun] || defaultYearData()
            const tot = data.total
            const isOpen = openYear === tahun
            return (
              <div
                key={tahun}
                className="rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenYear(isOpen ? null : tahun)}
                  className="w-full flex items-center gap-3 sm:gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                >
                  <span className="font-semibold text-gray-900 dark:text-white shrink-0">{tahun}</span>
                  <div className="flex-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs min-w-0 text-right">
                    <span className="text-gray-500 dark:text-gray-400">Wajib {formatCurrency(tot.total)}</span>
                    <span className="text-primary-600 dark:text-primary-400">Bayar {formatCurrency(tot.bayar)}</span>
                    <span className="text-amber-600 dark:text-amber-400">Ket {formatCurrency(tot.kurang)}</span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 dark:text-gray-400 shrink-0 transition-transform duration-300 ease-out ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700 space-y-4">
                    {/* Ringkasan */}
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Ringkasan</h3>
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-2.5 sm:p-3 text-center">
                          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total</p>
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={formatCurrency(tot.total)}>{formatCurrency(tot.total)}</p>
                        </div>
                        <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 p-2.5 sm:p-3 text-center">
                          <p className="text-[10px] sm:text-xs text-primary-600 dark:text-primary-400 mb-0.5">Bayar</p>
                          <p className="text-xs sm:text-sm font-semibold text-primary-700 dark:text-primary-300 truncate" title={formatCurrency(tot.bayar)}>{formatCurrency(tot.bayar)}</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2.5 sm:p-3 text-center">
                          <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 mb-0.5">Kurang</p>
                          <p className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-300 truncate" title={formatCurrency(tot.kurang)}>{formatCurrency(tot.kurang)}</p>
                        </div>
                      </div>
                    </section>
                    {/* Tombol Bayar jika belum lunas - sejajar kotak Bayar, rata tengah, lebar sama */}
                    {(tot.kurang ?? 0) > 0 && (
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 items-center">
                        <div />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setBayarFor({ tahun, wajib: tot.total, kurang: tot.kurang }) }}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl shadow-sm"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          Bayar
                        </button>
                        <div />
                      </div>
                    )}
                    {/* Riwayat pembayaran */}
                    <section>
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Riwayat pembayaran</h3>
                      <HistoryList items={data.history} formatDateFunc={formatDate} emptyMessage="Tidak ada riwayat pembayaran." />
                    </section>
                    {/* Rincian per bulan */}
                    {data.rincian.length > 0 && (
                      <section>
                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Rincian per bulan</h3>
                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-600">
                          <table className="w-full min-w-[260px] text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                                <th className="py-2 px-2 sm:px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Bulan</th>
                                <th className="py-2 px-2 sm:px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Wajib</th>
                                <th className="py-2 px-2 sm:px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Bayar</th>
                                <th className="py-2 px-2 sm:px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Kurang</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                              {data.rincian.map((row) => (
                                <tr key={row.id || row.id_bulan} className="text-gray-800 dark:text-gray-200">
                                  <td className="py-1.5 px-2 sm:px-3">{row.keterangan_1 || row.bulan || '-'}</td>
                                  <td className="py-1.5 px-2 sm:px-3 text-right">{formatCurrency(row.wajib)}</td>
                                  <td className="py-1.5 px-2 sm:px-3 text-right text-primary-600 dark:text-primary-400">{formatCurrency(row.bayar)}</td>
                                  <td className="py-1.5 px-2 sm:px-3 text-right text-amber-600 dark:text-amber-400">{formatCurrency(row.kurang)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      <BayarOffcanvas
        isOpen={!!bayarFor}
        onClose={() => setBayarFor(null)}
        title="Bayar UWABA (iPayMu)"
        jenisPembayaran="UWABA"
        idSantri={idSantri}
        idReferensi={bayarFor?.tahun ?? null}
        tabelReferensi="uwaba___bayar"
        wajib={bayarFor?.wajib ?? 0}
        kurang={bayarFor?.kurang ?? 0}
        onSuccess={() => {
          setBayarFor(null)
          if (!idSantri || !bayarFor?.tahun) return
          Promise.all([pembayaranAPI.getRincian(idSantri, 'uwaba', bayarFor.tahun), pembayaranAPI.getHistory(idSantri, 'uwaba', bayarFor.tahun)])
            .then(([r1, r2]) => {
              setDataByYear((prev) => ({
                ...prev,
                [bayarFor.tahun]: {
                  total: r1?.success && r1?.data?.total ? { total: r1.data.total.total ?? 0, bayar: r1.data.total.bayar ?? 0, kurang: r1.data.total.kurang ?? 0 } : { total: 0, bayar: 0, kurang: 0 },
                  rincian: r1?.success && Array.isArray(r1?.data?.rincian) ? r1.data.rincian : [],
                  history: r2?.success && Array.isArray(r2?.data) ? uniqueHistoryById(r2.data) : [],
                },
              }))
            })
        }}
      />
    </div>
  )
}
