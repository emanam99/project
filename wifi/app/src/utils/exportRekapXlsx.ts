import type { RekapData, RekapItem } from '../api/apiClient'
import { labelPeriode } from './tagihanSettings'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function statusLabel(row: RekapItem): string {
  return row.lunas ? 'Lunas' : 'Belum lunas'
}

/** Ekspor rekap periode ke file .xlsx (Excel). */
export async function exportRekapXlsx(opts: {
  data: RekapData
  bulan: number
  tahun: number
  statusFilter: 'all' | 'lunas' | 'belum'
}): Promise<void> {
  const XLSX = await import('xlsx')
  const { data, bulan, tahun, statusFilter } = opts
  const periode = labelPeriode(bulan, tahun)
  const items = data.items
  const s = data.summary

  const statusFilterLabel =
    statusFilter === 'lunas' ? 'Lunas' : statusFilter === 'belum' ? 'Belum lunas' : 'Semua'

  const sheetRows: Record<string, string | number>[] = items.map((row, i) => ({
    No: i + 1,
    Pelanggan: row.nama_pelanggan || '',
    'No. HP': row.no_hp || '',
    Paket: row.paket || '',
    'Jml Tagihan': row.jumlah_tagihan,
    Periode: periode,
    Kewajiban: row.nominal,
    Terbayar: row.total_bayar,
    Sisa: row.sisa,
    Status: statusLabel(row),
    'Jatuh tempo': row.jatuh_tempo || '',
  }))

  const summaryRows: Record<string, string | number>[] = [
    { Keterangan: 'Periode', Nilai: periode },
    { Keterangan: 'Filter status', Nilai: statusFilterLabel },
    { Keterangan: 'Jumlah pelanggan', Nilai: s.jumlah_pelanggan ?? items.length },
    { Keterangan: 'Jumlah tagihan', Nilai: s.jumlah_tagihan },
    { Keterangan: 'Lunas', Nilai: s.jumlah_lunas },
    { Keterangan: 'Belum lunas', Nilai: s.jumlah_belum },
    { Keterangan: 'Total kewajiban', Nilai: s.total_kewajiban },
    { Keterangan: 'Total terbayar', Nilai: s.total_terbayar },
    { Keterangan: 'Total sisa', Nilai: s.total_sisa },
    {
      Keterangan: 'Diekspor',
      Nilai: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
    },
  ]

  const wb = XLSX.utils.book_new()
  const wsData = XLSX.utils.json_to_sheet(sheetRows)
  wsData['!cols'] = [
    { wch: 5 },
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsData, 'Rekap')

  const wsSum = XLSX.utils.json_to_sheet(summaryRows)
  wsSum['!cols'] = [{ wch: 20 }, { wch: 28 }]
  XLSX.utils.book_append_sheet(wb, wsSum, 'Ringkasan')

  const safePeriode = periode.replace(/\s+/g, '-').replace(/[^\w.-]+/g, '')
  const filename = `rekap-wifi-${safePeriode || `${tahun}-${bulan}`}.xlsx`
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}
