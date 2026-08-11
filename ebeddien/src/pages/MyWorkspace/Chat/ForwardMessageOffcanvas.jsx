import { createPortal } from 'react-dom'
import { NamaUsernameDisplay } from '../../../components/NamaUsernameDisplay'

const Z_BACKDROP = 10210
const Z_PANEL = 10211
const NAV_CLEARANCE = 'calc(4rem + env(safe-area-inset-bottom, 0px))'

/**
 * Pilih percakapan tujuan untuk meneruskan pesan.
 */
export default function ForwardMessageOffcanvas({
  open,
  closing,
  onClose,
  conversations,
  currentConversationId,
  onSelectConversation,
  forwardingPreview,
}) {
  if (!open && !closing) return null
  if (typeof document === 'undefined') return null

  const list = (conversations || []).filter((c) => {
    const id = Number(c.conversation_id ?? c.id)
    return id > 0 && id !== Number(currentConversationId)
  })

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: Z_BACKDROP }}>
      <div
        className={`fixed inset-0 backdrop-blur-[2px] transition-opacity duration-200 ${closing ? 'bg-black/0' : 'bg-black/30'}`}
        style={{ zIndex: Z_BACKDROP }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Teruskan ke"
        className={`fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700 overflow-hidden ${
          closing ? 'animate-[chatFwdSlideOut_0.22s_ease-in_forwards]' : 'animate-[chatFwdSlideIn_0.22s_ease-out]'
        }`}
        style={{ zIndex: Z_PANEL }}
      >
        <style>{`
          @keyframes chatFwdSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes chatFwdSlideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }
        `}</style>
        <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/80">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Teruskan ke</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            aria-label="Tutup"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {forwardingPreview ? (
          <div className="shrink-0 px-3 py-2 border-b border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-700/30">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{forwardingPreview}</p>
          </div>
        ) : null}
        <ul className="flex-1 overflow-y-auto min-h-0 chat-scrollbar" style={{ paddingBottom: NAV_CLEARANCE }}>
          {list.length === 0 ? (
            <li className="py-8 text-center text-xs text-gray-400">Tidak ada percakapan lain.</li>
          ) : (
            list.map((c) => {
              const cid = Number(c.conversation_id ?? c.id)
              const label = c.peer_name || c.name || c.title || `Percakapan ${cid}`
              return (
                <li key={cid}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/60 border-b border-gray-50 dark:border-gray-700/50"
                    onClick={() => onSelectConversation(cid)}
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      <NamaUsernameDisplay text={label} className="truncate" />
                    </p>
                    {c.last_message ? (
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">{String(c.last_message).slice(0, 80)}</p>
                    ) : null}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
