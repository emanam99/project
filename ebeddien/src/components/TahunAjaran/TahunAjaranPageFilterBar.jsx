import { formatTahunAjaranPairLabel } from '../../utils/tahunAjaranPair'

const selectClass =
  'border rounded-md px-2 py-1 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 focus:outline-none'

function FilterWrap({ className = '', children }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg ${className}`}
    >
      {children}
    </div>
  )
}

function FilterWrapBlock({ className = '', children }) {
  return (
    <div
      className={`px-3 py-2 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg ${className}`}
    >
      {children}
    </div>
  )
}

function TahunAjaranPageFilterBar({
  variant = 'dual',
  selectedHijriyah = '',
  selectedMasehi = '',
  onHijriyahChange,
  onMasehiChange,
  combinedValue = '',
  onCombinedChange,
  hijriyahOptions = [],
  masehiOptions = [],
  pairOptions = [],
  showHint = true,
  hideLabels = false,
  alignRight = false,
  inlineToolbar = false,
  className = ''
}) {
  if (variant === 'hijriyah') {
    return (
      <FilterWrap className={className}>
        <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Tahun Ajaran</label>
        <select
          value={selectedHijriyah}
          onChange={(e) => onHijriyahChange?.(e.target.value)}
          className={selectClass}
          aria-label="Tahun ajaran hijriyah"
        >
          <option value="">Pilih tahun hijriyah</option>
          {hijriyahOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </FilterWrap>
    )
  }

  if (variant === 'combined') {
    return (
      <FilterWrap className={className}>
        <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Tahun Ajaran</label>
        <select
          value={combinedValue}
          onChange={(e) => onCombinedChange?.(e.target.value)}
          className={`${selectClass} min-w-[10rem]`}
          aria-label="Tahun ajaran hijriyah dan masehi"
        >
          <option value="">Pilih tahun ajaran</option>
          {pairOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {formatTahunAjaranPairLabel(p.hijriyah, p.masehi)}
            </option>
          ))}
        </select>
      </FilterWrap>
    )
  }

  const hint =
    showHint && (!String(selectedHijriyah || '').trim() || !String(selectedMasehi || '').trim())

  const dualAlign = alignRight && !inlineToolbar ? 'justify-end w-full' : ''
  const inlineRowClass = inlineToolbar
    ? 'flex flex-nowrap items-center gap-1.5 shrink-0'
    : `flex flex-wrap items-center gap-2 ${dualAlign}`
  const inlineSelectClass = inlineToolbar ? `${selectClass} h-[34px] min-w-[5.5rem]` : selectClass
  const dualSelects = (
    <>
      {!hideLabels ? (
        <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Tahun Hijriyah</label>
      ) : null}
      <select
        value={selectedHijriyah}
        onChange={(e) => onHijriyahChange?.(e.target.value)}
        className={inlineSelectClass}
        aria-label="Tahun ajaran hijriyah"
      >
        <option value="">{hideLabels ? 'Hijriyah' : 'Pilih hijriyah'}</option>
        {hijriyahOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {!hideLabels ? (
        <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Tahun Masehi</label>
      ) : null}
      <select
        value={selectedMasehi}
        onChange={(e) => onMasehiChange?.(e.target.value)}
        className={inlineSelectClass}
        aria-label="Tahun ajaran masehi"
      >
        <option value="">{hideLabels ? 'Masehi' : 'Pilih masehi'}</option>
        {masehiOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </>
  )

  if (hideLabels) {
    return (
      <div className={`${inlineRowClass} ${className}`.trim()}>
        {dualSelects}
      </div>
    )
  }

  return (
    <FilterWrapBlock className={className}>
      <div className={`flex flex-wrap items-center gap-2 ${dualAlign}`}>{dualSelects}</div>
      {hint ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1.5">
          Pilih tahun hijriyah dan masehi agar data ditampilkan untuk pasangan tahun tersebut.
        </p>
      ) : null}
    </FilterWrapBlock>
  )
}

export default TahunAjaranPageFilterBar
