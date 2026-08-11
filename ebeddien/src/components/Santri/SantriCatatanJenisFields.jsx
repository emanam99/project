/**
 * @typedef {'putih' | 'hitam'} JenisCatatan
 */

/** @param {unknown} v @returns {JenisCatatan} */
export function normalizeJenisCatatanRow(v) {
  const s = String(v || '').trim().toLowerCase()
  return s === 'hitam' ? 'hitam' : 'putih'
}

/**
 * Toggle jenis catatan Putih / Hitam (form tambah).
 * @param {{ value: JenisCatatan, onChange: (v: JenisCatatan) => void, disabled?: boolean, id?: string }} props
 */
export function SantriCatatanJenisToggle({ value, onChange, disabled, id = 'santri-catatan-jenis' }) {
  const baseBtn =
    'flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50'
  return (
    <div className="mb-2">
      <span id={`${id}-label`} className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
        Jenis catatan
      </span>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-100/90 p-0.5 dark:border-gray-600 dark:bg-gray-700/80"
      >
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === 'putih'}
          onClick={() => onChange('putih')}
          className={`${baseBtn} ${
            value === 'putih'
              ? 'bg-white text-amber-900 shadow-sm dark:bg-gray-800 dark:text-amber-100'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          Putih
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={value === 'hitam'}
          onClick={() => onChange('hitam')}
          className={`${baseBtn} ${
            value === 'hitam'
              ? 'bg-gray-900 text-white shadow-sm dark:bg-gray-950 dark:text-gray-100'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          Hitam
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
        Putih: catatan baik / positif. Hitam: catatan buruk atau perlu perhatian.
      </p>
    </div>
  )
}

/**
 * @param {{ value: '' | JenisCatatan, onChange: (v: '' | JenisCatatan) => void, id?: string }} props
 */
export function SantriCatatanJenisFilter({ value, onChange, id = 'santri-catatan-filter' }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium text-gray-600 dark:text-gray-400">
        Tampilkan
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === 'putih' || v === 'hitam' ? v : '')
        }}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      >
        <option value="">Semua</option>
        <option value="putih">Catatan baik (Putih)</option>
        <option value="hitam">Catatan buruk (Hitam)</option>
      </select>
    </div>
  )
}

/**
 * Badge kecil untuk satu baris riwayat.
 * @param {{ jenis: JenisCatatan }} props
 */
export function SantriCatatanJenisBadge({ jenis }) {
  const isHitam = jenis === 'hitam'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isHitam
          ? 'bg-gray-900 text-white dark:bg-gray-950'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
      }`}
    >
      {isHitam ? 'Hitam' : 'Putih'}
    </span>
  )
}
