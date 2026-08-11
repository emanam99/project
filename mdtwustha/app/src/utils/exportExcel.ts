import type {
  SantriRow,
  AbsenRekapRow,
  AbsenGuruRekapRow,
  JurnalRekapDetailRow,
  NilaiRekapRow,
  MapelRow,
  NilaiRekapTampil,
  SyahriahKhususRow,
} from '../api/apiClient'

async function loadXlsx() {
  return import('xlsx')
}

function cell(val: unknown): string | number {
  if (val === null || val === undefined || val === '') return '-'
  return typeof val === 'number' ? val : String(val)
}

function sanitizeFilenamePart(part: string) {
  return part.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'data'
}

function jenisKelaminLabel(jk?: string) {
  if (jk === 'L') return 'Laki-laki'
  if (jk === 'P') return 'Perempuan'
  return cell(jk)
}

export async function exportSantriToExcel(rows: SantriRow[]) {
  if (!rows.length) {
    throw new Error('Tidak ada data santri untuk diekspor')
  }

  const XLSX = await loadXlsx()

  const sheetRows = rows.map((row, index) => ({
    No: index + 1,
    'No. Induk': cell(row.nomer_induk),
    'Nama Lengkap': cell(row.nama),
    Kelas: cell(row.nama_kelas || row.kelas),
    Kel: cell(row.kelas_kel ?? row.kel),
    Kamar: cell(row.kamar),
    'No. KK': cell(row.no_kk),
    NIK: cell(row.nik),
    'Tempat Lahir': cell(row.tempat_lahir),
    'Tanggal Lahir': cell(row.tanggal_lahir),
    'Jenis Kelamin': jenisKelaminLabel(row.jenis_kelamin),
    Dusun: cell(row.dusun),
    RT: cell(row.rt),
    RW: cell(row.rw),
    Desa: cell(row.desa),
    Kecamatan: cell(row.kecamatan),
    Kabupaten: cell(row.kabupaten),
    Provinsi: cell(row.provinsi),
    'Nama Ayah': cell(row.ayah),
    'Nama Ibu': cell(row.ibu),
    'Saudara di Pesantren': cell(row.saudara_di_pesantren),
  }))

  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data Santri')
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Data_Santri_${date}.xlsx`)
}

export type ExportAbsenRekapOptions = {
  kelasLabel: string
  tanggalAwal: string
  tanggalAkhir: string
  hijriAwal?: string
  hijriAkhir?: string
  hariEfektif: number
  tampilanJam?: 'total' | 'terpisah'
}

export async function exportAbsenRekapToExcel(rows: AbsenRekapRow[], options: ExportAbsenRekapOptions) {
  if (!rows.length) {
    throw new Error('Tidak ada data rekap untuk diekspor')
  }

  const XLSX = await loadXlsx()
  const {
    kelasLabel,
    tanggalAwal,
    tanggalAkhir,
    hijriAwal,
    hijriAkhir,
    hariEfektif,
    tampilanJam = 'total',
  } = options

  const infoRows: (string | number)[][] = [
    ['Rekap Absensi Santri'],
    ['Kelas', kelasLabel],
    ['Periode Masehi', `${tanggalAwal} s/d ${tanggalAkhir}`],
  ]
  if (hijriAwal && hijriAkhir) {
    infoRows.push(['Periode Hijriyah', `${hijriAwal} s/d ${hijriAkhir}`])
  }
  infoRows.push(
    ['Jumlah hari', hariEfektif],
    ['Tampilan', tampilanJam === 'terpisah' ? 'Jam 1 & 2 terpisah' : 'Total semua'],
    []
  )

  const sumJam = (row: AbsenRekapRow) => ({
    H: (row.jam_1?.H ?? 0) + (row.jam_2?.H ?? 0),
    S: (row.jam_1?.S ?? 0) + (row.jam_2?.S ?? 0),
    I: (row.jam_1?.I ?? 0) + (row.jam_2?.I ?? 0),
    A: (row.jam_1?.A ?? 0) + (row.jam_2?.A ?? 0),
  })

  let headerRow: (string | number)[]
  let dataRows: (string | number)[][]

  if (tampilanJam === 'terpisah') {
    headerRow = [
      'No',
      'No. Induk',
      'Nama',
      'J1 Hadir',
      'J1 Sakit',
      'J1 Izin',
      'J1 Alpa',
      'J2 Hadir',
      'J2 Sakit',
      'J2 Izin',
      'J2 Alpa',
    ]
    dataRows = rows.map((row, index) => [
      index + 1,
      cell(row.nomer_induk),
      cell(row.nama),
      row.jam_1.H,
      row.jam_1.S,
      row.jam_1.I,
      row.jam_1.A,
      row.jam_2.H,
      row.jam_2.S,
      row.jam_2.I,
      row.jam_2.A,
    ])
  } else {
    headerRow = ['No', 'No. Induk', 'Nama', 'Hadir', 'Sakit', 'Izin', 'Alpa']
    dataRows = rows.map((row, index) => {
      const t = sumJam(row)
      return [index + 1, cell(row.nomer_induk), cell(row.nama), t.H, t.S, t.I, t.A]
    })
  }

  const aoa = [...infoRows, headerRow, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absensi')

  const kelasPart = sanitizeFilenamePart(kelasLabel)
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Rekap_Absensi_${kelasPart}_${tanggalAwal}_${tanggalAkhir}_${date}.xlsx`)
}

