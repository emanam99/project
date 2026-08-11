import { createEmptyTesMadinState } from '../hooks/useTesMadinForm'
import { T1_OPSI, T2_KELAS_OPSI, T3_KELAS_OPSI, T4_OPSI } from '../components/TesMadinFormFields'

const asText = (v) => (v == null ? '' : String(v))

export const TES_MASUK_EXCEL_COLUMNS = [
  { key: '__id_santri', label: 'ID Santri', readonly: true, hidden: true },
  { key: '__nis', label: 'NIS' },
  { key: '__nama', label: 'Nama' },
  { key: 'gelombang', label: 'Gelombang Tes' },
  { key: 'tanggalTesHijriyah', label: 'Tgl Tes (Hijriyah)' },
  { key: 't1_membaca', label: 'T1 Membaca' },
  { key: 't1_menulis', label: 'T1 Menulis' },
  { key: 't1_jumlah', label: 'T1 Jumlah' },
  { key: 't1_keputusan', label: 'T1 Keputusan' },
  { key: 't2_kitab', label: 'T2 Kitab' },
  { key: 't2_ns5', label: 'T2 NS (5)' },
  { key: 't2_ns6', label: 'T2 NS (6)' },
  { key: 't2_jumlah', label: 'T2 Jumlah' },
  { key: 't2_keputusan_kelas', label: 'T2 Kelas Ula' },
  { key: 't2_lanjut_t3', label: 'T2 Lanjut T3' },
  { key: 't3_baca', label: 'T3 Baca' },
  { key: 't3_nahwu', label: 'T3 Nahwu' },
  { key: 't3_sharaf', label: 'T3 Sharaf' },
  { key: 't3_jumlah', label: 'T3 Jumlah' },
  { key: 't3_keputusan_kelas', label: 'T3 Kelas Wustha' },
  { key: 't3_lanjut_t4', label: 'T3 Lanjut T4' },
  { key: 't4_baca', label: 'T4 Baca' },
  { key: 't4_fiqih', label: 'T4 Fiqih' },
  { key: 't4_nahwu', label: 'T4 Nahwu' },
  { key: 't4_balaghah', label: 'T4 Balaghah' },
  { key: 't4_jumlah', label: 'T4 Jumlah' },
  { key: 't4_keputusan', label: 'T4 Keputusan' },
  { key: 'tanggalSuratHijriyah', label: 'Tgl Surat (Hijriyah)' },
  { key: 'namaKetua', label: 'Nama Ketua Panitia' },
]

const FORM_FIELD_KEYS = TES_MASUK_EXCEL_COLUMNS
  .map((c) => c.key)
  .filter((k) => !k.startsWith('__'))

/** Normalisasi NIS untuk pencocokan (angka: abaikan leading zero). */
export function normalizeNis(v) {
  const s = asText(v).trim().replace(/\s+/g, '')
  if (!s) return ''
  if (/^\d+$/.test(s)) {
    const stripped = s.replace(/^0+/, '')
    return stripped === '' ? '0' : stripped
  }
  return s.toLowerCase()
}

function displayNis(v) {
  const s = asText(v).trim()
  return s || '—'
}

function cellText(rowCells, cIdx) {
  if (!rowCells || cIdx < 0) return ''
  const cell = rowCells[cIdx]
  if (!cell) return ''
  return asText(cell.m ?? cell.v ?? '').trim()
}

function columnIndex(columns, key) {
  return columns.findIndex((c) => c.key === key)
}

function parseBool(raw) {
  const s = asText(raw).trim().toLowerCase()
  if (!s) return false
  return ['1', 'true', 'ya', 'y', 'yes', 'v', 'x', '✓'].includes(s)
}

function mapByOptions(raw, options) {
  const s = asText(raw).trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  const byId = options.find((o) => o.id === lower || o.id === s)
  if (byId) return byId.id
  const byLabel = options.find((o) => o.label.toLowerCase() === lower)
  if (byLabel) return byLabel.id
  if (/^\d+$/.test(s)) return s
  return s
}

function parseFormField(key, raw) {
  if (key === 't2_lanjut_t3' || key === 't3_lanjut_t4') return parseBool(raw)
  if (key === 't1_keputusan') return mapByOptions(raw, T1_OPSI)
  if (key === 't2_keputusan_kelas') return mapByOptions(raw, T2_KELAS_OPSI)
  if (key === 't3_keputusan_kelas') return mapByOptions(raw, T3_KELAS_OPSI)
  if (key === 't4_keputusan') return mapByOptions(raw, T4_OPSI)
  if (key === 'gelombang') {
    const digits = asText(raw).replace(/\D/g, '')
    return digits || ''
  }
  return asText(raw)
}

