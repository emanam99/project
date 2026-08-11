import { useCallback, useMemo, useState } from 'react'

const SCALE_STEPS = [0.7, 0.75, 0.85, 0.9, 1, 1.05, 1.15, 1.25]
const DEFAULT_COL_WIDTH = 120
const MIN_COL_WIDTH = 56
const MAX_COL_WIDTH = 420
const WIDTH_STEP = 12

function clampWidth(w) {
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(w)))
}

function ResizableHeader({ colId, width, onResize, onNudge, stickyLeft, children, className = '' }) {
  const onMouseDownHandle = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = width
    const onMove = (ev) => {
      onResize(colId, clampWidth(startW + ev.clientX - startX))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <th
      className={`py-2 px-2 text-left align-bottom border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/80 relative group text-xs ${className} ${
        stickyLeft != null ? 'sticky z-[2]' : ''
      }`}
      style={{ width, minWidth: width, maxWidth: width, left: stickyLeft }}
    >
      <div className="flex items-start justify-between gap-0.5 pr-1">
        <div className="min-w-0 flex-1 font-medium truncate" title={typeof children === 'string' ? children : undefined}>
          {children}
        </div>
        <div className="flex flex-col shrink-0 opacity-60 group-hover:opacity-100">
          <button
            type="button"
            title="Persempit kolom"
            onClick={(e) => {
              e.stopPropagation()
              onNudge(colId, -WIDTH_STEP)
            }}
            className="leading-none px-0.5 text-[9px] text-gray-500 hover:text-teal-600 dark:hover:text-teal-400"
          >
            −
          </button>
          <button
            type="button"
            title="Perlebar kolom"
            onClick={(e) => {
              e.stopPropagation()
              onNudge(colId, WIDTH_STEP)
            }}
            className="leading-none px-0.5 text-[9px] text-gray-500 hover:text-teal-600 dark:hover:text-teal-400"
          >
            +
          </button>
        </div>
      </div>
      <div
        role="separator"
        aria-label="Ubah lebar kolom"
        onMouseDown={onMouseDownHandle}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-teal-400/80 dark:hover:bg-teal-500/80 z-[3]"
      />
    </th>
  )
}

/**
 * Tabel preview simpan Excel: baris berubah; sel valid hijau, sel error merah; zoom & lebar kolom.
 * @param {object} props
 * @param {Array<{ id: string, nama: string, nip?: string, cells: Record<string, { label: string, from: string, to: string, error?: string|null }> }>} props.rows
 * @param {Array<{ key: string, label: string }>} props.columns — urutan kolom tampilan
 * @param {'sebelum'|'sesudah'} props.valueMode
 */
