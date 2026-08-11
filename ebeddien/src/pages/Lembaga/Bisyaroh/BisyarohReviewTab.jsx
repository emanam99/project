import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { subtitleBisyarohKolomKind, formatBisyarohCheckboxDisplay } from './bisyarohKolomTipe'
import BisyarohReviewPrintOffcanvas from './BisyarohReviewPrintOffcanvas'
import { isReviewRowDisabled } from './bisyarohReviewDisabledRows'

const LS_KEY = 'bisyaroh-review-layout-v1'

const SCALE_STEPS = [0.7, 0.75, 0.85, 0.9, 1, 1.05, 1.15, 1.25]

const FIXED_COL = {
  nip: { key: '__nip', defaultWidth: 76 },
  rekeningJatim: { key: '__rekening_jatim', defaultWidth: 120 },
  pengurus: { key: '__pengurus', defaultWidth: 160 },
  bisyaroh: { key: '__bisyaroh', defaultWidth: 140 },
  total: { key: '__total', defaultWidth: 116 },
  potong: { key: '__potong', defaultWidth: 200 },
  catatan: { key: '__catatan', defaultWidth: 128 }
}

function bisyarohSetLabel(sec) {
  const nama = (sec?.bisyaroh_nama || '').trim()
  if (nama) return nama
  const id = sec?.bisyaroh_id
  return id != null ? `Set #${id}` : '—'
}

const DEFAULT_KOLOM_WIDTH = 104
const MIN_COL_WIDTH = 48
const MAX_COL_WIDTH = 480
const WIDTH_STEP = 12

function clampWidth(w) {
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(w)))
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { scale: 0.85, widths: {} }
    const p = JSON.parse(raw)
    return {
      scale: typeof p.scale === 'number' ? p.scale : 0.85,
      widths: p.widths && typeof p.widths === 'object' ? p.widths : {}
    }
  } catch {
    return { scale: 0.85, widths: {} }
  }
}

function persistLayout(scale, widths) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ scale, widths }))
  } catch {
    /* abaikan */
  }
}

function RekapTotalCell({ row, formatRp }) {
  const total = Number(row.total_nominal) || 0
  if (total !== 0) {
    return <span className="tabular-nums">{formatRp(row.total_nominal)}</span>
  }
  return <span className="tabular-nums text-gray-500">{formatRp(0)}</span>
}

function ResizableHeader({
  colId,
  width,
  onResize,
  onNudge,
  stickyLeft,
  stickyZ,
  children,
  className = ''
}) {
  const dragging = useRef(false)

  const onMouseDownHandle = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const startX = e.clientX
    const startW = width
    const onMove = (ev) => {
      onResize(colId, clampWidth(startW + ev.clientX - startX))
    }
    const onUp = () => {
      dragging.current = false
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
      className={`py-2 px-2 text-left align-bottom border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/80 relative group ${className} ${
        stickyLeft != null ? 'sticky z-[2]' : ''
      }`}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        left: stickyLeft
      }}
    >
      <div className="flex items-start justify-between gap-0.5 pr-1">
        <div className="min-w-0 flex-1">{children}</div>
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
 * Tab Review: tampilan rekap read-only dengan zoom & lebar kolom seperti Excel.
 */
