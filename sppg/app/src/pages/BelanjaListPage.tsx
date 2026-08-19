import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  downloadBelanjaBniCsv,
  downloadBelanjaMakerXlsx,
  listBelanja,
  updateBelanjaBniStatus,
  updateBelanjaCairStatus,
  type BelanjaRow,
} from '../api/apiClient'
import {
  canChangeBniStatus,
  canChangeCairStatus,
  canManageData,
  canSetBniStatus,
  getStoredUser,
  type BelanjaBniStatus,
  type BelanjaCairStatus,
} from '../utils/auth'
import { usePageTitle } from '../contexts/PageTitleContext'
import { formatDateId, formatRp, todayYmd } from '../utils/format'

type FacetOption = { value: string; label: string; count: number }

const BNI_STATUS_OPTIONS: { value: BelanjaBniStatus; label: string }[] = [
  { value: 'belum', label: 'Belum' },
  { value: 'maker', label: 'Maker' },
  { value: 'approved', label: 'Approved' },
]

const CAIR_STATUS_OPTIONS: { value: BelanjaCairStatus; label: string }[] = [
  { value: 'jatim', label: 'Jatim' },
  { value: 'cair', label: 'Cair' },
]

function statusLabel(status?: string | null): string {
  const found = BNI_STATUS_OPTIONS.find((o) => o.value === status)
  return found?.label || 'Belum'
}

function statusClass(status?: string | null): string {
  switch (status) {
    case 'maker':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
    case 'approved':
      return 'bg-[var(--ok-bg)] text-[var(--ok-ink)] border-[var(--ok-line)]'
    default:
      return 'bg-surface-soft text-muted border-line'
  }
}

function cairLabel(status?: string | null): string {
  if (status === 'jatim') return 'Jatim'
  if (status === 'cair') return 'Cair'
  return '—'
}

function cairClass(status?: string | null): string {
  switch (status) {
    case 'jatim':
      return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
    case 'cair':
      return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
    default:
      return 'bg-surface-soft text-faint border-line'
  }
}

function countBy(
  rows: BelanjaRow[],
  keyFn: (row: BelanjaRow) => string | null,
): FacetOption[] {
  const map = new Map<string, { label: string; count: number }>()
  for (const row of rows) {
    const raw = keyFn(row)
    if (raw === null) continue
    const prev = map.get(raw)
    if (prev) prev.count += 1
    else map.set(raw, { label: raw, count: 1 })
  }
  return [...map.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'id'))
}

