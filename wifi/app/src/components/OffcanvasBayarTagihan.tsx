import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { createTagihanBayar, type Tagihan } from '../api/apiClient'
import { useOverlayHistory } from '../hooks/useOverlayHistory'
import { getStoredUser } from '../utils/auth'
import { formatRp, todayYmd } from '../utils/format'
import { labelPeriode } from '../utils/tagihanSettings'

export type OffcanvasBayarTagihanProps = {
  open: boolean
  onClose: () => void
  tagihan: Tagihan | null
  onSaved: (updated: Tagihan) => void
  zIndex?: number
}

/** Offcanvas bawah: catat pembayaran (tanpa ket; pencatat dari sesi). */
export default function OffcanvasBayarTagihan({
  open,
  onClose,
  tagihan,
  onSaved,
  zIndex = 1100,
}: OffcanvasBayarTagihanProps) {
  const user = getStoredUser()
  const pencatat = user?.name?.trim() || user?.email || '—'
  const [nominal, setNominal] = useState('')
  const [via, setVia] = useState<'cash' | 'tf'>('cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useOverlayHistory(open, onClose, 'bayar')

  useEffect(() => {
    if (!open || !tagihan) return
    setNominal(String(Math.round(tagihan.sisa)))
    setVia('cash')
    setError('')
  }, [open, tagihan])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tagihan) return
    setSaving(true)
    setError('')
    const res = await createTagihanBayar({
      tagihan_id: tagihan.id,
      nominal: Number(nominal),
      tanggal: todayYmd(),
      via,
    })
    setSaving(false)
    if (res.success && res.data) {
      onSaved(res.data)
      onClose()
    } else {
      setError(res.message || 'Gagal mencatat pembayaran')
    }
  }

  const panel = (
    <AnimatePresence>
      {open && tagihan && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            style={{ zIndex }}
            aria-label="Tutup"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 safe-bottom rounded-t-2xl border border-line bg-surface shadow-xl"
            style={{ zIndex: zIndex + 1 }}
            role="dialog"
            aria-modal
            aria-label="Catat pembayaran"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2 border-b border-line">
              <div className="min-w-0">
                <h2 className="font-semibold text-ink text-[15px]">Bayar</h2>
                <p className="text-[12px] text-muted truncate mt-0.5">
                  {labelPeriode(tagihan.periode_bulan, tagihan.periode_tahun)} · sisa{' '}
                  {formatRp(tagihan.sisa)}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-soft hover:text-ink"
                onClick={onClose}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3">
              <p className="text-[11px] text-muted">
                Tanggal {todayYmd()} · Dicatat oleh {pencatat}
              </p>

              {error && <div className="ui-alert-error text-[12px]">{error}</div>}

              <div>
                <label className="ui-label">Nominal</label>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  max={Math.max(1, Math.round(tagihan.sisa))}
                  required
                  autoFocus
                  value={nominal}
                  onChange={(e) => setNominal(e.target.value)}
                />
              </div>

              <div>
                <label className="ui-label">Via</label>
                <div className="flex gap-2">
                  {(['cash', 'tf'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVia(v)}
                      className={[
                        'flex-1 py-2 rounded-lg text-[13px] font-semibold border transition',
                        via === v
                          ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-ink'
                          : 'border-line text-muted hover:bg-surface-soft',
                      ].join(' ')}
                    >
                      {v === 'cash' ? 'Cash' : 'Transfer'}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="ui-btn-primary w-full" disabled={saving}>
                {saving ? 'Menyimpan…' : 'Simpan pembayaran'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
