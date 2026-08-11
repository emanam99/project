import { useEffect, useId, useMemo, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  /** Dipanggil saat user memilih saran (klik/enter) */
  onSelectSuggestion?: (value: string) => void
  options: string[]
  placeholder?: string
  className?: string
  required?: boolean
  disabled?: boolean
  id?: string
  maxSuggestions?: number
}

export default function SuggestInput({
  value,
  onChange,
  onSelectSuggestion,
  options,
  placeholder,
  className = 'ui-input',
  required,
  disabled,
  id,
  maxSuggestions = 8,
}: Props) {
  const autoId = useId()
  const listId = id || `suggest-${autoId}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const uniq: string[] = []
    const seen = new Set<string>()
    for (const raw of options) {
      const opt = raw.trim()
      if (!opt) continue
      const key = opt.toLowerCase()
      if (seen.has(key)) continue
      if (q && !key.includes(q)) continue
      // Jangan tampilkan jika sudah sama persis dengan input
      if (q && key === q) continue
      seen.add(key)
      uniq.push(opt)
      if (uniq.length >= maxSuggestions) break
    }
    return uniq
  }, [options, value, maxSuggestions])

  useEffect(() => {
    setHi(0)
  }, [filtered])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (opt: string) => {
    onChange(opt)
    onSelectSuggestion?.(opt)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={listId}
        className={className}
        value={value}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHi((i) => Math.min(i + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && filtered[hi]) {
            e.preventDefault()
            pick(filtered[hi])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && filtered.length > 0 && (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg py-1"
        >
          {filtered.map((opt, i) => (
            <li key={opt}>
              <button
                type="button"
                role="option"
                aria-selected={i === hi}
                className={[
                  'w-full px-3 py-1.5 text-left text-[13px] truncate',
                  i === hi ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-ink font-semibold' : 'text-ink hover:bg-surface-soft',
                ].join(' ')}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
