import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { pembayaranAPI } from '../../../services/api'
import { formatCurrency } from '../../../utils/riwayatPembayaran'

const MENU_ITEMS = [
  { key: 'pendaftaran', path: '/santri/riwayat-pembayaran/pendaftaran', label: 'Pendaftaran', description: 'Riwayat pembayaran registrasi per tahun ajaran' },
  { key: 'uwaba', path: '/santri/riwayat-pembayaran/uwaba', label: 'UWABA', descriptionBase: 'Riwayat pembayaran UWABA' },
  { key: 'khusus', path: '/santri/riwayat-pembayaran/khusus', label: 'Khusus', description: 'Riwayat pembayaran khusus' },
  { key: 'tunggakan', path: '/santri/riwayat-pembayaran/tunggakan', label: 'Tunggakan', description: 'Riwayat pembayaran tunggakan' },
]

const defaultSummary = () => ({ total: 0, bayar: 0, kurang: 0 })

/** Status Ket: Belum (merah), Kurang Rp ... (amber), Lunas (hijau) */
function labelKet(wajib, bayar, kurang, formatCur) {
  const w = Number(wajib) || 0
  const b = Number(bayar) || 0
  const k = Number.isFinite(Number(kurang)) ? Number(kurang) : w - b
  if (w === 0) return { label: '—', className: 'text-gray-500 dark:text-gray-400' }
  if (b === 0) return { label: 'Belum', className: 'text-red-600 dark:text-red-400 font-medium' }
  if (k > 0) return { label: `Kurang ${formatCur(k)}`, className: 'text-amber-600 dark:text-amber-400' }
  return { label: 'Lunas', className: 'text-primary-600 dark:text-primary-400 font-medium' }
}

export default function RiwayatPembayaranIndex() {
  const { user } = useAuthStore()
  const idSantri = user?.santri_id || user?.id
  const [summary, setSummary] = useState({
    pendaftaran: defaultSummary(),
    uwaba: defaultSummary(),
    khusus: defaultSummary(),
    tunggakan: defaultSummary(),
  })
  const [tahunAjaranList, setTahunAjaranList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!idSantri) {
      setLoading(false)
      return
    }
    setLoading(true)
    const s = {
      pendaftaran: defaultSummary(),
      uwaba: defaultSummary(),
      khusus: defaultSummary(),
      tunggakan: defaultSummary(),
    }

    Promise.all([
      pembayaranAPI.getAllRegistrasiBySantri(idSantri).then((r) => {
        if (r.success && Array.isArray(r.data)) {
          r.data.forEach((row) => {
            const w = Number(row.wajib) || 0
            const b = Number(row.bayar) || 0
            s.pendaftaran.total += w
            s.pendaftaran.bayar += b
            s.pendaftaran.kurang += Number(row.kurang) ?? (w - b)
          })
        }
      }),
      pembayaranAPI.getUwabaTahunList().then((res) => {
        let list = res?.success && Array.isArray(res.data?.tahun_ajaran) ? res.data.tahun_ajaran : []
        if (list.length === 0) return pembayaranAPI.getTahunAjaranList().then((r) => (r?.success && Array.isArray(r.data?.tahun_hijriyah) ? r.data.tahun_hijriyah : []))
        return list
      }).then((list) => {
        const arr = Array.isArray(list) ? list : []
        setTahunAjaranList(arr)
        if (arr.length === 0) return Promise.resolve()
        return Promise.all(arr.map((tahun) => pembayaranAPI.getRincian(idSantri, 'uwaba', tahun))).then((results) => {
          results.forEach((r) => {
            if (r?.success && r?.data?.total) {
              s.uwaba.total += Number(r.data.total.total) || 0
              s.uwaba.bayar += Number(r.data.total.bayar) || 0
            }
          })
          s.uwaba.kurang = s.uwaba.total - s.uwaba.bayar
        })
      }),
      pembayaranAPI.getRincian(idSantri, 'khusus').then((r) => {
        if (r.success && r.data?.total) {
          s.khusus.total = Number(r.data.total.total) || 0
          s.khusus.bayar = Number(r.data.total.bayar) || 0
          s.khusus.kurang = Number(r.data.total.kurang) ?? s.khusus.total - s.khusus.bayar
        }
      }),
      pembayaranAPI.getRincian(idSantri, 'tunggakan').then((r) => {
        if (r.success && r.data?.total) {
          s.tunggakan.total = Number(r.data.total.total) || 0
          s.tunggakan.bayar = Number(r.data.total.bayar) || 0
          s.tunggakan.kurang = Number(r.data.total.kurang) ?? s.tunggakan.total - s.tunggakan.bayar
        }
      }),
    ])
      .catch(() => {})
      .finally(() => {
        setSummary(s)
        setLoading(false)
      })
  }, [idSantri])

  const totalKeseluruhan = {
    total: summary.pendaftaran.total + summary.uwaba.total + summary.khusus.total + summary.tunggakan.total,
    bayar: summary.pendaftaran.bayar + summary.uwaba.bayar + summary.khusus.bayar + summary.tunggakan.bayar,
    kurang: summary.pendaftaran.kurang + summary.uwaba.kurang + summary.khusus.kurang + summary.tunggakan.kurang,
  }

  if (!idSantri) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-gray-500 dark:text-gray-400">Anda harus login sebagai santri untuk melihat riwayat pembayaran.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-8">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 tracking-tight">Riwayat Pembayaran</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Pilih jenis pembayaran untuk melihat detail.</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 dark:border-primary-400 border-t-transparent" />
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
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className="flex items-center gap-3 sm:gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/90 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="block font-semibold text-gray-900 dark:text-white">{item.label}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-4 shrink-0 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Wajib {formatCurrency(tot.total)}</span>
                      <span className="text-xs text-primary-600 dark:text-primary-400 whitespace-nowrap">Bayar {formatCurrency(tot.bayar)}</span>
                      <span className={`text-xs whitespace-nowrap ${ket.className}`}>{ket.label}</span>
                    </div>
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>

          <section className="mt-8 pt-6 border-t-2 border-gray-200 dark:border-gray-600">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Total keseluruhan</h2>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div className="rounded-xl bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600 p-4 text-center shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Wajib</p>
                <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tabular-nums" title={formatCurrency(totalKeseluruhan.total)}>{formatCurrency(totalKeseluruhan.total)}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600 p-4 text-center shadow-sm">
                <p className="text-xs text-primary-600 dark:text-primary-400 mb-1">Bayar</p>
                <p className="text-base sm:text-lg font-bold text-primary-700 dark:text-primary-300 tabular-nums" title={formatCurrency(totalKeseluruhan.bayar)}>{formatCurrency(totalKeseluruhan.bayar)}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600 p-4 text-center shadow-sm">
                {(() => {
                  const ket = labelKet(totalKeseluruhan.total, totalKeseluruhan.bayar, totalKeseluruhan.kurang, formatCurrency)
                  const boxLabel = ket.label.startsWith('Kurang') ? 'Kurang' : 'Status'
                  const displayValue = boxLabel === 'Kurang' ? ket.label.replace(/^Kurang\s+/, '') : ket.label
                  return (
                    <>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{boxLabel}</p>
                      <p className={`text-base sm:text-lg font-bold ${ket.className}`}>{displayValue}</p>
                    </>
                  )
                })()}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
