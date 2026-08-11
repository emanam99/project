import { formatWaktu } from '../BukuTamuFormat'
import { bukuTamuScanErrorTitle } from '../BukuTamuScanError'
import MahromFotoImg from './MahromFotoImg'

function BukuTamuScanErrorPanel({ scanError }) {
  if (!scanError?.message) return null
  const title = scanError.title || bukuTamuScanErrorTitle(scanError.code)

  return (
    <div
      className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-xl border border-red-200 dark:border-red-800/80 bg-red-50 dark:bg-red-950/30"
      role="alert"
    >
      <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center mb-4 ring-4 ring-red-100/80 dark:ring-red-900/30">
        <svg className="w-9 h-9 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <p className="text-base font-semibold text-red-800 dark:text-red-200">{title}</p>
      <p className="text-sm text-red-700/90 dark:text-red-300/90 mt-2 max-w-sm leading-relaxed">{scanError.message}</p>
    </div>
  )
}

export default function BukuTamuBiodataPanel({
  currentMahrom,
  currentEntry,
  biodata,
  santriOptions,
  selectedSantriIds,
  onToggleSantri,
  onViewSantriDetail,
  ktpLoading,
  ktpPreviewUrl,
  scanError = null,
  emptyMessage = 'Scan kartu mahrom untuk menampilkan biodata dan KTP.',
}) {
  if (scanError?.message) {
    return <BukuTamuScanErrorPanel scanError={scanError} />
  }

  if (!currentMahrom) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{emptyMessage}</p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-start">
        {currentMahrom.foto_path ? (
          <MahromFotoImg
            fotoPath={currentMahrom.foto_path}
            className="w-20 h-24 rounded-lg border border-gray-200 dark:border-gray-600 object-cover flex-shrink-0 bg-white"
          />
        ) : null}
        <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Mahrom</p>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{currentMahrom.nama}</h2>

        {santriOptions.length > 0 && (
          <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Santri yang didatangi
              {santriOptions.length > 1 && (
                <span className="font-normal normal-case text-gray-400 ml-1">(centang satu atau lebih)</span>
              )}
            </p>
            <ul className="space-y-2">
              {santriOptions.map((s) => {
                const sid = Number(s.santri_id)
                const checked = selectedSantriIds.has(sid)
                return (
                  <li key={sid}>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSantri?.(sid)}
                        className="mt-1 shrink-0"
                      />
                      <span className="text-sm min-w-0">
                        {onViewSantriDetail ? (
                          <button
                            type="button"
                            onClick={() => onViewSantriDetail(s)}
                            className="font-medium text-teal-700 dark:text-teal-400 hover:underline text-left"
                          >
                            {s.santri_nama}
                          </button>
                        ) : (
                          <span className="font-medium text-gray-900 dark:text-gray-100">{s.santri_nama}</span>
                        )}
                        {s.nis ? (
                          <span className="text-gray-500 dark:text-gray-400"> · NIS {s.nis}</span>
                        ) : null}
                        {s.hubungan ? (
                          <span className="text-xs text-teal-600 dark:text-teal-400 ml-1">({s.hubungan})</span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {currentEntry?.waktu_datang && (
          <p className="text-sm text-teal-600 dark:text-teal-400 mt-3">
            Tercatat: {formatWaktu(currentEntry.waktu_datang)}
          </p>
        )}
        </div>
      </div>

      {biodata.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
          {biodata.map((line) => (
            <div key={line.label}>
              <dt className="text-xs text-gray-500">{line.label}</dt>
              <dd className="text-gray-900 dark:text-gray-100 font-medium break-words">{line.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">KTP</p>
        {ktpLoading ? (
          <p className="text-sm text-gray-500">Memuat KTP…</p>
        ) : ktpPreviewUrl ? (
          <a href={ktpPreviewUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
            <img
              src={ktpPreviewUrl}
              alt="KTP mahrom"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm object-contain max-h-48 bg-white"
            />
          </a>
        ) : (
          <p className="text-sm text-gray-400 italic">Belum ada berkas KTP terunggah.</p>
        )}
      </div>
    </div>
  )
}