const JURNAL_STATUS_LABEL: Record<string, string> = {
  mengajar: 'Mengajar',
  ijin: 'Izin',
  sakit: 'Sakit',
}

const JAM_LABEL: Record<string, string> = {
  jam_1: 'Jam 1',
  jam_2: 'Jam 2',
}

export type ExportGuruRekapOptions = {
  kelasLabel: string
  tanggalAwal: string
  tanggalAkhir: string
  hijriAwal?: string
  hijriAkhir?: string
  hariEfektif: number
  tampilanJam?: 'total' | 'terpisah'
}

export async function exportAbsenGuruRekapToExcel(rows: AbsenGuruRekapRow[], options: ExportGuruRekapOptions) {
  if (!rows.length) {
    throw new Error('Tidak ada data rekap untuk diekspor')
  }

  const XLSX = await loadXlsx()
  const {
    kelasLabel,
    tanggalAwal,
    tanggalAkhir,
    hijriAwal,
    hijriAkhir,
    hariEfektif,
    tampilanJam = 'total',
  } = options

  const infoRows: (string | number)[][] = [
    ['Rekap Absen Guru (dari Jurnal Mengajar)'],
    ['Kelas', kelasLabel],
    ['Periode Masehi', `${tanggalAwal} s/d ${tanggalAkhir}`],
  ]
  if (hijriAwal && hijriAkhir) {
    infoRows.push(['Periode Hijriyah', `${hijriAwal} s/d ${hijriAkhir}`])
  }
  infoRows.push(
    ['Jumlah hari', hariEfektif],
    ['Tampilan', tampilanJam === 'terpisah' ? 'Jam 1 & 2 terpisah' : 'Total semua'],
    []
  )

  const sumCounts = (j1: AbsenGuruRekapRow['jam_1'], j2: AbsenGuruRekapRow['jam_2']) => ({
    mengajar: j1.mengajar + j2.mengajar,
    ijin: j1.ijin + j2.ijin,
    sakit: j1.sakit + j2.sakit,
  })

  let headerRow: (string | number)[]
  let dataRows: (string | number)[][]
  let footerRow: (string | number)[]

  const grand = rows.reduce(
    (acc, row) => {
      acc.j1.mengajar += row.jam_1.mengajar
      acc.j1.ijin += row.jam_1.ijin
      acc.j1.sakit += row.jam_1.sakit
      acc.j2.mengajar += row.jam_2.mengajar
      acc.j2.ijin += row.jam_2.ijin
      acc.j2.sakit += row.jam_2.sakit
      const total = row.total ?? sumCounts(row.jam_1, row.jam_2)
      acc.total.mengajar += total.mengajar
      acc.total.ijin += total.ijin
      acc.total.sakit += total.sakit
      return acc
    },
    {
      j1: { mengajar: 0, ijin: 0, sakit: 0 },
      j2: { mengajar: 0, ijin: 0, sakit: 0 },
      total: { mengajar: 0, ijin: 0, sakit: 0 },
    }
  )

  if (tampilanJam === 'terpisah') {
    headerRow = [
      'No',
      'Nama Guru',
      'J1 Mengajar',
      'J1 Izin',
      'J1 Sakit',
      'J2 Mengajar',
      'J2 Izin',
      'J2 Sakit',
    ]
    dataRows = rows.map((row, index) => [
      index + 1,
      cell(row.pengurus_nama),
      row.jam_1.mengajar,
      row.jam_1.ijin,
      row.jam_1.sakit,
      row.jam_2.mengajar,
      row.jam_2.ijin,
      row.jam_2.sakit,
    ])
    footerRow = [
      '',
      'Total keseluruhan',
      grand.j1.mengajar,
      grand.j1.ijin,
      grand.j1.sakit,
      grand.j2.mengajar,
      grand.j2.ijin,
      grand.j2.sakit,
    ]
  } else {
    headerRow = ['No', 'Nama Guru', 'Mengajar', 'Izin', 'Sakit']
    dataRows = rows.map((row, index) => {
      const total = row.total ?? sumCounts(row.jam_1, row.jam_2)
      return [index + 1, cell(row.pengurus_nama), total.mengajar, total.ijin, total.sakit]
    })
    footerRow = ['', 'Total keseluruhan', grand.total.mengajar, grand.total.ijin, grand.total.sakit]
  }

  const aoa = [...infoRows, headerRow, ...dataRows, footerRow]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Absen Guru')

  const kelasPart = sanitizeFilenamePart(kelasLabel)
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Rekap_Absen_Guru_${kelasPart}_${tanggalAwal}_${tanggalAkhir}_${date}.xlsx`)
}

export async function exportJurnalRekapToExcel(rows: JurnalRekapDetailRow[], options: ExportGuruRekapOptions) {
  if (!rows.length) {
    throw new Error('Tidak ada data jurnal untuk diekspor')
  }

  const XLSX = await loadXlsx()
  const { kelasLabel, tanggalAwal, tanggalAkhir, hijriAwal, hijriAkhir, hariEfektif } = options

  const infoRows: (string | number)[][] = [
    ['Rekap Jurnal Mengajar'],
    ['Filter Kelas', kelasLabel],
    ['Periode Masehi', `${tanggalAwal} s/d ${tanggalAkhir}`],
  ]
  if (hijriAwal && hijriAkhir) {
    infoRows.push(['Periode Hijriyah', `${hijriAwal} s/d ${hijriAkhir}`])
  }
  infoRows.push(['Jumlah hari', hariEfektif], [])

  const headerRow = ['No', 'Tanggal', 'Kelas', 'Kel', 'Jam', 'Guru', 'Status', 'Fan', 'Kitab', 'Musonnif', 'Dari', 'Sampai', 'Deskripsi Materi', 'Alasan']

  const dataRows = rows.map((row, index) => [
    index + 1,
    cell(row.tanggal),
    cell(row.nama_kelas),
    cell(row.kel),
    JAM_LABEL[row.jam] || row.jam,
    cell(row.pengurus_nama),
    JURNAL_STATUS_LABEL[row.status] || row.status,
    cell(row.mapel_fan),
    cell(row.mapel_kitab),
    cell(row.mapel_musonnif),
    cell(row.mapel_dari),
    cell(row.mapel_sampai),
    cell(row.deskripsi || row.pelajaran),
    cell(row.alasan),
  ])

  const aoa = [...infoRows, headerRow, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Jurnal')

  const kelasPart = sanitizeFilenamePart(kelasLabel)
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Rekap_Jurnal_${kelasPart}_${tanggalAwal}_${tanggalAkhir}_${date}.xlsx`)
}

