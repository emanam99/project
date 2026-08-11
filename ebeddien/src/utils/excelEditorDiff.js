const asText = (v) => (v == null ? '' : String(v))

/** Normalisasi NIP untuk pencocokan baris (angka: abaikan leading zero). */
export function normalizeNip(v) {
  const s = asText(v).trim().replace(/\s+/g, '')
  if (!s) return ''
  if (/^\d+$/.test(s)) {
    const stripped = s.replace(/^0+/, '')
    return stripped === '' ? '0' : stripped
  }
  return s.toLowerCase()
}

export function displayNip(v) {
  const s = asText(v).trim()
  return s || '—'
}

const normalizeCellText = (value) => {
  const s = asText(value).trim()
  return s.startsWith("'") ? s.slice(1) : s
}

const DATE_FIELD_KEYS = new Set([
  'tanggal_lahir',
  'tmt',
  'sejak',
  'masehi',
  'tanggal_dibuat',
  'tanggal_update',
  'tanggal_lahir_ayah',
  'tanggal_lahir_ibu',
  'tanggal_lahir_wali',
])

/**
 * Bandingkan nilai sel sebelum/sesudah — abaikan perbedaan format kosong & angka desimal.
 */
export function valuesEqualForExcelField(key, before, after, numericKeys = new Set()) {
  const b = normalizeCellText(before)
  const a = normalizeCellText(after)
  if (b === a) return true
  if (b === '' && a === '') return true

  if (numericKeys.has(key)) {
    const bn = Number(b)
    const an = Number(a)
    if (Number.isFinite(bn) && Number.isFinite(an)) {
      if (key === 'jarak') {
        return Math.round(bn * 100) / 100 === Math.round(an * 100) / 100
      }
      return bn === an
    }
  }

  if (DATE_FIELD_KEYS.has(key)) {
    const db = b.slice(0, 10)
    const da = a.slice(0, 10)
    if (db.length === 10 && da.length === 10 && db === da) return true
  }

  return false
}

/**
 * Ekstrak baris dari workbook; hanya fallback matrix bila sel tidak ada di celldata.
 */
export function extractRowsFromWorkbook(data, columns) {
  const firstSheet = Array.isArray(data) && data.length ? data[0] : null
  const celldata = Array.isArray(firstSheet?.celldata) ? firstSheet.celldata : []
  const matrixData = Array.isArray(firstSheet?.data) ? firstSheet.data : []
  const cellMap = new Map()
  celldata.forEach((cell) => {
    const key = `${cell.r}:${cell.c}`
    const val = cell?.v?.m ?? cell?.v?.v ?? ''
    cellMap.set(key, asText(val))
  })

  const rows = []
  let maxCelldataRow = 0
  for (let i = 0; i < celldata.length; i++) {
    const r = Number(celldata?.[i]?.r)
    if (Number.isFinite(r) && r > maxCelldataRow) {
      maxCelldataRow = r
    }
  }
  const maxMatrixRow = Math.max(0, matrixData.length - 1)
  const maxRow = Math.max(maxCelldataRow, maxMatrixRow, 0)
  for (let r = 1; r <= maxRow; r++) {
    const row = {}
    columns.forEach((col, cIdx) => {
      const cellKey = `${r}:${cIdx}`
      if (cellMap.has(cellKey)) {
        row[col.key] = normalizeCellText(cellMap.get(cellKey))
        return
      }
      const matrixCell = matrixData?.[r]?.[cIdx]
      const matrixVal = matrixCell?.m ?? matrixCell?.v ?? ''
      row[col.key] = normalizeCellText(matrixVal)
    })
    if (!row.id) continue
    rows.push(row)
  }
  return rows
}

