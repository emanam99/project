import { useEffect } from 'react'
import type { RekeningRow, RekeningTipe } from '../api/apiClient'
import { formatRp } from '../utils/format'

export type AlokasiDraft = {
  key: string
  rekening_id: string
  jumlah: string
}

export function emptyAlokasi(rekeningId = ''): AlokasiDraft {
  return { key: `${Date.now()}-${Math.random()}`, rekening_id: rekeningId, jumlah: '' }
}

export function tipeLabel(tipe: RekeningTipe | string): string {
  if (tipe === 'ewallet') return 'E-wallet'
  if (tipe === 'cash') return 'Cash'
  return 'Bank'
}

export function rekeningOptionLabel(row: RekeningRow): string {
  const nomor = row.nomor ? ` · ${row.nomor}` : ''
  return `${row.nama}${nomor}`
}

function num(v: string): number {
  return Math.round((Number(v) || 0) * 100) / 100
}

/** 1 baris = total. 2+ baris: baris terakhir = total − jumlah baris sebelumnya. */
export function applyAutoAlokasi(rows: AlokasiDraft[], total: number): AlokasiDraft[] {
  if (rows.length === 0) return rows
  const rounded = num(String(total))
  if (rows.length === 1) {
    const next = String(rounded)
    if (rows[0].jumlah === next) return rows
    return [{ ...rows[0], jumlah: next }]
  }
  const prefix = rows.slice(0, -1).reduce((sum, row) => sum + num(row.jumlah), 0)
  const last = Math.max(0, num(String(rounded - prefix)))
  const lastStr = String(last)
  if (rows[rows.length - 1].jumlah === lastStr) return rows
  return rows.map((row, i) => (i === rows.length - 1 ? { ...row, jumlah: lastStr } : row))
}

type Props = {
  rekening: RekeningRow[]
  rows: AlokasiDraft[]
  total: number
  jenis: 'masuk' | 'keluar'
  onChange: (rows: AlokasiDraft[]) => void
}

export default function AlokasiEditor({ rekening, rows, total, jenis, onChange }: Props) {
  const cash = rekening.find((r) => r.tipe === 'cash')
  const displayRows = applyAutoAlokasi(rows, total)
  const sum = displayRows.reduce((s, r) => s + num(r.jumlah), 0)
  const sisa = num(String(total - sum))
  const title = jenis === 'masuk' ? 'Masuk ke rekening' : 'Keluar dari rekening'
  const used = new Set(displayRows.map((r) => r.rekening_id).filter(Boolean))
  const canAdd = rekening.some((r) => !used.has(String(r.id)))

  useEffect(() => {
    if (rows.length > 0 || rekening.length === 0) return
    const id = String(cash?.id || rekening[0]?.id || '')
    onChange(applyAutoAlokasi([emptyAlokasi(id)], total))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rekening, rows.length])

  useEffect(() => {
    const next = applyAutoAlokasi(rows, total)
    if (next !== rows) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, rows])

  const setRows = (next: AlokasiDraft[]) => onChange(applyAutoAlokasi(next, total))

  const update = (key: string, patch: Partial<AlokasiDraft>) => {
    setRows(displayRows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    const nextRek = rekening.find((r) => !used.has(String(r.id)))
    setRows([...displayRows, emptyAlokasi(nextRek ? String(nextRek.id) : '')])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink text-[13px]">{title}</h2>
          <p className="text-[11px] text-muted mt-0.5">
            Satu rekening terisi otomatis sesuai total. Pecah: isi pecahan awal, baris terakhir otomatis sisa.
          </p>
        </div>
        <span className={`text-[11px] tabular-nums shrink-0 ${sisa === 0 ? 'text-muted' : 'text-[var(--danger)]'}`}>
          Alokasi {formatRp(sum)}
          {total > 0 ? ` / ${formatRp(total)}` : ''}
        </span>
      </div>

      {displayRows.map((row, idx) => {
        const autoJumlah = displayRows.length === 1 || idx === displayRows.length - 1
        return (
          <div key={row.key} className="grid grid-cols-[1fr_7.5rem_auto] gap-1.5 items-center">
            <select
              className="ui-input"
              value={row.rekening_id}
              onChange={(e) => update(row.key, { rekening_id: e.target.value })}
              required
            >
              <option value="">Pilih rekening</option>
              {rekening.map((r) => (
                <option key={r.id} value={r.id} disabled={used.has(String(r.id)) && String(r.id) !== row.rekening_id}>
                  {tipeLabel(r.tipe)} · {rekeningOptionLabel(r)}
                </option>
              ))}
            </select>
            <input
              className={`ui-input tabular-nums ${autoJumlah ? 'bg-surface-soft text-muted' : ''}`}
              type="number"
              min="0"
              step="any"
              placeholder="Jumlah"
              readOnly={autoJumlah}
              value={row.jumlah}
              onChange={(e) => update(row.key, { jumlah: e.target.value })}
              aria-label={autoJumlah ? 'Jumlah otomatis' : 'Jumlah'}
            />
            {displayRows.length > 1 ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-[var(--danger)] hover:underline px-1"
                onClick={() => setRows(displayRows.filter((r) => r.key !== row.key))}
              >
                Hapus
              </button>
            ) : (
              <span className="text-[10px] text-faint text-center">{idx === 0 ? 'otomatis' : ''}</span>
            )}
          </div>
        )
      })}

      <button type="button" className="ui-btn-ghost w-full text-[12px]" onClick={addRow} disabled={!canAdd}>
        + Pecah ke rekening lain
      </button>
      {sisa !== 0 && total > 0 && (
        <p className="text-[11px] text-[var(--danger)]">
          Sisa yang belum dialokasi: {formatRp(sisa)}. Total pecahan harus sama dengan total catatan.
        </p>
      )}
    </div>
  )
}

export function alokasiPayload(rows: AlokasiDraft[]): Array<{ rekening_id: number; jumlah: number }> {
  return rows
    .map((r) => ({ rekening_id: Number(r.rekening_id) || 0, jumlah: num(r.jumlah) }))
    .filter((r) => r.rekening_id > 0 && r.jumlah > 0)
}
