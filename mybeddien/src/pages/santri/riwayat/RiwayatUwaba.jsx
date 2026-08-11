import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../../store/authStore'
import { useSantriBiodata, useSantriIds, useSantriUwabaData } from '../../../hooks/useSantriCachedResources'
import { buildWaAdminPembayaranUrl } from '../../../utils/waAdminPembayaran'
import { refreshSantriUwabaYear } from '../../../services/santriDataService'
import { formatCurrency, formatDate, statusUwabaAccordionHeader } from '../../../utils/riwayatPembayaran'
import HistoryList from '../../../components/riwayat/HistoryList'
import BayarOffcanvas from '../../../components/riwayat/BayarOffcanvas'
import { PageEnter, PageEnterBlock, PageEnterLoading, PageEnterTitle } from '../../../components/motion/PageEnter'
import { KwitansiQrMismatchNotice, KwitansiQrPendingNotice, useKwitansiQrSantriMatch } from '../../../components/riwayat/KwitansiQrSantriGate'

const defaultYearData = () => ({
  total: { total: 0, bayar: 0, kurang: 0 },
  rincian: [],
  history: [],
  fetchMessage: '',
})

export default function RiwayatUwaba() {
  const { santriId: idSantri, userId } = useSantriIds()
  const user = useAuthStore((s) => s.user)
  const { biodata } = useSantriBiodata()
  const { tahunList, dataByYear, loading } = useSantriUwabaData()
  const qrMatch = useKwitansiQrSantriMatch()
  const waLaporKetidaksesuaianUrl = useMemo(
    () =>
      buildWaAdminPembayaranUrl({
        nama: biodata?.nama ?? user?.nama,
        nik: biodata?.nik ?? user?.nik,
        nis: biodata?.nis ?? user?.nis,
        daftarFormal: biodata?.daftar_formal ?? biodata?.formal,
        daftarDiniyah: biodata?.daftar_diniyah ?? biodata?.diniyah,
      }),
    [
      biodata?.nama,
      biodata?.nik,
      biodata?.nis,
      biodata?.daftar_formal,
      biodata?.formal,
      biodata?.daftar_diniyah,
      biodata?.diniyah,
      user?.nama,
      user?.nik,
      user?.nis,
    ]
  )
  const [openYear, setOpenYear] = useState(null)
  const [bayarFor, setBayarFor] = useState(null)
  const [listError, setListError] = useState('')

  if (!idSantri) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">Anda harus login sebagai santri.</p>
      </div>
    )
  }

  if (qrMatch.required && qrMatch.pending) {
    return <KwitansiQrPendingNotice />
  }
  if (qrMatch.required && !qrMatch.matched) {
    return <KwitansiQrMismatchNotice qrNis={qrMatch.qrNis} qrId={qrMatch.qrId} />
  }

  return (
    <PageEnter className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-8">
      <PageEnterTitle className="mb-4 sm:mb-6">
        <Link
          to="/santri/riwayat-pembayaran"
          className="inline-flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline mb-4"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Kembali ke Riwayat Pembayaran
        </Link>
        <div className="mb-4">
          <a
            href={waLaporKetidaksesuaianUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
            aria-label="Laporkan ketidaksesuaian tagihan lewat WhatsApp"
          >
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp
          </a>
          <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Laporkan ketidaksesuaian data tagihan
          </p>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight">UWABA</h1>
      </PageEnterTitle>

      {listError ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {listError}
        </div>
      ) : null}

      {loading ? (
        <PageEnterLoading className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 dark:border-primary-400 border-t-transparent" />
        </PageEnterLoading>
      ) : tahunList.length === 0 ? (
        <PageEnterBlock index={1}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Belum ada tahun ajaran UWABA untuk akun Anda (belum ada data uwaba atau pembayaran). Hubungi admin jika menurut Anda seharusnya sudah terdaftar.
        </p>
        </PageEnterBlock>
      ) : (
        <div className="space-y-2">
          {tahunList.map((tahun) => {
            const data = dataByYear[tahun] || defaultYearData()
            const tot = data.total
            const statusHdr = statusUwabaAccordionHeader(tot.total, tot.bayar, tot.kurang)
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
                  <div className="flex-1 flex flex-col items-end gap-1 text-xs min-w-0 text-right">
                    <span className="text-gray-500 dark:text-gray-400">Wajib {formatCurrency(tot.total)}</span>
                    <span className="text-primary-600 dark:text-primary-400">Bayar {formatCurrency(tot.bayar)}</span>
                    <span className={statusHdr.className}>{statusHdr.label}</span>
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
                    {data.fetchMessage ? (
                      <p className="text-xs text-red-600 dark:text-red-400">{data.fetchMessage}</p>
                    ) : null}
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
                      {(!data.rincian || data.rincian.length === 0) ? (
                        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                          Belum ada rincian per bulan di sistem. Nominal wajib ditetapkan admin di eBeddien (halaman UWABA per santri).
                        </p>
                      ) : null}
                    </section>
                    {/* Tombol Bayar jika belum lunas - sejajar kotak Bayar, rata tengah, lebar sama */}
                    {(tot.kurang ?? 0) > 0 && (
                      <div className="grid grid-cols-3 gap-2 sm:gap-3 items-center">
                        <div />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setBayarFor({
                              tahun,
                              wajib: tot.total,
                              kurang: tot.kurang,
                              rincian: data.rincian ?? [],
                            })
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl shadow-sm"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          Bayar
                        </button>
                        <div />
                      </div>
                    )}
                    {/* Riwayat pembayaran — sub-accordion, default tertutup */}
                    <section>
                      <HistoryList
                        items={data.history}
                        formatDateFunc={formatDate}
                        emptyMessage="Tidak ada riwayat pembayaran."
                        collapsible
                      />
                    </section>
                    {/* Rincian per bulan */}
                    {data.rincian.length > 0 && (
                      <section>
                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Rincian per bulan</h3>
                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-600">
                          <table className="w-full min-w-70 text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                                <th className="py-2 px-2 sm:px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Bulan</th>
                                <th className="py-2 px-2 sm:px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Wajib</th>
                                <th className="py-2 px-2 sm:px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Bayar</th>
                                <th className="py-2 px-2 sm:px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Ket</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                              {data.rincian.map((row) => {
                                const ket = statusUwabaAccordionHeader(row.wajib, row.bayar, row.kurang)
                                return (
                                  <tr key={row.id || row.id_bulan} className="text-gray-800 dark:text-gray-200">
                                    <td className="py-1.5 px-2 sm:px-3">{row.keterangan_1 || row.bulan || '-'}</td>
                                    <td className="py-1.5 px-2 sm:px-3 text-right">{formatCurrency(row.wajib)}</td>
                                    <td className="py-1.5 px-2 sm:px-3 text-right text-primary-600 dark:text-primary-400">{formatCurrency(row.bayar)}</td>
                                    <td className={`py-1.5 px-2 sm:px-3 text-right text-xs sm:text-sm ${ket.className}`}>{ket.label}</td>
                                  </tr>
                                )
                              })}
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
        title="Bayar UWABA"
        jenisPembayaran="UWABA"
        idSantri={idSantri}
        idReferensi={bayarFor?.tahun ?? null}
        tabelReferensi="uwaba___bayar"
        wajib={bayarFor?.wajib ?? 0}
        kurang={bayarFor?.kurang ?? 0}
        selectionMode="list"
        payableItems={bayarFor?.rincian ?? []}
        onSuccess={() => {
          const ta = bayarFor?.tahun
          setBayarFor(null)
          if (!idSantri || !ta) return
          refreshSantriUwabaYear(idSantri, userId, ta)
        }}
      />
    </PageEnter>
  )
}
