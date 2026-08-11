/** Toggle + daftar ringkas percakapan yang diarsipkan. */
export default function ArchivedChatList({
  showArchived,
  onToggleShowArchived,
  archivedConversations = [],
  onOpenConversation,
}) {
  const count = archivedConversations.length
  return (
    <div className="border-t border-gray-200/80 px-2 py-2 dark:border-gray-700/80">
      <button
        type="button"
        onClick={onToggleShowArchived}
        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700/60"
      >
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          Arsip
        </span>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] dark:bg-gray-600">{count}</span>
      </button>
      {showArchived && count > 0 ? (
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto chat-scrollbar">
          {archivedConversations.map((c) => (
            <li key={String(c.conversation_id)}>
              <button
                type="button"
                onClick={() => onOpenConversation?.(c)}
                className="w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                <span className="font-medium">{c.peer_name ?? c.name ?? `Chat ${c.conversation_id}`}</span>
                {c.draft_text ? <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">(draft)</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showArchived && count === 0 ? (
        <p className="px-2 pb-1 text-[11px] text-gray-500 dark:text-gray-400">Tidak ada chat diarsipkan.</p>
      ) : null}
    </div>
  )
}