export default function ExcelSavePreviewTable({ rows = [], columns = [], valueMode = 'sesudah' }) {
  const [scale, setScale] = useState(0.85)
  const [widths, setWidths] = useState({})

  const getWidth = useCallback(
    (colId, fallback = DEFAULT_COL_WIDTH) => clampWidth(widths[colId] ?? fallback),
    [widths]
  )

  const setColWidth = useCallback((colId, w) => {
    setWidths((prev) => ({ ...prev, [colId]: clampWidth(w) }))
  }, [])

  const nudgeColWidth = useCallback((colId, delta) => {
    setWidths((prev) => ({
      ...prev,
      [colId]: clampWidth((prev[colId] ?? DEFAULT_COL_WIDTH) + delta)
    }))
  }, [])

  const scaleDown = () => {
    const i = SCALE_STEPS.indexOf(scale)
    if (i > 0) setScale(SCALE_STEPS[i - 1])
    else setScale(SCALE_STEPS[0])
  }

  const scaleUp = () => {
    const i = SCALE_STEPS.indexOf(scale)
    if (i >= 0 && i < SCALE_STEPS.length - 1) setScale(SCALE_STEPS[i + 1])
    else if (i < 0) setScale(1)
    else setScale(SCALE_STEPS[SCALE_STEPS.length - 1])
  }

  const stickyNipWidth = getWidth('__nip', 88)
  const stickyNamaWidth = getWidth('__nama', 160)

  const displayColumns = useMemo(() => columns.filter((c) => c.key !== '__nip' && c.key !== '__nama'), [columns])

  if (!rows.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Tidak ada perubahan untuk ditampilkan.</p>
  }

  return (
    <div className="flex flex-col min-h-0 h-full gap-2">
      <div className="flex flex-wrap items-center gap-2 shrink-0 py-1">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Ukuran tampilan</span>
        <button
          type="button"
          onClick={scaleDown}
          disabled={scale <= SCALE_STEPS[0]}
          className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs disabled:opacity-40"
        >
          − Kecilkan
        </button>
        <button
          type="button"
          onClick={scaleUp}
          disabled={scale >= SCALE_STEPS[SCALE_STEPS.length - 1]}
          className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs disabled:opacity-40"
        >
          + Perbesar
        </button>
        <button
          type="button"
          onClick={() => setScale(0.85)}
          className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300"
        >
          {Math.round(scale * 100)}%
        </button>
        <button type="button" onClick={() => setWidths({})} className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs">
          Reset lebar kolom
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <div
          className="origin-top-left inline-block min-w-full"
          style={{ transform: `scale(${scale})`, width: `${100 / scale}%` }}
        >
          <table className="border-collapse text-xs text-gray-800 dark:text-gray-100 w-full" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <ResizableHeader
                  colId="__nip"
                  width={stickyNipWidth}
                  onResize={setColWidth}
                  onNudge={nudgeColWidth}
                  stickyLeft={0}
                  className="font-semibold"
                >
                  NIP
                </ResizableHeader>
                <ResizableHeader
                  colId="__nama"
                  width={stickyNamaWidth}
                  onResize={setColWidth}
                  onNudge={nudgeColWidth}
                  stickyLeft={stickyNipWidth}
                  className="font-semibold"
                >
                  Nama
                </ResizableHeader>
                {displayColumns.map((col) => (
                  <ResizableHeader
                    key={col.key}
                    colId={col.key}
                    width={getWidth(col.key, DEFAULT_COL_WIDTH)}
                    onResize={setColWidth}
                    onNudge={nudgeColWidth}
                  >
                    {col.label}
                  </ResizableHeader>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/80">
                  <td
                    className="py-1.5 px-2 sticky left-0 z-[1] bg-white dark:bg-gray-800 font-mono tabular-nums truncate"
                    style={{ width: stickyNipWidth, minWidth: stickyNipWidth, maxWidth: stickyNipWidth }}
                    title={row.nip}
                  >
                    {row.nip || '—'}
                  </td>
                  <td
                    className="py-1.5 px-2 sticky z-[1] bg-white dark:bg-gray-800 font-medium truncate"
                    style={{
                      width: stickyNamaWidth,
                      minWidth: stickyNamaWidth,
                      maxWidth: stickyNamaWidth,
                      left: stickyNipWidth
                    }}
                    title={row.nama}
                  >
                    {row.nama || '—'}
                  </td>
                  {displayColumns.map((col) => {
                    const cell = row.cells?.[col.key]
                    const w = getWidth(col.key, DEFAULT_COL_WIDTH)
                    if (!cell) {
                      return (
                        <td
                          key={col.key}
                          className="py-1.5 px-2 text-gray-400 truncate"
                          style={{ width: w, minWidth: w, maxWidth: w }}
                        >
                          —
                        </td>
                      )
                    }
                    const text = valueMode === 'sebelum' ? cell.from : cell.to
                    const hasError = Boolean(cell.error)
                    const cellClass = hasError
                      ? 'bg-red-100 dark:bg-red-950/50 text-red-900 dark:text-red-100 ring-1 ring-inset ring-red-300 dark:ring-red-800'
                      : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-800'
                    const title = hasError
                      ? cell.error
                      : `${cell.label}: ${cell.from} → ${cell.to}`
                    return (
                      <td
                        key={col.key}
                        className={`py-1.5 px-2 truncate font-medium ${cellClass}`}
                        style={{ width: w, minWidth: w, maxWidth: w }}
                        title={title}
                      >
                        {text === '' || text === '-' ? '—' : text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
