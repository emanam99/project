import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { listPelanggan, type Pelanggan } from '../api/apiClient'
import { useOverlayHistory } from '../hooks/useOverlayHistory'

export type OffcanvasCariPelangganProps = {
  open: boolean
  onClose: () => void
  onSelect: (pelanggan: Pelanggan) => void
  /** true = hanya aktif (default); false = semua */
  hanyaAktif?: boolean
  title?: string
  zIndex?: number
}

function getInitial(nama: string) {
  const parts = (nama || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return ((nama || '')[0] || '?').toUpperCase()
}

/** Offcanvas kanan cari pelanggan. */
export default function OffcanvasCariPelanggan({
  open,
  onClose,
  onSelect,
  hanyaAktif = true,
  title = 'Cari pelanggan',
  zIndex = 1100,
}: OffcanvasCariPelangganProps) {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<Pelanggan[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useOverlayHistory(open, onClose, 'cari-pelanggan')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      const res = await listPelanggan(hanyaAktif ? { aktif: '1' } : undefined)
      if (cancelled) return
      if (res.success && res.data) setList(res.data)
      else setError(res.message || 'Gagal memuat pelanggan')
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, hanyaAktif])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) => {
      const hay = `${p.nama || ''} ${p.no_hp || ''} ${p.alamat || ''} ${p.paket || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [list, query])

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
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3 shrink-0">
              <div>
                <h2 className="font-semibold text-ink text-[15px]">{title}</h2>
                <p className="text-[11px] text-muted mt-0.5">Cari nama, HP, atau paket</p>
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

            <div className="px-4 pt-3 pb-2 shrink-0">
              <input
                type="search"
                className="ui-input"
                placeholder="Nama / HP / paket…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 safe-bottom">
              {loading ? (
                <p className="text-center text-muted text-[13px] py-10">Memuat…</p>
              ) : error ? (
                <div className="ui-alert-error mx-1 text-[13px]">{error}</div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted text-[13px] py-10">Tidak ada pelanggan</p>
              ) : (
                <ul className="space-y-1.5 list-none m-0 p-0">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="ui-list-row w-full text-left !justify-start gap-2.5"
                        onClick={() => {
                          onSelect(p)
                          onClose()
                        }}
                      >
                        <span className="flex-shrink-0 w-9 h-9 rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)] font-bold text-[12px] flex items-center justify-center">
                          {getInitial(p.nama)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold text-ink truncate">{p.nama}</span>
                          <span className="block text-[11px] text-muted truncate">
                            {[p.no_hp, p.paket].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                        <svg
                          className="h-4 w-4 text-muted shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
