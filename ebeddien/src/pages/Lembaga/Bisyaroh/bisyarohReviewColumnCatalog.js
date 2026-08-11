import { formatBisyarohCheckboxDisplay } from './bisyarohKolomTipe'

/** Label kolom tetap + dinamis untuk cetak / pilihan kolom. */
export const REVIEW_FIXED_COLUMNS = [
  { id: '__nip', label: 'NIP' },
  { id: '__rekening_jatim', label: 'Rekening Jatim' },
  { id: '__pengurus', label: 'Pengurus' },
  { id: '__bisyaroh', label: 'Bisyaroh' },
  { id: '__total', label: 'Total' },
  { id: '__potong', label: 'Potong UWABA' },
  { id: '__potong_ket', label: 'Keterangan potong' },
  { id: '__catatan', label: 'Catatan' }
]

const LS_PRINT_COLS = 'bisyaroh-review-print-cols-v1'

function bisyarohSetLabel(section) {
  const nama = (section?.bisyaroh_nama || '').trim()
  if (nama) return nama
  const id = section?.bisyaroh_id
  return id != null ? `Set #${id}` : '—'
}

/** @returns {Array<{ id: string, label: string, kolomKey?: string }>} */
export function buildReviewColumnCatalog(sections = []) {
  const dynamic = new Map()
  for (const sec of sections) {
    for (const k of sec.kolom || []) {
      const id = `${sec.bisyaroh_id}:${k.col_key}`
      if (!dynamic.has(id)) {
        dynamic.set(id, {
          id,
          label: k.label || k.col_key,
          kolomKey: k.col_key
        })
      }
    }
  }
  return [...REVIEW_FIXED_COLUMNS, ...dynamic.values()]
}

export function loadPrintColumnSelection(allColumnIds) {
  try {
    const raw = localStorage.getItem(LS_PRINT_COLS)
    if (!raw) return new Set(allColumnIds)
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return new Set(allColumnIds)
    const valid = arr.filter((id) => allColumnIds.includes(id))
    return valid.length > 0 ? new Set(valid) : new Set(allColumnIds)
  } catch {
    return new Set(allColumnIds)
  }
}

export function persistPrintColumnSelection(selectedIds) {
  try {
    localStorage.setItem(LS_PRINT_COLS, JSON.stringify([...selectedIds]))
  } catch {
    /* abaikan */
  }
}

/**
 * @returns {string}
 */
export function getReviewCellDisplayText(row, section, colId, { formatRp, getRekapCell }) {
  if (colId === '__nip') {
    return row.nip != null && row.nip !== '' ? String(row.nip) : '—'
  }
  if (colId === '__rekening_jatim') {
    return row.rekening_jatim?.trim() ? String(row.rekening_jatim) : '—'
  }
  if (colId === '__pengurus') {
    return row.pengurus_nama ?? '—'
  }
  if (colId === '__bisyaroh') {
    return bisyarohSetLabel(section)
  }
  if (colId === '__total') {
    const total = Number(row.total_nominal) || 0
    return formatRp(total)
  }
  if (colId === '__potong') {
    if (!row.potong_uwaba) return '—'
    return formatRp(row.potong_uwaba.terpotong_total ?? 0)
  }
  if (colId === '__potong_ket') {
    return row.potong_uwaba?.keterangan?.trim() || '—'
  }
  if (colId === '__catatan') {
    return row.catatan?.trim() || '—'
  }

  const kolomKey = colId.includes(':') ? colId.split(':').slice(1).join(':') : null
  if (!kolomKey) return '—'
  const k = (section.kolom || []).find((x) => x.col_key === kolomKey)
  if (!k) return '—'

  if (k.kind === 'input') {
    const v = row.inputs?.[k.col_key]
    if (k.input_tipe === 'checkbox') {
      return formatBisyarohCheckboxDisplay(v, k.default_nilai)
    }
    if (v === '' || v == null) return '—'
    if (k.input_tipe === 'rupiah' && !Number.isNaN(Number(v))) {
      return formatRp(Number(v))
    }
    return String(v)
  }

  const cell = getRekapCell(row, k.col_key)
  return cell.text ?? '—'
}
