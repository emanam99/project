import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

const listBtnClass =
  'w-full text-left px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors'

/**
 * Offcanvas bawah: pilih koordinator tujuan (pola OffcanvasPindahRombel).
 */
export default function OffcanvasPindahKoordinator({
  isOpen,
  onClose,
  title = 'Pindah ke Koordinator',
  excludeKoordinatorId = null,
  koordinatorList = [],
  onSelect,
  allowUnassign = false,
}) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!isOpen) setSearch('')
  }, [isOpen])

  const filtered = useMemo(() => {
    const ex = excludeKoordinatorId != null && excludeKoordinatorId !== '' ? String(excludeKoordinatorId) : null
    let rows = (koordinatorList || []).filter((k) => {
      if (ex && String(k.id) === ex) return false
      return true
    })
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((k) => {
        const nama = String(k.nama || '').toLowerCase()
        const nip = String(k.nip ?? k.id ?? '').toLowerCase()
        return nama.includes(q) || nip.includes(q)
      })
    }
    return rows.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'))
  }, [koordinatorList, excludeKoordinatorId, search])

  const handlePick = (target) => {
    const id = target?.id
    const label = target?.nama || `ID ${id}`
    if (window.confirm(`Pindah madrasah ke koordinator ${label}?`)) {
      onSelect?.(id)
      onClose?.()
    }
  }

  const handleUnassign = () => {
    if (window.confirm('Lepas koordinator dari madrasah terpilih?')) {
      onSelect?.(null)
      onClose?.()
    }
  }

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="pindah-kord-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10258]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="pindah-kord-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-0 left-0 right-0 z-[10259] flex flex-col max-h-[85vh] w-full rounded-t-xl bg-white dark:bg-gray-800 shadow-xl border-t border-gray-200 dark:border-gray-700 sm:left-auto sm:right-0 sm:w-[28rem] sm:max-w-[100vw]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="offcanvas-pindah-kord-title"
          >
            <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
              <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
              <h2 id="offcanvas-pindah-kord-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-6">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau NIP…"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              {allowUnassign && (
                <button
                  type="button"
                  onClick={handleUnassign}
                  className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100"
                >
                  Lepas koordinator (kosongkan)
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Tidak ada koordinator lain.</p>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600">
                  {filtered.map((k) => (
                    <li key={k.id}>
                      <button type="button" onClick={() => handlePick(k)} className={listBtnClass}>
                        <span className="font-medium">{k.nama || '–'}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 font-mono">
                          NIP {k.nip ?? k.id}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
