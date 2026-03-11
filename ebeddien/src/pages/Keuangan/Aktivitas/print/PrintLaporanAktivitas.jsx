import { useMemo } from 'react'
import { getGambarUrl } from '../../../../config/images'
import './PrintLaporanAktivitas.css'

const getMonthName = (month) => {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  return months[month - 1] || ''
}

const getHijriyahMonthName = (month) => {
  const months = [
    'Muharram', 'Shafar', 'Rabiul Awal', 'Rabiul Akhir',
    'Jumadil Ula', 'Jumadil Akhir', 'Rajab', "Sya'ban",
    'Ramadhan', 'Syawal', "Dzul Qo'dah", 'Dzul Hijjah'
  ]
  return months[month - 1] || ''
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount || 0)
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Format hijriyah dari backend (1447-12-23 atau 1447-12-23 10.10.11) jadi tampilan singkat */
function formatHijriyahShort(hijriyahStr) {
  if (!hijriyahStr) return '-'
  const datePart = String(hijriyahStr).trim().substring(0, 10)
  const parts = datePart.split('-')
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return hijriyahStr
}

/**
 * Group aktivitas by date (tanggal_dibuat date only), sort dates ascending.
 * For each day compute: asal (saldo awal hari), pemasukan, pengeluaran, sisa.
 */
function groupByDayWithSaldo(aktivitas, saldoAwalBulan) {
  if (!aktivitas || aktivitas.length === 0) return []

  const byDate = {}
  aktivitas.forEach((item) => {
    const dateKey = new Date(item.tanggal_dibuat).toISOString().split('T')[0]
    if (!byDate[dateKey]) byDate[dateKey] = []
    byDate[dateKey].push(item)
  })

  const dates = Object.keys(byDate).sort()
  let runningSisa = saldoAwalBulan

  return dates.map((dateKey) => {
    const items = byDate[dateKey]
    const asal = runningSisa
    const pemasukan = items
      .filter((i) => i.tipe === 'pemasukan')
      .reduce((sum, i) => sum + (parseFloat(i.nominal) || 0), 0)
    const pengeluaran = items
      .filter((i) => i.tipe === 'pengeluaran')
      .reduce((sum, i) => sum + (parseFloat(i.nominal) || 0), 0)
    const sisa = asal + pemasukan - pengeluaran
    runningSisa = sisa
    const firstHijriyah = items.find((i) => i.hijriyah)?.hijriyah || null
    return {
      dateKey,
      dateLabel: formatDateOnly(dateKey + 'T12:00:00'),
      dateLabelHijriyah: firstHijriyah ? formatHijriyahShort(firstHijriyah) : null,
      asal,
      pemasukan,
      pengeluaran,
      sisa,
      items
    }
  })
}

function PrintLaporanAktivitas({ aktivitas = [], saldo = {}, monthLabel = '', useHijriyah = false, hijriyahMonthLabel = '', fontSize }) {
  const saldoAwal = parseFloat(saldo.saldo_awal) || 0
  const dayGroups = useMemo(
    () => groupByDayWithSaldo(aktivitas, saldoAwal),
    [aktivitas, saldoAwal]
  )

  const title = useHijriyah && hijriyahMonthLabel
    ? `Laporan Aktivitas ${hijriyahMonthLabel}`
    : `Laporan Aktivitas ${monthLabel}`

  const rootFontSize = fontSize != null && fontSize >= 6 && fontSize <= 18 ? { fontSize: `${fontSize}px` } : undefined

  return (
    <div className="print-laporan-aktivitas" style={rootFontSize}>
      <div className="print-laporan-aktivitas-header">
        <img src={getGambarUrl('/icon/icon192.png')} alt="Logo" className="print-laporan-aktivitas-logo" />
      </div>
      <div className="print-laporan-aktivitas-title">{title}</div>

      {dayGroups.length === 0 ? (
        <div className="print-laporan-aktivitas-empty">Tidak ada aktivitas untuk periode ini.</div>
      ) : (
        dayGroups.map((day, index) => (
          <div
            key={day.dateKey}
            className="print-day-page"
            style={{ breakAfter: index < dayGroups.length - 1 ? 'page' : 'auto' }}
          >
            <div className="print-day-pagenum">{index + 1}</div>
            <div className="print-day-header">
              <div className="print-day-title">
                Tanggal: {day.dateLabel}
                {day.dateLabelHijriyah && (
                  <span className="print-day-hijriyah"> (Hijriyah: {day.dateLabelHijriyah})</span>
                )}
              </div>
              <div className="print-day-summary-wrap">
                <table className="print-day-summary" cellPadding={0} cellSpacing={0}>
                  <thead>
                    <tr>
                      <th>Asal (Saldo Awal)</th>
                      <th>Pemasukan</th>
                      <th>Pengeluaran</th>
                      <th>Sisa (Saldo Akhir)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{formatCurrency(day.asal)}</td>
                      <td className="text-green">{formatCurrency(day.pemasukan)}</td>
                      <td className="text-red">{formatCurrency(day.pengeluaran)}</td>
                      <td>{formatCurrency(day.sisa)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="print-day-body">
              <table className="print-day-items" cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Tipe</th>
                    <th>Keterangan</th>
                    <th>Kategori</th>
                    <th>Lembaga</th>
                    <th>Hijriyah</th>
                    <th className="text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {day.items.map((item, i) => (
                    <tr key={`${item.tipe}-${item.id}-${i}`}>
                      <td>{i + 1}</td>
                      <td className="print-tipe-cell">
                        {item.tipe === 'pemasukan' ? (
                          <span className="print-tipe-icon print-tipe-pemasukan" title="Pemasukan">
                            <svg className="print-tipe-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                          </span>
                        ) : (
                          <span className="print-tipe-icon print-tipe-pengeluaran" title="Pengeluaran">
                            <svg className="print-tipe-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 7V3" />
                            </svg>
                          </span>
                        )}
                      </td>
                      <td>{item.keterangan || '-'}</td>
                      <td>{item.kategori || '-'}</td>
                      <td>{item.lembaga || '-'}</td>
                      <td>{formatHijriyahShort(item.hijriyah)}</td>
                      <td className="text-right">
                        <span className={item.tipe === 'pemasukan' ? 'text-green' : 'text-red'}>
                          {item.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(item.nominal)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default PrintLaporanAktivitas
export { getMonthName, getHijriyahMonthName, formatCurrency, formatDateOnly }
