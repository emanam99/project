import { useEffect, useRef, useState } from 'react'
import { alumniAPI } from '../../services/alumniApi'

/**
 * Input teks + dropdown saran dari master alamat (Jember/Bondowoso).
 * onPick(item) dipanggil saat user memilih saran.
 */
export default function AlamatSuggestField({
  label,
  required,
  field,
  value,
  onChange,
  onPick,
  inputClassName,
}) {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const skipSuggestRef = useRef(false)

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false
      return
    }
    const q = String(value || '').trim()
    if (q.length < 1) {
      setItems([])
      setOpen(false)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await alumniAPI.alamatSuggest(q, field)
        if (cancelled) return
        const list = res.success && res.data?.items ? res.data.items : []
        setItems(list)
        setOpen(list.length > 0)
      } catch {
        if (!cancelled) {
          setItems([])
          setOpen(false)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [value, field])

  const pick = (item) => {
    skipSuggestRef.current = true
    setOpen(false)
    setItems([])
    onPick?.(item)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        className={inputClassName}
        value={value}
        required={required}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (items.length > 0) setOpen(true)
        }}
      />
      {loading && (
        <p className="mt-1 text-[11px] text-gray-400">Mencari…</p>
      )}
      {open && items.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-1">
          {items.map((item) => (
            <li key={item.id + item.label}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-teal-50 dark:hover:bg-teal-900/30"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
              >
                {item.label}
                {item.kode_pos ? (
                  <span className="block text-[11px] text-gray-400 font-mono">{item.kode_pos}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
