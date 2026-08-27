import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  createTagihan,
  deleteTagihanBerulang,
  listTagihanBerulang,
  type Pelanggan,
  type TagihanBerulang,
} from '../api/apiClient'
import { useOverlayHistory } from '../hooks/useOverlayHistory'
import { formatRp } from '../utils/format'
import { computeJatuhTempo, getJatuhTempoHari, labelPeriode } from '../utils/tagihanSettings'

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

export type TagihanTarget = Pick<Pelanggan, 'id' | 'nama'>

export type OffcanvasTambahTagihanProps = {
  open: boolean
  onClose: () => void
  /** Satu pelanggan (halaman Tagihan) atau banyak (masal). */
  targets: TagihanTarget[]
  onCreated: (count: number) => void
  zIndex?: number
}

/** Offcanvas kanan buat tagihan baru (satu atau masal). */
export default function OffcanvasTambahTagihan({
  open,
  onClose,
  targets,
  onCreated,
  zIndex = 1100,
}: OffcanvasTambahTagihanProps) {
  const now = new Date()
  const [nominal, setNominal] = useState('150000')
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [keterangan, setKeterangan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hariJatuh, setHariJatuh] = useState(getJatuhTempoHari())
  const [berulang, setBerulang] = useState(false)
  const [existingBerulang, setExistingBerulang] = useState<TagihanBerulang[]>([])
  const [stoppingId, setStoppingId] = useState<number | null>(null)

  useOverlayHistory(open, onClose, 'tambah-tagihan')

  const isMasal = targets.length > 1
  const subtitle =
    targets.length === 0
      ? 'Belum ada pelanggan'
      : targets.length === 1
        ? targets[0].nama
        : `${targets.length} pelanggan`

  useEffect(() => {
    if (!open) return
    const d = new Date()
    setBulan(d.getMonth() + 1)
    setTahun(d.getFullYear())
    setNominal('150000')
    setKeterangan('')
    setError('')
    setHariJatuh(getJatuhTempoHari())
    setBerulang(false)
    setExistingBerulang([])
  }, [open])

  useEffect(() => {
    if (!open || targets.length !== 1) {
      setExistingBerulang([])
      return
    }
    let cancelled = false
    void (async () => {
      const res = await listTagihanBerulang(targets[0].id)
      if (!cancelled && res.success && res.data) {
        setExistingBerulang(res.data)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, targets])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const jatuhTempo = computeJatuhTempo(bulan, tahun, hariJatuh)

  const stopBerulang = async (id: number) => {
    setStoppingId(id)
    setError('')
    const res = await deleteTagihanBerulang(id)
    setStoppingId(null)
    if (res.success) {
      setExistingBerulang((prev) => prev.filter((r) => r.id !== id))
    } else {
      setError(res.message || 'Gagal mematikan berulang')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (targets.length === 0) {
      setError('Pilih pelanggan dulu')
      return
    }
    setSaving(true)
    setError('')
    const ids = targets.map((t) => t.id)
    const res = await createTagihan({
      ...(ids.length === 1 ? { pelanggan_id: ids[0] } : { pelanggan_ids: ids }),
      nama: labelPeriode(bulan, tahun),
      nominal: Number(nominal),
      periode_bulan: bulan,
      periode_tahun: tahun,
      jatuh_tempo: jatuhTempo,
      keterangan: keterangan.trim() || undefined,
      berulang,
      jatuh_tempo_hari: hariJatuh,
    })
    setSaving(false)
    if (res.success) {
      const count = Array.isArray(res.data) ? res.data.length : 1
      onCreated(count)
      onClose()
    } else {
      setError(res.message || 'Gagal membuat tagihan')
    }
  }

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex }}
            aria-label="Tutup"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="ui-offcanvas"
            style={{ zIndex: zIndex + 1 }}
            role="dialog"
            aria-modal
            aria-label={isMasal ? 'Tambah tagihan masal' : 'Tambah tagihan'}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3 shrink-0">
              <div className="min-w-0">
                <h2 className="font-semibold text-ink text-[15px]">
                  {isMasal ? 'Tagihan masal' : 'Tambah tagihan'}
                </h2>
                <p className="text-[11px] text-muted mt-0.5 truncate">{subtitle}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-soft hover:text-ink"
                onClick={onClose}
                aria-label="Tutup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                {error && <div className="ui-alert-error text-[13px]">{error}</div>}

                {isMasal && (
                  <ul className="rounded-lg border border-line max-h-28 overflow-y-auto divide-y divide-line text-[12px]">
                    {targets.map((t) => (
                      <li key={t.id} className="px-2.5 py-1.5 text-ink truncate">
                        {t.nama}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="ui-label">Bulan</label>
                    <select
                      className="ui-input"
                      value={bulan}
                      onChange={(e) => setBulan(Number(e.target.value))}
                    >
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
                      className="ui-input"
                      type="number"
                      value={tahun}
                      onChange={(e) => setTahun(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div>
                  <label className="ui-label">Nominal</label>
                  <input
                    className="ui-input"
                    type="number"
                    min={1}
                    required
                    value={nominal}
                    onChange={(e) => setNominal(e.target.value)}
                  />
                </div>
                <div>
                  <label className="ui-label">Keterangan</label>
                  <input
                    className="ui-input"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                  />
                </div>

                <div className="rounded-xl border border-line bg-surface-soft/50 px-3 py-2.5">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={berulang}
                        onChange={(e) => setBerulang(e.target.checked)}
                      />
                      <span className="absolute inset-0 rounded-full bg-line transition peer-checked:bg-[var(--accent)]" />
                      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink">
                        Ulangi tiap bulan
                      </span>
                      <span className="block text-[11px] text-muted mt-0.5 leading-snug">
                        Cron otomatis membuat tagihan yang sama setiap tanggal 1 (nominal &amp; jatuh
                        tempo sama).
                      </span>
                    </span>
                  </label>
                </div>

                {existingBerulang.length > 0 && (
                  <div className="rounded-xl border border-line overflow-hidden">
                    <div className="px-3 py-2 text-[11px] font-semibold text-muted bg-surface-soft/80">
                      Berulang aktif untuk pelanggan ini
                    </div>
                    <ul className="divide-y divide-line">
                      {existingBerulang.map((row) => (
                        <li key={row.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 text-[12px]">
                            <div className="font-semibold text-ink tabular-nums">{formatRp(row.nominal)}</div>
                            <div className="text-[11px] text-muted">
                              JT tgl {row.jatuh_tempo_hari}
                              {row.last_run_periode ? ` · terakhir ${row.last_run_periode}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="ui-btn-ghost text-[11px] text-[var(--danger)] shrink-0"
                            disabled={stoppingId === row.id}
                            onClick={() => void stopBerulang(row.id)}
                          >
                            {stoppingId === row.id ? '…' : 'Matikan'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[11px] text-muted">
                  Jatuh tempo: tanggal {hariJatuh} →{' '}
                  <span className="font-semibold text-ink tabular-nums">{jatuhTempo}</span>
                  {' '}(atur di Pengaturan)
                </p>
              </div>

              <div className="shrink-0 border-t border-line px-4 py-3 safe-bottom">
                <button type="submit" className="ui-btn-primary w-full" disabled={saving || targets.length === 0}>
                  {saving
                    ? 'Menyimpan…'
                    : isMasal
                      ? `Buat ${targets.length} tagihan${berulang ? ' + berulang' : ''}`
                      : berulang
                        ? 'Buat tagihan + berulang'
                        : 'Buat tagihan'}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
