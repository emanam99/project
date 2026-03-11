import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { paymentAPI, pendaftaranAPI } from '../services/api'

const formatCurrency = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0)

const defaultSummary = () => ({ total: 0, bayar: 0, kurang: 0 })

/** Status: Belum (merah), Kurang Rp ... (amber), Lunas (hijau) */
function labelKet(wajib, bayar, kurang, formatCur) {
  const w = Number(wajib) || 0
  const b = Number(bayar) || 0
  const k = Number.isFinite(Number(kurang)) ? Number(kurang) : w - b
  if (w === 0) return { label: '—', className: 'text-gray-500 dark:text-gray-400' }
  if (b === 0) return { label: 'Belum', className: 'text-red-600 dark:text-red-400 font-medium' }
  if (k > 0) return { label: `Kurang ${formatCur(k)}`, className: 'text-amber-600 dark:text-amber-400' }
  return { label: 'Lunas', className: 'text-green-600 dark:text-green-400 font-medium' }
}

const MENU_ITEMS = [
  { key: 'pendaftaran', label: 'Pendaftaran', description: 'Riwayat pembayaran registrasi per tahun ajaran' },
  { key: 'uwaba', label: 'UWABA', descriptionBase: 'Riwayat pembayaran UWABA' },
  { key: 'khusus', label: 'Khusus', description: 'Riwayat pembayaran khusus' },
  { key: 'tunggakan', label: 'Tunggakan', description: 'Riwayat pembayaran tunggakan' }
]

/**
 * Offcanvas global: Riwayat Pembayaran Santri.
 * Menampilkan ringkasan Pendaftaran, UWABA, Khusus, Tunggakan (seperti mybeddian).
 * Bisa dipanggil dari semua page dengan isOpen, onClose, idSantri.
 */
