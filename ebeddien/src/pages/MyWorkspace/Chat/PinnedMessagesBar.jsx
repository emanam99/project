/** Bar pin di atas thread: klik loncat ke pesan (callback). */
export default function PinnedMessagesBar({ pins = [], onJump, loading }) {
  if (!pins?.length && !loading) return null
  if (loading) {
    return (
      <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
        Memuat pesan disematkan…
      </div>
    )
  }
  return (
    <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/95 dark:border-amber-800 dark:bg-amber-950/60">
      <div className="flex items-center gap-2 overflow-x-auto px-2 py-2 chat-scrollbar">
        {pins.map((p) => (
          <button
            key={String(p.message_id)}
            type="button"
            onClick={() => onJump?.(p.message_id)}
            className="flex max-w-[220px] shrink-0 items-start gap-1.5 rounded-lg border border-amber-200/90 bg-white/90 px-2.5 py-1.5 text-left text-xs text-amber-950 shadow-sm hover:bg-amber-100/80 dark:border-amber-800 dark:bg-gray-800/90 dark:text-amber-50 dark:hover:bg-amber-900/40"
          >
            <span className="shrink-0 text-amber-600 dark:text-amber-300" aria-hidden>
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h-4V2h8v8h-2zM4 20h8v-8H4v8zm8-18v2h4v8h4v8H8V2z" />
              </svg>
            </span>
            <span className="line-clamp-2 break-words">{p.preview || `Pesan #${p.message_id}`}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
