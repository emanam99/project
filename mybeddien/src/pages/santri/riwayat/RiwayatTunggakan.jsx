import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { pembayaranAPI } from '../../../services/api'
import { formatCurrency, formatDate, uniqueHistoryById } from '../../../utils/riwayatPembayaran'
import HistoryList from '../../../components/riwayat/HistoryList'
import BayarOffcanvas from '../../../components/riwayat/BayarOffcanvas'

export default function RiwayatTunggakan() {
  const { user } = useAuthStore()
  const idSantri = user?.santri_id || user?.id
  const [rincian, setRincian] = useState([])
  const [total, setTotal] = useState({ total: 0, bayar: 0, kurang: 0 })
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [bayarFor, setBayarFor] = useState(null)

  useEffect(() => {
    if (!idSantri) return
    setLoading(true)
    Promise.all([
      pembayaranAPI.getRincian(idSantri, 'tunggakan'),
      pembayaranAPI.getHistory(idSantri, 'tunggakan'),
    ])
      .then(([r1, r2]) => {
        if (r1.success && r1.data) {
          setRincian(r1.data.rincian || [])
          setTotal(r1.data.total || { total: 0, bayar: 0, kurang: 0 })
        }
        if (r2.success && r2.data) setHistory(uniqueHistoryById(Array.isArray(r2.data) ? r2.data : []))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [idSantri])

  if (!idSantri) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">Anda harus login sebagai santri.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 sm:py-4 pb-6">
      <Link
        to="/santri/riwayat-pembayaran"
        className="inline-flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline mb-3 transition-colors"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
        </svg>
        Kembali ke Riwayat Pembayaran
      </Link>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 tracking-tight">Tunggakan</h1>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-500 dark:border-primary-400 border-t-transparent" />
        </div>
      ) : (
        <>
          <section className="mb-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <h2 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Ringkasan</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 p-2.5 text-center shadow-sm">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Wajib</p>
                <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(total.total)}</p>
              </div>
              <div className="rounded-lg bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 p-2.5 text-center shadow-sm">
                <p className="text-[10px] text-primary-600 dark:text-primary-400 mb-0.5">Bayar</p>
                <p className="text-xs font-bold text-primary-700 dark:text-primary-300 tabular-nums">{formatCurrency(total.bayar)}</p>
              </div>
              <div className="rounded-lg bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 p-2.5 text-center shadow-sm">
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-0.5">Kurang</p>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300 tabular-nums">{formatCurrency(total.kurang)}</p>
              </div>
            </div>
          </section>

          {rincian.length > 0 && (
            <div className="mb-4 space-y-2">
              <h2 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rincian</h2>
              {rincian.map((row) => {
                const rowKurang = Number(row.kurang) ?? (Number(row.wajib) || 0) - (Number(row.bayar) || 0)
                const showBayar = rowKurang > 0
                return (
                  <div
                    key={row.id}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 p-2.5"
                  >
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-1">
                      {row.keterangan_1 || '—'}{row.keterangan_2 ? ` / ${row.keterangan_2}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-gray-600 dark:text-gray-400">
                        Wajib <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(row.wajib)}</span>
                      </span>
                      <span className="text-primary-600 dark:text-primary-400">
                        Bayar <span className="font-semibold">{formatCurrency(row.bayar)}</span>
                      </span>
                      {showBayar && (
                        <button
                          type="button"
                          onClick={() => setBayarFor({ id: row.id, wajib: row.wajib, kurang: rowKurang })}
                          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-lg"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          Bayar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <section className="pt-3 border-t border-gray-200 dark:border-gray-600">
            <h2 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Riwayat pembayaran</h2>
            <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/60 p-3">
              <HistoryList items={history} formatDateFunc={formatDate} emptyMessage="Tidak ada riwayat pembayaran." />
            </div>
          </section>

          <BayarOffcanvas
            isOpen={!!bayarFor}
            onClose={() => setBayarFor(null)}
            title="Bayar Tunggakan (iPayMu)"
            jenisPembayaran="Tunggakan"
            idSantri={idSantri}
            idReferensi={bayarFor?.id ?? null}
            tabelReferensi="uwaba___tunggakan"
            wajib={bayarFor?.wajib ?? 0}
            kurang={bayarFor?.kurang ?? 0}
            onSuccess={() => { setBayarFor(null); Promise.all([pembayaranAPI.getRincian(idSantri, 'tunggakan'), pembayaranAPI.getHistory(idSantri, 'tunggakan')]).then(([r1, r2]) => { if (r1?.success && r1?.data) { setRincian(r1.data.rincian || []); setTotal(r1.data.total || { total: 0, bayar: 0, kurang: 0 }) } if (r2?.success && r2?.data) setHistory(uniqueHistoryById(Array.isArray(r2.data) ? r2.data : [])) }) }}
          />
        </>
      )}
    </div>
  )
}