export default function RiwayatPembayaranSantriOffcanvas({ isOpen, onClose, idSantri, namaSantri = '' }) {
  const [summary, setSummary] = useState({
    pendaftaran: defaultSummary(),
    uwaba: defaultSummary(),
    khusus: defaultSummary(),
    tunggakan: defaultSummary()
  })
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !idSantri) {
      setSummary({
        pendaftaran: defaultSummary(),
        uwaba: defaultSummary(),
        khusus: defaultSummary(),
        tunggakan: defaultSummary()
      })
      setTahunAjaranList([])
      return
    }

    setLoading(true)
    const s = {
      pendaftaran: defaultSummary(),
      uwaba: defaultSummary(),
      khusus: defaultSummary(),
      tunggakan: defaultSummary()
    }

    const run = async () => {
      try {
        await Promise.all([
          pendaftaranAPI.getRincian(idSantri).then((r) => {
            if (r?.success && r?.data?.total) {
              s.pendaftaran.total = Number(r.data.total.total) || 0
              s.pendaftaran.bayar = Number(r.data.total.bayar) || 0
              s.pendaftaran.kurang = Number(r.data.total.kurang) ?? s.pendaftaran.total - s.pendaftaran.bayar
            }
          }).catch(() => {}),
          paymentAPI.getPublicUwabaTahunList().then((res) => {
            const list = res?.success && Array.isArray(res.data?.tahun_ajaran) ? res.data.tahun_ajaran : []
            setTahunAjaranList(list)
            if (list.length === 0) return Promise.resolve()
            return Promise.all(list.map((tahun) => paymentAPI.getPublicRincian(idSantri, 'uwaba', tahun))).then((results) => {
              results.forEach((r) => {
                if (r?.success && r?.data?.total) {
                  s.uwaba.total += Number(r.data.total.total) || 0
                  s.uwaba.bayar += Number(r.data.total.bayar) || 0
                }
              })
              s.uwaba.kurang = s.uwaba.total - s.uwaba.bayar
            })
          }).catch(() => {}),
          paymentAPI.getRincian(idSantri, 'khusus').then((r) => {
            if (r?.success && r?.data?.total) {
              s.khusus.total = Number(r.data.total.total) || 0
              s.khusus.bayar = Number(r.data.total.bayar) || 0
              s.khusus.kurang = Number(r.data.total.kurang) ?? s.khusus.total - s.khusus.bayar
            }
          }).catch(() => {}),
          paymentAPI.getRincian(idSantri, 'tunggakan').then((r) => {
            if (r?.success && r?.data?.total) {
              s.tunggakan.total = Number(r.data.total.total) || 0
              s.tunggakan.bayar = Number(r.data.total.bayar) || 0
              s.tunggakan.kurang = Number(r.data.total.kurang) ?? s.tunggakan.total - s.tunggakan.bayar
            }
          }).catch(() => {})
        ])
      } finally {
        setSummary(s)
        setLoading(false)
      }
    }

    run()
  }, [isOpen, idSantri])

  const totalKeseluruhan = {
    total: summary.pendaftaran.total + summary.uwaba.total + summary.khusus.total + summary.tunggakan.total,
    bayar: summary.pendaftaran.bayar + summary.uwaba.bayar + summary.khusus.bayar + summary.tunggakan.bayar,
    kurang: summary.pendaftaran.kurang + summary.uwaba.kurang + summary.khusus.kurang + summary.tunggakan.kurang
  }

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="riwayat-pembayaran-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10000]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="riwayat-pembayaran-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[10001] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="riwayat-pembayaran-santri-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 id="riwayat-pembayaran-santri-title" className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">
                Riwayat Pembayaran {namaSantri ? `— ${namaSantri}` : ''}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!idSantri ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Pilih santri untuk melihat riwayat pembayaran.</p>
              ) : loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 dark:border-teal-400 border-t-transparent" />
                </div>
              ) : (
                <>
                  <ul className="space-y-2">
                    {MENU_ITEMS.map((item) => {
                      const tot = summary[item.key] || defaultSummary()
                      const hideIfNoWajib = ['pendaftaran', 'khusus', 'tunggakan'].includes(item.key)
                      if (hideIfNoWajib && (Number(tot.total) || 0) === 0) return null
                      const description = item.descriptionBase
                        ? `${item.descriptionBase}${tahunAjaranList.length > 0 ? ` ${tahunAjaranList.join(', ')}` : ''}`
                        : item.description
                      const ket = labelKet(tot.total, tot.bayar, tot.kurang, formatCurrency)
                      return (
                        <li
                          key={item.key}
                          className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="block font-semibold text-gray-900 dark:text-white">{item.label}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0 text-right text-xs">
                            <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              Wajib {formatCurrency(tot.total)}
                            </span>
                            <span className="text-green-600 dark:text-green-400 whitespace-nowrap">
                              Bayar {formatCurrency(tot.bayar)}
                            </span>
                            <span className={`whitespace-nowrap ${ket.className}`}>{ket.label}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  <section className="mt-6 pt-4 border-t-2 border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Total keseluruhan
                    </h3>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600 p-3 text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Wajib</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums truncate" title={formatCurrency(totalKeseluruhan.total)}>
                          {formatCurrency(totalKeseluruhan.total)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600 p-3 text-center">
                        <p className="text-xs text-green-600 dark:text-green-400 mb-0.5">Bayar</p>
                        <p className="text-sm font-bold text-green-700 dark:text-green-300 tabular-nums truncate" title={formatCurrency(totalKeseluruhan.bayar)}>
                          {formatCurrency(totalKeseluruhan.bayar)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600 p-3 text-center">
                        {(() => {
                          const ket = labelKet(totalKeseluruhan.total, totalKeseluruhan.bayar, totalKeseluruhan.kurang, formatCurrency)
                          const boxLabel = ket.label.startsWith('Kurang') ? 'Kurang' : 'Status'
                          const displayValue = boxLabel === 'Kurang' ? ket.label.replace(/^Kurang\s+/, '') : ket.label
                          return (
                            <>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{boxLabel}</p>
                              <p className={`text-sm font-bold tabular-nums truncate ${ket.className}`}>{displayValue}</p>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
