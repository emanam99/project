/**
 * Toggle jam acara: WIB (default) atau Istiwa’.
 * @param {'wib'|'istiwa'} value
 */
export default function JamJenisToggle({ value, onChange }) {
  const istiwa = value === 'istiwa'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Jenis jam</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-medium ${istiwa ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
          WIB
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={istiwa}
          aria-label={istiwa ? 'Pakai jam Istiwa’' : 'Pakai jam WIB'}
          onClick={() => onChange(istiwa ? 'wib' : 'istiwa')}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            istiwa ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              istiwa ? 'translate-x-5' : ''
            }`}
          />
        </button>
        <span className={`text-xs font-medium ${istiwa ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
          Istiwa’
        </span>
      </div>
    </div>
  )
}