function cellTextFromMatrix(matrixData, celldataMap, r, cIdx) {
  const key = `${r}:${cIdx}`
  if (celldataMap.has(key)) return normalizeCellText(celldataMap.get(key))
  const matrixCell = matrixData?.[r]?.[cIdx]
  return normalizeCellText(matrixCell?.m ?? matrixCell?.v ?? '')
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

function rowDiffersFromBaseline(merged, base, columns, numericKeys) {
  for (const col of columns) {
    if (col.readonly || col.key === 'id' || col.key === 'no' || col.key === 'nip') continue
    const beforeText = asText(base[col.key]).trim()
    const afterText = asText(merged[col.key]).trim()
    if (!valuesEqualForExcelField(col.key, beforeText, afterText, numericKeys)) return true
  }
  return false
}

/**
 * Terapkan isian sheet ke baseline pengurus via NIP (urutan baris bebas).
 * Baris tanpa NIP diabaikan. Hanya baris dengan NIP dikenali (+ opsional hanya yang berubah).
 * @param {object} [options]
 * @param {boolean} [options.onlyChanged=true] — hanya terapkan baris yang nilainya berubah dari baseline
 * @param {Set<string>} [options.numericKeys]
 * @returns {{ rows: object[], errors: string[], warnings: string[] }}
 */
export function extractRowsFromWorkbookByNip(workbook, columns, baselineRows = [], options = {}) {
  const onlyChanged = options.onlyChanged !== false
  const numericKeys = options.numericKeys instanceof Set ? options.numericKeys : new Set()
  const firstSheet = Array.isArray(workbook) && workbook.length ? workbook[0] : null
  const celldata = Array.isArray(firstSheet?.celldata) ? firstSheet.celldata : []
  const matrixData = Array.isArray(firstSheet?.data) ? firstSheet.data : []
  const celldataMap = new Map()
  celldata.forEach((cell) => {
    const key = `${cell.r}:${cell.c}`
    const val = cell?.v?.m ?? cell?.v?.v ?? ''
    celldataMap.set(key, asText(val))
  })

  const nipToBaseline = new Map()
  const duplicateNips = new Set()
  for (const row of baselineRows) {
    const nipKey = normalizeNip(row.nip)
    if (nipKey) {
      if (nipToBaseline.has(nipKey)) duplicateNips.add(nipKey)
      else nipToBaseline.set(nipKey, row)
    }
  }

  const errors = []
  const warnings = []
  if (duplicateNips.size > 0) {
    errors.push('Data pengurus memiliki NIP ganda di server — hubungi admin.')
    return { rows: baselineRows, errors, warnings }
  }

  const colIdx = {}
  columns.forEach((col, i) => {
    colIdx[col.key] = i
  })
  const idxNip = colIdx.nip ?? -1

  const updatesById = new Map()
  const sheetRows = iterSheetDataRows(matrixData)
  const nipSeenInSheet = new Map()

  for (const { r } of sheetRows) {
    const getCell = (colKey) => {
      const cIdx = colIdx[colKey]
      if (cIdx == null || cIdx < 0) return ''
      return cellTextFromMatrix(matrixData, celldataMap, r, cIdx)
    }

    const nipRaw = idxNip >= 0 ? getCell('nip') : ''
    const nipKey = normalizeNip(nipRaw)
    const rowNum = r + 1

    if (!nipKey) {
      continue
    }

    const prev = nipSeenInSheet.get(nipKey)
    if (prev != null) {
      errors.push(
        `Baris ${rowNum}: NIP [${displayNip(nipRaw)}] muncul lebih dari sekali (juga di baris ${prev + 1}).`
      )
      continue
    }
    nipSeenInSheet.set(nipKey, r)

    if (!nipToBaseline.has(nipKey)) {
      errors.push(`Baris ${rowNum}: NIP [${displayNip(nipRaw)}] tidak dikenali.`)
      continue
    }

    const base = nipToBaseline.get(nipKey)
    const merged = { ...base }
    columns.forEach((col) => {
      if (col.readonly || col.key === 'id' || col.key === 'no') return
      merged[col.key] = getCell(col.key)
    })

    if (onlyChanged && !rowDiffersFromBaseline(merged, base, columns, numericKeys)) {
      continue
    }

    updatesById.set(String(base.id), merged)
  }

  const rows = baselineRows.map((base) => updatesById.get(String(base.id)) || base)
  return { rows, errors, warnings }
}
