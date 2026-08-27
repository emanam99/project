import { useEffect, useMemo, useState } from 'react'
import { fetchRekap, type RekapData, type RekapItem } from '../api/apiClient'
import OffcanvasDetailTagihanPelanggan from '../components/OffcanvasDetailTagihanPelanggan'
import OffcanvasTambahTagihan, { type TagihanTarget } from '../components/OffcanvasTambahTagihan'
import { usePageTitle } from '../contexts/PageTitleContext'
import { exportRekapXlsx } from '../utils/exportRekapXlsx'
import { formatRp } from '../utils/format'
import { labelPeriode } from '../utils/tagihanSettings'

const BULAN = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export default function RekapPage() {
  usePageTitle('Rekap')
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [status, setStatus] = useState<'all' | 'lunas' | 'belum'>('all')
  const [q, setQ] = useState('')
  const [data, setData] = useState<RekapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedPelanggan, setSelectedPelanggan] = useState<Record<number, string>>({})
  const [masalOpen, setMasalOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<RekapItem | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetchRekap({
      periode_bulan: bulan,
      periode_tahun: tahun,
      status: status === 'all' ? undefined : status,
      q: q.trim() || undefined,
    })
    if (res.success && res.data) {
      setData(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat rekap')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulan, tahun, status])

  const s = data?.summary
  const items = data?.items ?? []

  const targets: TagihanTarget[] = useMemo(
    () =>
      Object.entries(selectedPelanggan).map(([id, nama]) => ({
        id: Number(id),
        nama,
      })),
    [selectedPelanggan],
  )

  const selectedCount = targets.length

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedPelanggan({})
  }

  const togglePelanggan = (row: RekapItem) => {
    const pid = row.pelanggan_id
    const nama = row.nama_pelanggan || `#${pid}`
    setSelectedPelanggan((prev) => {
      if (prev[pid]) {
        const next = { ...prev }
        delete next[pid]
        return next
      }
      return { ...prev, [pid]: nama }
    })
  }

  const allPelangganIds = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of items) {
      if (!map.has(row.pelanggan_id)) {
        map.set(row.pelanggan_id, row.nama_pelanggan || `#${row.pelanggan_id}`)
      }
    }
    return map
  }, [items])

  const allSelected =
    allPelangganIds.size > 0 && selectedCount === allPelangganIds.size && selectedCount > 0

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedPelanggan({})
      return
    }
    const next: Record<number, string> = {}
    allPelangganIds.forEach((nama, id) => {
      next[id] = nama
    })
    setSelectedPelanggan(next)
  }

  const periodeLabel = labelPeriode(bulan, tahun)

  const onExportXlsx = async () => {
    if (!data || !items.length) {
      setError('Tidak ada data untuk diekspor')
      return
    }
    setExporting(true)
    setError('')
    try {
      await exportRekapXlsx({ data, bulan, tahun, statusFilter: status })
      setOk(`Excel rekap ${periodeLabel} diunduh`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengekspor Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-3.5 pb-20">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="ui-label">Bulan</label>
          <select className="ui-input" value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
            {BULAN.slice(1).map((b, i) => (
              <option key={b} value={i + 1}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ui-label">Tahun</label>
          <input
            className="ui-input w-24"
            type="number"
            value={tahun}
            onChange={(e) => setTahun(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="ui-label">Status</label>
          <select
            className="ui-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'all' | 'lunas' | 'belum')}
          >
            <option value="all">Semua</option>
            <option value="belum">Belum lunas</option>
            <option value="lunas">Lunas</option>
          </select>
        </div>
        <div className="flex-1 min-w-[8rem]">
          <label className="ui-label">Cari</label>
          <input
            className="ui-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load()
            }}
            placeholder="Nama pelanggan"
          />
        </div>
        <button type="button" className="ui-btn-primary" onClick={() => void load()}>
          Terapkan
        </button>
        <button
          type="button"
          className="ui-btn-ghost text-[12px] gap-1.5"
          disabled={exporting || loading || !items.length}
          onClick={() => void onExportXlsx()}
          title="Unduh Excel (.xlsx) sesuai filter saat ini"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14" />
          </svg>
          {exporting ? 'Mengekspor…' : 'Ekspor Excel'}
        </button>
        <button
          type="button"
          className={selectMode ? 'ui-btn-ghost' : 'ui-btn-primary'}
          onClick={() => {
            if (selectMode) exitSelectMode()
            else setSelectMode(true)
          }}
        >
          {selectMode ? 'Batal pilih' : 'Pilih'}
        </button>
      </div>

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="ui-card p-3">
            <div className="text-[11px] text-muted">Kewajiban</div>
            <div className="text-[15px] font-semibold text-ink">{formatRp(s.total_kewajiban)}</div>
          </div>
          <div className="ui-card p-3">
            <div className="text-[11px] text-muted">Terbayar</div>
            <div className="text-[15px] font-semibold text-ink">{formatRp(s.total_terbayar)}</div>
          </div>
          <div className="ui-card p-3 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-muted">Sisa</div>
            <div className="text-[15px] font-semibold text-ink">{formatRp(s.total_sisa)}</div>
          </div>
          <div className="ui-card p-3 col-span-2 sm:col-span-3 text-[12px] text-muted">
            {s.jumlah_pelanggan ?? items.length} pelanggan · {s.jumlah_tagihan} tagihan · {s.jumlah_lunas}{' '}
            lunas · {s.jumlah_belum} belum
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted text-[13px]">Memuat…</div>
      ) : !items.length ? (
        <div className="ui-card p-4 text-[13px] text-muted">Tidak ada data untuk filter ini.</div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="w-full text-left text-[12px] min-w-[32rem]">
            <thead>
              <tr className="border-b border-line text-muted">
                {selectMode && (
                  <th className="px-2 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Pilih semua pelanggan"
                    />
                  </th>
                )}
                <th className="px-3 py-2 font-semibold">Pelanggan</th>
                <th className="px-3 py-2 font-semibold">Tagihan</th>
                <th className="px-3 py-2 font-semibold text-right">Nominal</th>
                <th className="px-3 py-2 font-semibold text-right">Bayar</th>
                <th className="px-3 py-2 font-semibold text-right">Sisa</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const checked = Boolean(selectedPelanggan[row.pelanggan_id])
                return (
                  <tr
                    key={row.pelanggan_id}
                    className={[
                      'border-b border-line/70 last:border-0 cursor-pointer transition',
                      selectMode && checked
                        ? 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]'
                        : 'hover:bg-surface-soft',
                      detailRow?.pelanggan_id === row.pelanggan_id
                        ? 'bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]'
                        : '',
                    ].join(' ')}
                    onClick={() => {
                      if (selectMode) togglePelanggan(row)
                      else setDetailRow(row)
                    }}
                  >
                    {selectMode && (
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePelanggan(row)}
                          aria-label={`Pilih ${row.nama_pelanggan}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-ink font-medium">{row.nama_pelanggan}</td>
                    <td className="px-3 py-2 text-muted">
                      {row.jumlah_tagihan}× · {periodeLabel}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRp(row.nominal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRp(row.total_bayar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatRp(row.sisa)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={[
                          'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                          row.lunas
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                        ].join(' ')}
                      >
                        {row.lunas ? 'Lunas' : 'Belum'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectMode && selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md safe-bottom shadow-lg">
          <div className="mx-auto max-w-5xl px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="text-[13px] text-ink font-medium">{selectedCount} pelanggan dipilih</div>
            <button type="button" className="ui-btn-primary text-[13px]" onClick={() => setMasalOpen(true)}>
              + Tagihan masal
            </button>
          </div>
        </div>
      )}

      <OffcanvasTambahTagihan
        open={masalOpen}
        onClose={() => setMasalOpen(false)}
        targets={targets}
        onCreated={(count) => {
          setOk(`${count} tagihan dibuat`)
          exitSelectMode()
          void load()
        }}
      />
      <OffcanvasDetailTagihanPelanggan
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        pelangganId={detailRow?.pelanggan_id ?? null}
        pelangganNama={detailRow?.nama_pelanggan ?? ''}
        periodeBulan={bulan}
        periodeTahun={tahun}
        ringkas={
          detailRow
            ? {
                jumlah_tagihan: detailRow.jumlah_tagihan,
                nominal: detailRow.nominal,
                total_bayar: detailRow.total_bayar,
                sisa: detailRow.sisa,
              }
            : undefined
        }
        onChanged={() => {
          setOk('Diperbarui')
          void load()
        }}
        zIndex={1100}
      />
    </div>
  )
}
