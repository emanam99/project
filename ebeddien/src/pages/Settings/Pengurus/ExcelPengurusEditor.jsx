import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import './ExcelPengurusEditor.css'
import { manageUsersAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import {
  extractRowsFromWorkbookByNip,
  valuesEqualForExcelField
} from '../../../utils/excelEditorDiff'
import ExcelSavePreviewTable from '../../../components/ExcelSavePreviewTable'
import { validatePengurusExcelField } from './pengurusExcelValidate'
import { EXPORT_COLUMNS } from './exportPengurusConfig'
import { filterPengurusList, readPengurusListFiltersFromSearch } from './pengurusListFilterUtils'

const Workbook = lazy(async () => {
  await import('@fortune-sheet/react/dist/index.css')
  const mod = await import('@fortune-sheet/react')
  return { default: mod.Workbook }
})

const READONLY_PENGURUS_KEYS = new Set([
  'id',
  'nip',
  'id_user',
  'kategori_lembaga',
  'lembaga',
  'jabatan',
  'tanggal_dibuat',
  'tanggal_update',
])

const SHEET_COLUMNS = EXPORT_COLUMNS.filter((c) => c.key !== 'no').map((c) => ({
  key: c.key,
  label: c.label,
  readonly: READONLY_PENGURUS_KEYS.has(c.key),
}))

const mapPengurusUserToExcelRow = (p) => {
  const jabatanList = p.jabatan || []
  const lembagaFromApi = p.lembaga || []
  const kategoriLembagaStr =
    lembagaFromApi.length > 0
      ? [...new Set(lembagaFromApi.map((l) => l.kategori).filter(Boolean))].join(', ') || ''
      : ''
  const lembagaStr =
    lembagaFromApi.length > 0
      ? lembagaFromApi
          .map((l) => l.nama || '')
          .filter(Boolean)
          .join(', ') || ''
      : ''
  const jabatanStr = jabatanList.length
    ? jabatanList
        .map((j) =>
          j.lembaga_id ? `${j.jabatan_nama || '-'} (${j.lembaga_id})` : j.jabatan_nama || '-'
        )
        .join('; ')
    : ''
  const wa = p.whatsapp ?? p.no_wa ?? ''
  const fmtDate = (v) => {
    if (v == null || v === '') return ''
    const s = String(v).trim()
    if (s.startsWith('0000-00-00')) return ''
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return s
  }
  const fmtDecimal = (v) => {
    if (v == null || v === '') return ''
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v)
    return String(Math.round(n * 100) / 100)
  }
  return {
    id: p.id,
    nip: p.nip ?? '',
    id_user: p.id_user ?? '',
    grup: p.grup ?? '',
    gelar_awal: p.gelar_awal ?? '',
    nama: p.nama ?? '',
    gelar_akhir: p.gelar_akhir ?? '',
    nik: p.nik ?? '',
    no_kk: p.no_kk ?? '',
    kategori: p.kategori ?? '',
    status_pengurus: p.status_pengurus ?? '',
    gender: p.gender ?? '',
    tempat_lahir: p.tempat_lahir ?? '',
    tanggal_lahir: fmtDate(p.tanggal_lahir),
    pendidikan_terakhir: p.pendidikan_terakhir ?? '',
    sekolah: p.sekolah ?? '',
    tahun_lulus: p.tahun_lulus ?? '',
    s1: p.s1 ?? '',
    s2: p.s2 ?? '',
    s3: p.s3 ?? '',
    tmt: fmtDate(p.tmt),
    bidang_studi: p.bidang_studi ?? '',
    jurusan_title: p.jurusan_title ?? '',
    status_nikah: p.status_nikah ?? '',
    pekerjaan: p.pekerjaan ?? '',
    niy: p.niy ?? '',
    nidn: p.nidn ?? '',
    nuptk: p.nuptk ?? '',
    npk: p.npk ?? '',
    dusun: p.dusun ?? '',
    rt: p.rt ?? '',
    rw: p.rw ?? '',
    desa: p.desa ?? '',
    kecamatan: p.kecamatan ?? '',
    kabupaten: p.kabupaten ?? '',
    provinsi: p.provinsi ?? '',
    kode_pos: p.kode_pos ?? '',
    jarak: fmtDecimal(p.jarak),
    email: p.email ?? '',
    no_telpon: p.no_telpon ?? wa ?? '',
    whatsapp: wa ?? '',
    status: p.status ?? '',
    sejak: fmtDate(p.sejak),
    nyabang: p.nyabang ?? '',
    hijriyah: p.hijriyah ?? '',
    masehi: fmtDate(p.masehi),
    rekening_jatim: p.rekening_jatim ?? '',
    an_jatim: p.an_jatim ?? '',
    tanggal_dibuat: fmtDate(p.tanggal_dibuat),
    tanggal_update: fmtDate(p.tanggal_update),
    kategori_lembaga: kategoriLembagaStr,
    lembaga: lembagaStr,
    jabatan: jabatanStr,
  }
}

const asText = (v) => (v == null ? '' : String(v))

function buildSavePreviewModel(pendingChanges, columns, baselineById) {
  const byRow = new Map()
  for (const item of pendingChanges) {
    const id = String(item.id)
    if (!byRow.has(id)) {
      const base = baselineById.get(id) || {}
      byRow.set(id, {
        id,
        nama: item.nama || base.nama || '—',
        nip: base.nip ?? '',
        cells: {}
      })
    }
    byRow.get(id).cells[item.key] = {
      label: item.label,
      from: item.from,
      to: item.to,
      error: item.error || null
    }
  }
  const rows = Array.from(byRow.values())
  const changedKeys = new Set(pendingChanges.map((c) => c.key))
  const previewColumns = columns.filter(
    (c) => changedKeys.has(c.key) && !c.readonly && c.key !== 'id' && c.key !== 'no'
  )
  return { rows, columns: previewColumns }
}
const CHANGED_CELL_BG = '#fef3c7'
const READONLY_CELL_BG = '#f3f4f6'
const EXCEL_VISIBLE_COLUMNS_STORAGE_KEY = 'excelPengurusVisibleColumns'
const EXCEL_COLUMN_ORDER_STORAGE_KEY = 'excelPengurusColumnOrder'
const NUMERIC_FIELD_KEYS = new Set(['grup', 'jarak'])

const EXCEL_NIP_EXTRACT_OPTS = { onlyChanged: true, numericKeys: NUMERIC_FIELD_KEYS }
const FORCE_TEXT_KEYS = new Set([
  'nik',
  'no_telpon',
  'whatsapp',
  'no_kk',
  'niy',
  'nidn',
  'nuptk',
  'npk',
  'rekening_jatim',
  'rt',
  'rw',
  'kode_pos',
])

