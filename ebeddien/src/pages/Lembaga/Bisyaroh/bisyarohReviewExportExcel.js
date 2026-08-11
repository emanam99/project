import * as XLSX from 'xlsx'
import { isBisyarohCheckboxTruthy } from './bisyarohKolomTipe'

function sanitizeFilenamePart(s) {
  return String(s || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48)
}

function sanitizeSheetName(name, used) {
  let base = String(name || 'Sheet')
    .replace(/[\\/*?:\[\]]/g, ' ')
    .trim()
    .slice(0, 28)
  if (!base) base = 'Sheet'
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    const suffix = ` ${n}`
    candidate = base.slice(0, 31 - suffix.length) + suffix
    n += 1
  }
  used.add(candidate)
  return candidate
}

/**
 * Ubah teks/angka ke bilangan bulat untuk Excel (tanpa titik/koma pemisah).
 * Mendukung: 1500000, 1.500.000, Rp 1.500.000, 1.234,56, dll.
 * @returns {number|string} angka bulat, atau '' jika kosong/tidak valid
 */
export function parseNominalToInteger(raw) {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return ''
    return Math.round(raw)
  }
  let s = String(raw).trim()
  if (s === '' || s === '—' || s === '-') return ''
  s = s.replace(/^Rp\.?\s*/i, '').replace(/\s/g, '').replace(/%$/, '').trim()
  if (s === '') return ''

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
  if (!Number.isFinite(n)) return ''
  return Math.round(n)
}

/** @returns {boolean} */
function isNumericExportTipe(tipe) {
  return tipe === 'rupiah' || tipe === 'angka' || tipe === 'persen'
}

/**
 * Nilai uang/angka untuk sel Excel: selalu bilangan bulat atau kosong.
 * @returns {number|string}
 */
function exportMoneyValue(raw, fallbackDisplay = '') {
  const fromRaw = parseNominalToInteger(raw)
  if (fromRaw !== '') return fromRaw
  if (fallbackDisplay !== '' && fallbackDisplay != null) {
    const fromDisplay = parseNominalToInteger(fallbackDisplay)
    if (fromDisplay !== '') return fromDisplay
  }
  return ''
}

function exportCellValue(row, k) {
  const tipe = k.input_tipe || 'angka'

  if (k.kind === 'input') {
    const v = row.inputs?.[k.col_key]
    if (tipe === 'checkbox') {
      return isBisyarohCheckboxTruthy(v) ? 1 : 0
    }
    if (tipe === 'teks') {
      return v === '' || v == null ? '' : String(v)
    }
    if (isNumericExportTipe(tipe)) {
      const cell = (row.cells || []).find((x) => x.col_key === k.col_key)
      return exportMoneyValue(
        cell?.nilai_nominal != null ? cell.nilai_nominal : v,
        cell?.nilai_tampil
      )
    }
    return v === '' || v == null ? '' : String(v)
  }

  const c = (row.cells || []).find((x) => x.col_key === k.col_key)
  if (!c) return ''
  if (c.error) return c.nilai_tampil || c.error_code || '#N/A'

  const cellTipe = c.input_tipe || tipe
  if (cellTipe === 'teks') {
    return c.nilai_tampil && c.nilai_tampil !== '—' ? String(c.nilai_tampil) : ''
  }
  if (isNumericExportTipe(cellTipe)) {
    return exportMoneyValue(c.nilai_nominal, c.nilai_tampil)
  }
  return c.nilai_tampil && c.nilai_tampil !== '—' ? String(c.nilai_tampil) : ''
}

/** Paksa kolom teks (NIP, rekening) agar Excel tidak mengubah ke notasi ilmiah. */
function applyTextColumnTypes(ws, textColIndexes = [0, 1]) {
  const ref = ws['!ref']
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  for (let r = 1; r <= range.e.r; r += 1) {
    for (const c of textColIndexes) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[addr]
      if (!cell || cell.v === '' || cell.v == null) continue
      cell.t = 's'
      cell.v = String(cell.v)
      cell.z = '@'
    }
  }
}

function bisyarohSetLabel(section) {
  const nama = (section?.bisyaroh_nama || '').trim()
  if (nama) return nama
  const id = section?.bisyaroh_id
  return id != null ? `Set #${id}` : ''
}

function buildSectionSheetAoa(section) {
  const kolom = section.kolom || []
  const setLabel = bisyarohSetLabel(section)
  const headers = [
    'NIP',
    'Rekening Jatim',
    'Pengurus',
    'Bisyaroh',
    ...kolom.map((k) => k.label || k.col_key),
    'Total',
    'Potong UWABA',
    'Keterangan potong',
    'Catatan'
  ]
  const aoa = [headers]
  for (const row of section.rows || []) {
    aoa.push([
      row.nip != null && row.nip !== '' ? String(row.nip) : '',
      row.rekening_jatim != null && row.rekening_jatim !== '' ? String(row.rekening_jatim) : '',
      row.pengurus_nama ?? '',
      setLabel,
      ...kolom.map((k) => exportCellValue(row, k)),
      (() => {
        const t = exportMoneyValue(row.total_nominal)
        return t !== '' ? t : 0
      })(),
      row.potong_uwaba?.terpotong_total != null
        ? exportMoneyValue(row.potong_uwaba.terpotong_total)
        : '',
      row.potong_uwaba?.keterangan ?? '',
      (row.catatan || '').trim()
    ])
  }
  const subtotal = exportMoneyValue(section.subtotal_nominal)
  if ((section.rows || []).length > 0) {
    aoa.push([])
    aoa.push([
      'Subtotal',
      '',
      '',
      '',
      ...kolom.map(() => ''),
      subtotal !== '' ? subtotal : 0,
      '',
      '',
      ''
    ])
  }
  return aoa
}

/**
 * Export data tab Review ke file .xlsx (satu sheet per set rekap).
 *
 * @param {object} opts
 * @param {Array} opts.sections
 * @param {string} [opts.lembagaNama]
 * @param {string} [opts.lembagaId]
 * @param {string} [opts.periodeBulan]
 * @param {string} [opts.periodeKalender]
 * @param {number} [opts.grandTotal]
 * @param {boolean} [opts.showGrandTotal]
 */
export function exportBisyarohReviewToExcel({
  sections = [],
  lembagaNama = '',
  lembagaId = '',
  periodeBulan = '',
  periodeKalender = 'masehi',
  grandTotal = 0,
  showGrandTotal = false
}) {
  if (!sections.length) {
    throw new Error('Tidak ada data rekap untuk diekspor')
  }
  const wb = XLSX.utils.book_new()
  const usedNames = new Set()

  const infoRows = [
    ['Bisyaroh — Preview / Review'],
    ['Lembaga', lembagaNama || lembagaId || '—'],
    ['Periode', periodeBulan || '—'],
    ['Kalender', periodeKalender === 'hijriyah' ? 'Hijriyah' : 'Masehi'],
    ['Diekspor', new Date().toLocaleString('id-ID')]
  ]
  if (showGrandTotal) {
    const gt = exportMoneyValue(grandTotal)
    infoRows.push(['Total keseluruhan', gt !== '' ? gt : 0])
  }
  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows)
  XLSX.utils.book_append_sheet(wb, wsInfo, sanitizeSheetName('Info', usedNames))

  for (const sec of sections) {
    const aoa = buildSectionSheetAoa(sec)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    applyTextColumnTypes(ws, [0, 1])
    const label = sec.bisyaroh_nama || `Set_${sec.bisyaroh_id}`
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(label, usedNames))
  }

  const lembagaPart = sanitizeFilenamePart(lembagaNama || lembagaId || 'Lembaga')
  const kalPart = periodeKalender === 'hijriyah' ? 'Hijriyah' : 'Masehi'
  const datePart = new Date().toISOString().slice(0, 10)
  const filename = `Bisyaroh_Review_${lembagaPart}_${periodeBulan || 'periode'}_${kalPart}_${datePart}.xlsx`
  XLSX.writeFile(wb, filename)
}
