import { useEffect, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import MaterialIcon from './MaterialIcon'
import type { FanCol } from '../utils/nilaiFanColumns'

export type OffcanvasUrutanFanProps = {
  open: boolean
  onClose: () => void
  fans: FanCol[]
  onApply: (orderedKeys: string[]) => void
}

export default function OffcanvasUrutanFan({ open, onClose, fans, onApply }: OffcanvasUrutanFanProps) {
  const [items, setItems] = useState<FanCol[]>([])
  const [noDraft, setNoDraft] = useState<Record<string, string>>({})
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setItems(fans.map((f) => ({ ...f, mapelIds: [...f.mapelIds] })))
    const draft: Record<string, string> = {}
    fans.forEach((f, i) => {
      draft[f.key] = String(i + 1)
    })
    setNoDraft(draft)
    setDragIndex(null)
    setDragOverIndex(null)
  }, [open, fans])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const moveItem = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return
    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      const draft: Record<string, string> = {}
      next.forEach((f, i) => {
        draft[f.key] = String(i + 1)
      })
      setNoDraft(draft)
      return next
    })
  }

  const applyNoChange = (key: string) => {
    const raw = noDraft[key]
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) {
      const idx = items.findIndex((f) => f.key === key)
      setNoDraft((d) => ({ ...d, [key]: String(idx + 1) }))
      return
    }
    const from = items.findIndex((f) => f.key === key)
    if (from < 0) return
    const to = Math.min(Math.max(n, 1), items.length) - 1
    moveItem(from, to)
  }

  const onDragStart = (index: number) => (e: DragEvent) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const onDragOver = (index: number) => (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) setDragOverIndex(index)
  }

  const onDrop = (index: number) => (e: DragEvent) => {
    e.preventDefault()
    const from = dragIndex ?? Number.parseInt(e.dataTransfer.getData('text/plain'), 10)
    setDragIndex(null)
    setDragOverIndex(null)
    if (Number.isFinite(from)) moveItem(from, index)
  }

  const onDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleApply = () => {
    onApply(items.map((f) => f.key))
    onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Tutup"
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal
            aria-label="Ubah urutan fan"
            className="fixed inset-y-0 right-0 z-[90] w-full max-w-md flex flex-col bg-white dark:bg-slate-900 border-l ui-divider shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
          >
            <header className="flex items-center justify-between gap-2 px-4 py-3 border-b ui-divider shrink-0">
              <div>
                <h2 className="text-sm font-semibold m-0 text-slate-800 dark:text-slate-100">Urutan fan</h2>
                <p className="text-[11px] ui-text-muted m-0 mt-0.5">
                  Seret ikon atau ubah nomor, lalu terapkan.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg ui-text-muted hover:bg-black/5 dark:hover:bg-white/5"
                aria-label="Tutup"
              >
                <MaterialIcon name="close" size={20} />
              </button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {items.length === 0 ? (
                <p className="text-sm ui-text-muted text-center py-8">Belum ada fan. Muat nilai dulu.</p>
              ) : (
                <ul className="m-0 p-0 list-none space-y-1">
                  {items.map((fan, index) => {
                    const isDragging = dragIndex === index
                    const isOver = dragOverIndex === index && dragIndex !== null && dragIndex !== index
                    return (
                      <li
                        key={fan.key}
                        onDragOver={onDragOver(index)}
                        onDrop={onDrop(index)}
                        onDragEnd={onDragEnd}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-2 transition ${
                          isDragging ? 'opacity-50' : ''
                        } ${isOver ? 'border-blue-500/50 bg-blue-500/10' : 'ui-divider'}`}
                      >
                        <button
                          type="button"
                          draggable
                          onDragStart={onDragStart(index)}
                          title="Seret untuk mengurutkan"
                          className="cursor-grab active:cursor-grabbing ui-text-muted hover:text-slate-700 dark:hover:text-slate-200 px-0.5"
                          aria-label={`Seret ${fan.label}`}
                        >
                          <MaterialIcon name="drag_indicator" size={18} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={items.length}
                          inputMode="numeric"
                          value={noDraft[fan.key] ?? String(index + 1)}
                          onChange={(e) => setNoDraft((d) => ({ ...d, [fan.key]: e.target.value }))}
                          onBlur={() => applyNoChange(fan.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          className="ui-input w-11 text-center tabular-nums text-xs !py-1 !px-1"
                          title="Ubah nomor untuk pindah urutan"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate text-slate-800 dark:text-slate-100">
                            {fan.label}
                          </div>
                          <div className="text-[10px] ui-text-muted">
                            {fan.mapelIds.length} mapel
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <footer className="shrink-0 border-t ui-divider p-3 flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm ui-btn-secondary">
                Batal
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={items.length === 0}
                className="px-3 py-2 text-sm ui-btn-primary disabled:opacity-50"
              >
                Terapkan urutan
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
