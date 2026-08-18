import { useCallback, useEffect, useMemo, useState } from 'react'
import { bisyarohAPI } from '../../../services/api'
import { downloadCsvText } from './bisyarohReviewJatimCsv'

function formatRp(n) {
  const v = Number(n) || 0
  return `Rp ${v.toLocaleString('id-ID')}`
}

function CopyIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  )
}

/**
 * Accordion ekspor multi-lembaga (status ditinjau) untuk Review / Rilis.
 */
export default function BisyarohExportAccordion({
  open = false,
  onToggle,
  periodeBulan,
  periodeKalender = 'masehi',
  lembagaList = [],
  disabledKeys = [],
  canExport = false,
  onNotify,
  onExported
}) {
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [error, setError] = useState('')

  const lembagaIdsAll = useMemo(
    () => (Array.isArray(lembagaList) ? lembagaList.map((l) => String(l.id)).filter(Boolean) : []),
    [lembagaList]
  )

  const loadPreview = useCallback(async () => {
    if (!periodeBulan || lembagaIdsAll.length === 0) {
      setItems([])
      return
    }
    setLoadingPreview(true)
    setError('')
    try {
      const res = await bisyarohAPI.transferExportBatch({
        periode_bulan: periodeBulan,
        kalender: periodeKalender,
        lembaga_ids: lembagaIdsAll,
        disabled_keys: disabledKeys,
        dry_run: true
      })
      if (res?.success) {
        const list = Array.isArray(res.data?.items) ? res.data.items : []
        setItems(list)
        setSelected(new Set(list.map((it) => String(it.lembaga_id))))
      } else {
        setItems([])
        setSelected(new Set())
        setError(res?.message || 'Tidak ada lembaga ditinjau siap ekspor')
      }
    } catch (e) {
      setItems([])
      setSelected(new Set())
      setError(e?.response?.data?.message || e?.message || 'Gagal memuat pratinjau ekspor')
    } finally {
      setLoadingPreview(false)
    }
  }, [periodeBulan, periodeKalender, lembagaIdsAll, disabledKeys])

  useEffect(() => {
    if (open) loadPreview()
  }, [open, loadPreview])

  const selectedItems = useMemo(
    () => items.filter((it) => selected.has(String(it.lembaga_id))),
    [items, selected]
  )

  const totalCount = selectedItems.reduce((a, it) => a + (Number(it.row_count) || 0), 0)
  const totalNominal = selectedItems.reduce((a, it) => a + (Number(it.total_nominal) || 0), 0)

  const toggleOne = (lid) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const k = String(lid)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((it) => String(it.lembaga_id))))
  }

  const copyPlain = async (value, label) => {
    const text = String(value ?? '')
    try {
      await navigator.clipboard.writeText(text)
      onNotify?.(`${label} disalin`, 'success')
    } catch {
      onNotify?.('Gagal menyalin ke clipboard', 'error')
    }
  }

  const runExportCsv = async () => {
    const ids = selectedItems.map((it) => String(it.lembaga_id))
    if (ids.length === 0) {
      onNotify?.('Pilih minimal satu lembaga', 'error')
      return
    }
    setExporting(true)
    try {
      const res = await bisyarohAPI.transferExportBatch({
        periode_bulan: periodeBulan,
        kalender: periodeKalender,
        lembaga_ids: ids,
        disabled_keys: disabledKeys
      })
      if (!res?.success) {
        onNotify?.(res?.message || 'Gagal export CSV', 'error')
        return
      }
      const csv = res.data?.csv_text || ''
      const fname =
        res.data?.file_name ||
        `bisyaroh-jatim-${periodeBulan}-${periodeKalender}.csv`
      downloadCsvText(csv, fname)
      onNotify?.(
        `CSV Jatim diunduh (${res.data?.row_count ?? 0} baris, batch #${res.data?.batch_id || res.data?.batch?.id || '—'})`,
        'success'
      )
      onExported?.(res.data)
    } catch (e) {
      onNotify?.(e?.response?.data?.message || e?.message || 'Gagal export CSV', 'error')
    } finally {
      setExporting(false)
    }
  }

  const runExportExcelHint = () => {
    onNotify?.(
      'Excel multi-lembaga memakai data rekap yang sedang dibuka di Review. Untuk arsip bank, gunakan Export CSV Jatim (batch tersimpan).',
      'info'
    )
  }

  if (!canExport) return null

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-amber-900 dark:text-amber-100 hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
      >
        <span>Ekspor Bank Jatim (multi-lembaga ditinjau)</span>
        <span className="text-[10px] font-medium opacity-80">{open ? 'Tutup' : 'Buka'}</span>
      </button>
      {open ? (
        <div className="px-3 pb-3 space-y-2 border-t border-amber-200/80 dark:border-amber-800/50">
          {loadingPreview ? (
            <p className="text-[11px] text-gray-500 py-2">Memuat lembaga ditinjau…</p>
          ) : error && items.length === 0 ? (
            <p className="text-[11px] text-amber-800 dark:text-amber-200 py-2">{error}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600"
                >
                  {selected.size === items.length ? 'Hapus semua' : 'Pilih semua'}
                </button>
                <button
                  type="button"
                  onClick={loadPreview}
                  className="text-[10px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600"
                >
                  Segarkan
                </button>
              </div>
              <ul className="max-h-48 overflow-y-auto space-y-1">
                {items.map((it) => {
                  const lid = String(it.lembaga_id)
                  const nama =
                    it.lembaga_nama ||
                    lembagaList.find((l) => String(l.id) === lid)?.nama ||
                    lid
                  return (
                    <li key={lid}>
                      <label className="flex items-center gap-2 text-[11px] rounded-md px-2 py-1.5 hover:bg-white/70 dark:hover:bg-gray-900/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(lid)}
                          onChange={() => toggleOne(lid)}
                          className="rounded border-gray-400 text-amber-600"
                        />
                        <span className="flex-1 min-w-0 truncate font-medium text-gray-800 dark:text-gray-100">
                          {nama}
                        </span>
                        <span className="tabular-nums text-gray-600 dark:text-gray-300 shrink-0">
                          {it.row_count} · {formatRp(it.total_nominal)}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Count</span>
                    <span>{totalCount}</span>
                    <button
                      type="button"
                      onClick={() => copyPlain(totalCount, 'Count')}
                      className="p-0.5 rounded text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-900/40"
                      title="Salin count (angka murni)"
                      aria-label="Salin count"
                    >
                      <CopyIcon />
                    </button>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Sum</span>
                    <span>{formatRp(totalNominal)}</span>
                    <button
                      type="button"
                      onClick={() => copyPlain(Math.floor(totalNominal), 'Sum')}
                      className="p-0.5 rounded text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-900/40"
                      title="Salin sum (angka murni)"
                      aria-label="Salin sum"
                    >
                      <CopyIcon />
                    </button>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={runExportExcelHint}
                    className="px-2 py-1 rounded border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 text-[10px] font-medium"
                  >
                    Excel
                  </button>
                  <button
                    type="button"
                    disabled={exporting || selectedItems.length === 0}
                    onClick={runExportCsv}
                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-medium disabled:opacity-50"
                  >
                    {exporting ? 'Mengekspor…' : 'Export CSV Jatim'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