export type ExportNilaiRekapOptions = {
  kelasLabel: string
  tanggalAwal: string
  tanggalAkhir: string
  hijriAwal?: string
  hijriAkhir?: string
  tampil: NilaiRekapTampil
  mapel: MapelRow[]
}

function formatMapelHeader(m: MapelRow) {
  const fan = m.fan || ''
  const kitab = m.kitab_nama || ''
  let label = fan && kitab ? `${fan} — ${kitab}` : fan || kitab || `Mapel ${m.id}`
  if (m.dari || m.sampai) label += ` (${m.dari || '…'}–${m.sampai || '…'})`
  return label
}

function rowNilaiStats(row: NilaiRekapRow, mapel: MapelRow[]) {
  const values: number[] = []
  for (const m of mapel) {
    const v = row.cells?.[m.id]?.nilai
    if (v !== null && v !== undefined && !Number.isNaN(v)) values.push(v)
  }
  const sum = values.reduce((a, b) => a + b, 0)
  const avg = values.length ? Math.round((sum / values.length) * 100) / 100 : null
  return { sum: values.length ? Math.round(sum * 100) / 100 : null, avg, count: values.length }
}

export async function exportNilaiRekapToExcel(rows: NilaiRekapRow[], options: ExportNilaiRekapOptions) {
  if (!rows.length) {
    throw new Error('Tidak ada data rekap untuk diekspor')
  }

  const XLSX = await loadXlsx()
  const { kelasLabel, tanggalAwal, tanggalAkhir, hijriAwal, hijriAkhir, tampil, mapel } = options
  const showNilai = tampil === 'nilai' || tampil === 'keduanya'
  const showAbsen = tampil === 'absen' || tampil === 'keduanya'
  const showKelas = rows.some((r) => r.kelas_id)

  const tampilLabel =
    tampil === 'nilai' ? 'Nilai saja' : tampil === 'absen' ? 'Absen saja' : 'Nilai & Absen'

  const infoRows: (string | number)[][] = [
    ['Rekap Nilai'],
    ['Kelas', kelasLabel],
    ['Periode Masehi', `${tanggalAwal} s/d ${tanggalAkhir}`],
  ]
  if (hijriAwal && hijriAkhir) {
    infoRows.push(['Periode Hijriyah', `${hijriAwal} s/d ${hijriAkhir}`])
  }
  infoRows.push(['Tampilan', tampilLabel], [])

  const headerRow: (string | number)[] = ['No']
  if (showKelas) headerRow.push('Kelas')
  headerRow.push('No. Induk', 'Nama')
  for (const m of mapel) {
    const label = formatMapelHeader(m)
    if (tampil === 'keduanya') {
      headerRow.push(`${label} · Nilai`, `${label} · Absen`)
    } else if (tampil === 'absen') {
      headerRow.push(`${label} · Absen`)
    } else {
      headerRow.push(label)
    }
  }
  if (showNilai) {
    headerRow.push('Total', 'Rata-rata')
  }

  const dataRows = rows.map((row, index) => {
    const out: (string | number)[] = [index + 1]
    if (showKelas) {
      out.push(row.kel ? `${row.nama_kelas || ''} · ${row.kel}` : cell(row.nama_kelas))
    }
    out.push(cell(row.nomer_induk), cell(row.nama))
    for (const m of mapel) {
      const c = row.cells?.[m.id] ?? null
      if (tampil === 'nilai') {
        out.push(c?.nilai ?? '-')
      } else if (tampil === 'absen') {
        out.push(c?.absen ?? '-')
      } else {
        out.push(c?.nilai ?? '-', c?.absen ?? '-')
      }
    }
    if (showNilai) {
      const stats = rowNilaiStats(row, mapel)
      out.push(stats.sum ?? '-', stats.avg ?? '-')
    }
    return out
  })

  const aoa = [...infoRows, headerRow, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Nilai')

  const kelasPart = sanitizeFilenamePart(kelasLabel)
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Rekap_Nilai_${kelasPart}_${tanggalAwal}_${tanggalAkhir}_${date}.xlsx`)
}

function khususStatusLabel(row: SyahriahKhususRow) {
  if (row.lunas) return 'Lunas'
  if (row.sudah_bayar) return 'Kurang'
  return 'Belum'
}

export async function exportSyahriahKhususToExcel(
  rows: SyahriahKhususRow[],
  opts?: { tahunAjaranLabel?: string }
) {
  if (!rows.length) {
    throw new Error('Tidak ada data pembayaran khusus untuk diekspor')
  }

  const XLSX = await loadXlsx()
  const sheetRows = rows.map((row, index) => {
    const kelas = [row.nama_kelas, row.kel].filter(Boolean).join(' · ')
    return {
      No: index + 1,
      'No. Induk': cell(row.nomer_induk),
      Santri: cell(row.nama_santri),
      Kelas: cell(kelas),
      Nama: cell(row.nama),
      Nominal: Number(row.nominal) || 0,
      Terbayar: Number(row.total_bayar) || 0,
      Sisa: Number(row.sisa) || 0,
      'Terakhir pembayaran': cell(row.terakhir_pembayaran),
      Status: khususStatusLabel(row),
      Keterangan: cell(row.keterangan),
    }
  })

  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pembayaran Khusus')
  const date = new Date().toISOString().slice(0, 10)
  const taPart = sanitizeFilenamePart(opts?.tahunAjaranLabel || 'TA')
  XLSX.writeFile(wb, `Pembayaran_Khusus_${taPart}_${date}.xlsx`)
}
