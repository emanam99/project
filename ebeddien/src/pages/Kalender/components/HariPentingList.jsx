import { formatHijriDateDisplay } from '../../../components/PickDateHijri/PickDateHijri'
import { formatJamRangeLabel } from '../utils/hariPentingJam'

const BULAN_MASEHI = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_HIJRIYAH = ['Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir', 'Rajab', "Sya'ban", 'Ramadhan', 'Syawal', 'Dzulkaidah', 'Dzulhijjah']

function formatYmdMasehi(ymd) {
  if (!ymd || typeof ymd !== 'string') return ''
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ymd
  const y = m[1]
  const mo = Number(m[2])
  const d = Number(m[3])
  const namaBln = BULAN_MASEHI[mo - 1]
  return `${d} ${namaBln != null ? namaBln : mo} ${y}`
}

function formatTanggal(item, tab) {
  if (item.tipe === 'dari_sampai' && item.tanggal_dari && item.tanggal_sampai) {
    if (item.kategori === 'hijriyah') {
      return `${formatHijriDateDisplay(item.tanggal_dari)} – ${formatHijriDateDisplay(item.tanggal_sampai)}`
    }
    return `${formatYmdMasehi(item.tanggal_dari)} – ${formatYmdMasehi(item.tanggal_sampai)}`
  }
  const tgl = item.tanggal != null && item.tanggal !== '' ? Number(item.tanggal) : null
  const bln = item.bulan != null && item.bulan !== '' ? Number(item.bulan) : null
  const thn = item.tahun != null && item.tahun !== '' ? Number(item.tahun) : null
  if (tgl == null && bln == null && thn == null) return null
  const namaBulan = bln >= 1 && bln <= 12
    ? (tab === 'hijriyah' ? BULAN_HIJRIYAH[bln - 1] : BULAN_MASEHI[bln - 1])
    : ''
  const parts = []
  if (tgl != null) parts.push(tgl)
  if (namaBulan) parts.push(namaBulan)
  if (thn != null) parts.push(tab === 'hijriyah' ? `${thn} H` : thn)
  return parts.length ? parts.join(' ') : null
}

export default function HariPentingList({ list = [], loading = false, onRefresh, tab = 'hijriyah' }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500 dark:text-gray-400">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-teal-500 border-t-transparent" />
        <p className="text-sm font-medium">Memuat hari penting...</p>
      </div>
    )
  }

  if (!list.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
        <p className="text-sm">Tidak ada data hari penting untuk bulan ini.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {onRefresh && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 px-3 py-1.5 rounded-lg border border-teal-200 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
          >
            Segarkan
          </button>
        </div>
      )}
      <ul className="space-y-2.5 list-none p-0 m-0">
        {list.map((item) => {
          const tanggalLabel = formatTanggal(item, tab)
          const jamLabel = formatJamRangeLabel(item)
          return (
            <li
              key={item.id}
              className="flex items-stretch gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {item.warna_label && (
                <span
                  className="w-1.5 flex-shrink-0 min-h-full rounded-l-xl"
                  style={{ backgroundColor: item.warna_label || '#0d9488' }}
                  aria-hidden
                />
              )}
              <div className="flex-1 min-w-0 py-3.5 px-4">
                <div className="font-semibold text-gray-800 dark:text-gray-100">
                  {item.nama_event}
                </div>
                {(tanggalLabel || jamLabel) && (
                  <div className="mt-1 text-xs font-medium text-teal-600 dark:text-teal-400">
                    {[tanggalLabel, jamLabel].filter(Boolean).join(' · ')}
                  </div>
                )}
                {item.keterangan && (
                  <div className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-snug">
                    {item.keterangan}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
