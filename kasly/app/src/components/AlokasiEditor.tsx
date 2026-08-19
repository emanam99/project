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

type Props = {
  rekening: RekeningRow[]
  rows: AlokasiDraft[]
  total: number
  jenis: 'masuk' | 'keluar'
  onChange: (rows: AlokasiDraft[]) => void
}

export default function AlokasiEditor({ rekening, rows, total, jenis, onChange }: Props) {
  const cash = rekening.find((r) => r.tipe === 'cash')
  const sum = rows.reduce((s, r) => s + num(r.jumlah), 0)
  const sisa = Math.round((total - sum) * 100) / 100
  const title = jenis === 'masuk' ? 'Masuk ke rekening' : 'Keluar dari rekening'

  useEffect(() => {
    if (rows.length > 0 || rekening.length === 0) return
    const id = String(cash?.id || rekening[0]?.id || '')
    onChange([{ ...emptyAlokasi(id), jumlah: total > 0 ? String(total) : '' }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rekening, rows.length])

  useEffect(() => {
    if (rows.length !== 1) return
    if (rows[0].jumlah.trim() === '' && total > 0) {
      onChange([{ ...rows[0], jumlah: String(total) }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  const update = (key: string, patch: Partial<AlokasiDraft>) => {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    const used = new Set(rows.map((r) => r.rekening_id))
    const next = rekening.find((r) => !used.has(String(r.id)))
    onChange([...rows, emptyAlokasi(next ? String(next.id) : '')])
  }

  const isiSisa = (key: string) => {
    const other = rows.filter((r) => r.key !== key).reduce((s, r) => s + num(r.jumlah), 0)
    const fill = Math.max(0, Math.round((total - other) * 100) / 100)
    update(key, { jumlah: fill ? String(fill) : '' })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink text-[13px]">{title}</h2>
        <span className={`text-[11px] tabular-nums ${sisa === 0 ? 'text-muted' : 'text-[var(--danger)]'}`}>
          Alokasi {formatRp(sum)}
          {total > 0 ? ` / ${formatRp(total)}` : ''}
        </span>
      </div>

      {rows.map((row, idx) => (
        <div key={row.key} className="grid grid-cols-[1fr_7.5rem_auto] gap-1.5 items-center">
          <select
            className="ui-input"
            value={row.rekening_id}
            onChange={(e) => update(row.key, { rekening_id: e.target.value })}
            required
          >
            <option value="">Pilih rekening</option>
            {rekening.map((r) => (
              <option key={r.id} value={r.id}>
                {tipeLabel(r.tipe)} · {rekeningOptionLabel(r)}
              </option>
            ))}
          </select>
          <input
            className="ui-input tabular-nums"
            type="number"
            min="0"
            step="any"
            placeholder="Jumlah"
            value={row.jumlah}
            onChange={(e) => update(row.key, { jumlah: e.target.value })}
            onFocus={() => {
              if (!row.jumlah && sisa > 0) isiSisa(row.key)
            }}
          />
          {rows.length > 1 ? (
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--danger)] hover:underline px-1"
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            >
              Hapus
            </button>
          ) : (
            <span className="text-[10px] text-faint text-center">{idx === 0 ? 'wajib' : ''}</span>
          )}
        </div>
      ))}

      <button type="button" className="ui-btn-ghost w-full text-[12px]" onClick={addRow}>
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
