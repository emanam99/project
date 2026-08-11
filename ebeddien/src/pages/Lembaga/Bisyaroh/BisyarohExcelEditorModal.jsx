import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './BisyarohExcelEditorModal.css'

const Workbook = lazy(async () => {
  await import('@fortune-sheet/react/dist/index.css')
  const mod = await import('@fortune-sheet/react')
  return { default: mod.Workbook }
})

const asText = (v) => (v == null ? '' : String(v))

const cloneWorkbookData = (sheets) => {
  try {
    return JSON.parse(JSON.stringify(Array.isArray(sheets) ? sheets : []))
  } catch {
    return Array.isArray(sheets) ? [...sheets] : []
  }
}

/** Normalisasi NIP untuk pencocokan (angka: abaikan leading zero). */
function normalizeNip(v) {
  const s = asText(v).trim().replace(/\s+/g, '')
  if (!s) return ''
  if (/^\d+$/.test(s)) {
    const stripped = s.replace(/^0+/, '')
    return stripped === '' ? '0' : stripped
  }
  return s.toLowerCase()
}

function normalizeName(v) {
  return asText(v).trim().replace(/\s+/g, ' ').toLowerCase()
}

function displayNip(v) {
  const s = asText(v).trim()
  return s || '—'
}

function cellText(rowCells, cIdx) {
  if (!rowCells || cIdx < 0) return ''
  const cell = rowCells[cIdx]
  if (!cell) return ''
  return asText(cell.m ?? cell.v ?? '').trim()
}

function buildRowLookupMaps(rows) {
  const nipToRow = new Map()
  const nameToRow = new Map()
  const idToRow = new Map()
  const duplicateNips = new Set()
  const duplicateNames = new Set()

  for (const row of rows || []) {
    const id = Number(row.id_pengurus)
    if (Number.isFinite(id) && id > 0) idToRow.set(id, row)

    const nipKey = normalizeNip(row.nip)
    if (nipKey) {
      if (nipToRow.has(nipKey)) duplicateNips.add(nipKey)
      else nipToRow.set(nipKey, row)
    }

    const nameKey = normalizeName(row.pengurus_nama)
    if (nameKey) {
      if (nameToRow.has(nameKey)) duplicateNames.add(nameKey)
      else nameToRow.set(nameKey, row)
    }
  }

  return { nipToRow, nameToRow, idToRow, duplicateNips, duplicateNames }
}

function columnIndex(columns, key) {
  return columns.findIndex((c) => c.key === key)
}

function isSheetRowMeaningful(rowCells, columns, colIdxByKey) {
  for (const col of columns) {
    if (col.key === '__id_pengurus') continue
    const cIdx = colIdxByKey[col.key]
    if (cellText(rowCells, cIdx)) return true
  }
  return false
}