function formValueForCell(key, form) {
  const v = form?.[key]
  if (key === 't2_lanjut_t3' || key === 't3_lanjut_t4') return v ? 'Ya' : ''
  if (v == null || v === '') return ''
  return String(v)
}

function buildRowFormSeed(pendaftar, existingTesForm) {
  const gelombangFromList = pendaftar?.gelombang_tes != null && String(pendaftar.gelombang_tes).trim() !== ''
    ? String(pendaftar.gelombang_tes).replace(/\D/g, '')
    : ''
  const base = { ...createEmptyTesMadinState() }
  if (gelombangFromList) base.gelombang = gelombangFromList
  if (!existingTesForm) return base
  return {
    ...base,
    ...existingTesForm,
    gelombang: existingTesForm.gelombang || base.gelombang || '',
  }
}

function formHasTesData(form) {
  if (!form) return false
  return FORM_FIELD_KEYS.some((key) => {
    const v = form[key]
    if (key === 't2_lanjut_t3' || key === 't3_lanjut_t4') return Boolean(v)
    return v != null && String(v).trim() !== ''
  })
}

function buildPendaftarLookupMaps(pendaftarList) {
  const nisToRow = new Map()
  const idToRow = new Map()
  const duplicateNis = new Set()

  for (const row of pendaftarList || []) {
    const id = Number(row.id ?? row.id_santri)
    if (Number.isFinite(id) && id > 0) idToRow.set(id, row)

    const nisKey = normalizeNis(row.nis)
    if (nisKey) {
      if (nisToRow.has(nisKey)) duplicateNis.add(nisKey)
      else nisToRow.set(nisKey, row)
    }
  }

  return { nisToRow, idToRow, duplicateNis }
}

function isSheetRowMeaningful(rowCells, columns, colIdxByKey) {
  for (const col of columns) {
    if (col.key === '__id_santri' || col.key === '__nama') continue
    const cIdx = colIdxByKey[col.key]
    if (cellText(rowCells, cIdx)) return true
  }
  return false
}

function iterSheetDataRows(dataMatrix) {
  const maxR = Array.isArray(dataMatrix) ? dataMatrix.length : 0
  let emptyStreak = 0
  const rows = []
  for (let r = 1; r < maxR; r++) {
    const rowCells = dataMatrix[r] || []
    const hasAny = rowCells.some((cell) => asText(cell?.m ?? cell?.v ?? '').trim() !== '')
    if (!hasAny) {
      emptyStreak += 1
      if (emptyStreak >= 8 && r > 1) break
      continue
    }
    emptyStreak = 0
    rows.push({ r, rowCells })
  }
  return rows
}

function extractFormFromRowCells(rowCells, columns, colIdxByKey, existingForm) {
  const form = { ...createEmptyTesMadinState(), ...(existingForm || {}) }
  let sheetTouched = false

  for (const key of FORM_FIELD_KEYS) {
    const cIdx = colIdxByKey[key]
    const raw = cellText(rowCells, cIdx)
    if (raw === '') continue
    form[key] = parseFormField(key, raw)
    sheetTouched = true
  }

  const hasValue = sheetTouched || formHasTesData(form)
  return { form, hasValue }
}

function resolveTargetPendaftar({ nisRaw, idRaw }, maps) {
  const nisKey = normalizeNis(nisRaw)
  if (nisKey) {
    return { row: maps.nisToRow.get(nisKey) || null, matchedBy: 'nis', nisKey, nisRaw }
  }
  const id = parseInt(String(idRaw || '').trim(), 10)
  if (Number.isFinite(id) && id > 0) {
    return { row: maps.idToRow.get(id) || null, matchedBy: 'id', nisKey: '', nisRaw: '' }
  }
  return { row: null, matchedBy: null, nisKey: '', nisRaw: '' }
}

/**
 * Validasi sheet & ekstrak update tes per NIS.
 * Urutan baris bebas; cocokkan lewat NIS (atau ID tersembunyi).
 */