const getDefaultVisibleColumns = () =>
  SHEET_COLUMNS.reduce((a, col) => {
    a[col.key] = true
    return a
  }, {})

const getVisibleColumnsSelection = () => {
  const defaults = getDefaultVisibleColumns()
  try {
    const raw = localStorage.getItem(EXCEL_VISIBLE_COLUMNS_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaults
    return { ...defaults, ...parsed }
  } catch (_) {
    return defaults
  }
}

const setVisibleColumnsSelection = (selected) => {
  try {
    localStorage.setItem(EXCEL_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(selected))
  } catch (_) {}
}

const applyStoredColumnOrder = () => {
  try {
    const raw = localStorage.getItem(EXCEL_COLUMN_ORDER_STORAGE_KEY)
    if (!raw) return
    const keys = JSON.parse(raw)
    if (!Array.isArray(keys) || keys.length === 0) return
    const byKey = new Map(SHEET_COLUMNS.map((c) => [c.key, c]))
    const ordered = []
    keys.forEach((k) => {
      const item = byKey.get(String(k))
      if (item) {
        ordered.push(item)
        byKey.delete(String(k))
      }
    })
    byKey.forEach((item) => ordered.push(item))
    if (ordered.length === SHEET_COLUMNS.length) {
      SHEET_COLUMNS.splice(0, SHEET_COLUMNS.length, ...ordered)
    }
  } catch (_) {}
}

const persistColumnOrder = () => {
  try {
    localStorage.setItem(EXCEL_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(SHEET_COLUMNS.map((c) => c.key)))
  } catch (_) {}
}

applyStoredColumnOrder()

const toForcedTextStorage = (value) => {
  const s = asText(value)
  if (s === '') return ''
  return s.startsWith("'") ? s : `'${s}`
}

const buildWorkbookData = (rows, columns) => {
  const celldata = []
  const colReadOnly = {}
  columns.forEach((col, cIdx) => {
    if (col.readonly) colReadOnly[cIdx] = 1
  })

  columns.forEach((col, cIdx) => {
    celldata.push({ r: 0, c: cIdx, v: { m: col.label, v: col.label, ct: { t: 'inlineStr' } } })
  })

  rows.forEach((row, rIdx) => {
    columns.forEach((col, cIdx) => {
      const val = row[col.key]
      celldata.push({
        r: rIdx + 1,
        c: cIdx,
        v: {
          m: asText(val),
          v: FORCE_TEXT_KEYS.has(col.key) ? toForcedTextStorage(val) : asText(val),
          ct: FORCE_TEXT_KEYS.has(col.key) ? { fa: '@', t: 's' } : { t: 'inlineStr' },
          qp: FORCE_TEXT_KEYS.has(col.key) ? 1 : undefined,
          bg: col.readonly ? READONLY_CELL_BG : undefined,
        },
      })
    })
  })

  return [
    {
      name: 'Pengurus Editor',
      row: Math.max(rows.length + 50, 200),
      column: columns.length + 5,
      celldata,
      config: {
        colReadOnly,
      },
    },
  ]
}

const applyColumnVisibility = (workbook, selectedColumns, columns) => {
  const firstSheet = Array.isArray(workbook) && workbook.length ? workbook[0] : null
  if (!firstSheet) return workbook
  const colhidden = {}
  columns.forEach((col, idx) => {
    if (!selectedColumns[col.key]) colhidden[idx] = 0
  })
  const prevConfig = firstSheet.config || {}
  const prevHidden = prevConfig.colhidden || {}
  const prevKeys = Object.keys(prevHidden)
  const nextKeys = Object.keys(colhidden)
  const sameHidden =
    prevKeys.length === nextKeys.length &&
    nextKeys.every((k) => Object.prototype.hasOwnProperty.call(prevHidden, k))
  if (sameHidden) return workbook

  const nextConfig = { ...prevConfig, colhidden }
  return [{ ...firstSheet, config: nextConfig }, ...workbook.slice(1)]
}

const getCellValueText = (cell) => asText(cell?.v?.m ?? cell?.v?.v ?? '').trim()
const normalizeSheetCellText = (value) => {
  const s = asText(value).trim()
  return s.startsWith("'") ? s.slice(1) : s
}

const buildCellValueMap = (workbook) => {
  const firstSheet = Array.isArray(workbook) && workbook.length ? workbook[0] : null
  const celldata = Array.isArray(firstSheet?.celldata) ? firstSheet.celldata : []
  const map = new Map()
  celldata.forEach((cell) => {
    if (!cell || typeof cell.r !== 'number' || typeof cell.c !== 'number') return
    map.set(`${cell.r}:${cell.c}`, getCellValueText(cell))
  })
  return map
}

const clearCopySelectionVisual = () => {
  if (typeof window === 'undefined') return
  // Meniru perilaku Excel: setelah edit nilai, mode copy dibatalkan (garis putus-putus hilang).
  window.requestAnimationFrame(() => {
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
    })
    document.dispatchEvent(escEvent)
  })
}

const selectionTouchesLockedColumns = (columns) => {
  if (!Array.isArray(columns) || columns.length === 0) return false
  if (typeof window === 'undefined') return false
  const luckysheet = window.luckysheet
  const selections = luckysheet?.getluckysheet_select_save?.()
  if (!Array.isArray(selections) || selections.length === 0) return false

  return selections.some((sel) => {
    const row = Array.isArray(sel?.row) ? sel.row : []
    const column = Array.isArray(sel?.column) ? sel.column : []
    if (row.length < 2 || column.length < 2) return false
    const rowStart = Number(row[0])
    const rowEnd = Number(row[1])
    const colStart = Number(column[0])
    const colEnd = Number(column[1])
    if (Number.isNaN(rowStart) || Number.isNaN(rowEnd) || Number.isNaN(colStart) || Number.isNaN(colEnd)) {
      return false
    }
    // Baris 0 adalah header.
    if (Math.max(rowStart, rowEnd) < 1) return false

    const minCol = Math.min(colStart, colEnd)
    const maxCol = Math.max(colStart, colEnd)
    for (let c = minCol; c <= maxCol; c++) {
      if (columns[c]?.readonly) return true
    }
    return false
  })
}

const applyRowsByColumnFilters = (rows, filters) => {
  const entries = Object.entries(filters || {}).filter(([, values]) => Array.isArray(values) && values.length > 0)
  if (entries.length === 0) return rows
  return rows.filter((row) =>
    entries.every(([key, values]) => values.includes(asText(row?.[key]).trim()))
  )
}