function resolveTargetRow({ nipRaw, namaRaw, idRaw }, maps) {
  const nipKey = normalizeNip(nipRaw)
  if (nipKey) {
    return { row: maps.nipToRow.get(nipKey) || null, matchedBy: 'nip', nipKey, nipRaw }
  }
  const nameKey = normalizeName(namaRaw)
  if (nameKey) {
    return { row: maps.nameToRow.get(nameKey) || null, matchedBy: 'nama', nipKey: '', nipRaw: '' }
  }
  const id = parseInt(String(idRaw || '').trim(), 10)
  if (Number.isFinite(id) && id > 0) {
    return { row: maps.idToRow.get(id) || null, matchedBy: 'id', nipKey: '', nipRaw: '' }
  }
  return { row: null, matchedBy: null, nipKey: '', nipRaw: '' }
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

function applyRowValuesToTarget(targetRow, rowCells, columns, colIdxByKey) {
  columns.forEach((col) => {
    if (col.key === '__id_pengurus' || col.key === '__pengurus_nama' || col.key === '__nip') return
    const cIdx = colIdxByKey[col.key]
    const raw = cellText(rowCells, cIdx)
    if (col.key === '__catatan') {
      targetRow.catatan = asText(raw)
      return
    }
    targetRow.inputs = { ...(targetRow.inputs || {}), [col.key]: asText(raw) }
  })
}

/**
 * Cocokkan baris sheet ke pengurus rekap via NIP (utama), nama, atau ID tersembunyi.
 * Urutan baris bebas; validasi NIP saat Terapkan.
 */
function validateAndExtractSections(workbook, meta, sourceSections) {
  const errors = []
  const warnings = []
  const nextSections = (sourceSections || []).map((s) => ({
    ...s,
    rows: (s.rows || []).map((r) => ({ ...r, inputs: { ...(r.inputs || {}) } }))
  }))

  ;(workbook || []).forEach((sheet, sIdx) => {
    const m = meta[sIdx]
    if (!m) return
    const sheetLabel = sheet?.name || `Set #${m.bisyaroh_id}`
    const targetSec = nextSections.find((x) => x.bisyaroh_id === m.bisyaroh_id)
    if (!targetSec) return

    const maps = buildRowLookupMaps(targetSec.rows)
    if (maps.duplicateNips.size > 0) {
      errors.push(`${sheetLabel}: data rekap memiliki NIP ganda di server — hubungi admin.`)
    }

    const columns = m.columns
    const colIdx = {}
    columns.forEach((col, i) => {
      colIdx[col.key] = i
    })
    const idxNip = columnIndex(columns, '__nip')
    const idxNama = columnIndex(columns, '__pengurus_nama')
    const idxId = columnIndex(columns, '__id_pengurus')

    const dataMatrix = Array.isArray(sheet?.data) ? sheet.data : []
    const sheetRows = iterSheetDataRows(dataMatrix)
    const nipSeenInSheet = new Map()

    for (const { r, rowCells } of sheetRows) {
      if (!isSheetRowMeaningful(rowCells, columns, colIdx)) continue

      const nipRaw = idxNip >= 0 ? cellText(rowCells, idxNip) : ''
      const namaRaw = idxNama >= 0 ? cellText(rowCells, idxNama) : ''
      const idRaw = idxId >= 0 ? cellText(rowCells, idxId) : ''
      const rowLabel = `baris ${r + 1}`

      const nipKey = normalizeNip(nipRaw)
      if (nipKey) {
        const prev = nipSeenInSheet.get(nipKey)
        if (prev != null) {
          errors.push(
            `${sheetLabel} (${rowLabel}): NIP [${displayNip(nipRaw)}] muncul lebih dari sekali (juga di baris ${prev + 1}).`
          )
          continue
        }
        nipSeenInSheet.set(nipKey, r)
      }

      const resolved = resolveTargetRow({ nipRaw, namaRaw, idRaw }, maps)

      if (nipKey && !maps.nipToRow.has(nipKey)) {
        errors.push(`${sheetLabel} (${rowLabel}): NIP [${displayNip(nipRaw)}] keliru, cek kembali.`)
        continue
      }

      if (resolved.matchedBy === 'nama' && !resolved.row) {
        const namaTampil = asText(namaRaw).trim() || '—'
        errors.push(`${sheetLabel} (${rowLabel}): nama «${namaTampil}» tidak ditemukan di rekap.`)
        continue
      }

      if (!resolved.row) {
        if (nipRaw || namaRaw) {
          errors.push(`${sheetLabel} (${rowLabel}): tidak cocok dengan pengurus rekap — periksa NIP atau nama.`)
        } else {
          errors.push(`${sheetLabel} (${rowLabel}): isi NIP atau nama pengurus agar data bisa diterapkan.`)
        }
        continue
      }

      applyRowValuesToTarget(resolved.row, rowCells, columns, colIdx)
    }

    for (const row of targetSec.rows || []) {
      const nipKey = normalizeNip(row.nip)
      if (nipKey && !nipSeenInSheet.has(nipKey)) {
        warnings.push(
          `${sheetLabel}: NIP [${displayNip(row.nip)}] (${row.pengurus_nama || 'pengurus'}) tidak ada di sheet — nilai rekap baris ini tidak diubah.`
        )
      }
    }
  })

  return { ok: errors.length === 0, errors, warnings, sections: nextSections }
}

function buildWorkbookFromSections(sections) {
  const meta = []
  const sheets = (sections || []).map((sec, secIdx) => {
    const inputCols = (sec?.kolom || []).filter((k) => k.kind === 'input')
    const columns = [
      { key: '__id_pengurus', label: 'ID Pengurus', readonly: true, hidden: true },
      { key: '__pengurus_nama', label: 'Pengurus', readonly: false },
      { key: '__nip', label: 'NIP', readonly: false },
      ...inputCols.map((k) => ({ key: k.col_key, label: k.label, readonly: false })),
      { key: '__catatan', label: 'Catatan', readonly: false }
    ]
    const celldata = []
    const colReadOnly = {}
    const colhidden = {}
    columns.forEach((col, cIdx) => {
      celldata.push({ r: 0, c: cIdx, v: { m: col.label, v: col.label, ct: { t: 'inlineStr' } } })
      if (col.readonly) colReadOnly[cIdx] = 1
      if (col.hidden) colhidden[cIdx] = 0
    })
    ;(sec?.rows || []).forEach((row, rIdx) => {
      const base = {
        __id_pengurus: row.id_pengurus,
        __pengurus_nama: row.pengurus_nama || '',
        __nip: row.nip ?? '',
        __catatan: row.catatan ?? ''
      }
      columns.forEach((col, cIdx) => {
        const value =
          col.key in base
            ? base[col.key]
            : row?.inputs && Object.prototype.hasOwnProperty.call(row.inputs, col.key)
              ? row.inputs[col.key]
              : ''
        celldata.push({
          r: rIdx + 1,
          c: cIdx,
          v: {
            m: asText(value),
            v: asText(value),
            ct: { t: 'inlineStr' }
          }
        })
      })
    })
    meta[secIdx] = {
      bisyaroh_id: sec.bisyaroh_id,
      columns,
      rowCount: (sec?.rows || []).length
    }
    return {
      name: sec.bisyaroh_nama || `Set #${sec.bisyaroh_id}`,
      row: Math.max((sec?.rows || []).length + 30, 200),
      column: columns.length + 2,
      celldata,
      config: { colReadOnly, colhidden }
    }
  })
  return { sheets, meta }
}

export default function BisyarohExcelEditorModal({ open, sections, onClose, onApply, onNotify }) {
  const workbookRef = useRef(null)
  const [workbookData, setWorkbookData] = useState([])
  const [editorSessionKey, setEditorSessionKey] = useState(0)
  const [applyErrors, setApplyErrors] = useState([])
  const [applyWarnings, setApplyWarnings] = useState([])
  const { sheets, meta } = useMemo(() => buildWorkbookFromSections(sections), [sections])

  useEffect(() => {
    if (!open) return
    setEditorSessionKey((k) => k + 1)
    setWorkbookData(cloneWorkbookData(sheets))
    setApplyErrors([])
    setApplyWarnings([])
  }, [open, sheets])

  const handleApply = () => {
    const latest = workbookRef.current?.getAllSheets?.()
    const source = Array.isArray(latest) && latest.length > 0 ? latest : workbookData
    const result = validateAndExtractSections(source, meta, sections)
    setApplyWarnings(result.warnings || [])
    if (!result.ok) {
      setApplyErrors(result.errors)
      return
    }
    setApplyErrors([])
    onApply(result.sections)
    if (result.warnings?.length && typeof onNotify === 'function') {
      const preview = result.warnings.slice(0, 2).join(' ')
      const more = result.warnings.length > 2 ? ` (+${result.warnings.length - 2} lainnya)` : ''
      onNotify(`${preview}${more}`, 'info')
    }
    onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed left-0 right-0 bottom-0 z-[251] h-[85vh] sm:h-[88vh] bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">Excel Editor Rekap Bisyaroh</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Urutan baris bebas. Paste dari Excel (NIP/nama + nilai input). Data dicocokkan lewat NIP; jika NIP kosong, lewat nama.
                  Saat Terapkan, NIP yang tidak ada di rekap ditolak.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs sm:text-sm"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-medium"
                >
                  Terapkan ke Rekap
                </button>
              </div>
            </div>

            {(applyErrors.length > 0 || applyWarnings.length > 0) && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 max-h-[28vh] overflow-y-auto space-y-2">
                {applyErrors.length > 0 && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-200 mb-1">Validasi gagal — perbaiki lalu Terapkan lagi</p>
                    <ul className="text-[11px] text-red-700 dark:text-red-300 space-y-0.5 list-disc pl-4">
                      {applyErrors.map((msg, i) => (
                        <li key={`err-${i}`}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {applyWarnings.length > 0 && applyErrors.length === 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">Catatan</p>
                    <ul className="text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5 list-disc pl-4">
                      {applyWarnings.map((msg, i) => (
                        <li key={`warn-${i}`}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="excel-bisyaroh-editor flex-1 min-h-0">
              <Suspense
                fallback={
                  <div className="h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
                  </div>
                }
              >
                <Workbook
                  key={`bisyaroh-excel-editor-${editorSessionKey}`}
                  ref={workbookRef}
                  data={workbookData}
                  onChange={setWorkbookData}
                />
              </Suspense>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
