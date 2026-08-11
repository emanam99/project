import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { NamaUsernameDisplay } from '../../../components/NamaUsernameDisplay'

/** Di atas bottom nav (z-[100]) & panel chat header (z-[219]); selaras offcanvas portal lain di eBeddien. */
const Z_BACKDROP = 10210
const Z_PANEL = 10211

const SLIDE_CSS = `
  @keyframes chatNewSlideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes chatNewSlideOutRight { from { transform: translateX(0); } to { transform: translateX(100%); } }
`

const NAV_CLEARANCE = 'calc(4rem + env(safe-area-inset-bottom, 0px))'

/**
 * Offcanvas pilih kontak / buat grup — di-portal ke body agar z-index di atas bottom nav.
 */
export default function NewChatContactOffcanvas({
  open,
  closing,
  onClose,
  groupMode,
  onToggleGroupMode,
  newChatSearch,
  onNewChatSearchChange,
  chatUsersLoading,
  chatUsers,
  filteredUsers,
  onlineUsers,
  lastSeenByUserId,
  formatLastSeen,
  userPhotoMap,
  getInitial,
  handleAvatarError,
  selectedGroupUserIds,
  onSelectUser,
  groupNameSheetOpen,
  onToggleGroupNameSheet,
  groupNameInput,
  onGroupNameInputChange,
  groupImageFile,
  groupImagePreview,
  onGroupImageChange,
  creatingGroup,
  onSubmitCreateGroup,
}) {
  if (!open && !closing) return null
  if (typeof document === 'undefined') return null

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
        aria-label="Pilih kontak"
        className={`fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700 overflow-hidden ${
          closing ? 'animate-[chatNewSlideOutRight_0.22s_ease-in_forwards]' : 'animate-[chatNewSlideInRight_0.22s_ease-out]'
        }`}
        style={{ zIndex: Z_PANEL }}
      >
        <style>{SLIDE_CSS}</style>
        <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/80">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Pilih kontak</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            aria-label="Tutup"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="shrink-0 px-2.5 pt-1 pb-2 border-b border-gray-100 dark:border-gray-700/80">
          <button
            type="button"
            onClick={onToggleGroupMode}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-sm font-semibold text-white shadow-sm dark:shadow-black/20 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors ${
              groupMode
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600'
                : 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600'
            }`}
            aria-label="Buat grup"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            {groupMode ? 'Batal Buat Grup' : 'Buat Grup'}
          </button>
        </div>
        <div className="shrink-0 px-2.5 py-2 border-b border-gray-100 dark:border-gray-700/80">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={newChatSearch}
              onChange={(e) => onNewChatSearchChange(e.target.value)}
              placeholder="Cari kontak..."
              className="w-full rounded-xl border-0 bg-gray-100 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 pl-8 pr-3 py-1.5 text-xs placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:bg-white dark:focus:bg-gray-700 transition-colors"
              aria-label="Cari kontak"
            />
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 chat-scrollbar"
          style={{ paddingBottom: NAV_CLEARANCE }}
        >
          {chatUsersLoading ? (
            <div className="py-6 text-center text-gray-400 dark:text-gray-500 text-xs">Memuat...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-6 px-3 text-center text-gray-400 dark:text-gray-500 text-xs">
              {chatUsers.length === 0 ? 'Tidak ada user.' : 'Tidak ada hasil.'}
            </div>
          ) : (
            <ul className="py-1">
              {filteredUsers.map((u) => {
                const isOnline = onlineUsers.some((o) => String(o.user_id) === String(u.id))
                const lastSeen = u.last_seen_at ?? lastSeenByUserId[String(u.id)]
                const lastSeenLabel = isOnline ? 'Online' : (formatLastSeen(lastSeen) ? formatLastSeen(lastSeen) : '—')
                const selected = groupMode && selectedGroupUserIds.includes(Number(u.id))
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => onSelectUser(u.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg mx-1 hover:bg-gray-50 dark:hover:bg-gray-700/60 active:bg-gray-100 dark:active:bg-gray-700 transition-colors ${
                        selected ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                      }`}
                    >
                      <div className="relative w-8 h-8 shrink-0" style={{ perspective: 800 }}>
                        <motion.div
                          className="relative w-full h-full"
                          style={{ transformStyle: 'preserve-3d' }}
                          animate={{ rotateY: selected ? 180 : 0 }}
                          transition={{ duration: 0.28, ease: 'easeInOut' }}
                        >
                          <div
                            className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-xs font-medium shadow-sm overflow-hidden"
                            style={{ backfaceVisibility: 'hidden' }}
                          >
                            {userPhotoMap[String(u.id)] ? (
                              <img
                                src={userPhotoMap[String(u.id)]}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={() => handleAvatarError(u.id)}
                              />
                            ) : (
                              getInitial(u.display_name || u.nama || u.username || '?')
                            )}
                          </div>
                          <div
                            className="absolute inset-0 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-sm"
                            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </motion.div>
                        {isOnline && !selected && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-gray-800" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
                          <NamaUsernameDisplay
                            text={u.display_name || (u.nama && u.username ? `${u.nama} @${u.username}` : null) || u.nama || u.username || `User ${u.id}`}
                            className="truncate"
                          />
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
                          {isOnline ? (
                            <span className="text-teal-600 dark:text-teal-400 inline-flex items-center gap-1">
                              <span className="inline-block w-1 h-1 rounded-full bg-teal-400" aria-hidden />
                              Online
                            </span>
                          ) : (
                            lastSeenLabel
                          )}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {groupMode && (
          <div
            className="shrink-0 border-t border-gray-100 dark:border-gray-700/80 px-2.5 py-2"
            style={{ paddingBottom: NAV_CLEARANCE }}
          >
            <AnimatePresence initial={false}>
              {groupNameSheetOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: 8 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: 8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="overflow-hidden mb-2"
                >
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-700/40 p-2.5 space-y-2">
                    <input
                      type="text"
                      value={groupNameInput}
                      onChange={(e) => onGroupNameInputChange(e.target.value)}
                      placeholder="Masukkan nama grup..."
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <label className="w-full inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16l5-5a2 2 0 012.828 0l5.172 5M14 14l1-1a2 2 0 012.828 0L21 16m-9-9h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </span>
                      <span>{groupImageFile ? groupImageFile.name : 'Tambah gambar grup'}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={onGroupImageChange} />
                    </label>
                    {groupImagePreview && (
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                        <img src={groupImagePreview} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={onSubmitCreateGroup}
                      disabled={creatingGroup || !groupNameInput.trim() || selectedGroupUserIds.length === 0}
                      className="w-full rounded-lg py-2 px-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {creatingGroup ? 'Membuat...' : 'Buat Grup'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={onToggleGroupNameSheet}
              disabled={selectedGroupUserIds.length === 0}
              className="w-full rounded-xl py-2.5 px-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {groupNameSheetOpen ? 'Tutup Form Grup' : `OK (${selectedGroupUserIds.length})`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
