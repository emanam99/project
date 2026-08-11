import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import {
  buildReviewColumnCatalog,
  loadPrintColumnSelection,
  persistPrintColumnSelection
} from './bisyarohReviewColumnCatalog'
import { printBisyarohReview } from './bisyarohReviewPrint'

export default function BisyarohReviewPrintOffcanvas({
  open,
  onClose,
  sections = [],
  meta = {},
  formatRp,
  getRekapCell,
  onNotify
}) {
  const catalog = useMemo(() => buildReviewColumnCatalog(sections), [sections])
  const allIds = useMemo(() => catalog.map((c) => c.id), [catalog])

  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    if (!open) return
    setSelected(loadPrintColumnSelection(allIds))
  }, [open, allIds])

  const closeOffcanvas = useOffcanvasBackClose(open, onClose)

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(allIds))
  const clearAll = () => setSelected(new Set())

  const handlePrint = () => {
    const ids = allIds.filter((id) => selected.has(id))
    if (ids.length === 0) {
      onNotify?.('Pilih minimal satu kolom', 'error')
      return
    }
    try {
      persistPrintColumnSelection(ids)
      printBisyarohReview({
        sections,
        selectedColumnIds: ids,
        catalog,
        meta,
        formatRp,
        getRekapCell
      })
      onNotify?.('Dialog cetak dibuka', 'success')
      closeOffcanvas()
    } catch (e) {
      onNotify?.(e?.message || 'Gagal mencetak', 'error')
    }
  }

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <Fragment key="bisyaroh-review-print">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeOffcanvas}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[201] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bisyaroh-review-print-title"
          >
            <motion.div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2
                    id="bisyaroh-review-print-title"
                    className="text-base font-semibold text-gray-900 dark:text-white tracking-tight"
                  >
                    Cetak Preview
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Pilih kolom yang ikut tercetak. Tombol kembali browser menutup panel ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeOffcanvas}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  ✕
                </button>
              </div>
            </motion.div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Pilih semua
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Kosongkan
                </button>
              </div>
              <div className="space-y-1 border border-gray-200 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-800/50 max-h-[min(60vh,420px)] overflow-y-auto">
                {catalog.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="rounded border-gray-300 dark:border-gray-600 text-teal-600"
                    />
                    <span className="text-gray-900 dark:text-gray-100 truncate">{c.label}</span>
                  </label>
                ))}
                {catalog.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">Belum ada kolom.</p>
                ) : null}
              </div>
            </div>

            <div className="flex-shrink-0 px-5 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={closeOffcanvas}
                  className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={catalog.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  Cetak
                </button>
              </div>
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>,
    document.body
  )
}
