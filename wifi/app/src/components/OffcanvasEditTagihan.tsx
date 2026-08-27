import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { updateTagihan, type Tagihan } from '../api/apiClient'
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

export type OffcanvasEditTagihanProps = {
  open: boolean
  onClose: () => void
  tagihan: Tagihan | null
  onSaved: (updated: Tagihan) => void
  zIndex?: number
}

/** Offcanvas kanan: edit tagihan (nominal tidak boleh < total bayar). */
export default function OffcanvasEditTagihan({
  open,
  onClose,
  tagihan,
  onSaved,
  zIndex = 1100,
}: OffcanvasEditTagihanProps) {
  const [nominal, setNominal] = useState('')
  const [bulan, setBulan] = useState(1)
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [keterangan, setKeterangan] = useState('')
  const [hariJatuh, setHariJatuh] = useState(getJatuhTempoHari())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useOverlayHistory(open, onClose, 'edit-tagihan')

  const minNominal = tagihan ? Math.max(0, Math.round(tagihan.total_bayar)) : 0

  useEffect(() => {
    if (!open || !tagihan) return
    setNominal(String(Math.round(tagihan.nominal)))
    setBulan(tagihan.periode_bulan)
    setTahun(tagihan.periode_tahun)
    setKeterangan(tagihan.keterangan || '')
    setError('')
    // Ambil hari dari jatuh_tempo yang tersimpan, fallback ke pengaturan
    const dayFromJt = Number(String(tagihan.jatuh_tempo || '').slice(8, 10))
    setHariJatuh(
      Number.isInteger(dayFromJt) && dayFromJt >= 1 && dayFromJt <= 31
        ? dayFromJt
        : getJatuhTempoHari(),
    )
  }, [open, tagihan])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const jatuhTempo = computeJatuhTempo(bulan, tahun, hariJatuh)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tagihan) return
    const nom = Number(nominal)
    if (!Number.isFinite(nom) || nom <= 0) {
      setError('Nominal harus lebih dari 0')
      return
    }
    if (nom + 0.00001 < minNominal) {
      setError(`Nominal tidak boleh kurang dari total bayar (${formatRp(minNominal)})`)
      return
    }
    setSaving(true)
    setError('')
    const res = await updateTagihan(tagihan.id, {
      nama: labelPeriode(bulan, tahun),
      nominal: nom,
      periode_bulan: bulan,
      periode_tahun: tahun,
      jatuh_tempo: jatuhTempo,
      keterangan: keterangan.trim(),
    })
    setSaving(false)
    if (res.success && res.data) {
      onSaved(res.data)
      onClose()
    } else {
      setError(res.message || 'Gagal menyimpan tagihan')
    }
  }

  const panel = (
    <AnimatePresence>
      {open && tagihan && (
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
            aria-label="Edit tagihan"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3 shrink-0">
              <div className="min-w-0">
                <h2 className="font-semibold text-ink text-[15px]">Edit tagihan</h2>
                <p className="text-[11px] text-muted mt-0.5 truncate">
                  {tagihan.nama_pelanggan || labelPeriode(tagihan.periode_bulan, tagihan.periode_tahun)}
                </p>
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

                <div className="rounded-lg border border-line bg-surface-soft/60 px-3 py-2 text-[12px] text-muted">
                  Sudah dibayar{' '}
                  <span className="font-semibold text-ink tabular-nums">{formatRp(tagihan.total_bayar)}</span>
                  {minNominal > 0 && (
                    <>
                      {' '}
                      · nominal minimal{' '}
                      <span className="font-semibold text-ink tabular-nums">{formatRp(minNominal)}</span>
                    </>
                  )}
                </div>

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
                    min={Math.max(1, minNominal)}
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

                <div>
                  <label className="ui-label">Hari jatuh tempo</label>
                  <input
                    className="ui-input"
                    type="number"
                    min={1}
                    max={31}
                    value={hariJatuh}
                    onChange={(e) => setHariJatuh(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                  />
                  <p className="text-[11px] text-muted mt-1">
                    Jatuh tempo →{' '}
                    <span className="font-semibold text-ink tabular-nums">{jatuhTempo}</span>
                  </p>
                </div>
              </div>

              <div className="shrink-0 border-t border-line px-4 py-3 safe-bottom">
                <button type="submit" className="ui-btn-primary w-full" disabled={saving}>
                  {saving ? 'Menyimpan…' : 'Simpan perubahan'}
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
