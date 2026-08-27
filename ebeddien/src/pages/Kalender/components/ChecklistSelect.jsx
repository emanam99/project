import { useEffect, useRef, useState } from 'react'

/**
 * Select dengan checklist: bisa pilih lebih dari satu opsi.
 * @param {number[]|string[]} value
 * @param {{ value: number|string, label: string }[]} options
 */
export default function ChecklistSelect({
  value = [],
  onChange,
  options = [],
  emptyLabel = 'Pilih',
  formatSelected,
  id,
  disabled = false
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const selected = Array.isArray(value) ? value : []

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const display =
    selected.length === 0
      ? emptyLabel
      : formatSelected
        ? formatSelected(selected)
        : selected
            .map((v) => options.find((o) => o.value === v)?.label ?? String(v))
            .join(', ')

  const toggle = (val) => {
    const has = selected.includes(val)
    onChange(has ? selected.filter((d) => d !== val) : [...selected, val])
  }

  const allSelected = options.length > 0 && selected.length === options.length
  const toggleAll = () => {
    onChange(allSelected ? [] : options.map((o) => o.value))
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left text-sm flex items-center justify-between gap-2 disabled:opacity-50"
      >
        <span className={`truncate ${selected.length === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
          {display}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg max-h-64 overflow-y-auto"
        >
          {options.length > 0 && (
            <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = selected.length > 0 && !allSelected
                }}
                onChange={toggleAll}
                className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
              />
              {allSelected ? 'Hapus semua' : 'Centang semua'}
            </label>
          )}
          {options.map((o) => {
            const checked = selected.includes(o.value)
            return (
              <label
                key={String(o.value)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                />
                {o.label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
