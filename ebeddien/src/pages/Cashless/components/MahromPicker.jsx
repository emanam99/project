/**
 * Pilih mahrom untuk kartu CM (dari relasi santri___mahrom).
 */
export default function MahromPicker({ options = [], value, onChange, disabled = false }) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
        Belum ada mahrom terhubung ke santri ini. Daftarkan di menu Wali Santri → Data Mahrom, lalu tautkan ke santri.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Pemegang kartu mahrom</p>
      <div className="grid grid-cols-1 gap-2">
        {options.map((opt) => {
          const id = opt.mahrom_id
          const selected = value === id
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(id)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/25 ring-2 ring-violet-300/60 dark:ring-violet-700/50'
                  : 'border-gray-200 dark:border-gray-600 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-gray-50 dark:hover:bg-gray-700/30'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                {opt.hubungan}{opt.is_utama ? ' · Utama' : ''}
              </span>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 truncate" title={opt.nama}>
                {opt.nama}
              </p>
              {opt.nim && (
                <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">NIM {opt.nim}</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
