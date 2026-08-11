/** Jumlah permintaan chunk paralel (offset) per gelombang — backend tetap per-query; ini mengurangi waktu tunggu total. */
export const MANAGE_DATA_PARALLEL_CONCURRENCY = 4

/** Hilangkan baris duplikat (mis. id_khusus / id_tunggakan sama) setelah merge chunk. */
export function dedupeManageDataRows(rows, getRowKey) {
  if (!getRowKey || !Array.isArray(rows)) return rows
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const k = getRowKey(r)
    if (k == null || k === '' || seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

/**
 * Muat semua halaman Manage Data memakai OFFSET paralel (gelombang), setelah chunk pertama memastikan meta.total ada.
 * Chunk pertama offset=0; chunk lanjutan tidak memakai cursor agar selaras cabang OFFSET di API.
 *
 * @param {object} options
 * @param {number} options.chunkSize
 * @param {number} [options.concurrency]
 * @param {AbortSignal} [options.signal]
 * @param {(opts: object) => Promise<{ success?: boolean, message?: string, data?: unknown[], meta?: object }>} options.fetchChunk
 * @param {(rows: unknown[], total: number) => void} [options.onProgress]
 * @param {(row: unknown) => string|number|null|undefined} [options.getRowKey]
 */
export async function fetchManageDataParallelOffsets({
  chunkSize,
  concurrency = MANAGE_DATA_PARALLEL_CONCURRENCY,
  signal,
  fetchChunk,
  onProgress,
  getRowKey,
}) {
  const offsetOpts = (offset) => ({
    limit: chunkSize,
    offset,
    cursor: 0,
    cursor_sid: 0,
    cursor_kid: 0,
    cursor_tid: 0,
    ...(signal ? { signal } : {}),
  })

  const first = await fetchChunk(offsetOpts(0))
  if (!first?.success) {
    return { ok: false, message: first?.message || 'Gagal memuat data' }
  }

  const meta = first.meta
  const firstRows = dedupeManageDataRows(
    Array.isArray(first.data) ? first.data : [],
    getRowKey,
  )
  if (!meta || typeof meta.total !== 'number') {
    onProgress?.(firstRows, firstRows.length)
    return { ok: true, rows: firstRows, total: firstRows.length, meta: null }
  }

  const total = meta.total
  let rows = [...firstRows]
  onProgress?.(rows, total)

  const offsets = []
  for (let o = chunkSize; o < total; o += chunkSize) {
    offsets.push(o)
  }

  for (let i = 0; i < offsets.length; i += concurrency) {
    const wave = offsets.slice(i, i + concurrency)
    const results = await Promise.all(wave.map((off) => fetchChunk(offsetOpts(off))))
    for (const r of results) {
      if (!r?.success) {
        return {
          ok: false,
          message: r?.message || 'Gagal memuat data',
          rows,
          total,
        }
      }
      rows = dedupeManageDataRows(
        rows.concat(Array.isArray(r.data) ? r.data : []),
        getRowKey,
      )
      onProgress?.(rows, total)
    }
  }

  if (rows.length > total) {
    rows = rows.slice(0, total)
  }
  rows = dedupeManageDataRows(rows, getRowKey)

  return { ok: true, rows, total, meta }
}
