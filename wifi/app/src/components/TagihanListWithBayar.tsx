import { useCallback, useEffect, useState } from 'react'
import {
  deleteTagihan,
  deleteTagihanBayar,
  getTagihan,
  listTagihan,
  type Tagihan,
} from '../api/apiClient'
import OffcanvasBayarTagihan from './OffcanvasBayarTagihan'
import OffcanvasEditTagihan from './OffcanvasEditTagihan'
import { formatDateId, formatRp } from '../utils/format'
import { labelPeriode } from '../utils/tagihanSettings'

export type TagihanListWithBayarProps = {
  pelangganId: number | null
  periodeBulan?: number
  periodeTahun?: number
  /** Dipanggil setelah bayar / hapus (untuk refresh parent). */
  onChanged?: () => void
  /** Status offcanvas bayar terbuka (agar parent bisa tahan Escape). */
  onBayarOpenChange?: (open: boolean) => void
  /** z-index offcanvas bayar (harus di atas detail kanan jika nested). */
  bayarZIndex?: number
  className?: string
  /** Paksa reload list. */
  reloadToken?: number
}

/** List tagihan accordion + offcanvas bayar bawah (dipakai Tagihan & Rekap). */
export default function TagihanListWithBayar({
  pelangganId,
  periodeBulan,
  periodeTahun,
  onChanged,
  onBayarOpenChange,
  bayarZIndex = 1200,
  className = '',
  reloadToken = 0,
}: TagihanListWithBayarProps) {
  const [tagihanList, setTagihanList] = useState<Tagihan[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [riwayatById, setRiwayatById] = useState<Record<number, Tagihan>>({})
  const [riwayatLoadingId, setRiwayatLoadingId] = useState<number | null>(null)
  const [bayarTarget, setBayarTarget] = useState<Tagihan | null>(null)
  const [editTarget, setEditTarget] = useState<Tagihan | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    onBayarOpenChange?.(Boolean(bayarTarget))
  }, [bayarTarget, onBayarOpenChange])

  const openBayar = (t: Tagihan) => setBayarTarget(t)
  const closeBayar = () => setBayarTarget(null)
  const openEdit = (t: Tagihan) => setEditTarget(t)
  const closeEdit = () => setEditTarget(null)

  const loadTagihan = useCallback(async (pid: number) => {
    setLoading(true)
    const res = await listTagihan({
      pelanggan_id: pid,
      periode_bulan: periodeBulan,
      periode_tahun: periodeTahun,
    })
    if (res.success && res.data) {
      setTagihanList(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat tagihan')
    }
    setLoading(false)
  }, [periodeBulan, periodeTahun])

  useEffect(() => {
    if (!pelangganId) {
      setTagihanList([])
      setExpandedId(null)
      setRiwayatById({})
      return
    }
    setExpandedId(null)
    setRiwayatById({})
    void loadTagihan(pelangganId)
  }, [pelangganId, loadTagihan, reloadToken])

  const loadRiwayat = async (id: number) => {
    setRiwayatLoadingId(id)
    const res = await getTagihan(id)
    setRiwayatLoadingId(null)
    if (res.success && res.data) {
      setRiwayatById((prev) => ({ ...prev, [id]: res.data! }))
      setError('')
      return res.data
    }
    setError(res.message || 'Gagal memuat riwayat')
    return null
  }

  const toggleAccordion = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!riwayatById[id]) {
      await loadRiwayat(id)
    }
  }

  const handleDeleteTagihan = async (t: Tagihan) => {
    if (!window.confirm(`Hapus tagihan ${labelPeriode(t.periode_bulan, t.periode_tahun)}?`)) return
    const res = await deleteTagihan(t.id)
    if (res.success) {
      if (expandedId === t.id) setExpandedId(null)
      setRiwayatById((prev) => {
        const next = { ...prev }
        delete next[t.id]
        return next
      })
      if (pelangganId) await loadTagihan(pelangganId)
      onChanged?.()
    } else {
      setError(res.message || 'Gagal menghapus')
    }
  }

  const handleDeleteBayar = async (tagihanId: number, bayarId: number) => {
    if (!window.confirm('Hapus pembayaran ini?')) return
    const res = await deleteTagihanBayar(bayarId)
    if (res.success && res.data) {
      setRiwayatById((prev) => ({ ...prev, [tagihanId]: res.data! }))
      if (pelangganId) await loadTagihan(pelangganId)
      onChanged?.()
    } else {
      setError(res.message || 'Gagal menghapus pembayaran')
    }
  }

  const onBayarSaved = async (updated: Tagihan) => {
    setRiwayatById((prev) => ({ ...prev, [updated.id]: updated }))
    setExpandedId(updated.id)
    if (pelangganId) await loadTagihan(pelangganId)
    onChanged?.()
  }

  const onEditSaved = async (updated: Tagihan) => {
    setRiwayatById((prev) => ({ ...prev, [updated.id]: updated }))
    if (pelangganId) await loadTagihan(pelangganId)
    onChanged?.()
  }

  return (
    <div className={['flex flex-col min-h-0', className].join(' ')}>
      {error && <div className="ui-alert-error text-[12px] mb-2 shrink-0">{error}</div>}

      <div className="flex-1 overflow-auto space-y-1.5 min-h-0">
        {!pelangganId ? (
          <p className="text-[13px] text-muted">Belum ada pelanggan dipilih.</p>
        ) : loading ? (
          <div className="text-[13px] text-muted">Memuat…</div>
        ) : tagihanList.length === 0 ? (
          <div className="text-[13px] text-muted">Belum ada tagihan.</div>
        ) : (
          <ul className="space-y-1.5">
            {tagihanList.map((t) => {
              const open = expandedId === t.id
              const detail = riwayatById[t.id]
              const jumlahBayar = detail?.pembayaran?.length ?? t.jumlah_bayar ?? 0
              const loadingRiwayat = riwayatLoadingId === t.id

              return (
                <li
                  key={t.id}
                  className={[
                    'rounded-lg border transition overflow-hidden',
                    open
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]'
                      : 'border-line',
                  ].join(' ')}
                >
                  <div className="p-2.5">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void toggleAccordion(t.id)}
                      aria-expanded={open}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold text-ink truncate">
                              {labelPeriode(t.periode_bulan, t.periode_tahun)}
                            </span>
                            <span
                              className={[
                                'text-[10px] text-muted transition-transform',
                                open ? 'rotate-180' : '',
                              ].join(' ')}
                              aria-hidden
                            >
                              ▾
                            </span>
                          </div>
                          <div className="text-[11px] text-muted">
                            Jatuh tempo {formatDateId(t.jatuh_tempo)}
                            {jumlahBayar > 0 ? ` · ${jumlahBayar} bayar` : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13px] font-semibold text-ink">{formatRp(t.nominal)}</div>
                          <div
                            className={`text-[11px] font-semibold ${t.lunas ? 'text-emerald-600' : 'text-amber-600'}`}
                          >
                            {t.lunas ? 'Lunas' : `Sisa ${formatRp(t.sisa)}`}
                          </div>
                        </div>
                      </div>
                    </button>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted">
                        {open ? 'Sembunyikan riwayat' : 'Lihat riwayat'}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          className="ui-btn-ghost text-[11px] px-2 py-1 leading-none"
                          onClick={() => openEdit(t)}
                        >
                          Edit
                        </button>
                        {!t.lunas && (
                          <button
                            type="button"
                            className="ui-btn-primary text-[11px] px-2 py-1 leading-none"
                            onClick={() => openBayar(t)}
                          >
                            Bayar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-line px-2.5 py-2 space-y-1.5 bg-surface/60">
                      {loadingRiwayat && !detail ? (
                        <p className="text-[12px] text-muted py-1">Memuat riwayat…</p>
                      ) : detail?.pembayaran && detail.pembayaran.length > 0 ? (
                        <ul className="space-y-1">
                          {detail.pembayaran.map((b) => (
                            <li
                              key={b.id}
                              className="flex items-start justify-between gap-2 rounded-md bg-surface-soft px-2 py-1.5 text-[12px]"
                            >
                              <div className="min-w-0">
                                <div className="text-ink font-semibold tabular-nums">
                                  {formatRp(b.nominal)}
                                </div>
                                <div className="text-muted text-[11px]">
                                  {formatDateId(b.tanggal)} · {b.via}
                                  {b.created_by_name ? ` · ${b.created_by_name}` : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="text-[var(--danger)] shrink-0"
                                onClick={() => void handleDeleteBayar(t.id, b.id)}
                                aria-label="Hapus pembayaran"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12px] text-muted py-1">Belum ada pembayaran.</p>
                      )}

                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          className="text-[11px] text-[var(--danger)]"
                          onClick={() => void handleDeleteTagihan(t)}
                        >
                          Hapus tagihan
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <OffcanvasBayarTagihan
        open={Boolean(bayarTarget)}
        onClose={closeBayar}
        tagihan={bayarTarget}
        onSaved={(updated) => void onBayarSaved(updated)}
        zIndex={bayarZIndex}
      />
      <OffcanvasEditTagihan
        open={Boolean(editTarget)}
        onClose={closeEdit}
        tagihan={editTarget}
        onSaved={(updated) => void onEditSaved(updated)}
        zIndex={bayarZIndex}
      />
    </div>
  )
}
