import { TINGKATAN_OPTIONS } from '../tingkatanConfig'

/**
 * Centang banyak tingkatan — nilai form: array slug (disimpan backend sebagai JSON).
 */
export default function TingkatanFields({ selected = [], onChange }) {
  const set = new Set(selected)

  return (
    <div className="flex flex-wrap gap-3">
      {TINGKATAN_OPTIONS.map(({ slug, label }) => (
        <label key={slug} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={set.has(slug)}
            onChange={(e) => {
              const next = new Set(set)
              if (e.target.checked) next.add(slug)
              else next.delete(slug)
              onChange(TINGKATAN_OPTIONS.map((o) => o.slug).filter((s) => next.has(s)))
            }}
            className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        </label>
      ))}
    </div>
  )
}