export default function BelanjaListPage() {
  usePageTitle('Belanja')
  const role = getStoredUser()?.role
  const canManage = canManageData(role)
  const canStatus = canChangeBniStatus(role)
  const canCair = canChangeCairStatus(role)
  const canExportBni = role === 'admin_maker' || role === 'super_admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<BelanjaRow[]>([])
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rekeningId, setRekeningId] = useState('')
  const [kategori, setKategori] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | BelanjaBniStatus>('')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [updatingCair, setUpdatingCair] = useState(false)
  const [copyOk, setCopyOk] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [todayTotal, setTodayTotal] = useState(0)

  const load = async (override?: {
    q?: string
    from?: string
    to?: string
    bni_status?: '' | BelanjaBniStatus
  }) => {
    const nextQ = override?.q ?? q
    const nextFrom = override?.from ?? from
    const nextTo = override?.to ?? to
    const nextStatus = override?.bni_status ?? statusFilter
    setLoading(true)
    const res = await listBelanja({
      q: nextQ.trim() || undefined,
      from: nextFrom || undefined,
      to: nextTo || undefined,
      bni_status: nextStatus || undefined,
    })
    if (res.success && res.data) {
      setRows(res.data)
      setSelected(new Set())
      setError('')
    } else {
      setError(res.message || 'Gagal memuat data')
    }
    setLoading(false)
  }

  useEffect(() => {
    const today = todayYmd()
    void (async () => {
      const res = await listBelanja({ from: today, to: today })
      if (res.success && res.data) {
        setTodayTotal(res.data.reduce((sum, r) => sum + Number(r.total || 0), 0))
      }
    })()

    if (searchParams.get('hari') === '1') {
      setFrom(today)
      setTo(today)
      void load({ from: today, to: today })
      setSearchParams({}, { replace: true })
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rekeningBase = useMemo(
    () => (kategori ? rows.filter((r) => (r.kategori || '') === kategori) : rows),
    [rows, kategori],
  )

  const kategoriBase = useMemo(
    () => (rekeningId ? rows.filter((r) => String(r.rekening_id ?? '') === rekeningId) : rows),
    [rows, rekeningId],
  )

  const rekeningOptions = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const r of rekeningBase) {
      if (!r.rekening_id) continue
      const value = String(r.rekening_id)
      const label = (r.nama_penerima || r.nomor_rekening || `Rekening #${r.rekening_id}`).trim()
      const prev = map.get(value)
      if (prev) prev.count += 1
      else map.set(value, { label, count: 1 })
    }
    return [...map.entries()]
      .map(([value, { label, count }]) => ({ value, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'id'))
  }, [rekeningBase])

  const kategoriOptions = useMemo(
    () =>
      countBy(kategoriBase, (r) => {
        const name = (r.kategori || '').trim()
        return name !== '' ? name : null
      }),
    [kategoriBase],
  )

  useEffect(() => {
    if (rekeningId && !rekeningOptions.some((o) => o.value === rekeningId)) {
      setRekeningId('')
    }
  }, [rekeningId, rekeningOptions])

  useEffect(() => {
    if (kategori && !kategoriOptions.some((o) => o.value === kategori)) {
      setKategori('')
    }
  }, [kategori, kategoriOptions])

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (rekeningId && String(r.rekening_id ?? '') !== rekeningId) return false
      if (kategori && (r.kategori || '') !== kategori) return false
      return true
    })
  }, [rows, rekeningId, kategori])

  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows])
  const selectedCount = useMemo(
    () => visibleIds.filter((id) => selected.has(id)).length,
    [visibleIds, selected],
  )
  const selectedTotal = useMemo(
    () =>
      visibleRows
        .filter((r) => selected.has(r.id))
        .reduce((sum, r) => sum + Number(r.total || 0), 0),
    [visibleRows, selected],
  )
  const allVisibleSelected = visibleIds.length > 0 && selectedCount === visibleIds.length

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id)
      } else {
        for (const id of visibleIds) next.add(id)
      }
      return next
    })
  }

  const filterHariIni = () => {
    const today = todayYmd()
    setFrom(today)
    setTo(today)
    setRekeningId('')
    setKategori('')
    void load({ from: today, to: today })
  }

  const selectedIds = () => visibleIds.filter((id) => selected.has(id))

  const applyStatus = async (
    status: BelanjaBniStatus,
    namaArsip?: string,
    opts?: { keepSelection?: boolean },
  ) => {
    const ids = selectedIds()
    if (!ids.length) {
      setError('Centang minimal satu catatan untuk mengubah status.')
      return
    }
    if (!canStatus) {
      setError('Role admin biasa tidak dapat mengubah status BNI.')
      return
    }
    const blocked = visibleRows.filter(
      (r) => ids.includes(r.id) && !canSetBniStatus(role, r.bni_status || 'belum', status),
    )
    if (blocked.length) {
      setError(
        `Tidak dapat set ${statusLabel(status)} untuk ${blocked.length} catatan (status terkunci / turun / di luar wewenang role).`,
      )
      return
    }
    setOk('')
    setError('')
    setUpdatingStatus(true)
    const res = await updateBelanjaBniStatus(ids, status, {
      nama: namaArsip?.trim() || undefined,
    })
    setUpdatingStatus(false)
    if (res.success) {
      const batch = res.data?.batch
      const batches = batch?.batches
      if (status === 'maker' && batches && batches.length > 1) {
        setOk(
          `Maker + ${batches.length} CSV diarsipkan ke Waiting: ${batches.map((b) => b.csv_filename).join(', ')}. Unggah Inhouse ke sheet BNI Inhouse, Online ke sheet Online.`,
        )
      } else if (status === 'maker' && batch) {
        setOk(
          `Maker + CSV diarsipkan: ${batch.csv_filename} (${batch.record_count} rek, ${formatRp(batch.total_amount)}). Menunggu email BNI untuk auto-approve.`,
        )
      } else if (status === 'maker' && res.data?.batch_error) {
        setOk(`Status Maker diperbarui, tetapi arsip CSV gagal: ${res.data.batch_error}`)
      } else {
        setOk(res.message || `Status ${ids.length} catatan → ${statusLabel(status)}`)
      }
      setRows((prev) =>
        prev.map((r) => {
          if (!ids.includes(r.id)) return r
          const next: BelanjaRow = { ...r, bni_status: status }
          if (status === 'approved' && r.rekening_id) {
            next.cair_status = r.rekening_jenis === 'va' ? 'jatim' : 'cair'
          }
          return next
        }),
      )
      if (!opts?.keepSelection) {
        setSelected(new Set())
      }
    } else {
      setError(res.message || 'Gagal mengubah status')
    }
  }

  const applyCairStatus = async (status: BelanjaCairStatus) => {
    const ids = selectedIds()
    if (!ids.length) {
      setError('Centang minimal satu catatan untuk mengubah status Jatim/Cair.')
      return
    }
    if (!canCair) {
      setError('Hanya super admin yang dapat mengubah status Jatim/Cair.')
      return
    }
    setOk('')
    setError('')
    setUpdatingCair(true)
    const res = await updateBelanjaCairStatus(ids, status)
    setUpdatingCair(false)
    if (res.success) {
      setOk(`Status Jatim/Cair ${ids.length} catatan → ${cairLabel(status)}`)
      setRows((prev) =>
        prev.map((r) => (ids.includes(r.id) ? { ...r, cair_status: status } : r)),
      )
      setSelected(new Set())
    } else {
      setError(res.message || 'Gagal mengubah status Jatim/Cair')
    }
  }

  const copySelectedTotal = async () => {
    const raw = String(Math.round(Number(selectedTotal) || 0))
    try {
      await navigator.clipboard.writeText(raw)
      setCopyOk(true)
      window.setTimeout(() => setCopyOk(false), 1500)
    } catch {
      setError('Gagal menyalin total. Salin manual: ' + raw)
    }
  }

  const exportBni = async () => {
    setOk('')
    setError('')
    const ids = selectedIds()
    if (!ids.length) {
      setError('Centang catatan yang ingin diekspor terlebih dahulu.')
      return
    }
    const defaultNama =
      from && to && from === to
        ? formatDateId(from).split(',')[0]?.trim() || 'belanja'
        : 'belanja'
    const nama = window.prompt('Nama file CSV (tanpa ekstensi)?', defaultNama)
    if (nama === null) return
    setExporting(true)
    const res = await downloadBelanjaBniCsv({
      nama: nama.trim() || 'belanja',
      ids,
    })
    setExporting(false)
    if (res.success) {
      const isZip = res.filename.toLowerCase().endsWith('.zip')
      setOk(
        isZip
          ? `ZIP diunduh: ${res.filename} (Inhouse + Online). Kedua CSV masuk arsip Waiting — unggah masing-masing ke sheet BNI Direct yang sesuai.`
          : `CSV diunduh: ${res.filename} (${ids.length} baris terpilih). File masuk arsip Waiting.`,
      )
      const canPromptMaker = visibleRows.some(
        (r) => ids.includes(r.id) && canSetBniStatus(role, r.bni_status || 'belum', 'maker'),
      )
      if (
        canPromptMaker &&
        window.confirm(
          'Tandai status terpilih menjadi Maker?',
        )
      ) {
        await applyStatus('maker', nama.trim() || 'belanja', { keepSelection: true })
      }
    } else {
      setError(res.message)
    }
  }

  const exportMakerExcel = async () => {
    setOk('')
    setError('')
    const ids = selectedIds()
    if (!ids.length) {
      setError('Centang catatan yang ingin diekspor Excel terlebih dahulu.')
      return
    }
    const defaultNama =
      from && to
        ? `MAKER OPERASIONAL ${from.slice(8)}-${to.slice(8)}`
        : 'MAKER OPERASIONAL'
    const nama = window.prompt(
      'Judul / nama file Excel (tanpa ekstensi)?\nContoh: MAKER OPERASIONAL 11-23',
      defaultNama,
    )
    if (nama === null) return
    setExportingXlsx(true)
    const res = await downloadBelanjaMakerXlsx({
      nama: nama.trim() || 'MAKER OPERASIONAL',
      ids,
    })
    setExportingXlsx(false)
    if (res.success) {
      setOk(`Excel diunduh: ${res.filename} (${ids.length} baris terpilih). File masuk arsip Waiting.`)
    } else {
      setError(res.message)
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="ui-card p-3 flex flex-wrap items-center justify-between gap-2 border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Total belanja hari ini</div>
          <div className="mt-0.5 font-display text-xl font-bold text-ink tabular-nums">{formatRp(todayTotal)}</div>
        </div>
        <button type="button" className="ui-btn-ghost" onClick={filterHariIni}>
          Tampilkan hari ini
        </button>
      </div>

      <form
        className="ui-card p-2.5 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setRekeningId('')
          setKategori('')
          void load()
        }}
      >
        <div>
          <label className="ui-label">Cari</label>
          <input
            className="ui-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rekening / keterangan / barang / kategori"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="ui-label">Dari</label>
            <input type="date" className="ui-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="ui-label">Sampai</label>
            <input type="date" className="ui-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="ui-label">Rekening</label>
            <select
              className="ui-input"
              value={rekeningId}
              onChange={(e) => setRekeningId(e.target.value)}
              disabled={loading || rows.length === 0}
            >
              <option value="">
                Semua rekening{rekeningBase.length ? ` (${rekeningBase.length})` : ''}
              </option>
              {rekeningOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label">Kategori</label>
            <select
              className="ui-input"
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              disabled={loading || rows.length === 0}
            >
              <option value="">
                Semua kategori{kategoriBase.length ? ` (${kategoriBase.length})` : ''}
              </option>
              {kategoriOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label">Status BNI</label>
            <select
              className="ui-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | BelanjaBniStatus)}
            >
              <option value="">Semua status</option>
              {BNI_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="ui-btn-ghost">
            Filter
          </button>
          <button type="button" className="ui-btn-ghost" onClick={filterHariIni}>
            Hari ini
          </button>
        </div>
      </form>

      {canManage && (
        <div className="ui-card p-2.5 flex flex-wrap items-center gap-2">
          {visibleRows.length > 0 ? (
            <>
              <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
                Pilih semua ({visibleRows.length})
              </label>
              <span className="text-[12px] text-muted inline-flex items-center gap-1.5 flex-wrap">
                Terpilih: {selectedCount}
                {selectedCount > 0 ? (
                  <>
                    <span>· {formatRp(selectedTotal)}</span>
                    <button
                      type="button"
                      className="ui-btn-ghost !py-0.5 !px-1.5 text-[11px]"
                      title="Salin angka total (tanpa Rp / titik)"
                      onClick={() => void copySelectedTotal()}
                    >
                      {copyOk ? 'Tersalin' : 'Salin'}
                    </button>
                  </>
                ) : null}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-muted">Belum ada catatan untuk dipilih</span>
          )}
          {selectedCount > 0 && (
          <div className="flex flex-wrap gap-1.5 ml-auto items-center">
            {canExportBni && (
              <button
                type="button"
                className="ui-btn-ghost py-1 px-2 text-[12px]"
                disabled={exporting || exportingXlsx || loading}
                onClick={() => void exportBni()}
              >
                {exporting ? 'Mengunduh…' : `Ekspor BNI (${selectedCount})`}
              </button>
            )}
            <button
              type="button"
              className="ui-btn-ghost py-1 px-2 text-[12px]"
              disabled={exporting || exportingXlsx || loading}
              onClick={() => void exportMakerExcel()}
            >
              {exportingXlsx ? 'Mengunduh…' : `Ekspor Excel (${selectedCount})`}
            </button>
            {canStatus &&
              BNI_STATUS_OPTIONS.filter((opt) => {
                if (opt.value === 'belum') return false
                return visibleRows.some(
                  (r) =>
                    selected.has(r.id) &&
                    canSetBniStatus(role, r.bni_status || 'belum', opt.value),
                )
              }).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="ui-btn-ghost py-1 px-2 text-[12px]"
                  disabled={updatingStatus || updatingCair}
                  onClick={() => void applyStatus(opt.value)}
                >
                  → {opt.label}
                </button>
              ))}
            {canCair &&
              CAIR_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="ui-btn-ghost py-1 px-2 text-[12px]"
                  disabled={updatingStatus || updatingCair}
                  onClick={() => void applyCairStatus(opt.value)}
                >
                  → {opt.label}
                </button>
              ))}
            <Link to="/belanja/baru" className="ui-btn-primary py-1 px-2.5 text-[12px]">
              + Baru
            </Link>
          </div>
          )}
          {selectedCount === 0 && canManage && (
            <div className="ml-auto">
              <Link to="/belanja/baru" className="ui-btn-primary py-1 px-2.5 text-[12px]">
                + Baru
              </Link>
            </div>
          )}
        </div>
      )}

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      {loading ? (
        <div className="text-muted text-[13px]">Memuat…</div>
      ) : visibleRows.length === 0 ? (
        <div className="ui-card p-6 text-center text-muted text-[13px]">Belum ada catatan.</div>
      ) : (
        <div className="space-y-1.5">
          {visibleRows.map((row) => {
            const checked = selected.has(row.id)
            const status = row.bni_status || 'belum'
            const cair = row.cair_status
            return (
              <div
                key={row.id}
                className={[
                  'ui-card p-2.5 flex items-center gap-2.5 transition',
                  checked
                    ? 'border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]'
                    : 'hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]',
                ].join(' ')}
              >
                {canManage && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    checked={checked}
                    onChange={() => toggleOne(row.id)}
                    aria-label={`Pilih ${row.nama_penerima || row.id}`}
                  />
                )}
                <Link to={`/belanja/${row.id}`} className="min-w-0 flex-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="text-[13px] font-semibold text-ink truncate">
                        {row.nama_penerima || 'Tanpa rekening'}
                      </div>
                      <span
                        className={[
                          'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border',
                          statusClass(status),
                        ].join(' ')}
                      >
                        {statusLabel(status)}
                      </span>
                      <span
                        className={[
                          'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border',
                          cairClass(cair),
                        ].join(' ')}
                        title="Status pencairan (Jatim/Cair)"
                      >
                        {cairLabel(cair)}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted mt-0.5 truncate">
                      {row.keterangan || 'Belanja dapur'}
                      {' · '}
                      {formatDateId(row.tanggal)}
                      {row.kategori ? ` · ${row.kategori}` : ''}
                      {row.item_count != null ? ` · ${row.item_count} item` : ''}
                    </div>
                  </div>
                  <div className="font-display text-[15px] font-bold text-ink whitespace-nowrap tabular-nums">
                    {formatRp(row.total)}
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