export function validateAndExtractTesMasukUpdates(workbook, meta, pendaftarList, tesFormMap = {}) {
  const errors = []
  const warnings = []
  const updates = []

  const maps = buildPendaftarLookupMaps(pendaftarList)
  if (maps.duplicateNis.size > 0) {
    errors.push('Daftar pendaftar memiliki NIS ganda — hubungi admin sebelum import.')
  }

  const sheet = Array.isArray(workbook) ? workbook[0] : null
  const m = meta?.[0]
  if (!sheet || !m) {
    errors.push('Sheet editor kosong.')
    return { ok: false, errors, warnings, updates }
  }

  const columns = m.columns
  const colIdx = {}
  columns.forEach((col, i) => {
    colIdx[col.key] = i
  })

  const idxNis = columnIndex(columns, '__nis')
  const idxId = columnIndex(columns, '__id_santri')
  const dataMatrix = Array.isArray(sheet?.data) ? sheet.data : []
  const sheetRows = iterSheetDataRows(dataMatrix)
  const nisSeenInSheet = new Map()

  for (const { r, rowCells } of sheetRows) {
    if (!isSheetRowMeaningful(rowCells, columns, colIdx)) continue

    const nisRaw = idxNis >= 0 ? cellText(rowCells, idxNis) : ''
    const idRaw = idxId >= 0 ? cellText(rowCells, idxId) : ''
    const rowLabel = `baris ${r + 1}`

    const nisKey = normalizeNis(nisRaw)
    if (nisKey) {
      const prev = nisSeenInSheet.get(nisKey)
      if (prev != null) {
        errors.push(`(${rowLabel}): NIS [${displayNis(nisRaw)}] muncul lebih dari sekali (juga di baris ${prev + 1}).`)
        continue
      }
      nisSeenInSheet.set(nisKey, r)
    }

    if (nisKey && !maps.nisToRow.has(nisKey)) {
      errors.push(`(${rowLabel}): NIS [${displayNis(nisRaw)}] tidak ditemukan di daftar pendaftar tahun ini.`)
      continue
    }

    const resolved = resolveTargetPendaftar({ nisRaw, idRaw }, maps)
    if (!resolved.row) {
      if (nisRaw || idRaw) {
        errors.push(`(${rowLabel}): tidak cocok dengan pendaftar — periksa NIS.`)
      } else {
        errors.push(`(${rowLabel}): isi NIS agar data bisa diterapkan.`)
      }
      continue
    }

    const sid = Number(resolved.row.id ?? resolved.row.id_santri)
    const existingForm = tesFormMap[sid]
      ? buildRowFormSeed(resolved.row, tesFormMap[sid])
      : buildRowFormSeed(resolved.row, null)

    const { form, hasValue } = extractFormFromRowCells(rowCells, columns, colIdx, existingForm)
    if (!hasValue) continue

    updates.push({
      id_santri: Number(resolved.row.id ?? resolved.row.id_santri),
      id_registrasi: resolved.row.id_registrasi,
      nis: resolved.row.nis,
      nama: resolved.row.nama,
      form,
    })
  }

  if (updates.length === 0 && errors.length === 0) {
    errors.push('Tidak ada baris nilai tes yang valid untuk disimpan.')
  }

  return { ok: errors.length === 0, errors, warnings, updates }
}

export function buildTesMasukWorkbookFromPendaftar(pendaftarList, tesFormMap = {}) {
  const columns = TES_MASUK_EXCEL_COLUMNS
  const celldata = []
  const colReadOnly = {}
  const colhidden = {}

  columns.forEach((col, cIdx) => {
    celldata.push({ r: 0, c: cIdx, v: { m: col.label, v: col.label, ct: { t: 'inlineStr' } } })
    if (col.readonly) colReadOnly[cIdx] = 1
    if (col.hidden) colhidden[cIdx] = 0
  })

  ;(pendaftarList || []).forEach((row, rIdx) => {
    const sid = Number(row.id ?? row.id_santri)
    const rowForm = buildRowFormSeed(row, Number.isFinite(sid) ? tesFormMap[sid] : null)
    const base = {
      __id_santri: row.id ?? row.id_santri ?? '',
      __nis: row.nis ?? '',
      __nama: row.nama ?? '',
    }
    columns.forEach((col, cIdx) => {
      let value = ''
      if (col.key in base) {
        value = base[col.key]
      } else if (FORM_FIELD_KEYS.includes(col.key)) {
        value = formValueForCell(col.key, rowForm)
      }
      celldata.push({
        r: rIdx + 1,
        c: cIdx,
        v: { m: asText(value), v: asText(value), ct: { t: 'inlineStr' } },
      })
    })
  })

  const meta = [{
    columns,
    rowCount: (pendaftarList || []).length,
  }]

  const sheets = [{
    name: 'Tes Masuk',
    row: Math.max((pendaftarList || []).length + 30, 200),
    column: columns.length + 2,
    celldata,
    config: { colReadOnly, colhidden },
  }]

  return { sheets, meta }
}

export function cloneWorkbookData(sheets) {
  try {
    return JSON.parse(JSON.stringify(Array.isArray(sheets) ? sheets : []))
  } catch {
    return Array.isArray(sheets) ? [...sheets] : []
  }
}
