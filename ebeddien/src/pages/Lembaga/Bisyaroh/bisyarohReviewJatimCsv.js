import { parseNominalToInteger } from './bisyarohReviewExportExcel'

export const JATIM_CSV_DEFAULTS = {
  sourceAccount: '1581600000',
  paymentLabel: 'Bisyaroh',
  orgName: 'AL UTSMANI',
  email: 'alutsmanipps@gmail.com'
}

const NAMA_BULAN_MASEHI = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
]

const NAMA_BULAN_HIJRIYAH = [
  'Muharram',
  'Shafar',
  'Rabiul Awal',
  'Rabiul Akhir',
  'Jumadil Ula',
  'Jumadil Akhir',
  'Rajab',
  "Sya'ban",
  'Ramadhan',
  'Syawal',
  "Dzul Qo'dah",
  'Dzul Hijjah'
]

/** Bulat ke bawah — desimal nominal diabaikan (sen = 00). */
export function floorNominalToInteger(raw, fallbackDisplay = '') {
  const toFloor = (n) => {
    if (!Number.isFinite(n)) return 0
    return Math.floor(Math.abs(n)) * (n < 0 ? -1 : 1)
  }

  const parseFloatNominal = (val) => {
    if (val === null || val === undefined) return null
    if (typeof val === 'number') return Number.isFinite(val) ? val : null
    let s = String(val).trim()
    if (s === '' || s === '—' || s === '-') return null
    s = s.replace(/^Rp\.?\s*/i, '').replace(/\s/g, '').replace(/%$/, '').trim()
    if (s === '') return null

    const hasComma = s.includes(',')
    const hasDot = s.includes('.')
    if (hasComma && hasDot) {
      const lastComma = s.lastIndexOf(',')
      const lastDot = s.lastIndexOf('.')
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.')
      } else {
        s = s.replace(/,/g, '')
      }
    } else if (hasComma) {
      const parts = s.split(',')
      if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
        s = parts[0].replace(/\./g, '') + '.' + parts[1]
      } else {
        s = s.replace(/,/g, '')
      }
    } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '')
    }

    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  let n = parseFloatNominal(raw)
  if (n === null && fallbackDisplay !== '' && fallbackDisplay != null) {
    n = parseFloatNominal(fallbackDisplay)
  }
  if (n === null) {
    const fromInt = parseNominalToInteger(raw)
    if (fromInt !== '') return toFloor(fromInt)
    return 0
  }
  return toFloor(n)
}

export function formatJatimPeriodeLabel(periodeBulan, periodeKalender) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodeBulan || ''))
  if (!m) return periodeBulan || 'Bisyaroh'
  const idx = Number(m[2]) - 1
  const name =
    periodeKalender === 'hijriyah'
      ? NAMA_BULAN_HIJRIYAH[idx] || m[2]
      : NAMA_BULAN_MASEHI[idx] || m[2]
  return String(name).replace(/['\s]+/g, '')
}

function rowTransferNominal(row) {
  return floorNominalToInteger(row.total_nominal)
}

function sanitizeRekening(raw) {
  return String(raw || '')
    .replace(/\D/g, '')
    .trim()
}

export function sanitizeJatimNama(raw) {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function csvEscapeField(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildCsvLine(fields) {
  return fields.map(csvEscapeField).join(',')
}

function sanitizeFilenamePart(s) {
  return String(s || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48)
}

/**
 * Export CSV upload Bank Jatim (format file upload.csv).
 *
 * Baris 1: rekening sumber, total nominal, jumlah baris.
 * Baris data: rekening tujuan, nama, nominal, Bisyaroh, periode, organisasi, email.
 */
export function exportBisyarohReviewJatimCsv({
  sections = [],
  lembagaNama = '',
  lembagaId = '',
  periodeBulan = '',
  periodeKalender = 'masehi',
  jatimOptions = {},
  disabledRowKeys = null
}) {
  if (!sections.length) {
    throw new Error('Tidak ada data rekap untuk diekspor')
  }

  const opts = { ...JATIM_CSV_DEFAULTS, ...jatimOptions }
  const periodeLabel = formatJatimPeriodeLabel(periodeBulan, periodeKalender)

  const disabled = disabledRowKeys instanceof Set ? disabledRowKeys : null

  const dataRows = []
  for (const sec of sections) {
    for (const row of sec.rows || []) {
      if (disabled?.has(`${sec.bisyaroh_id}:${row.id_pengurus}`)) continue

      const rekening = sanitizeRekening(row.rekening_jatim)
      if (!rekening) continue

      const nominal = rowTransferNominal(row)
      if (nominal <= 0) continue

      const nama = sanitizeJatimNama(row.pengurus_nama)
      if (!nama) continue

      dataRows.push([
        rekening,
        nama,
        String(nominal),
        opts.paymentLabel,
        periodeLabel,
        opts.orgName,
        opts.email
      ])
    }
  }

  if (dataRows.length === 0) {
    throw new Error('Tidak ada baris dengan rekening Jatim dan nominal valid untuk CSV upload')
  }

  const totalNominal = dataRows.reduce((acc, r) => acc + Number(r[2] || 0), 0)
  const lines = [
    buildCsvLine([opts.sourceAccount, String(totalNominal), String(dataRows.length)]),
    ...dataRows.map((r) => buildCsvLine(r))
  ]

  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const lembagaPart = sanitizeFilenamePart(lembagaNama || lembagaId || 'Lembaga')
  const kalPart = periodeKalender === 'hijriyah' ? 'Hijriyah' : 'Masehi'
  const datePart = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `Bisyaroh_Jatim_${lembagaPart}_${periodeBulan || 'periode'}_${kalPart}_${datePart}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return { rowCount: dataRows.length, totalNominal }
}
