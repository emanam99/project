import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Workbook } from '@fortune-sheet/react'
import '@fortune-sheet/react/dist/index.css'
import './ExcelSantriEditor.css'
import { santriAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'

const SHEET_COLUMNS = [
  { key: 'id', label: 'ID', readonly: true },
  { key: 'nis', label: 'NIS', readonly: true },
  { key: 'nama', label: 'Nama' },
  { key: 'nik', label: 'NIK' },
  { key: 'tempat_lahir', label: 'Tempat Lahir' },
  { key: 'tanggal_lahir', label: 'Tanggal Lahir' },
  { key: 'gender', label: 'Gender' },
  { key: 'nisn', label: 'NISN' },
  { key: 'no_kk', label: 'No KK' },
  { key: 'kepala_keluarga', label: 'Kepala Keluarga' },
  { key: 'anak_ke', label: 'Anak Ke' },
  { key: 'jumlah_saudara', label: 'Jumlah Saudara' },
  { key: 'ayah', label: 'Ayah' },
  { key: 'status_ayah', label: 'Status Ayah' },
  { key: 'nik_ayah', label: 'NIK Ayah' },
  { key: 'tempat_lahir_ayah', label: 'Tempat Lahir Ayah' },
  { key: 'tanggal_lahir_ayah', label: 'Tanggal Lahir Ayah' },
  { key: 'pekerjaan_ayah', label: 'Pekerjaan Ayah' },
  { key: 'pendidikan_ayah', label: 'Pendidikan Ayah' },
  { key: 'penghasilan_ayah', label: 'Penghasilan Ayah' },
  { key: 'ibu', label: 'Ibu' },
  { key: 'status_ibu', label: 'Status Ibu' },
  { key: 'nik_ibu', label: 'NIK Ibu' },
  { key: 'tempat_lahir_ibu', label: 'Tempat Lahir Ibu' },
  { key: 'tanggal_lahir_ibu', label: 'Tanggal Lahir Ibu' },
  { key: 'pekerjaan_ibu', label: 'Pekerjaan Ibu' },
  { key: 'pendidikan_ibu', label: 'Pendidikan Ibu' },
  { key: 'penghasilan_ibu', label: 'Penghasilan Ibu' },
  { key: 'hubungan_wali', label: 'Hubungan Wali' },
  { key: 'wali', label: 'Wali' },
  { key: 'nik_wali', label: 'NIK Wali' },
  { key: 'tempat_lahir_wali', label: 'Tempat Lahir Wali' },
  { key: 'tanggal_lahir_wali', label: 'Tanggal Lahir Wali' },
  { key: 'pekerjaan_wali', label: 'Pekerjaan Wali' },
  { key: 'pendidikan_wali', label: 'Pendidikan Wali' },
  { key: 'penghasilan_wali', label: 'Penghasilan Wali' },
  { key: 'status_santri', label: 'Status Santri' },
  { key: 'kategori', label: 'Kategori' },
  { key: 'status_pendaftar', label: 'Status Pendaftar' },
  { key: 'status_murid', label: 'Status Murid' },
  { key: 'status_nikah', label: 'Status Nikah' },
  { key: 'pekerjaan', label: 'Pekerjaan Santri' },
  { key: 'saudara_di_pesantren', label: 'Saudara di Pesantren' },
  { key: 'hobi', label: 'Hobi' },
  { key: 'cita_cita', label: 'Cita-cita' },
  { key: 'kebutuhan_khusus', label: 'Kebutuhan Khusus' },
  { key: 'riwayat_sakit', label: 'Riwayat Sakit' },
  { key: 'ukuran_baju', label: 'Ukuran Baju' },
  { key: 'kip', label: 'KIP' },
  { key: 'pkh', label: 'PKH' },
  { key: 'kks', label: 'KKS' },
  { key: 'dusun', label: 'Dusun' },
  { key: 'rt', label: 'RT' },
  { key: 'rw', label: 'RW' },
  { key: 'desa', label: 'Desa' },
  { key: 'kecamatan', label: 'Kecamatan' },
  { key: 'kabupaten', label: 'Kabupaten' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  { key: 'madrasah', label: 'Madrasah' },
  { key: 'nama_madrasah', label: 'Nama Madrasah' },
  { key: 'alamat_madrasah', label: 'Alamat Madrasah' },
  { key: 'lulus_madrasah', label: 'Lulus Madrasah' },
  { key: 'sekolah', label: 'Sekolah' },
  { key: 'nama_sekolah', label: 'Nama Sekolah' },
  { key: 'alamat_sekolah', label: 'Alamat Sekolah' },
  { key: 'lulus_sekolah', label: 'Lulus Sekolah' },
  { key: 'npsn', label: 'NPSN' },
  { key: 'nsm', label: 'NSM' },
  { key: 'id_kamar', label: 'ID Kamar' },
  { key: 'daerah', label: 'Daerah', readonly: true },
  { key: 'kamar', label: 'Kamar', readonly: true },
  { key: 'daerah_kamar', label: 'Daerah.Kamar', readonly: true },
  { key: 'id_diniyah', label: 'ID Rombel Diniyah' },
  { key: 'diniyah', label: 'Lembaga Diniyah', readonly: true },
  { key: 'kelas_diniyah', label: 'Kelas Diniyah', readonly: true },
  { key: 'kel_diniyah', label: 'Kel Diniyah', readonly: true },
  { key: 'nim_diniyah', label: 'NIM Diniyah' },
  { key: 'id_formal', label: 'ID Rombel Formal' },
  { key: 'formal', label: 'Lembaga Formal', readonly: true },
  { key: 'kelas_formal', label: 'Kelas Formal', readonly: true },
  { key: 'kel_formal', label: 'Kel Formal', readonly: true },
  { key: 'nim_formal', label: 'NIM Formal' },
  { key: 'lttq', label: 'LTTQ' },
  { key: 'kelas_lttq', label: 'Kelas LTTQ' },
  { key: 'kel_lttq', label: 'Kel LTTQ' },
  { key: 'no_telpon', label: 'No Telpon' },
  { key: 'no_wa_santri', label: 'No WA Santri' },
  { key: 'email', label: 'Email' },
]

const asText = (v) => (v == null ? '' : String(v))
const CHANGED_CELL_BG = '#fef3c7'
const READONLY_CELL_BG = '#f3f4f6'
const EXCEL_VISIBLE_COLUMNS_STORAGE_KEY = 'excelSantriVisibleColumns'
const EXCEL_COLUMN_ORDER_STORAGE_KEY = 'excelSantriColumnOrder'
const NUMERIC_FIELD_KEYS = new Set(['id_kamar', 'id_diniyah', 'id_formal'])
const FORCE_TEXT_KEYS = new Set([
  'nik',
  'no_telpon',
  'no_wa_santri',
  'no_kk',
  'nik_ayah',
  'nik_ibu',
  'nik_wali',
  'kip',
  'pkh',
  'kks',
  'npsn',
  'nsm',
])

const getDefaultVisibleColumns = () =>
  SHEET_COLUMNS.reduce((acc, col) => {
    acc[col.key] = true
    return acc
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

const buildWorkbookData = (rows) => {
  const celldata = []
  const colReadOnly = {}
  SHEET_COLUMNS.forEach((col, cIdx) => {
    if (col.readonly) colReadOnly[cIdx] = 1
  })

  SHEET_COLUMNS.forEach((col, cIdx) => {
    celldata.push({ r: 0, c: cIdx, v: { m: col.label, v: col.label, ct: { t: 'inlineStr' } } })
  })

  rows.forEach((row, rIdx) => {
    SHEET_COLUMNS.forEach((col, cIdx) => {
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
      name: 'Santri Editor',
      row: Math.max(rows.length + 50, 200),
      column: SHEET_COLUMNS.length + 5,
      celldata,
      config: {
        colReadOnly,
      },
    },
  ]
}

const applyColumnVisibility = (workbook, selectedColumns) => {
  const firstSheet = Array.isArray(workbook) && workbook.length ? workbook[0] : null
  if (!firstSheet) return workbook
  const colhidden = {}
  SHEET_COLUMNS.forEach((col, idx) => {
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

const selectionTouchesLockedColumns = () => {
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
      if (SHEET_COLUMNS[c]?.readonly) return true
    }
    return false
  })
}

const extractRowsFromWorkbook = (data) => {
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
    SHEET_COLUMNS.forEach((col, cIdx) => {
      const fromCellData = cellMap.get(`${r}:${cIdx}`)
      if (fromCellData != null) {
        row[col.key] = normalizeSheetCellText(fromCellData)
        return
      }
      const matrixCell = matrixData?.[r]?.[cIdx]
      const matrixVal = matrixCell?.m ?? matrixCell?.v ?? ''
      row[col.key] = normalizeSheetCellText(matrixVal)
    })
    if (!row.id) continue
    rows.push(row)
  }
  return rows
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

function ReorderColumnItem({
  item,
  index,
  total,
  visibleColumns,
  hasActiveFilter,
  onToggleColumn,
  onMoveColumn,
  onOpenFilter,
  onDragAutoScroll,
  onDragEnd,
}) {
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      onDrag={(_, info) => onDragAutoScroll(info.point.y)}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2 rounded-md border border-transparent bg-white/80 dark:bg-gray-800/50"
    >
      <button
        type="button"
        onPointerDown={(event) => dragControls.start(event)}
        className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-grab active:cursor-grabbing"
        title="Tarik untuk pindah urutan"
        aria-label={`Geser urutan kolom ${item.label}`}
        style={{ touchAction: 'none' }}
      >
        ≡
      </button>
      <input
        type="checkbox"
        id={`excel-santri-col-${item.key}`}
        checked={!!visibleColumns[item.key]}
        onChange={() => onToggleColumn(item.key)}
        className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
      />
      <label
        htmlFor={`excel-santri-col-${item.key}`}
        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer flex-1"
      >
        {item.label}
      </label>
      <button
        type="button"
        onClick={() => onOpenFilter(item.key)}
        className={`h-7 px-2 rounded border text-xs ${
          hasActiveFilter
            ? 'border-teal-500 text-teal-600 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30'
            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
        }`}
        title="Filter kolom"
      >
        Filter
      </button>
      <button
        type="button"
        onClick={() => onMoveColumn(index, 'up')}
        disabled={index === 0}
        className="h-7 w-7 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40"
        title="Naikkan"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => onMoveColumn(index, 'down')}
        disabled={index === total - 1}
        className="h-7 w-7 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40"
        title="Turunkan"
      >
        ▼
      </button>
    </Reorder.Item>
  )
}

export default function ExcelSantriEditor() {
  const { showNotification } = useNotification()
  const location = useLocation()
  const workbookRef = useRef(null)
  const sheetContainerRef = useRef(null)
  const initialCellMapRef = useRef(new Map())
  const workbookDataRef = useRef([])
  const changedCountDebounceRef = useRef(null)
  const baselineRowsByIdRef = useRef(new Map())
  const baselineRowIdByIndexRef = useRef([])
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
  const allRowsRef = useRef([])
  const closeColumnOffcanvas = useOffcanvasBackClose(
    isColumnOffcanvasOpen,
    () => setIsColumnOffcanvasOpen(false),
    {
      useDomisiliPopstateStack: true,
      domisiliStackId: 'excel-santri-columns',
      domisiliStackPriority: 20,
    }
  )
  const closeReviewOffcanvas = useOffcanvasBackClose(
    isReviewOffcanvasOpen,
    () => setIsReviewOffcanvasOpen(false),
    {
      useDomisiliPopstateStack: true,
      domisiliStackId: 'excel-santri-review',
      domisiliStackPriority: 30,
    }
  )
  const closeColumnFilterOffcanvas = useOffcanvasBackClose(
    isColumnFilterOffcanvasOpen,
    () => setIsColumnFilterOffcanvasOpen(false),
    {
      useDomisiliPopstateStack: true,
      domisiliStackId: 'excel-santri-column-filter',
      domisiliStackPriority: 40,
    }
  )


  const applyChangedCellHighlight = useCallback((nextWorkbook) => {
    const firstSheet = Array.isArray(nextWorkbook) && nextWorkbook.length ? nextWorkbook[0] : null
    if (!firstSheet || !Array.isArray(firstSheet.celldata)) return nextWorkbook

    const colMeta = SHEET_COLUMNS
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
    const currentRows = extractRowsFromWorkbook(sourceWorkbook)
    if (!Array.isArray(currentRows) || currentRows.length === 0) return
    const currentById = new Map(currentRows.map((row) => [String(row.id), row]))
    const merged = allRowsRef.current.map((row) => currentById.get(String(row.id)) || row)
    allRowsRef.current = merged
  }, [])

  const rebuildWorkbookFromRows = useCallback((rows) => {
    const rebuiltWorkbook = applyColumnVisibility(buildWorkbookData(rows), visibleColumns)
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
        const query = new URLSearchParams(location.search || '')
        const params = {}
        const mappedKeys = ['lembaga', 'kelas', 'kel', 'status', 'kategori', 'daerah', 'kamar', 'tidak_diniyah', 'tidak_formal']
        mappedKeys.forEach((k) => {
          const v = query.get(k)
          if (v != null && String(v).trim() !== '') params[k] = String(v).trim()
        })
        const res = await santriAPI.getExcelRaw(params)
        if (!cancelled && res?.success) {
          const dataRows = Array.isArray(res.data) ? res.data : []
          allRowsRef.current = dataRows
          const initialRows = applyRowsByColumnFilters(dataRows, columnFilters)
          const initialWorkbook = applyColumnVisibility(buildWorkbookData(initialRows), getVisibleColumnsSelection())
          initialCellMapRef.current = buildCellValueMap(initialWorkbook)
          baselineRowsByIdRef.current = new Map(
            dataRows.map((row) => [String(row.id), row])
          )
          baselineRowIdByIndexRef.current = dataRows.map((row) => String(row.id))
          setWorkbookData(initialWorkbook)
          workbookDataRef.current = initialWorkbook
        }
      } catch (e) {
        if (!cancelled) {
          showNotification('Gagal memuat data santri untuk editor Excel', 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showNotification, location.search])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!selectionTouchesLockedColumns()) return
      const isTypingKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
      const isDeleteKey = event.key === 'Backspace' || event.key === 'Delete'
      const isCutPaste = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'x' || event.key.toLowerCase() === 'v')
      if (!isTypingKey && !isDeleteKey && !isCutPaste) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onPaste = (event) => {
      if (!selectionTouchesLockedColumns()) return
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
      return Number.isFinite(n) ? n : null
    }
    return v === '' ? null : v
  }

  const buildPendingChangesFromRows = useCallback((rowsRaw) => {
    const rows = rowsRaw.map((row, idx) => {
      if (String(row.id || '').trim() !== '') return row
      const fallbackId = baselineRowIdByIndexRef.current[idx]
      return fallbackId ? { ...row, id: fallbackId } : row
    })
    const baseline = baselineRowsByIdRef.current
    const changes = []
    const payloadMap = new Map()

    rows.forEach((row) => {
      const id = String(row.id || '').trim()
      if (!id) return
      const beforeRow = baseline.get(id) || {}
      SHEET_COLUMNS.forEach((col) => {
        if (col.readonly || col.key === 'id') return
        const beforeText = asText(beforeRow[col.key]).trim()
        const afterText = asText(row[col.key]).trim()
        if (beforeText === afterText) return

        changes.push({
          id,
          nama: asText(row.nama || beforeRow.nama || '-'),
          key: col.key,
          label: col.label,
          from: beforeText === '' ? '-' : beforeText,
          to: afterText === '' ? '-' : afterText,
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
    const rowsRaw = extractRowsFromWorkbook(sourceWorkbook)
    return buildPendingChangesFromRows(rowsRaw)
  }, [buildPendingChangesFromRows])

  const handleConfirmSave = async () => {
    try {
      setSaving(true)
      if (!Array.isArray(pendingPayloadRows) || pendingPayloadRows.length === 0) {
        showNotification('Tidak ada perubahan untuk disimpan', 'warning')
        return
      }
      const res = await santriAPI.bulkUpdateFromExcel(pendingPayloadRows)
      if (res?.success) {
        syncCurrentWorkbookRowsToAllRows()
        const latestWorkbook = workbookRef.current?.getAllSheets?.()
        const sourceWorkbook = Array.isArray(latestWorkbook) && latestWorkbook.length > 0
          ? latestWorkbook
          : workbookDataRef.current
        initialCellMapRef.current = buildCellValueMap(sourceWorkbook)
        const freshRows = allRowsRef.current
        baselineRowsByIdRef.current = new Map(freshRows.map((r) => [String(r.id), r]))
        baselineRowIdByIndexRef.current = freshRows.map((r) => String(r.id))
        setPendingChanges([])
        setPendingPayloadRows([])
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('excel-santri-changed-count', { detail: { count: 0 } }))
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
    window.dispatchEvent(new CustomEvent('excel-santri-saving-changed', { detail: { saving } }))
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
      const pending = buildPendingChangesFromRows(allRowsRef.current)
      if (pending.changes.length === 0) {
        showNotification('Tidak ada perubahan yang perlu disimpan', 'warning')
        return
      }
      setPendingChanges(pending.changes)
      setPendingPayloadRows(pending.payloadRows)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('excel-santri-changed-count', { detail: { count: pending.payloadRows.length } }))
      }
      setIsReviewOffcanvasOpen(true)
    }
    window.addEventListener('excel-santri-save-request', onHeaderSaveRequest)
    return () => {
      window.removeEventListener('excel-santri-save-request', onHeaderSaveRequest)
      window.dispatchEvent(new CustomEvent('excel-santri-saving-changed', { detail: { saving: false } }))
      window.dispatchEvent(new CustomEvent('excel-santri-changed-count', { detail: { count: 0 } }))
    }
  }, [saving, buildPendingChangesFromRows, showNotification, syncCurrentWorkbookRowsToAllRows])

  useEffect(() => {
    const onToggleColumns = () => setIsColumnOffcanvasOpen(true)
    window.addEventListener('excel-santri-columns-toggle', onToggleColumns)
    return () => {
      window.removeEventListener('excel-santri-columns-toggle', onToggleColumns)
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
          const key = SHEET_COLUMNS[c]?.key
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
    const isAnyVisible = SHEET_COLUMNS.some((col) => next[col.key])
    if (!isAnyVisible) {
      showNotification('Minimal satu kolom harus ditampilkan', 'warning')
      return
    }
    setVisibleColumns(next)
    setVisibleColumnsSelection(next)
    setWorkbookData((prev) => applyColumnVisibility(prev, next))
  }

  const handleSelectAllColumns = (checked) => {
    const next = getDefaultVisibleColumns()
    SHEET_COLUMNS.forEach((col) => {
      next[col.key] = checked
    })
    setVisibleColumns(next)
    setVisibleColumnsSelection(next)
    setWorkbookData((prev) => applyColumnVisibility(prev, next))
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

  const applyColumnOrder = (nextColumns) => {
    if (!Array.isArray(nextColumns) || nextColumns.length !== SHEET_COLUMNS.length) return
    syncCurrentWorkbookRowsToAllRows()

    SHEET_COLUMNS.splice(0, SHEET_COLUMNS.length, ...nextColumns)
    persistColumnOrder()

    const rows = applyRowsByColumnFilters(allRowsRef.current, columnFilters)
    const rebuiltWorkbook = applyColumnVisibility(buildWorkbookData(rows), visibleColumns)
    workbookDataRef.current = rebuiltWorkbook
    setWorkbookData(rebuiltWorkbook)
    setColumnOrder([...nextColumns])
    setColumnOrderVersion((v) => v + 1)
  }

  const handleMoveColumn = (index, direction) => {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= columnOrder.length) return

    const nextColumns = [...columnOrder]
    const [moved] = nextColumns.splice(index, 1)
    nextColumns.splice(target, 0, moved)
    applyColumnOrder(nextColumns)
  }

  const handleReorderPreview = useCallback((nextColumns) => {
    if (!Array.isArray(nextColumns) || nextColumns.length !== columnOrder.length) return
    setColumnOrder(nextColumns)
  }, [columnOrder.length])

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

  const groupedPendingChanges = pendingChanges.reduce((acc, item) => {
    const key = `${item.id}::${item.nama}`
    if (!acc[key]) {
      acc[key] = {
        id: item.id,
        nama: item.nama,
        items: [],
      }
    }
    acc[key].items.push(item)
    return acc
  }, {})

  useEffect(() => {
    const api = workbookRef.current
    if (!api) return
    const hiddenColumns = []
    const shownColumns = []
    SHEET_COLUMNS.forEach((col, idx) => {
      if (visibleColumns[col.key]) shownColumns.push(String(idx))
      else hiddenColumns.push(String(idx))
    })

    if (shownColumns.length > 0) {
      api.showRowOrColumn(shownColumns, 'column')
    }
    if (hiddenColumns.length > 0) {
      api.hideRowOrColumn(hiddenColumns, 'column')
    }
  }, [visibleColumns])

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
    <div className="excel-santri-page h-full overflow-hidden p-2 sm:p-3 lg:p-4 flex flex-col gap-2">
      <div ref={sheetContainerRef} className="excel-santri-editor flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-visible">
        <Workbook
          key={`excel-santri-workbook-${columnOrderVersion}-${workbookRenderVersion}`}
          ref={workbookRef}
          data={workbookData}
          onChange={(nextData) => {
            // Hindari setState berulang dari callback internal FortuneSheet (resize/repaint),
            // cukup simpan snapshot terbaru untuk proses simpan.
            workbookDataRef.current = nextData
            if (typeof window !== 'undefined') {
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
                window.dispatchEvent(new CustomEvent('excel-santri-changed-count', { detail: { count: pending.payloadRows.length } }))
                changedCountDebounceRef.current = null
              }, 180)
            }
          }}
        />
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
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Kolom Excel Santri</h3>
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
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Centang kolom untuk ditampilkan di spreadsheet. Hapus centang untuk menyembunyikan kolom.
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
                    values={columnOrder}
                    onReorder={handleReorderPreview}
                    className="space-y-2"
                  >
                    {columnOrder.map((item, index) => (
                      <ReorderColumnItem
                        key={item.key}
                        item={item}
                        index={index}
                        total={columnOrder.length}
                        visibleColumns={visibleColumns}
                        hasActiveFilter={Array.isArray(columnFilters[item.key]) && columnFilters[item.key].length > 0}
                        onToggleColumn={handleToggleColumn}
                        onMoveColumn={handleMoveColumn}
                        onOpenFilter={openColumnFilter}
                        onDragAutoScroll={handleColumnDragAutoScroll}
                        onDragEnd={() => applyColumnOrder(columnOrder)}
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
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Review Perubahan</h3>
                  <button
                    type="button"
                    onClick={closeReviewOffcanvas}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
                  Total perubahan: <strong>{pendingChanges.length}</strong> | Baris terdampak: <strong>{pendingPayloadRows.length}</strong>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {Object.values(groupedPendingChanges).map((group) => (
                    <div key={`${group.id}-${group.nama}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                        ID {group.id} - {group.nama}
                      </div>
                      <div className="space-y-2">
                        {group.items.map((item, idx) => (
                          <div key={`${item.id}-${item.key}-${idx}`} className="rounded-md bg-gray-50 dark:bg-gray-700/40 p-2">
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">{item.label}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                              <span className="line-through text-red-500">{item.from}</span>
                              <span className="mx-2">→</span>
                              <span className="text-emerald-600 dark:text-emerald-400">{item.to}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeReviewOffcanvas}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={saving}
                    className="px-3 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
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