const getFilterBaseRows = (rows, filters, excludeColumnKey = null) => {
  if (!excludeColumnKey) return applyRowsByColumnFilters(rows, filters)
  const nextFilters = { ...(filters || {}) }
  delete nextFilters[excludeColumnKey]
  return applyRowsByColumnFilters(rows, nextFilters)
}

/** Pindah kolom ke posisi 1-based (selaras Bisyaroh rekap urutan pengurus). */
function moveColumnToPosition(list, itemKey, targetOneBased) {
  const n = list.length
  if (n === 0) return list
  const idx = list.findIndex((c) => c.key === itemKey)
  if (idx < 0) return list
  let pos = parseInt(String(targetOneBased), 10)
  if (!Number.isFinite(pos)) return list
  pos = Math.max(1, Math.min(n, pos)) - 1
  if (idx === pos) return list
  const next = [...list]
  const [item] = next.splice(idx, 1)
  next.splice(pos, 0, item)
  return next
}

function ReorderColumnItem({
  item,
  index,
  total,
  visibleColumns,
  hasActiveFilter,
  onToggleColumn,
  onMoveTo,
  onOpenFilter,
  onDragAutoScroll,
  onDragEnd,
}) {
  const dragControls = useDragControls()
  const [orderInput, setOrderInput] = useState(String(index + 1))

  useEffect(() => {
    setOrderInput(String(index + 1))
  }, [index])

  const commitOrder = useCallback(() => {
    const parsed = parseInt(orderInput, 10)
    if (!Number.isFinite(parsed)) {
      setOrderInput(String(index + 1))
      return
    }
    const clamped = Math.max(1, Math.min(total, parsed))
    setOrderInput(String(clamped))
    if (clamped !== index + 1) {
      onMoveTo(item.key, clamped)
    }
  }, [orderInput, index, total, item.key, onMoveTo])

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      onDrag={(_, info) => onDragAutoScroll(info.point.y)}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2 rounded-md border border-transparent bg-white/80 dark:bg-gray-800/50 py-0.5"
    >
      <input
        type="checkbox"
        id={`excel-pengurus-col-${item.key}`}
        checked={!!visibleColumns[item.key]}
        onChange={() => onToggleColumn(item.key)}
        className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 shrink-0"
      />
      <input
        type="number"
        min={1}
        max={total}
        value={orderInput}
        onChange={(e) => setOrderInput(e.target.value)}
        onBlur={commitOrder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitOrder()
            e.currentTarget.blur()
          }
        }}
        className="w-11 h-7 shrink-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-center tabular-nums text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
        title="Nomor urut (1 = atas). Enter atau klik luar untuk menerapkan."
        aria-label={`Urutan kolom ${item.label}`}
      />
      <button
        type="button"
        onPointerDown={(event) => dragControls.start(event)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-grab active:cursor-grabbing"
        title="Tarik untuk pindah urutan"
        aria-label={`Geser urutan kolom ${item.label}`}
        style={{ touchAction: 'none' }}
      >
        ≡
      </button>
      <label
        htmlFor={`excel-pengurus-col-${item.key}`}
        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer flex-1 min-w-0 truncate"
        title={item.label}
      >
        {item.label}
      </label>
      <button
        type="button"
        onClick={() => onOpenFilter(item.key)}
        className={`h-7 px-2 shrink-0 rounded border text-xs ${
          hasActiveFilter
            ? 'border-teal-500 text-teal-600 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30'
            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
        }`}
        title="Filter kolom"
      >
        Filter
      </button>
    </Reorder.Item>
  )
}

