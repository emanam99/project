import { useState } from 'react'

export default function SearchInChatPanel({
  open,
  onClose,
  onSearch,
  results = [],
  loading,
  onPickResult,
  highlightId,
}) {
  const [q, setQ] = useState('')

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[105] bg-black/25 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="fixed left-2 right-2 top-[72px] z-[106] max-h-[min(70vh,520px)] rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800 md:left-auto md:right-4 md:w-full md:max-w-md">
        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
          <span className="text-gray-400" aria-hidden>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSearch?.(q.trim())
              }
            }}
            placeholder="Cari dalam percakapan…"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
          <button
            type="button"
            className="shrink-0 rounded-lg bg-teal-600 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-500"
            onClick={() => onSearch?.(q.trim())}
          >
            Cari
          </button>
          <button type="button" className="shrink-0 p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" onClick={onClose} aria-label="Tutup">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[min(50vh,360px)] overflow-y-auto p-2">
          {loading ? <p className="px-2 py-4 text-center text-xs text-gray-500">Mencari…</p> : null}
          {!loading && results.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-gray-500">Ketik kata kunci dan Enter.</p>
          ) : null}
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={String(r.id)}>
                <button
                  type="button"
                  onClick={() => onPickResult?.(r)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    highlightId != null && Number(highlightId) === Number(r.id) ? 'ring-2 ring-teal-500/80' : ''
                  }`}
                >
                  <span className="line-clamp-2 whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">{r.message}</span>
                  <span className="mt-1 block text-[10px] tabular-nums text-gray-500">
                    {r.created_at ? new Date(r.created_at).toLocaleString('id-ID') : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
