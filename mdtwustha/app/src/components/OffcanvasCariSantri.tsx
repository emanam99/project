import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { getSantri, type SantriRow } from '../api/apiClient'
import MaterialIcon from './MaterialIcon'
import { ContentSkeleton } from './LazyFallback'

export type OffcanvasCariSantriProps = {
  open: boolean
  onClose: () => void
  onSelect: (santri: SantriRow) => void
  /** Filter opsional ke kelas aktif */
  kelasIds?: string[]
  title?: string
  zIndex?: number
}

function formatKelas(s: SantriRow) {
  const nama = s.nama_kelas || s.kelas || ''
  const kel = s.kelas_kel || s.kel || ''
  if (!nama) return 'Belum ada kelas'
  return kel ? `${nama} · ${kel}` : nama
}

function getInitial(nama: string) {
  const parts = (nama || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return ((nama || '')[0] || '?').toUpperCase()
}

/**
 * Offcanvas kanan cari santri — bisa dipanggil dari halaman mana pun.
 */
export default function OffcanvasCariSantri({
  open,
  onClose,
  onSelect,
  kelasIds,
  title = 'Cari Santri',
  zIndex = 1100,
}: OffcanvasCariSantriProps) {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<SantriRow[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      const res = await getSantri()
      if (cancelled) return
      if (res.success) setList(res.data || [])
      else setError(res.message || 'Gagal memuat santri')
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = list
    if (kelasIds && kelasIds.length > 0) {
      const set = new Set(kelasIds.map(String))
      rows = rows.filter((s) => s.kelas_id && set.has(String(s.kelas_id)))
    }
    if (!q) return rows.slice(0, 80)
    return rows.filter((s) => {
      const hay = `${s.nomer_induk || ''} ${s.nama || ''} ${s.nik || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [list, query, kelasIds])

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
            <div className="ui-modal-header shrink-0">
              <div>
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
                <p className="text-xs ui-text-muted mt-0.5">Cari berdasarkan NIS atau nama</p>
              </div>
              <button type="button" className="ui-btn-close" onClick={onClose} aria-label="Tutup">
                <MaterialIcon name="close" size={20} />
              </button>
            </div>

            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <MaterialIcon
                  name="search"
                  size={20}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="NIS / nama santri..."
                  className="ui-search"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {loading ? (
                <ContentSkeleton rows={5} className="px-1 pt-4" />
              ) : error ? (
                <div className="ui-error-box mx-1 px-3 py-2 text-sm">{error}</div>
              ) : filtered.length === 0 ? (
                <p className="text-center ui-text-muted text-sm py-10">Tidak ada santri</p>
              ) : (
                <ul className="space-y-1.5 list-none m-0 p-0">
                  {filtered.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="ui-list-item w-full text-left"
                        onClick={() => {
                          onSelect(s)
                          onClose()
                        }}
                      >
                        <span className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 font-bold text-sm flex items-center justify-center">
                          {getInitial(s.nama || '')}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="ui-text-strong block truncate">{s.nama || '–'}</span>
                          <span className="text-xs ui-text-muted block truncate">
                            {s.nomer_induk ? `NIS ${s.nomer_induk}` : '–'} · {formatKelas(s)}
                          </span>
                        </span>
                        <MaterialIcon name="chevron_right" size={20} className="text-slate-400 shrink-0" />
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