export default function BisyarohReviewTab({
  sections = [],
  loading = false,
  showGrandTotal = false,
  grandTotal = 0,
  formatRp,
  getRekapCell,
  onExportExcel,
  exportingExcel = false,
  onExportJatimCsv,
  exportingJatimCsv = false,
  disabledRowKeys = new Set(),
  onToggleDisabledRow,
  printMeta = {},
  onNotify
}) {
  const initial = useMemo(() => loadLayout(), [])
  const [scale, setScale] = useState(() => {
    const nearest = SCALE_STEPS.reduce((a, b) =>
      Math.abs(b - initial.scale) < Math.abs(a - initial.scale) ? b : a
    )
    return nearest
  })
  const [widths, setWidths] = useState(initial.widths)
  const [printOffcanvasOpen, setPrintOffcanvasOpen] = useState(false)

  useEffect(() => {
    persistLayout(scale, widths)
  }, [scale, widths])

  const getWidth = useCallback(
    (colId, fallback = DEFAULT_KOLOM_WIDTH) => clampWidth(widths[colId] ?? fallback),
    [widths]
  )

  const setColWidth = useCallback((colId, w) => {
    setWidths((prev) => ({ ...prev, [colId]: clampWidth(w) }))
  }, [])

  const nudgeColWidth = useCallback((colId, delta) => {
    setWidths((prev) => {
      const fb =
        colId === FIXED_COL.nip.key
          ? FIXED_COL.nip.defaultWidth
          : colId === FIXED_COL.rekeningJatim.key
            ? FIXED_COL.rekeningJatim.defaultWidth
            : colId === FIXED_COL.pengurus.key
              ? FIXED_COL.pengurus.defaultWidth
              : colId === FIXED_COL.bisyaroh.key
                ? FIXED_COL.bisyaroh.defaultWidth
                : colId === FIXED_COL.total.key
                  ? FIXED_COL.total.defaultWidth
                  : colId === FIXED_COL.potong.key
                    ? FIXED_COL.potong.defaultWidth
                    : colId === FIXED_COL.catatan.key
                      ? FIXED_COL.catatan.defaultWidth
                      : DEFAULT_KOLOM_WIDTH
      return { ...prev, [colId]: clampWidth((prev[colId] ?? fb) + delta) }
    })
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

  const scaleReset = () => setScale(0.85)

  const resetAllWidths = () => setWidths({})

  const scalePercent = Math.round(scale * 100)

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Memuat rekap…</p>
  }

  if (!sections.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
        Belum ada data rekap. Atur lembaga, periode, dan set di tab Rekap lalu muat ulang.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 sticky top-0 z-[5] py-2 -mx-1 px-1 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700/80">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mr-1">Ukuran tampilan</span>
        <button
          type="button"
          onClick={scaleDown}
          disabled={scale <= SCALE_STEPS[0]}
          className="px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
          title="Kecilkan ukuran"
        >
          − Kecilkan
        </button>
        <button
          type="button"
          onClick={scaleUp}
          disabled={scale >= SCALE_STEPS[SCALE_STEPS.length - 1]}
          className="px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
          title="Perbesar ukuran"
        >
          + Perbesar
        </button>
        <button
          type="button"
          onClick={scaleReset}
          className="px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {scalePercent}%
        </button>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <button
          type="button"
          onClick={resetAllWidths}
          className="px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Reset lebar semua kolom"
        >
          Reset lebar kolom
        </button>
        {onExportExcel ? (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              type="button"
              onClick={onExportExcel}
              disabled={exportingExcel || !sections.length}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-teal-400 dark:border-teal-600 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 text-xs font-medium hover:bg-teal-100 dark:hover:bg-teal-900/50 disabled:opacity-50"
              title="Unduh rekap tampilan ini ke Excel"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {exportingExcel ? 'Mengekspor…' : 'Export Excel'}
            </button>
          </>
        ) : null}
        {onExportJatimCsv ? (
          <>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              type="button"
              onClick={onExportJatimCsv}
              disabled={exportingJatimCsv || !sections.length}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/25 text-amber-900 dark:text-amber-100 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
              title="CSV upload Bank Jatim (rekening, nominal, jumlah baris)"
            >
              {exportingJatimCsv ? 'Menyiapkan…' : 'CSV Jatim'}
            </button>
          </>
        ) : null}
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <button
          type="button"
          onClick={() => setPrintOffcanvasOpen(true)}
          disabled={!sections.length}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          title="Cetak dengan pilihan kolom"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          Cetak
        </button>
        <p className="w-full text-[10px] text-gray-500 dark:text-gray-400 leading-snug">
          Seret garis di tepi kanan header kolom atau pakai tombol − / + di header. Klik nama pengurus untuk nonaktifkan dari total dan CSV Jatim.
        </p>
      </div>

      {showGrandTotal ? (
        <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
          Total keseluruhan: {formatRp(grandTotal)}
        </p>
      ) : null}

      <div
        className="origin-top-left"
        style={{
          transform: `scale(${scale})`,
          width: `${100 / scale}%`
        }}
      >
        <div className="space-y-8">
          {sections.map((sec) => (
            <div
              key={sec.bisyaroh_id}
              className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-900/20"
            >
              <div className="flex flex-wrap justify-between items-baseline gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  Set #{sec.bisyaroh_id}
                  {sec.bisyaroh_nama ? ` — ${sec.bisyaroh_nama}` : ''}
                </h3>
                <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
                  Subtotal: {formatRp(sec.subtotal_nominal)}
                </span>
              </div>
              <div className="overflow-x-auto max-w-[100vw] rounded border border-gray-100 dark:border-gray-700/80">
                <table className="border-collapse text-gray-800 dark:text-gray-100" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <ResizableHeader
                        colId={FIXED_COL.nip.key}
                        width={getWidth(FIXED_COL.nip.key, FIXED_COL.nip.defaultWidth)}
                        onResize={setColWidth}
                        onNudge={nudgeColWidth}
                      >
                        NIP
                      </ResizableHeader>
                      <ResizableHeader
                        colId={FIXED_COL.rekeningJatim.key}
                        width={getWidth(FIXED_COL.rekeningJatim.key, FIXED_COL.rekeningJatim.defaultWidth)}
                        onResize={setColWidth}
                        onNudge={nudgeColWidth}
                      >
                        Rekening Jatim
                      </ResizableHeader>
                      <ResizableHeader
                        colId={FIXED_COL.pengurus.key}
                        width={getWidth(FIXED_COL.pengurus.key, FIXED_COL.pengurus.defaultWidth)}
                        onResize={setColWidth}
                        onNudge={nudgeColWidth}
                        stickyLeft={0}
                        className="font-semibold shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.45)]"
                      >
                        Pengurus
                      </ResizableHeader>
                      <ResizableHeader
                        colId={FIXED_COL.bisyaroh.key}
                        width={getWidth(FIXED_COL.bisyaroh.key, FIXED_COL.bisyaroh.defaultWidth)}
                        onResize={setColWidth}
                        onNudge={nudgeColWidth}
                      >
                        Bisyaroh
                      </ResizableHeader>
                      {(sec.kolom || []).map((k) => {
                        const colId = `${sec.bisyaroh_id}:${k.col_key}`
                        return (
                          <ResizableHeader
                            key={colId}
                            colId={colId}
                            width={getWidth(colId, DEFAULT_KOLOM_WIDTH)}
                            onResize={setColWidth}
                            onNudge={nudgeColWidth}
                          >
                            <div className="font-medium truncate" title={k.label}>
                              {k.label}
                            </div>
                            <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                              {subtitleBisyarohKolomKind(k.kind, k.input_tipe)}
                              {k.masuk_total ? (
                                <span className="ml-1 text-teal-600 dark:text-teal-400 font-semibold">Σ</span>
                              ) : (
                                <span className="ml-1 text-gray-400">○</span>
                              )}
                            </div>
                          </ResizableHeader>
                        )
                      })}
                      <ResizableHeader
                        colId={FIXED_COL.total.key}
                        width={getWidth(FIXED_COL.total.key, FIXED_COL.total.defaultWidth)}
                        onResize={setColWidth}
                        onNudge={nudgeColWidth}
                        className="text-right font-semibold text-teal-700 dark:text-teal-300"
                      >
                        Total
                      </ResizableHeader>
                      <ResizableHeader
                        colId={FIXED_COL.potong.key}
                        width={getWidth(FIXED_COL.potong.key, FIXED_COL.potong.defaultWidth)}
                        onResize={setColWidth}
                        onNudge={nudgeColWidth}
                        className="font-semibold"
                      >
                        Potong UWABA
                      </ResizableHeader>
                      <ResizableHeader
                        colId={FIXED_COL.catatan.key}
                        width={getWidth(FIXED_COL.catatan.key, FIXED_COL.catatan.defaultWidth)}
                        onResize={setColWidth}
                        onNudge={nudgeColWidth}
                      >
                        Catatan
                      </ResizableHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {(sec.rows || []).map((row) => {
                      const rowDisabled = isReviewRowDisabled(disabledRowKeys, sec.bisyaroh_id, row.id_pengurus)
                      return (
                      <tr
                        key={`${sec.bisyaroh_id}-${row.id_pengurus}`}
                        className={`border-b border-gray-100 dark:border-gray-700 align-top ${
                          rowDisabled ? 'opacity-55 bg-gray-100/70 dark:bg-gray-900/60' : ''
                        }`}
                      >
                        <td
                          className="py-1.5 px-2 truncate tabular-nums"
                          style={{
                            width: getWidth(FIXED_COL.nip.key, FIXED_COL.nip.defaultWidth),
                            minWidth: getWidth(FIXED_COL.nip.key, FIXED_COL.nip.defaultWidth),
                            maxWidth: getWidth(FIXED_COL.nip.key, FIXED_COL.nip.defaultWidth)
                          }}
                        >
                          {row.nip ?? '—'}
                        </td>
                        <td
                          className="py-1.5 px-2 truncate tabular-nums"
                          style={{
                            width: getWidth(FIXED_COL.rekeningJatim.key, FIXED_COL.rekeningJatim.defaultWidth),
                            minWidth: getWidth(FIXED_COL.rekeningJatim.key, FIXED_COL.rekeningJatim.defaultWidth),
                            maxWidth: getWidth(FIXED_COL.rekeningJatim.key, FIXED_COL.rekeningJatim.defaultWidth)
                          }}
                          title={row.rekening_jatim || ''}
                        >
                          {row.rekening_jatim?.trim() ? row.rekening_jatim : '—'}
                        </td>
                        <td
                          className={`py-1.5 px-2 sticky left-0 z-[1] font-medium truncate shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)] dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.45)] ${
                            rowDisabled ? 'bg-gray-100 dark:bg-gray-900' : 'bg-white dark:bg-gray-800'
                          }`}
                          style={{
                            width: getWidth(FIXED_COL.pengurus.key, FIXED_COL.pengurus.defaultWidth),
                            minWidth: getWidth(FIXED_COL.pengurus.key, FIXED_COL.pengurus.defaultWidth),
                            maxWidth: getWidth(FIXED_COL.pengurus.key, FIXED_COL.pengurus.defaultWidth)
                          }}
                          title={
                            rowDisabled
                              ? `${row.pengurus_nama} (dinonaktifkan dari total dan CSV)`
                              : 'Klik untuk nonaktifkan dari total dan CSV'
                          }
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onToggleDisabledRow?.({
                                bisyarohId: sec.bisyaroh_id,
                                idPengurus: row.id_pengurus
                              })
                            }
                            className={`max-w-full truncate text-left hover:text-teal-700 dark:hover:text-teal-300 ${
                              rowDisabled ? 'line-through text-gray-500 dark:text-gray-400' : ''
                            }`}
                          >
                            {row.pengurus_nama}
                          </button>
                          {rowDisabled ? (
                            <span className="ml-1 rounded bg-gray-200 dark:bg-gray-700 px-1 py-0.5 text-[9px] font-semibold text-gray-600 dark:text-gray-300">
                              OFF
                            </span>
                          ) : null}
                        </td>
                        <td
                          className="py-1.5 px-2 truncate text-gray-700 dark:text-gray-300"
                          style={{
                            width: getWidth(FIXED_COL.bisyaroh.key, FIXED_COL.bisyaroh.defaultWidth),
                            minWidth: getWidth(FIXED_COL.bisyaroh.key, FIXED_COL.bisyaroh.defaultWidth),
                            maxWidth: getWidth(FIXED_COL.bisyaroh.key, FIXED_COL.bisyaroh.defaultWidth)
                          }}
                          title={bisyarohSetLabel(sec)}
                        >
                          {bisyarohSetLabel(sec)}
                        </td>
                        {(sec.kolom || []).map((k) => {
                          const colId = `${sec.bisyaroh_id}:${k.col_key}`
                          const w = getWidth(colId, DEFAULT_KOLOM_WIDTH)
                          if (k.kind === 'input') {
                            const v = row.inputs?.[k.col_key]
                            let text
                            if (k.input_tipe === 'checkbox') {
                              text = formatBisyarohCheckboxDisplay(v, k.default_nilai)
                            } else {
                              text =
                                v === '' || v == null
                                  ? '—'
                                  : k.input_tipe === 'rupiah' && !Number.isNaN(Number(v))
                                    ? formatRp(Number(v))
                                    : String(v)
                            }
                            return (
                              <td
                                key={colId}
                                className="py-1.5 px-2 truncate"
                                style={{ width: w, minWidth: w, maxWidth: w }}
                                title={text}
                              >
                                {text}
                              </td>
                            )
                          }
                          const cell = getRekapCell(row, k.col_key)
                          return (
                            <td
                              key={colId}
                              className={`py-1.5 px-2 text-right font-mono truncate ${
                                cell.error
                                  ? 'text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/30'
                                  : ''
                              }`}
                              style={{ width: w, minWidth: w, maxWidth: w }}
                              title={cell.error ? cell.title : cell.text}
                            >
                              {cell.text}
                            </td>
                          )
                        })}
                        <td
                          className="py-1.5 px-2 text-right font-semibold text-teal-700 dark:text-teal-300 align-top"
                          style={{
                            width: getWidth(FIXED_COL.total.key, FIXED_COL.total.defaultWidth),
                            minWidth: getWidth(FIXED_COL.total.key, FIXED_COL.total.defaultWidth),
                            maxWidth: getWidth(FIXED_COL.total.key, FIXED_COL.total.defaultWidth)
                          }}
                        >
                          <RekapTotalCell row={row} formatRp={formatRp} />
                        </td>
                        <td
                          className="py-1.5 px-2 align-top overflow-hidden"
                          style={{
                            width: getWidth(FIXED_COL.potong.key, FIXED_COL.potong.defaultWidth),
                            minWidth: getWidth(FIXED_COL.potong.key, FIXED_COL.potong.defaultWidth),
                            maxWidth: getWidth(FIXED_COL.potong.key, FIXED_COL.potong.defaultWidth)
                          }}
                        >
                          {row.potong_uwaba ? (
                            <div className="space-y-0.5 text-left text-[11px] leading-snug">
                              <div className="font-semibold text-teal-700 dark:text-teal-300 tabular-nums">
                                {formatRp(row.potong_uwaba.terpotong_total)}
                              </div>
                              <p className="text-gray-500 dark:text-gray-400 line-clamp-2" title={row.potong_uwaba.keterangan}>
                                {row.potong_uwaba.keterangan}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td
                          className="py-1.5 px-2 truncate text-gray-600 dark:text-gray-300"
                          style={{
                            width: getWidth(FIXED_COL.catatan.key, FIXED_COL.catatan.defaultWidth),
                            minWidth: getWidth(FIXED_COL.catatan.key, FIXED_COL.catatan.defaultWidth),
                            maxWidth: getWidth(FIXED_COL.catatan.key, FIXED_COL.catatan.defaultWidth)
                          }}
                          title={row.catatan || ''}
                        >
                          {row.catatan?.trim() ? row.catatan : '—'}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
                {(sec.rows || []).length === 0 ? (
                  <p className="text-sm text-gray-500 p-3">Tidak ada baris pengurus untuk set ini.</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <BisyarohReviewPrintOffcanvas
        open={printOffcanvasOpen}
        onClose={() => setPrintOffcanvasOpen(false)}
        sections={sections}
        meta={printMeta}
        formatRp={formatRp}
        getRekapCell={getRekapCell}
        onNotify={onNotify}
      />
    </div>
  )
}
