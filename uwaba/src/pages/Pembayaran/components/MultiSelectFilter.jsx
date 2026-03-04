import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Filter dropdown dengan checkbox - bisa pilih 2 opsi atau lebih.
 * @param {string} filterKey - Id unik filter
 * @param {string} label - Label tombol (e.g. "Status")
 * @param {{ value: string, count: number }[]} options - Opsi dengan count
 * @param {string[]} selected - Nilai yang terpilih
 * @param {(selected: string[]) => void} onChange - Callback saat pilihan berubah
 * @param {boolean} isOpen - Apakah dropdown ini yang terbuka
 * @param {(key: string, rect: DOMRect) => void} onOpen - Callback saat tombol diklik (key, getBoundingClientRect)
 * @param {{ top: number, left: number, width: number }|null} dropdownPosition - Posisi dropdown (dari parent)
 * @param {React.RefObject} dropdownRef - Ref untuk dropdown (supaya parent bisa deteksi click outside)
 */
function MultiSelectFilter({
  filterKey,
  label,
  options = [],
  selected = [],
  onChange,
  isOpen,
  onOpen,
  dropdownPosition,
  dropdownRef
}) {
  const buttonRef = useRef(null)
  const masterCheckRef = useRef(null)

  useEffect(() => {
    if (!masterCheckRef.current) return
    masterCheckRef.current.indeterminate = selected.length > 0 && selected.length < options.length
  }, [selected.length, options.length])

  const displayText =
    selected.length === 0
      ? label
      : selected.length === 1
        ? options.find(o => o.value === selected[0])?.value ?? selected[0]
        : `${selected.length} dipilih`

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const rect = buttonRef.current ? buttonRef.current.getBoundingClientRect() : null
          onOpen(filterKey, rect)
        }}
        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 flex items-center justify-between gap-1 px-2"
        style={{ minWidth: '100px' }}
      >
        <span className="truncate">{displayText}</span>
        <svg
          className={`w-3 h-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="fixed z-[9999] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-lg max-h-60 overflow-y-auto"
              style={{
                top: `${(dropdownPosition?.top ?? 0)}px`,
                left: `${(dropdownPosition?.left ?? 0)}px`,
                width: `${(dropdownPosition?.width ?? 200)}px`
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="p-2">
                {/* Master check: centang semua / hapus semua */}
                {options.length > 0 && (
                  <>
                    <label
                      className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 pb-2 mb-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        ref={masterCheckRef}
                        type="checkbox"
                        checked={selected.length === options.length}
                        onChange={e => {
                          e.stopPropagation()
                          if (e.target.checked) {
                            onChange(options.map(o => o.value))
                          } else {
                            onChange([])
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="flex-1">
                        {selected.length === options.length ? 'Hapus semua centang' : 'Centang semua'}
                      </span>
                    </label>
                  </>
                )}
                <div className="space-y-1">
                {options.map(item => {
                  const isChecked = selected.includes(item.value)
                  return (
                    <label
                      key={item.value}
                      className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-600 rounded cursor-pointer text-xs"
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          e.stopPropagation()
                          if (e.target.checked) {
                            onChange([...selected, item.value])
                          } else {
                            onChange(selected.filter(v => v !== item.value))
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300 flex-1">
                        {item.value} ({item.count})
                      </span>
                    </label>
                  )
                })}
                </div>
                {selected.length > 0 && (
                  <div className="pt-1 mt-1 border-t border-gray-200 dark:border-gray-600">
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="w-full text-left px-1.5 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      Hapus semua
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}

export default MultiSelectFilter
