import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import TagihanListWithBayar from './TagihanListWithBayar'
import OffcanvasTambahTagihan from './OffcanvasTambahTagihan'
import { useOverlayHistory } from '../hooks/useOverlayHistory'
import { formatRp } from '../utils/format'
import { labelPeriode } from '../utils/tagihanSettings'

export type OffcanvasDetailTagihanPelangganProps = {
  open: boolean
  onClose: () => void
  pelangganId: number | null
  pelangganNama: string
  periodeBulan?: number
  periodeTahun?: number
  /** Ringkasan dari rekap (opsional). */
  ringkas?: {
    jumlah_tagihan?: number
    nominal?: number
    total_bayar?: number
    sisa?: number
  }
  onChanged?: () => void
  zIndex?: number
}

const CREATE_Z_OFFSET = 50
const BAYAR_Z_OFFSET = 100

/** Offcanvas kanan: detail tagihan pelanggan (list + bayar, sama seperti page Tagihan). */
export default function OffcanvasDetailTagihanPelanggan({
  open,
  onClose,
  pelangganId,
  pelangganNama,
  periodeBulan,
  periodeTahun,
  ringkas,
  onChanged,
  zIndex = 1100,
}: OffcanvasDetailTagihanPelangganProps) {
  const [bayarOpen, setBayarOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [listReload, setListReload] = useState(0)

  useOverlayHistory(open, onClose, 'detail-tagihan')

  useEffect(() => {
    if (!open) {
      setBayarOpen(false)
      setCreateOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (bayarOpen || createOpen) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, bayarOpen, createOpen])

  const periodeHint =
    periodeBulan && periodeTahun ? labelPeriode(periodeBulan, periodeTahun) : null

  const panel = (
    <AnimatePresence>
      {open && pelangganId != null && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex }}
            aria-label="Tutup"
            onClick={() => {
              if (!bayarOpen && !createOpen) onClose()
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="ui-offcanvas"
            style={{ zIndex: zIndex + 1 }}
            role="dialog"
            aria-modal
            aria-label={`Tagihan ${pelangganNama}`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3 shrink-0">
              <div className="min-w-0">
                <h2 className="font-semibold text-ink text-[15px] truncate">{pelangganNama}</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  {periodeHint ? `Tagihan · ${periodeHint}` : 'Detail tagihan'}
                  {ringkas?.jumlah_tagihan != null ? ` · ${ringkas.jumlah_tagihan} item` : ''}
                </p>
                {ringkas && (
                  <p className="text-[11px] text-muted mt-1 tabular-nums">
                    {formatRp(ringkas.nominal ?? 0)} · bayar {formatRp(ringkas.total_bayar ?? 0)} · sisa{' '}
                    {formatRp(ringkas.sisa ?? 0)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  className="ui-btn-primary text-[11px] px-2 py-1.5 leading-none"
                  onClick={() => setCreateOpen(true)}
                >
                  + Tagihan
                </button>
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
            </div>

            <div className="flex-1 min-h-0 flex flex-col px-3 py-3">
              <TagihanListWithBayar
                pelangganId={pelangganId}
                periodeBulan={periodeBulan}
                periodeTahun={periodeTahun}
                reloadToken={listReload}
                onChanged={onChanged}
                onBayarOpenChange={setBayarOpen}
                bayarZIndex={zIndex + BAYAR_Z_OFFSET}
                className="flex-1"
              />
            </div>
          </motion.aside>

          <OffcanvasTambahTagihan
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            targets={[{ id: pelangganId, nama: pelangganNama }]}
            zIndex={zIndex + CREATE_Z_OFFSET}
            onCreated={() => {
              setListReload((n) => n + 1)
              onChanged?.()
            }}
          />
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
