import { useEffect, useState } from 'react'
import { bisyarohAPI } from '../../../services/api'

/**
 * Upload mutasi Bank Jatim + pilih batch export target.
 */
export default function BisyarohUploadMutasiPanel({
  canUpload = false,
  periodeBulan = '',
  periodeKalender = 'masehi',
  defaultExportBatchId = null,
  onNotify,
  onDone,
  compact = false
}) {
  const [batches, setBatches] = useState([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [exportBatchId, setExportBatchId] = useState(defaultExportBatchId || '')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (defaultExportBatchId) setExportBatchId(String(defaultExportBatchId))
  }, [defaultExportBatchId])

  useEffect(() => {
    if (!canUpload) return
    let cancelled = false
    ;(async () => {
      setLoadingBatches(true)
      try {
        const params = { jenis: 'export_upload', limit: 50 }
        if (periodeKalender === 'masehi' || periodeKalender === 'hijriyah') {
          params.kalender = periodeKalender
        }
        if (/^\d{4}-\d{2}$/.test(String(periodeBulan || ''))) {
          params.periode_bulan = periodeBulan
        }
        const res = await bisyarohAPI.transferListBatches(params)
        if (cancelled) return
        const items = Array.isArray(res?.data?.items) ? res.data.items : []
        setBatches(items)
        if (!exportBatchId && items[0]?.id) {
          setExportBatchId(String(items[0].id))
        }
      } catch {
        if (!cancelled) setBatches([])
      } finally {
        if (!cancelled) setLoadingBatches(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya reload saat filter berubah
  }, [canUpload, periodeBulan, periodeKalender])

  if (!canUpload) return null

  const submit = async () => {
    if (!file) {
      onNotify?.('Pilih file CSV mutasi', 'error')
      return
    }
    if (!exportBatchId) {
      onNotify?.('Pilih batch export target', 'error')
      return
    }
    setUploading(true)
    try {
      const res = await bisyarohAPI.transferUploadMutasi({
        file,
        exportBatchId: Number(exportBatchId)
      })
      if (res?.success) {
        onNotify?.(
          `Mutasi diproses: berhasil ${res.data?.matched ?? 0}, gagal ${res.data?.gagal ?? 0}`,
          'success'
        )
        setFile(null)
        onDone?.(res.data)
      } else {
        onNotify?.(res?.message || 'Upload gagal', 'error')
      }
    } catch (e) {
      onNotify?.(e?.response?.data?.message || e?.message || 'Upload gagal', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={
        compact
          ? 'space-y-2'
          : 'rounded-lg border border-sky-200 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-950/20 p-3 space-y-2'
      }
    >
      {!compact ? (
        <div className="text-xs font-semibold text-sky-900 dark:text-sky-100">Upload mutasi Bank Jatim</div>
      ) : null}
      <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-snug">
        Pilih batch export CSV yang diunggah ke bank, lalu unggah file mutasi download. Pencocokan: rekening +
        nominal (identitas lembaga/NIP dari batch).
      </p>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[10px] text-gray-600 dark:text-gray-400 min-w-[160px] flex-1">
          Batch export
          <select
            value={exportBatchId}
            onChange={(e) => setExportBatchId(e.target.value)}
            disabled={loadingBatches || uploading}
            className="mt-0.5 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs px-2 py-1.5"
          >
            <option value="">{loadingBatches ? 'Memuat…' : '— pilih —'}</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.id} · {b.periode_bulan} · {b.row_count} baris · {b.file_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-gray-600 dark:text-gray-400 min-w-[140px]">
          File CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={uploading}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mt-0.5 block w-full text-[11px] text-gray-700 dark:text-gray-200"
          />
        </label>
        <button
          type="button"
          disabled={uploading || !file || !exportBatchId}
          onClick={submit}
          className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium disabled:opacity-50"
        >
          {uploading ? 'Mengunggah…' : 'Unggah & rekonsiliasi'}
        </button>
      </div>
    </div>
  )
}