export default function ExcelPengurusEditor() {
  const { showNotification } = useNotification()
  const location = useLocation()
  const listFilters = useMemo(
    () => readPengurusListFiltersFromSearch(location.search),
    [location.search]
  )
  const workbookRef = useRef(null)
  const sheetContainerRef = useRef(null)
  const initialCellMapRef = useRef(new Map())
  const workbookDataRef = useRef([])
  const changedCountDebounceRef = useRef(null)
  const baselineRowsByIdRef = useRef(new Map())
  const columnListScrollRef = useRef(null)
  const isMobileRef = useRef(false)
  const touchPanStateRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [workbookData, setWorkbookData] = useState([])
  const [isColumnOffcanvasOpen, setIsColumnOffcanvasOpen] = useState(false)
  const [isReviewOffcanvasOpen, setIsReviewOffcanvasOpen] = useState(false)
  const [pendingChanges, setPendingChanges] = useState([])
  const [pendingPayloadRows, setPendingPayloadRows] = useState([])
  const [previewValueMode, setPreviewValueMode] = useState('sesudah')
  const [visibleColumns, setVisibleColumns] = useState(() => getVisibleColumnsSelection())
  const [columnFilters, setColumnFilters] = useState({})
  const [isColumnFilterOffcanvasOpen, setIsColumnFilterOffcanvasOpen] = useState(false)
  const [activeFilterColumnKey, setActiveFilterColumnKey] = useState(null)
  const [draftFilterSelection, setDraftFilterSelection] = useState([])
  const [filterSearchText, setFilterSearchText] = useState('')
  const [filterVisibleLimit, setFilterVisibleLimit] = useState(100)
  const [columnOrderVersion, setColumnOrderVersion] = useState(0)
  const [workbookRenderVersion, setWorkbookRenderVersion] = useState(0)
  const [columnOrder, setColumnOrder] = useState(() => [...SHEET_COLUMNS])
  const [columnOrderDraft, setColumnOrderDraft] = useState(() => [...SHEET_COLUMNS])
  const columnOrderRef = useRef(columnOrder)
  columnOrderRef.current = columnOrder
  const isApplyingLayoutRef = useRef(false)
  const allRowsRef = useRef([])

  const closeColumnOffcanvas = useOffcanvasBackClose(
    isColumnOffcanvasOpen,
    () => setIsColumnOffcanvasOpen(false),
    {
      useDomisiliPopstateStack: true,
      domisiliStackId: 'excel-pengurus-columns',
      domisiliStackPriority: 20,
    }
  )
  const closeReviewOffcanvas = useOffcanvasBackClose(
    isReviewOffcanvasOpen,
    () => setIsReviewOffcanvasOpen(false),
    {
      useDomisiliPopstateStack: true,
      domisiliStackId: 'excel-pengurus-review',
      domisiliStackPriority: 30,
    }
  )
  const closeColumnFilterOffcanvas = useOffcanvasBackClose(
    isColumnFilterOffcanvasOpen,
    () => setIsColumnFilterOffcanvasOpen(false),
    {
      useDomisiliPopstateStack: true,
      domisiliStackId: 'excel-pengurus-column-filter',
      domisiliStackPriority: 40,
    }
  )


  const applyChangedCellHighlight = useCallback((nextWorkbook) => {
    const firstSheet = Array.isArray(nextWorkbook) && nextWorkbook.length ? nextWorkbook[0] : null
    if (!firstSheet || !Array.isArray(firstSheet.celldata)) return nextWorkbook

    const colMeta = columnOrderRef.current
    const baseline = initialCellMapRef.current
    let hasChangedCell = false
    const nextCelldata = firstSheet.celldata.map((cell) => {
      if (!cell || typeof cell.r !== 'number' || typeof cell.c !== 'number') return cell
      if (cell.r === 0) return cell // baris header
      if (cell.c < 0 || cell.c >= colMeta.length) return cell

      const meta = colMeta[cell.c]
      const nextV = { ...(cell.v || {}) }
      if (meta?.readonly) {
        const key = `${cell.r}:${cell.c}`
        const originalValue = baseline.get(key) ?? ''
        // Kolom readonly (ID/NIS/NIK): paksa kembali ke nilai awal meski user paste/ubah.
        const currentValue = getCellValueText(cell)
        const nextBg = READONLY_CELL_BG
        const isCellChanged = currentValue !== originalValue || nextV.bg !== nextBg
        if (!isCellChanged) return cell
        hasChangedCell = true
        nextV.m = originalValue
        nextV.v = originalValue
        nextV.bg = nextBg
        return { ...cell, v: nextV }
      }

      const key = `${cell.r}:${cell.c}`
      const originalValue = baseline.get(key) ?? ''
      const currentValue = getCellValueText(cell)
      if (currentValue !== originalValue) {
        if (nextV.bg === CHANGED_CELL_BG) return cell
        hasChangedCell = true
        nextV.bg = CHANGED_CELL_BG
      } else if (nextV.bg === CHANGED_CELL_BG) {
        hasChangedCell = true
        delete nextV.bg
      } else {
        return cell
      }
      return { ...cell, v: nextV }
    })

    if (!hasChangedCell) return nextWorkbook
    return [{ ...firstSheet, celldata: nextCelldata }, ...nextWorkbook.slice(1)]
  }, [])

  const syncCurrentWorkbookRowsToAllRows = useCallback(() => {
    const latestWorkbook = workbookRef.current?.getAllSheets?.()
    const sourceWorkbook = Array.isArray(latestWorkbook) && latestWorkbook.length > 0
      ? latestWorkbook
      : workbookDataRef.current
    const extracted = extractRowsFromWorkbookByNip(
      sourceWorkbook,
      columnOrderRef.current,
      allRowsRef.current,
      EXCEL_NIP_EXTRACT_OPTS
    )
    if (Array.isArray(extracted.rows) && extracted.rows.length > 0) {
      allRowsRef.current = extracted.rows
    }
  }, [])

  const rebuildWorkbookFromRows = useCallback((rows) => {
    const cols = columnOrderRef.current
    const rebuiltWorkbook = applyColumnVisibility(buildWorkbookData(rows, cols), visibleColumns, cols)
    workbookDataRef.current = rebuiltWorkbook
    setWorkbookData(rebuiltWorkbook)
    setWorkbookRenderVersion((v) => v + 1)
  }, [visibleColumns])

  const applyCurrentFiltersToSheet = useCallback((nextFilters) => {
    syncCurrentWorkbookRowsToAllRows()
    const filteredRows = applyRowsByColumnFilters(allRowsRef.current, nextFilters)
    rebuildWorkbookFromRows(filteredRows)
  }, [rebuildWorkbookFromRows, syncCurrentWorkbookRowsToAllRows])

  useEffect(() => {
    workbookDataRef.current = workbookData
  }, [workbookData])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await manageUsersAPI.getAll({ limit: 1000 })
        if (!cancelled && res?.success && res.data?.users) {
          const users = Array.isArray(res.data.users) ? res.data.users : []
          const filteredUsers = filterPengurusList(users, listFilters)
          const dataRows = filteredUsers.map(mapPengurusUserToExcelRow)
          allRowsRef.current = dataRows
          const initialRows = applyRowsByColumnFilters(dataRows, columnFilters)
          const cols = columnOrderRef.current
          const initialWorkbook = applyColumnVisibility(
            buildWorkbookData(initialRows, cols),
            getVisibleColumnsSelection(),
            cols
          )
          initialCellMapRef.current = buildCellValueMap(initialWorkbook)
          baselineRowsByIdRef.current = new Map(
            dataRows.map((row) => [String(row.id), row])
          )
          setWorkbookData(initialWorkbook)
          workbookDataRef.current = initialWorkbook
        }
      } catch (e) {
        if (!cancelled) {
          showNotification('Gagal memuat data pengurus untuk editor Excel', 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showNotification, listFilters])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!selectionTouchesLockedColumns(columnOrderRef.current)) return
      const isTypingKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
      const isDeleteKey = event.key === 'Backspace' || event.key === 'Delete'
      const isCutPaste = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'x' || event.key.toLowerCase() === 'v')
      if (!isTypingKey && !isDeleteKey && !isCutPaste) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onPaste = (event) => {
      if (!selectionTouchesLockedColumns(columnOrderRef.current)) return
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('paste', onPaste, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('paste', onPaste, true)
    }
  }, [])

  const normalizeForApiValue = (key, rawValue) => {
    const v = asText(rawValue).trim()
    if (NUMERIC_FIELD_KEYS.has(key)) {
      if (v === '') return null
      const n = Number(v)
      if (!Number.isFinite(n)) return null
      if (key === 'jarak') return Math.round(n * 100) / 100
      return n
    }
    return v === '' ? null : v
  }

  const buildPendingChangesFromRows = useCallback((rowsRaw) => {
    const rows = rowsRaw.filter((row) => String(row.id || '').trim() !== '')
    const baseline = baselineRowsByIdRef.current
    const changes = []
    const payloadMap = new Map()

    rows.forEach((row) => {
      const id = String(row.id || '').trim()
      if (!id) return
      const beforeRow = baseline.get(id) || {}
      columnOrderRef.current.forEach((col) => {
        if (col.readonly || col.key === 'id') return
        const beforeText = asText(beforeRow[col.key]).trim()
        const afterText = asText(row[col.key]).trim()
        if (valuesEqualForExcelField(col.key, beforeText, afterText, NUMERIC_FIELD_KEYS)) return

        const fieldError = validatePengurusExcelField(col.key, afterText)

        changes.push({
          id,
          nama: asText(row.nama || beforeRow.nama || '-'),
          key: col.key,
          label: col.label,
          from: beforeText === '' ? '-' : beforeText,
          to: afterText === '' ? '-' : afterText,
          error: fieldError
        })

        if (!payloadMap.has(id)) payloadMap.set(id, { id })
        payloadMap.get(id)[col.key] = normalizeForApiValue(col.key, row[col.key])
      })
    })

    return {
      changes,
      payloadRows: Array.from(payloadMap.values()),
    }
  }, [])

  const buildPendingChanges = useCallback((sourceWorkbook) => {
    const extracted = extractRowsFromWorkbookByNip(
      sourceWorkbook,
      columnOrderRef.current,
      allRowsRef.current,
      EXCEL_NIP_EXTRACT_OPTS
    )
    return buildPendingChangesFromRows(extracted.rows)
  }, [buildPendingChangesFromRows])

  const previewErrorCount = useMemo(
    () => pendingChanges.filter((c) => c.error).length,
    [pendingChanges]
  )

  const handleConfirmSave = async () => {
    try {
      if (previewErrorCount > 0) {
        showNotification(
          `Ada ${previewErrorCount} sel tidak valid (merah di preview). Perbaiki dulu sebelum menyimpan.`,
          'error'
        )
        return
      }
      setSaving(true)
      if (!Array.isArray(pendingPayloadRows) || pendingPayloadRows.length === 0) {
        showNotification('Tidak ada perubahan untuk disimpan', 'warning')
        return
      }
      const res = await manageUsersAPI.bulkUpdatePengurusFromExcel(pendingPayloadRows)
      if (res?.success) {
        syncCurrentWorkbookRowsToAllRows()
        const latestWorkbook = workbookRef.current?.getAllSheets?.()
        const sourceWorkbook = Array.isArray(latestWorkbook) && latestWorkbook.length > 0
          ? latestWorkbook
          : workbookDataRef.current
        initialCellMapRef.current = buildCellValueMap(sourceWorkbook)
        const freshRows = allRowsRef.current
        baselineRowsByIdRef.current = new Map(freshRows.map((r) => [String(r.id), r]))
        setPendingChanges([])
        setPendingPayloadRows([])
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('excel-pengurus-changed-count', { detail: { count: 0 } }))
        }
        setIsReviewOffcanvasOpen(false)
        setWorkbookData((prev) => applyChangedCellHighlight(prev))
        showNotification(`Simpan massal selesai. Updated: ${res.updated ?? 0}`, 'success')
      } else {
        showNotification(res?.message || 'Gagal menyimpan data massal', 'error')
      }
    } catch (e) {
      showNotification('Gagal menyimpan perubahan', 'error')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('excel-pengurus-saving-changed', { detail: { saving } }))
  }, [saving])

  useEffect(() => () => {
    if (changedCountDebounceRef.current) {
      clearTimeout(changedCountDebounceRef.current)
      changedCountDebounceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 768px), (pointer: coarse)')
    isMobileRef.current = media.matches
    const handleMediaChange = (event) => {
      isMobileRef.current = event.matches
    }
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMediaChange)
      return () => media.removeEventListener('change', handleMediaChange)
    }
    media.addListener(handleMediaChange)
    return () => media.removeListener(handleMediaChange)
  }, [])

  useEffect(() => {
    const container = sheetContainerRef.current
    if (!container) return
    const state = touchPanStateRef.current
    let retryTimer = null

    const pickScrollableTarget = () => {
      const candidates = [
        '.luckysheet-grid-window',
        '.luckysheet-cell-main',
        '.luckysheet-grid-container',
      ]
      for (const selector of candidates) {
        const el = container.querySelector(selector)
        if (el && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
          return el
        }
      }
      return container.querySelector('.luckysheet-grid-window') || container
    }

    const bindTouchPan = () => {
      const target = pickScrollableTarget()
      if (!target) return false

      const onTouchStart = (event) => {
        if (!isMobileRef.current) return
        if (!event.touches || event.touches.length !== 1) return
        const touch = event.touches[0]
        state.active = true
        state.moved = false
        state.startX = touch.clientX
        state.startY = touch.clientY
        state.startLeft = target.scrollLeft
        state.startTop = target.scrollTop
      }

      const onTouchMove = (event) => {
        if (!state.active || !event.touches || event.touches.length !== 1) return
        const touch = event.touches[0]
        const dx = touch.clientX - state.startX
        const dy = touch.clientY - state.startY
        if (!state.moved && Math.abs(dx) + Math.abs(dy) < 4) return
        state.moved = true
        if (event.cancelable) event.preventDefault()
        target.scrollLeft = state.startLeft - dx
        target.scrollTop = state.startTop - dy
      }

      const onTouchEnd = () => {
        state.active = false
        state.moved = false
      }

      target.addEventListener('touchstart', onTouchStart, { passive: true })
      target.addEventListener('touchmove', onTouchMove, { passive: false })
      target.addEventListener('touchend', onTouchEnd, { passive: true })
      target.addEventListener('touchcancel', onTouchEnd, { passive: true })

      return () => {
        target.removeEventListener('touchstart', onTouchStart)
        target.removeEventListener('touchmove', onTouchMove)
        target.removeEventListener('touchend', onTouchEnd)
        target.removeEventListener('touchcancel', onTouchEnd)
      }
    }

    let unbind = bindTouchPan()
    if (!unbind) {
      let retries = 0
      retryTimer = setInterval(() => {
        retries += 1
        unbind = bindTouchPan()
        if (unbind || retries >= 20) {
          clearInterval(retryTimer)
          retryTimer = null
        }
      }, 150)
    }

    return () => {
      if (retryTimer) clearInterval(retryTimer)
      if (typeof unbind === 'function') unbind()
      state.active = false
      state.moved = false
    }
  }, [columnOrderVersion, loading])

  useEffect(() => {
    const onHeaderSaveRequest = () => {
      if (saving) return
      syncCurrentWorkbookRowsToAllRows()
      const latestWorkbook = workbookRef.current?.getAllSheets?.()
      const sourceWorkbook = Array.isArray(latestWorkbook) && latestWorkbook.length > 0
        ? latestWorkbook
        : workbookDataRef.current
      const extracted = extractRowsFromWorkbookByNip(
        sourceWorkbook,
        columnOrderRef.current,
        allRowsRef.current,
        EXCEL_NIP_EXTRACT_OPTS
      )
      if (extracted.errors.length > 0) {
        const msg = extracted.errors.slice(0, 4).join('\n')
        const more = extracted.errors.length > 4 ? `\n(+${extracted.errors.length - 4} lainnya)` : ''
        showNotification(msg + more, 'error')
        return
      }
      if (extracted.warnings.length > 0) {
        const w = extracted.warnings.slice(0, 2).join(' ')
        showNotification(w, 'info')
      }
      allRowsRef.current = extracted.rows
      const pending = buildPendingChangesFromRows(extracted.rows)
      if (pending.changes.length === 0) {
        showNotification('Tidak ada perubahan yang perlu disimpan', 'warning')
        return
      }
      setPreviewValueMode('sesudah')
      setPendingChanges(pending.changes)
      setPendingPayloadRows(pending.payloadRows)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('excel-pengurus-changed-count', { detail: { count: pending.payloadRows.length } }))
      }
      setIsReviewOffcanvasOpen(true)
    }
    window.addEventListener('excel-pengurus-save-request', onHeaderSaveRequest)
    return () => {
      window.removeEventListener('excel-pengurus-save-request', onHeaderSaveRequest)
      window.dispatchEvent(new CustomEvent('excel-pengurus-saving-changed', { detail: { saving: false } }))
      window.dispatchEvent(new CustomEvent('excel-pengurus-changed-count', { detail: { count: 0 } }))
    }
  }, [saving, buildPendingChangesFromRows, showNotification, syncCurrentWorkbookRowsToAllRows])

  useEffect(() => {
    const onToggleColumns = () => setIsColumnOffcanvasOpen(true)
    window.addEventListener('excel-pengurus-columns-toggle', onToggleColumns)
    return () => {
      window.removeEventListener('excel-pengurus-columns-toggle', onToggleColumns)
    }
  }, [])

  useEffect(() => {
    const onCopy = (event) => {
      const api = workbookRef.current
      if (!api) return
      const sel = api.getSelection?.()
      if (!Array.isArray(sel) || sel.length === 0) return

      const container = sheetContainerRef.current
      if (container && !container.contains(document.activeElement) && !container.contains(event.target)) {
        return
      }

      const sheets = api.getAllSheets?.()
      const firstSheet = Array.isArray(sheets) && sheets.length ? sheets[0] : null
      const matrixData = Array.isArray(firstSheet?.data) ? firstSheet.data : []
      const hiddenColumnsConfig = firstSheet?.config?.colhidden || {}
      const isColumnHidden = (colIndex) =>
        Object.prototype.hasOwnProperty.call(hiddenColumnsConfig, String(colIndex)) ||
        Object.prototype.hasOwnProperty.call(hiddenColumnsConfig, colIndex)
      const range = sel[0]
      const row = Array.isArray(range?.row) ? range.row : []
      const column = Array.isArray(range?.column) ? range.column : []
      if (row.length < 2 || column.length < 2) return

      const r1 = Math.min(Number(row[0]), Number(row[1]))
      const r2 = Math.max(Number(row[0]), Number(row[1]))
      const c1 = Math.min(Number(column[0]), Number(column[1]))
      const c2 = Math.max(Number(column[0]), Number(column[1]))
      if ([r1, r2, c1, c2].some((n) => Number.isNaN(n))) return

      const lines = []
      for (let r = r1; r <= r2; r++) {
        const vals = []
        for (let c = c1; c <= c2; c++) {
          if (isColumnHidden(c)) continue
          const cell = matrixData?.[r]?.[c]
          let text = normalizeSheetCellText(cell?.m ?? cell?.v ?? '')
          const key = columnOrderRef.current[c]?.key
          if (key && FORCE_TEXT_KEYS.has(key) && text !== '') {
            text = text.startsWith("'") ? text : `'${text}`
          }
          vals.push(text)
        }
        if (vals.length === 0) continue
        lines.push(vals.join('\t'))
      }
      const plain = lines.join('\n')
      if (!plain) return

      event.preventDefault()
      event.stopPropagation()
      event.clipboardData?.setData('text/plain', plain)
    }

    document.addEventListener('copy', onCopy, true)
    return () => {
      document.removeEventListener('copy', onCopy, true)
    }
  }, [])

  const handleToggleColumn = (key) => {
    const next = { ...visibleColumns, [key]: !visibleColumns[key] }
    const isAnyVisible = columnOrder.some((col) => next[col.key])
    if (!isAnyVisible) {
      showNotification('Minimal satu kolom harus ditampilkan', 'warning')
      return
    }
    setVisibleColumns(next)
    setVisibleColumnsSelection(next)
    const cols = columnOrderRef.current
    setWorkbookData((prev) => applyColumnVisibility(prev, next, cols))
  }

  const handleSelectAllColumns = (checked) => {
    const next = getDefaultVisibleColumns()
    columnOrder.forEach((col) => {
      next[col.key] = checked
    })
    setVisibleColumns(next)
    setVisibleColumnsSelection(next)
    const cols = columnOrderRef.current
    setWorkbookData((prev) => applyColumnVisibility(prev, next, cols))
  }

  const openColumnFilter = (columnKey) => {
    syncCurrentWorkbookRowsToAllRows()
    const baseRows = getFilterBaseRows(allRowsRef.current, columnFilters, columnKey)
    const allUniqueValues = Array.from(
      new Set(baseRows.map((row) => asText(row?.[columnKey]).trim()))
    ).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))

    const hasExistingFilter = Object.prototype.hasOwnProperty.call(columnFilters, columnKey) &&
      Array.isArray(columnFilters[columnKey])
    const selectedValues = hasExistingFilter ? columnFilters[columnKey] : allUniqueValues
    setActiveFilterColumnKey(columnKey)
    setDraftFilterSelection(selectedValues)
    setFilterSearchText('')
    setFilterVisibleLimit(100)
    setIsColumnFilterOffcanvasOpen(true)
  }

  const clearActiveColumnFilter = () => {
    setDraftFilterSelection([])
  }

  const selectAllActiveColumnFilter = () => {
    if (!activeFilterColumnKey) return
    const baseRows = getFilterBaseRows(allRowsRef.current, columnFilters, activeFilterColumnKey)
    const values = Array.from(
      new Set(baseRows.map((row) => asText(row?.[activeFilterColumnKey]).trim()))
    ).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
    setDraftFilterSelection(values)
  }

  const toggleActiveColumnFilterValue = (value) => {
    if (!activeFilterColumnKey) return
    const current = Array.isArray(draftFilterSelection) ? draftFilterSelection : []
    const baseRows = getFilterBaseRows(allRowsRef.current, columnFilters, activeFilterColumnKey)
    const allValues = Array.from(
      new Set(baseRows.map((row) => asText(row?.[activeFilterColumnKey]).trim()))
    ).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
    const isAllSelected =
      allValues.length > 0 &&
      current.length === allValues.length &&
      allValues.every((v) => current.includes(v))

    // UX: jika kondisi awal "semua terpilih", klik pertama dianggap memilih nilai itu saja.
    if (isAllSelected) {
      setDraftFilterSelection([value])
      return
    }

    const exists = current.includes(value)
    const nextValues = exists ? current.filter((v) => v !== value) : [...current, value]
    setDraftFilterSelection(nextValues)
  }

  const applyActiveColumnFilter = () => {
    if (!activeFilterColumnKey) return
    syncCurrentWorkbookRowsToAllRows()
    const baseRows = getFilterBaseRows(allRowsRef.current, columnFilters, activeFilterColumnKey)
    const allValues = Array.from(
      new Set(baseRows.map((row) => asText(row?.[activeFilterColumnKey]).trim()))
    ).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
    const selectedValues = Array.isArray(draftFilterSelection) ? draftFilterSelection : []
    const isAllSelected =
      allValues.length > 0 &&
      selectedValues.length === allValues.length &&
      allValues.every((v) => selectedValues.includes(v))
    const next = { ...columnFilters }
    if (selectedValues.length === 0 || isAllSelected) {
      delete next[activeFilterColumnKey]
    } else {
      next[activeFilterColumnKey] = selectedValues
    }
    setColumnFilters(next)
    const filteredRows = applyRowsByColumnFilters(allRowsRef.current, next)
    rebuildWorkbookFromRows(filteredRows)
    setIsColumnFilterOffcanvasOpen(false)
  }

  const applyColumnOrder = useCallback((nextColumns) => {
    if (!Array.isArray(nextColumns) || nextColumns.length < SHEET_COLUMNS.length) return
    isApplyingLayoutRef.current = true
    syncCurrentWorkbookRowsToAllRows()

    const baseOrdered = nextColumns.filter((c) => SHEET_COLUMNS.some((b) => b.key === c.key))
    if (baseOrdered.length === SHEET_COLUMNS.length) {
      SHEET_COLUMNS.splice(0, SHEET_COLUMNS.length, ...baseOrdered)
      persistColumnOrder()
    }

    const rows = applyRowsByColumnFilters(allRowsRef.current, columnFilters)
    const rebuiltWorkbook = applyColumnVisibility(buildWorkbookData(rows, nextColumns), visibleColumns, nextColumns)
    initialCellMapRef.current = buildCellValueMap(rebuiltWorkbook)
    workbookDataRef.current = rebuiltWorkbook
    setWorkbookData(rebuiltWorkbook)
    setColumnOrder([...nextColumns])
    setColumnOrderDraft([...nextColumns])
    setColumnOrderVersion((v) => v + 1)
    setPendingChanges([])
    setPendingPayloadRows([])
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('excel-pengurus-changed-count', { detail: { count: 0 } }))
    }
    window.setTimeout(() => {
      isApplyingLayoutRef.current = false
    }, 300)
  }, [columnFilters, syncCurrentWorkbookRowsToAllRows, visibleColumns])

  const handleMoveColumnTo = useCallback(
    (itemKey, targetOneBased) => {
      const nextColumns = moveColumnToPosition(columnOrderDraft, itemKey, targetOneBased)
      setColumnOrderDraft(nextColumns)
      applyColumnOrder(nextColumns)
    },
    [columnOrderDraft, applyColumnOrder]
  )

  const handleReorderDraft = useCallback((nextColumns) => {
    if (!Array.isArray(nextColumns) || nextColumns.length !== columnOrderDraft.length) return
    setColumnOrderDraft(nextColumns)
  }, [columnOrderDraft.length])

  useEffect(() => {
    if (isColumnOffcanvasOpen) {
      setColumnOrderDraft([...columnOrder])
    }
  }, [isColumnOffcanvasOpen, columnOrder])

  const handleColumnDragAutoScroll = useCallback((pointerY) => {
    const container = columnListScrollRef.current
    if (!container || typeof pointerY !== 'number') return
    const rect = container.getBoundingClientRect()
    const threshold = 64
    const step = 28

    if (pointerY < rect.top + threshold) {
      container.scrollTop = Math.max(0, container.scrollTop - step)
      return
    }
    if (pointerY > rect.bottom - threshold) {
      container.scrollTop = Math.min(container.scrollHeight, container.scrollTop + step)
    }
  }, [])

  const activeFilterColumn = columnOrder.find((col) => col.key === activeFilterColumnKey) || null
  const activeFilterSelectedValues = Array.isArray(draftFilterSelection) ? draftFilterSelection : []
  const activeFilterBaseRows = activeFilterColumn
    ? getFilterBaseRows(allRowsRef.current, columnFilters, activeFilterColumn.key)
    : []
  const activeFilterUniqueValues = activeFilterColumn
    ? Array.from(
      new Set(
        activeFilterBaseRows.map((row) => asText(row?.[activeFilterColumn.key]).trim())
      )
    )
      .sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
      .filter((value) =>
        filterSearchText.trim() === ''
          ? true
          : value.toLowerCase().includes(filterSearchText.trim().toLowerCase())
      )
    : []
  const activeFilterVisibleValues = activeFilterUniqueValues.slice(0, filterVisibleLimit)

  const savePreviewModel = useMemo(
    () => buildSavePreviewModel(pendingChanges, columnOrder, baselineRowsByIdRef.current),
    [pendingChanges, columnOrder]
  )

  useEffect(() => {
    const api = workbookRef.current
    if (!api) return
    const hiddenColumns = []
    const shownColumns = []
    columnOrder.forEach((col, idx) => {
      if (visibleColumns[col.key]) shownColumns.push(String(idx))
      else hiddenColumns.push(String(idx))
    })

    if (shownColumns.length > 0) {
      api.showRowOrColumn(shownColumns, 'column')
    }
    if (hiddenColumns.length > 0) {
      api.hideRowOrColumn(hiddenColumns, 'column')
    }
  }, [visibleColumns, columnOrder])

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="excel-pengurus-page h-full overflow-hidden p-2 sm:p-3 lg:p-4 flex flex-col gap-2">
      <div ref={sheetContainerRef} className="excel-pengurus-editor flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-visible">
        <Suspense
          fallback={(
            <div className="flex items-center justify-center h-full min-h-[16rem]">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
            </div>
          )}
        >
          <Workbook
            key={`excel-pengurus-workbook-${columnOrderVersion}-${workbookRenderVersion}`}
            ref={workbookRef}
            data={workbookData}
            onChange={(nextData) => {
              // Hindari setState berulang dari callback internal FortuneSheet (resize/repaint),
              // cukup simpan snapshot terbaru untuk proses simpan.
              workbookDataRef.current = nextData
              if (typeof window !== 'undefined') {
                if (isApplyingLayoutRef.current) return
                if (isMobileRef.current) {
                  // Root cause mobile lag: perhitungan diff global di setiap onChange.
                  // Di HP, skip hitung realtime agar gesture sentuh tetap responsif.
                  return
                }
                if (changedCountDebounceRef.current) {
                  clearTimeout(changedCountDebounceRef.current)
                }
                changedCountDebounceRef.current = setTimeout(() => {
                  const latestWorkbook = workbookRef.current?.getAllSheets?.()
                  const sourceWorkbook = Array.isArray(latestWorkbook) && latestWorkbook.length > 0
                    ? latestWorkbook
                    : workbookDataRef.current
                  const pending = buildPendingChanges(sourceWorkbook)
                  window.dispatchEvent(new CustomEvent('excel-pengurus-changed-count', { detail: { count: pending.payloadRows.length } }))
                  changedCountDebounceRef.current = null
                }, 180)
              }
            }}
          />
        </Suspense>
      </div>
      {createPortal(
        <AnimatePresence>
          {isColumnOffcanvasOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[9998]"
                onClick={closeColumnOffcanvas}
                aria-hidden="true"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Kolom Excel Pengurus</h3>
                  <button
                    type="button"
                    onClick={closeColumnOffcanvas}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div ref={columnListScrollRef} className="flex-1 overflow-y-auto p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Centang kolom untuk ditampilkan. Ketik <strong>nomor urut</strong> setelah centang (mis. 2 = pindah ke baris ke-2), lalu
                    Enter — atau tarik <span className="font-mono">≡</span>.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => handleSelectAllColumns(true)}
                      className="text-xs px-2 py-1 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-800/50"
                    >
                      Tampilkan semua
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAllColumns(false)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Sembunyikan semua
                    </button>
                  </div>
                  <Reorder.Group
                    key={columnOrderVersion}
                    axis="y"
                    values={columnOrderDraft}
                    onReorder={handleReorderDraft}
                    className="space-y-2"
                  >
                    {columnOrderDraft.map((item, index) => (
                      <ReorderColumnItem
                        key={item.key}
                        item={item}
                        index={index}
                        total={columnOrderDraft.length}
                        visibleColumns={visibleColumns}
                        hasActiveFilter={Array.isArray(columnFilters[item.key]) && columnFilters[item.key].length > 0}
                        onToggleColumn={handleToggleColumn}
                        onMoveTo={handleMoveColumnTo}
                        onOpenFilter={openColumnFilter}
                        onDragAutoScroll={handleColumnDragAutoScroll}
                        onDragEnd={() => applyColumnOrder(columnOrderDraft)}
                      />
                    ))}
                  </Reorder.Group>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
      {createPortal(
        <AnimatePresence>
          {isColumnFilterOffcanvasOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-black/50 z-[9999]"
                onClick={(event) => {
                  event.stopPropagation()
                  closeColumnFilterOffcanvas()
                }}
                aria-hidden="true"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed right-0 bottom-0 w-full max-w-md h-[72vh] bg-white dark:bg-gray-800 shadow-xl z-[10000] flex flex-col rounded-t-2xl border-t border-gray-200 dark:border-gray-700"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Filter Kolom</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{activeFilterColumn?.label || '-'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      closeColumnFilterOffcanvas()
                    }}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Tutup filter"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={filterSearchText}
                    onChange={(e) => {
                      setFilterSearchText(e.target.value)
                      setFilterVisibleLimit(100)
                    }}
                    placeholder="Cari nilai..."
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllActiveColumnFilter}
                      className="h-7 w-7 rounded border border-gray-300 dark:border-gray-600 text-emerald-600 dark:text-emerald-400"
                      title="Pilih semua"
                      aria-label="Pilih semua"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={clearActiveColumnFilter}
                      className="h-7 w-7 rounded border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400"
                      title="Tidak pilih"
                      aria-label="Tidak pilih"
                    >
                      ✕
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Terpilih: {activeFilterSelectedValues.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {activeFilterVisibleValues.map((value) => (
                    <label
                      key={value === '' ? '__empty__' : value}
                      className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                    >
                      <input
                        type="checkbox"
                        checked={activeFilterSelectedValues.includes(value)}
                        onChange={() => toggleActiveColumnFilterValue(value)}
                        className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                      />
                      <span>{value === '' ? '(Kosong)' : value}</span>
                    </label>
                  ))}
                  {activeFilterUniqueValues.length === 0 && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Tidak ada data unik yang cocok.</div>
                  )}
                  {activeFilterUniqueValues.length > filterVisibleLimit && (
                    <button
                      type="button"
                      onClick={() => setFilterVisibleLimit((n) => n + 100)}
                      className="mt-2 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                    >
                      Tampilkan lebih banyak
                    </button>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={applyActiveColumnFilter}
                    className="w-full px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium"
                  >
                    Apply
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
      {createPortal(
        <AnimatePresence>
          {isReviewOffcanvasOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-[9998]"
                onClick={closeReviewOffcanvas}
                aria-hidden="true"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed left-0 right-0 bottom-0 z-[9999] h-[82vh] sm:h-[85vh] bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Preview Simpan</h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {savePreviewModel.rows.length} baris · {pendingChanges.length} sel diubah
                      {previewErrorCount > 0 ? (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          {' '}
                          · {previewErrorCount} error (sel merah)
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400"> · hijau = perubahan valid</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Tampilkan nilai</span>
                    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-100 dark:bg-gray-900/50">
                      <button
                        type="button"
                        onClick={() => setPreviewValueMode('sebelum')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          previewValueMode === 'sebelum'
                            ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        Sebelum
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewValueMode('sesudah')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          previewValueMode === 'sesudah'
                            ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        Sesudah
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={closeReviewOffcanvas}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs sm:text-sm"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSave}
                      disabled={saving || pendingPayloadRows.length === 0 || previewErrorCount > 0}
                      title={previewErrorCount > 0 ? 'Perbaiki sel merah di tabel preview' : undefined}
                      className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs sm:text-sm font-medium"
                    >
                      {saving ? 'Menyimpan…' : `Simpan (${pendingPayloadRows.length})`}
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 px-3 sm:px-4 pb-3">
                  <ExcelSavePreviewTable
                    rows={savePreviewModel.rows}
                    columns={savePreviewModel.columns}
                    valueMode={previewValueMode}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

