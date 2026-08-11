import { useEffect, useMemo, useState } from 'react'

const MANUAL = '__manual__'

type Props = {
  categories: string[]
  value: string
  onChange: (value: string) => void
  onCategoriesChange?: (next: string[]) => void
  label?: string
  required?: boolean
}

export default function KategoriField({
  categories,
  value,
  onChange,
  onCategoriesChange,
  label = 'Kategori',
  required = false,
}: Props) {
  const inList = useMemo(
    () => categories.some((c) => c.toLowerCase() === value.trim().toLowerCase()),
    [categories, value],
  )
  const [mode, setMode] = useState<'select' | 'manual'>(() =>
    value && !inList ? 'manual' : 'select',
  )
  const [manual, setManual] = useState(value && !inList ? value : '')

  useEffect(() => {
    if (value && !categories.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setMode('manual')
      setManual(value)
    }
  }, [categories, value])

  const selectValue = mode === 'manual' ? MANUAL : value

  return (
    <div className="space-y-2">
      <label className="ui-label">{label}</label>
      <select
        className="ui-input"
        value={selectValue}
        required={required && mode === 'select'}
        onChange={(e) => {
          const v = e.target.value
          if (v === MANUAL) {
            setMode('manual')
            onChange(manual.trim())
            return
          }
          setMode('select')
          setManual('')
          onChange(v)
        }}
      >
        <option value="">— Pilih kategori —</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={MANUAL}>+ Isi manual…</option>
      </select>

      {mode === 'manual' && (
        <input
          className="ui-input"
          value={manual}
          required={required}
          placeholder="Ketik kategori baru"
          onChange={(e) => {
            const next = e.target.value
            setManual(next)
            onChange(next)
          }}
          onBlur={() => {
            const nama = manual.trim()
            if (!nama) return
            if (!categories.some((c) => c.toLowerCase() === nama.toLowerCase())) {
              onCategoriesChange?.([...categories, nama].sort((a, b) => a.localeCompare(b, 'id')))
            }
            onChange(nama)
          }}
        />
      )}
    </div>
  )
}
