import { useCallback, useEffect, useState } from 'react'
import { bisyarohAPI } from '../../../services/api'
import { downloadCsvText } from './bisyarohReviewJatimCsv'
import BisyarohUploadMutasiPanel from './BisyarohUploadMutasiPanel'

const PAGE_SIZE = 50

function formatRp(n) {
  return `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`
}

function labelJenis(j) {
  if (j === 'mutasi_hasil') return 'Mutasi'
  return 'Export'
}

function labelStatus(st) {
  const s = String(st || '')
  if (s === 'berhasil') return 'Berhasil'
  if (s === 'gagal') return 'Gagal'
  if (s === 'pending') return 'Pending'
  if (s === 'ambiguous') return 'Ambigu'
  return s || '—'
}

function labelKalender(k) {
  return String(k || '').toLowerCase() === 'hijriyah' ? 'Hijriyah' : 'Masehi'
}

/**
 * Tab Rilis: arsip batch CSV export/mutasi, detail baris, upload, export ulang gagal.
 * Kalender & periode hanya filter opsional (kosong = semua).
 */
export default function BisyarohRilisTab({
  canUpload = false,
  canReconcile = false,
  onNotify
}) {
  const [filterKalender, setFilterKalender] = useState('')
  const [filterPeriode, setFilterPeriode] = useState('')
  const [batches, setBatches] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [rows, setRows] = useState([])
  const [rowFilter, setRowFilter] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [rilisBusyId, setRilisBusyId] = useState(null)
  const [applying, setApplying] = useState(false)

  const buildListParams = useCallback(
    (offset = 0, limit = PAGE_SIZE) => {
      const params = { limit, offset }
      if (filterKalender === 'masehi' || filterKalender === 'hijriyah') {
        params.kalender = filterKalender
      }
      if (/^\d{4}-\d{2}$/.test(filterPeriode)) {
        params.periode_bulan = filterPeriode
      }
      return params
    },
    [filterKalender, filterPeriode]
  )

  const loadBatches = useCallback(
    async ({ append = false, currentLen = 0 } = {}) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      try {
        const offset = append ? currentLen : 0
        const res = await bisyarohAPI.transferListBatches(buildListParams(offset, PAGE_SIZE))
        if (res?.success) {
          const items = Array.isArray(res.data?.items) ? res.data.items : []
          setBatches((prev) => (append ? [...prev, ...items] : items))
          setTotal(Number(res.data?.total) || items.length)
          setHasMore(!!res.data?.has_more)
        } else {
          if (!append) setBatches([])
          setTotal(0)
          setHasMore(false)
          onNotify?.(res?.message || 'Gagal memuat arsip', 'error')
        }
      } catch (e) {
        if (!append) setBatches([])
        setTotal(0)
        setHasMore(false)
        onNotify?.(e?.response?.data?.message || 'Gagal memuat arsip', 'error')
      } finally {
        if (append) setLoadingMore(false)
        else setLoading(false)
      }
    },
    [buildListParams, onNotify]
  )

  useEffect(() => {
    setSelectedId(null)
    setDetail(null)
    setRows([])
    loadBatches({ append: false })
  }, [filterKalender, filterPeriode, loadBatches])

  const openBatch = async (id) => {
    setSelectedId(id)
    setLoadingDetail(true)
    try {
      const [dRes, rRes] = await Promise.all([
        bisyarohAPI.transferShowBatch(id),
        bisyarohAPI.transferListBatchRows(id, rowFilter ? { transfer_status: rowFilter } : {})
      ])
      setDetail(dRes?.success ? dRes.data : null)
      setRows(rRes?.success && Array.isArray(rRes.data?.items) ? rRes.data.items : [])
    } catch (e) {
      setDetail(null)
      setRows([])
      onNotify?.(e?.response?.data?.message || 'Gagal memuat detail', 'error')
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    if (selectedId) openBatch(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowFilter])

  const exportRetryFailed = async () => {
    if (!selectedId) return
    if (!window.confirm('Export ulang hanya baris gagal dari batch ini?')) return
    setRetrying(true)
    try {
      const res = await bisyarohAPI.transferExportRetryFailed({
        retry_failed_batch_id: selectedId
      })
      if (!res?.success) {
        onNotify?.(res?.message || 'Gagal export ulang', 'error')
        return
      }
      const csv = res.data?.csv_text || ''
      downloadCsvText(csv, res.data?.file_name || `bisyaroh-retry-${selectedId}.csv`)
      onNotify?.(`CSV ulang gagal diunduh (batch #${res.data?.batch_id || '—'})`, 'success')
      await loadBatches({ append: false })
    } catch (e) {
      onNotify?.(e?.response?.data?.message || 'Gagal export ulang', 'error')
    } finally {
      setRetrying(false)
    }
  }

  const rilisManualRow = async (row) => {
    if (!canReconcile) return
    if (!row.rekap_baris_id) {
      onNotify?.('Baris mutasi belum tertaut ke rekap. Klik «Terapkan rekonsiliasi» dulu.', 'error')
      return
    }
    if (!window.confirm(`Tandai transfer berhasil untuk ${row.nama || row.nip || 'baris ini'}?`)) return
    setRilisBusyId(row.id)
    try {
      const res = await bisyarohAPI.transferRilisManual({
        transfer_baris_id: row.id,
        rekap_baris_id: row.rekap_baris_id || undefined,
        lembaga_id: row.lembaga_id || undefined
      })
      if (res?.success) {
        onNotify?.('Ditandai berhasil', 'success')
        await openBatch(selectedId)
      } else {
        onNotify?.(res?.message || 'Gagal', 'error')
      }
    } catch (e) {
      onNotify?.(e?.response?.data?.message || 'Gagal', 'error')
    } finally {
      setRilisBusyId(null)
    }
  }

  const applyMutasi = async () => {
    if (!selectedId || !detail?.batch) return
    setApplying(true)
    try {
      const res = await bisyarohAPI.transferApplyMutasi({
        mutasiBatchId: selectedId,
        exportBatchId: detail.batch.matched_export_batch_id || undefined
      })
      if (res?.success) {
        onNotify?.(
          `Rekonsiliasi: berhasil ${res.data?.matched ?? 0}, gagal ${res.data?.gagal ?? 0}`,
          'success'
        )
        await loadBatches({ append: false })
        await openBatch(selectedId)
      } else {
        onNotify?.(res?.message || 'Gagal menerapkan rekonsiliasi', 'error')
      }
    } catch (e) {
      onNotify?.(e?.response?.data?.message || e?.message || 'Gagal menerapkan rekonsiliasi', 'error')
    } finally {
      setApplying(false)
    }
  }

  const clearFilters = () => {
    setFilterKalender('')
    setFilterPeriode('')
  }

  const filterActive = filterKalender !== '' || filterPeriode !== ''

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Rilis & arsip transfer</h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Arsip export CSV & mutasi Bank Jatim (Masehi + Hijriyah). Filter opsional di bawah.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadBatches({ append: false })}
          className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 text-xs"
        >
          Segarkan
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/30 p-3">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Kalender</label>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-white dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setFilterKalender('')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                filterKalender === ''
                  ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setFilterKalender('masehi')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                filterKalender === 'masehi'
                  ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Masehi
            </button>
            <button
              type="button"
              onClick={() => setFilterKalender('hijriyah')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                filterKalender === 'hijriyah'
                  ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Hijriyah
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Periode</label>
          {filterKalender === 'hijriyah' ? (
            <input
              type="text"
              placeholder="Semua / YYYY-MM"
              value={filterPeriode}
              onChange={(e) => setFilterPeriode(e.target.value.trim())}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 w-40"
            />
          ) : (
            <input
              type="month"
              value={filterPeriode}
              onChange={(e) => setFilterPeriode(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
              title="Kosongkan untuk semua periode"
            />
          )}
        </div>
        {filterActive ? (
          <button
            type="button"
            onClick={clearFilters}
            className="px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200"
          >
            Hapus filter
          </button>
        ) : null}
        <p className="text-[10px] text-gray-500 dark:text-gray-400 w-full sm:w-auto sm:ml-auto">
          Menampilkan {batches.length}
          {total > 0 ? ` dari ${total}` : ''} batch
        </p>
      </div>

      {canUpload ? (
        <BisyarohUploadMutasiPanel
          canUpload={canUpload}
          periodeBulan={/^\d{4}-\d{2}$/.test(filterPeriode) ? filterPeriode : ''}
          periodeKalender={filterKalender || ''}
          defaultExportBatchId={
            detail?.batch?.jenis === 'export_upload'
              ? detail.batch.id
              : detail?.batch?.matched_export_batch_id || null
          }
          onNotify={onNotify}
          onDone={(data) => {
            loadBatches({ append: false })
            const id = data?.mutasi_batch_id || data?.export_batch_id || selectedId
            if (id) openBatch(id)
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Arsip batch</div>
          {loading ? (
            <p className="text-xs text-gray-500">Memuat…</p>
          ) : batches.length === 0 ? (
            <p className="text-xs text-gray-500">Belum ada batch{filterActive ? ' untuk filter ini' : ''}.</p>
          ) : (
            <>
              <ul className="max-h-[420px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                {batches.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => openBatch(b.id)}
                      className={`w-full text-left px-3 py-2 text-[11px] hover:bg-gray-50 dark:hover:bg-gray-900/40 ${
                        selectedId === b.id ? 'bg-teal-50 dark:bg-teal-900/30' : ''
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-gray-800 dark:text-gray-100">
                          #{b.id} · {labelJenis(b.jenis)}
                        </span>
                        <span className="text-gray-500">{b.status}</span>
                      </div>
                      <div className="text-gray-600 dark:text-gray-400 truncate">{b.file_name}</div>
                      <div className="flex flex-wrap gap-x-2 tabular-nums text-gray-500">
                        <span>
                          {b.periode_bulan || '—'} · {labelKalender(b.kalender)}
                        </span>
                        <span>
                          {b.row_count} baris · {formatRp(b.total_nominal)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadBatches({ append: true, currentLen: batches.length })}
                  className="w-full px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 text-xs font-medium hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50"
                >
                  {loadingMore ? 'Memuat…' : `Tampilkan lebih banyak (+${PAGE_SIZE})`}
                </button>
              ) : null}
            </>
          )}
        </div>

        <div className="lg:col-span-3 space-y-3">
          {!selectedId ? (
            <p className="text-xs text-gray-500">Pilih batch untuk melihat detail.</p>
          ) : loadingDetail ? (
            <p className="text-xs text-gray-500">Memuat detail…</p>
          ) : (
            <>
              <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-[11px] space-y-1">
                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  Batch #{detail?.batch?.id} — {labelJenis(detail?.batch?.jenis)}
                </div>
                <div className="text-gray-600 dark:text-gray-400">{detail?.batch?.file_name}</div>
                <div className="flex flex-wrap gap-3 tabular-nums">
                  <span>
                    {detail?.batch?.periode_bulan || '—'} · {labelKalender(detail?.batch?.kalender)}
                  </span>
                  <span>Baris: {detail?.batch?.row_count}</span>
                  <span>Total: {formatRp(detail?.batch?.total_nominal)}</span>
                  <span>Status: {detail?.batch?.status}</span>
                </div>
                {detail?.counts ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.entries(detail.counts).map(([k, v]) => (
                      <span
                        key={k}
                        className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300"
                      >
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {detail?.batch?.jenis === 'mutasi_hasil' ? (
                  <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-snug pt-1">
                    File mutasi adalah bukti transfer sukses di bank. Status rilis mengikuti pencocokan rekening +
                    nominal ke batch export
                    {detail?.batch?.matched_export_batch_id
                      ? ` #${detail.batch.matched_export_batch_id}`
                      : ''}
                    . Jika masih pending, terapkan rekonsiliasi.
                  </p>
                ) : null}
                {detail?.batch?.jenis === 'export_upload' && canReconcile ? (
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={retrying}
                      onClick={exportRetryFailed}
                      className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-medium disabled:opacity-50"
                    >
                      {retrying ? 'Menyiapkan…' : 'Export ulang baris gagal'}
                    </button>
                  </div>
                ) : null}
                {detail?.batch?.jenis === 'mutasi_hasil' && (canUpload || canReconcile) ? (
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={applying}
                      onClick={applyMutasi}
                      className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium disabled:opacity-50"
                    >
                      {applying ? 'Menerapkan…' : 'Terapkan rekonsiliasi'}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-gray-500">Filter status</span>
                <select
                  value={rowFilter}
                  onChange={(e) => setRowFilter(e.target.value)}
                  className="text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                >
                  <option value="">Semua</option>
                  <option value="pending">Pending</option>
                  <option value="berhasil">Berhasil</option>
                  <option value="gagal">Gagal</option>
                </select>
              </div>

              <div className="overflow-x-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr className="text-left">
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">Rekening</th>
                      <th className="px-2 py-1.5">Nama</th>
                      <th className="px-2 py-1.5">NIP</th>
                      <th className="px-2 py-1.5 text-right">Nominal</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-2 py-1 tabular-nums">{row.line_no}</td>
                        <td className="px-2 py-1 font-mono">{row.rekening}</td>
                        <td className="px-2 py-1 truncate max-w-[140px]" title={row.nama}>
                          {row.nama}
                        </td>
                        <td className="px-2 py-1">{row.nip || '—'}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatRp(row.nominal)}</td>
                        <td className="px-2 py-1">{labelStatus(row.transfer_status)}</td>
                        <td className="px-2 py-1">
                          {canReconcile &&
                          row.transfer_status !== 'berhasil' &&
                          row.rekap_baris_id ? (
                            <button
                              type="button"
                              disabled={rilisBusyId === row.id}
                              onClick={() => rilisManualRow(row)}
                              className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] disabled:opacity-50"
                            >
                              {rilisBusyId === row.id ? '…' : 'Rilis'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center text-gray-500">
                          Tidak ada baris
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
