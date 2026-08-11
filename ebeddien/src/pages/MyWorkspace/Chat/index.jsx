import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveSocket } from '../../../contexts/LiveSocketContext'
import { useAuthStore } from '../../../store/authStore'
import { getIcon } from '../../../config/menuIcons'
import { chatUserAPI, getApiBaseUrl } from '../../../services/api'
import { chatDexieStore, CHAT_CACHE_TTL_MS, shouldSyncFromServer } from '../../../services/chatDexieStore'
import { prefetchChatPhotos } from '../../../services/chatPhotoPrefetchService'
import { NamaUsernameDisplay } from '../../../components/NamaUsernameDisplay'
import { useNotification } from '../../../contexts/NotificationContext'
import { useChatOffcanvas } from '../../../contexts/ChatOffcanvasContext'
import MessageStatusIcon from './MessageStatusIcon'
import PinnedMessagesBar from './PinnedMessagesBar'
import MessageBubbleActions, {
  MessageBubbleMenuTrigger,
  MessageBubbleActionPanel,
  MessageBubbleLoveBadge,
} from './MessageBubbleActionBar'
import NewChatContactOffcanvas from './NewChatContactOffcanvas'
import ForwardMessageOffcanvas from './ForwardMessageOffcanvas'
import { useSwipeToReply } from './useSwipeToReply'
import MessageInfoOffcanvas from './MessageInfoOffcanvas'
import SearchInChatPanel from './SearchInChatPanel'
import GroupInviteSection from './GroupInviteSection'
import ArchivedChatList from './ArchivedChatList'
import { createTypedObjectUrl, ensureTypedBlob } from '../../../utils/filePreviewMedia'

function convKey(a, b) {
  const x = Number(a)
  const y = Number(b)
  return x <= y ? `${x}_${y}` : `${y}_${x}`
}

/** Key state messagesByKey untuk satu pesan masuk: id percakapan + peer_<lawan> agar cocok dengan /chat?u=… (tanpa ?c=). */
function collectInboundMessageKeys(payload, myUsersId) {
  const keys = new Set()
  const convRaw = payload?.conversation_id
  if (convRaw != null && convRaw !== '') {
    const c = Number(convRaw)
    if (c > 0) keys.add(String(c))
  }
  const sid = Number(payload?.sender_id ?? payload?.from_user_id)
  const tid = Number(payload?.to_user_id)
  if (sid > 0 && tid > 0) {
    if (myUsersId != null) {
      const me = Number(myUsersId)
      const other = sid === me ? tid : tid === me ? sid : null
      if (other != null && other > 0 && other !== me) {
        keys.add(`peer_${other}`)
      }
    } else {
      // myUsersId belum siap: isi kedua peer agar /chat?u=… tetap ketemu
      keys.add(`peer_${sid}`)
      keys.add(`peer_${tid}`)
    }
  }
  return [...keys]
}

function messageIdsEqual(a, b) {
  if (a == null || b == null) return false
  if (typeof a === 'string' && String(a).includes('_')) return false
  if (typeof b === 'string' && String(b).includes('_')) return false
  return Number(a) === Number(b)
}

const CHAT_ARCHIVE_OVERRIDE_STORAGE_KEY = 'ebeddien_chat_archive_override_v1'

function conversationArchivedRaw(conv) {
  const raw = conv?.is_archived
  return raw === true || raw === 1 || raw === '1'
}

function readArchiveOverrideMapFromStorage() {
  if (typeof sessionStorage === 'undefined') return new Map()
  try {
    const raw = sessionStorage.getItem(CHAT_ARCHIVE_OVERRIDE_STORAGE_KEY)
    if (!raw) return new Map()
    const o = JSON.parse(raw)
    const m = new Map()
    if (o && typeof o === 'object') {
      Object.keys(o).forEach((k) => {
        const id = Number(k)
        if (id > 0) m.set(id, Boolean(o[k]))
      })
    }
    return m
  } catch {
    return new Map()
  }
}

function writeArchiveOverrideMapToStorage(map) {
  if (typeof sessionStorage === 'undefined') return
  try {
    const o = {}
    map.forEach((v, k) => {
      o[String(k)] = Boolean(v)
    })
    if (Object.keys(o).length === 0) sessionStorage.removeItem(CHAT_ARCHIVE_OVERRIDE_STORAGE_KEY)
    else sessionStorage.setItem(CHAT_ARCHIVE_OVERRIDE_STORAGE_KEY, JSON.stringify(o))
  } catch {
    /* ignore quota / private mode */
  }
}

function chatAttachmentExtension(name) {
  const n = String(name || '').trim()
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1).toLowerCase() : ''
}

const CHAT_IMAGE_FILE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

function isChatImageAttachment(msg) {
  const mime = String(msg?.attachment_mime || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  return CHAT_IMAGE_FILE_EXT.has(chatAttachmentExtension(msg?.attachment_name))
}

/** ID pesan server untuk fetch lampiran (bukan temp / string random). */
function chatMessageAttachmentId(msg) {
  if (msg?.tempId != null) return null
  const raw = msg?.id
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

/** Gambar lampiran: fetch dengan Bearer (bukan <img src> ke API). */
function ChatAuthAttachmentImage({ messageId, alt, className, mimeHint, fileName }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let objectUrl = null
    ;(async () => {
      try {
        const blob = await chatUserAPI.fetchChatMessageAttachment(messageId)
        if (cancelled) return
        const typed = createTypedObjectUrl(blob, mimeHint, fileName)
        objectUrl = typed.url
        if (!objectUrl) {
          setFailed(true)
          return
        }
        setSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return objectUrl
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [messageId, mimeHint, fileName])
  if (failed) {
    return <span className="text-xs opacity-90">Gagal memuat gambar</span>
  }
  if (!src) {
    return <span className="mt-1 inline-block h-40 min-w-[8rem] animate-pulse rounded-md bg-black/15" aria-hidden />
  }
  return (
    <button
      type="button"
      className="mt-1 block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
      onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
    >
      <img src={src} alt={alt || 'Gambar'} className={className} loading="lazy" />
    </button>
  )
}

function safeChatDownloadFilename(name) {
  const n = String(name || 'lampiran')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return n || 'lampiran'
}

/** File non-gambar: unduh dengan nama benar; user buka dari folder Unduhan dengan aplikasi default. */
function ChatAuthAttachmentFileRow({ messageId, fileName, mime, isOwn }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try {
      const blob = await chatUserAPI.fetchChatMessageAttachment(messageId)
      const { blob: finalBlob } = ensureTypedBlob(blob, mime, fileName)
      const u = URL.createObjectURL(finalBlob || blob)
      const dl = safeChatDownloadFilename(fileName)
      const a = document.createElement('a')
      a.href = u
      a.download = dl
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(u), 120_000)
    } catch {
      /* noop */
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      title="Unduh file"
      onClick={open}
      className={`mt-1 flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
        isOwn ? 'bg-teal-400/40 text-white hover:bg-teal-400/50 disabled:opacity-60' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-600/70 dark:text-gray-100 disabled:opacity-60'
      }`}
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/15">
        FILE
      </span>
      <span className="min-w-0 truncate">{fileName || 'Lampiran'}</span>
    </button>
  )
}

/** Bubble satu pesan */
function MessageBubble({
  msg,
  isOwn,
  isGroup,
  groupSenderLabel,
  receiptPhase,
  highlight,
  actionMenuProps,
  swipeHandlers,
}) {
  const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''
  const showGroupLabel = Boolean(isGroup && groupSenderLabel && !isOwn)
  const isDeleted = Boolean(msg.deleted_at || msg.is_deleted)
  const edited = Boolean(msg.edited_at)
  const hasAttachment = Boolean(msg.has_attachment || msg.attachment_name)
  const isImageAttachment = isChatImageAttachment(msg)
  const attachmentNumericId = chatMessageAttachmentId(msg)
  const localPreview = msg.local_attachment_preview_url || null
  const uploadProgress = Number.isFinite(Number(msg.uploadProgress)) ? Math.max(0, Math.min(100, Number(msg.uploadProgress))) : null
  const progressRing = uploadProgress != null ? Math.max(0, Math.min(100, uploadProgress)) : null
  const replyPreview = msg.reply_preview
  const forwardFrom = msg.forward_from
  const loveCount = Number(msg?.reaction_summary?.love_count || 0)
  const showMenu = Boolean(actionMenuProps && !actionMenuProps.disabled)

  const stackClass = `flex flex-col max-w-full gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`
  const hasTextBody = Boolean(msg.message)
  // Lebar mengikuti isi: teks pendek = satu baris; panjang baru turun ke baris berikutnya
  const bubbleShellClass = `flex flex-col w-fit min-w-[7.5rem] max-w-[85%] sm:max-w-[65%] rounded-lg px-3 py-2 shadow-sm ${
    isOwn
      ? 'bg-teal-500 text-white rounded-br-md'
      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-600'
  }`

  const metaRow = (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-[10px] leading-none tabular-nums ${
        isOwn ? 'text-teal-100' : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      <span>{time}</span>
      {progressRing != null ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[9px]">
          {Math.round(progressRing)}
        </span>
      ) : null}
      {isOwn && receiptPhase ? <MessageStatusIcon phase={receiptPhase} /> : null}
      {showMenu ? (
        <MessageBubbleMenuTrigger
          open={actionMenuProps.open}
          onToggleOpen={actionMenuProps.onToggleOpen}
          isOwn={isOwn}
        />
      ) : null}
    </span>
  )

  const bubbleBody = isDeleted ? (
    <p className="text-sm italic opacity-90">Pesan ini dihapus</p>
  ) : (
    <>
      {forwardFrom ? (
        <p className={`text-[10px] font-medium mb-1 ${isOwn ? 'text-teal-100/95' : 'text-teal-700 dark:text-teal-300'}`}>
          Diteruskan dari {forwardFrom.sender_display_name || 'pengguna'}
        </p>
      ) : null}
      {forwardFrom ? (
        <div
          className={`mb-2 rounded-md border-l-[3px] px-2 py-1.5 text-xs ${
            isOwn
              ? 'border-teal-200/90 bg-teal-600/40 text-teal-50'
              : 'border-teal-500 bg-gray-50 text-gray-700 dark:bg-gray-600/50 dark:text-gray-100'
          }`}
        >
          {forwardFrom.message ? (
            <p className="whitespace-pre-wrap break-words line-clamp-4">{forwardFrom.message}</p>
          ) : null}
          {forwardFrom.has_attachment ? (
            <p className="mt-0.5 opacity-80 truncate">{forwardFrom.attachment_name || 'Lampiran'}</p>
          ) : null}
        </div>
      ) : null}
      {replyPreview ? (
        <div
          className={`mb-2 rounded-md border-l-[3px] px-2 py-1 text-xs ${
            isOwn
              ? 'border-teal-200/90 bg-teal-600/40 text-teal-50'
              : 'border-teal-500 bg-gray-50 text-gray-700 dark:bg-gray-600/50 dark:text-gray-100'
          }`}
        >
          <p className="font-semibold truncate">{replyPreview.sender_display_name || 'Pengguna'}</p>
          <p className="opacity-90 truncate">{replyPreview.message || '…'}</p>
        </div>
      ) : null}
      {hasAttachment ? (
        isImageAttachment ? (
          localPreview ? (
            <button
              type="button"
              className="mt-1 block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
              onClick={() => window.open(localPreview, '_blank', 'noopener,noreferrer')}
            >
              <img
                src={localPreview}
                alt={msg.attachment_name || 'Gambar'}
                className="max-h-64 w-auto max-w-full rounded-md object-cover"
              />
            </button>
          ) : attachmentNumericId != null ? (
            <ChatAuthAttachmentImage
              messageId={attachmentNumericId}
              alt={msg.attachment_name || 'Gambar'}
              mimeHint={msg.attachment_mime}
              fileName={msg.attachment_name}
              className="max-h-64 w-auto max-w-full rounded-md object-cover"
            />
          ) : (
            <span className="mt-1 text-xs opacity-90">Mengunggah gambar…</span>
          )
        ) : attachmentNumericId != null ? (
          <ChatAuthAttachmentFileRow
            messageId={attachmentNumericId}
            fileName={msg.attachment_name}
            mime={msg.attachment_mime}
            isOwn={isOwn}
          />
        ) : (
          <span className={`mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
            isOwn ? 'bg-teal-400/40 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-600/70 dark:text-gray-100'
          }`}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/15">FILE</span>
            <span className="min-w-0 truncate">{msg.attachment_name || 'Lampiran'}</span>
          </span>
        )
      ) : null}
      {hasTextBody ? (
        <p className={`text-sm whitespace-pre-wrap break-words ${hasAttachment ? 'mt-1' : ''}`}>
          {msg.message}
          <span className="float-right ml-2 mt-0.5 align-bottom select-none">{metaRow}</span>
        </p>
      ) : null}
      {edited && !isDeleted ? (
        <p className={`mt-0.5 text-[10px] italic ${isOwn ? 'text-teal-100/90' : 'text-gray-500 dark:text-gray-400'}`}>
          diedit
        </p>
      ) : null}
    </>
  )

  const bubble = (
    <div className={bubbleShellClass}>
      {bubbleBody}
      {!hasTextBody || isDeleted ? (
        <div className="mt-1 flex justify-end items-center">{metaRow}</div>
      ) : null}
    </div>
  )
  const actionPanel = showMenu ? (
    <MessageBubbleActionPanel
          open={actionMenuProps.open}
          onToggleOpen={actionMenuProps.onToggleOpen}
          isOwn={isOwn}
          onReply={actionMenuProps.onReply}
          onForward={actionMenuProps.onForward}
          onLove={actionMenuProps.onLove}
          loved={actionMenuProps.loved}
          onCopy={actionMenuProps.onCopy}
          onEdit={actionMenuProps.onEdit}
          onDelete={actionMenuProps.onDelete}
          onPin={actionMenuProps.onPin}
          onInfo={actionMenuProps.onInfo}
          canEdit={actionMenuProps.canEdit}
          canDelete={actionMenuProps.canDelete}
          canPin={actionMenuProps.canPin}
          isPinned={actionMenuProps.isPinned}
        />
  ) : null

  const stackContent = (
    <>
      {showGroupLabel ? (
        <span
          className="max-w-[85%] sm:max-w-[65%] text-[10px] font-semibold text-gray-600 dark:text-gray-400 px-1 whitespace-normal break-words"
          title={groupSenderLabel}
        >
          {groupSenderLabel}
        </span>
      ) : null}
      {bubble}
      <MessageBubbleLoveBadge loveCount={loveCount} isOwn={isOwn} />
      {actionPanel}
    </>
  )

  const column = showMenu ? (
    <MessageBubbleActions open={actionMenuProps.open} onToggleOpen={actionMenuProps.onToggleOpen}>
      <motion.div className={stackClass}>{stackContent}</motion.div>
    </MessageBubbleActions>
  ) : (
    <motion.div className={stackClass}>{stackContent}</motion.div>
  )

  return (
    <motion.div
      data-chat-msg-id={msg.id != null && !msg.tempId ? String(msg.id) : undefined}
      className={`relative flex flex-col gap-0.5 transition-colors duration-500 touch-pan-y ${isOwn ? 'items-end' : 'items-start'} ${
        highlight ? 'rounded-lg ring-2 ring-amber-400/90 ring-offset-2 ring-offset-[#e5ddd5] dark:ring-offset-gray-900/50' : ''
      }`}
      {...(swipeHandlers || {})}
    >
      <motion.div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>{column}</motion.div>
    </motion.div>
  )
}

/** Satu baris pesan + swipe balas (hook harus di komponen). */
function ChatMessageRow({
  msg,
  isOwn,
  isGroup,
  groupSenderLabel,
  receiptPhase,
  highlight,
  actionMenuProps,
  onSwipeReply,
  swipeDisabled,
}) {
  const swipeHandlers = useSwipeToReply(onSwipeReply, { disabled: swipeDisabled })
  return (
    <MessageBubble
      msg={msg}
      isOwn={isOwn}
      isGroup={isGroup}
      groupSenderLabel={groupSenderLabel}
      receiptPhase={receiptPhase}
      highlight={highlight}
      actionMenuProps={actionMenuProps}
      swipeHandlers={swipeHandlers}
    />
  )
}

/** Format waktu relatif untuk list percakapan */
function formatLastAt(lastAt) {
  if (!lastAt) return ''
  const d = new Date(lastAt)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (dDate.getTime() === today.getTime()) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }
  if (dDate.getTime() === yesterday.getTime()) return 'Kemarin'
  if (now.getTime() - d.getTime() < 7 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString('id-ID', { weekday: 'short' })
  }
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

/** Format "Terakhir online" (relatif): "baru saja", "5 menit lalu", "2 jam lalu", "Kemarin", dll. */
function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return null
  const d = new Date(lastSeenAt)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return 'Baru saja'
  if (diffMin < 60) return `${diffMin} menit yang lalu`
  if (diffHour < 24) return `${diffHour} jam yang lalu`
  if (diffDay === 1) return `Kemarin ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
  if (diffDay < 7) return d.toLocaleDateString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

const MESSAGE_PAGE_SIZE = 20
const CHAT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
const CHAT_ATTACHMENT_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
const getInitial = (text) => String(text || '?').trim().charAt(0).toUpperCase() || '?'

/** Parse "Nama @username" dari peer_name / daftar percakapan. */
function splitPeerDisplayName(peerName) {
  const s = String(peerName || '').trim()
  const idx = s.lastIndexOf(' @')
  if (idx > 0) {
    return { nama: s.slice(0, idx).trim(), username: s.slice(idx + 2).trim() }
  }
  return { nama: s, username: '' }
}

export default function Chat({
  variant = 'page',
  onRequestClose,
  offcanvasIsPinned = false,
  onToggleOffcanvasPinned,
} = {}) {
  const [urlParams, setUrlParams] = useSearchParams()
  const { savedOffcanvasQueryString, persistOffcanvasQuery, setChatTotalUnread } = useChatOffcanvas()

  const [offcanvasQuery, setOffcanvasQuery] = useState(() => {
    if (variant !== 'offcanvas') return new URLSearchParams()
    const raw = String(savedOffcanvasQueryString || '').trim()
    return new URLSearchParams(raw)
  })

  const searchParams = variant === 'offcanvas' ? offcanvasQuery : urlParams

  const setSearchParams = useCallback(
    (next, opts) => {
      if (variant === 'offcanvas') {
        setOffcanvasQuery((prev) => {
          const base = new URLSearchParams(prev)
          if (typeof next === 'function') {
            const resolved = next(base)
            return new URLSearchParams(resolved)
          }
          return new URLSearchParams(next)
        })
      } else {
        setUrlParams(next, opts ?? {})
      }
    },
    [variant, setUrlParams]
  )

  const offcanvasQueryString = variant === 'offcanvas' ? offcanvasQuery.toString() : ''
  useEffect(() => {
    if (variant !== 'offcanvas') return
    persistOffcanvasQuery(offcanvasQueryString)
  }, [variant, offcanvasQueryString, persistOffcanvasQuery])

  const { showNotification } = useNotification()
  const { socket, onlineUsers, isConnected } = useLiveSocket()
  const user = useAuthStore((s) => s.user)
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null) // peer_id (untuk private) untuk nama header & typing
  const [messagesByKey, setMessagesByKey] = useState({}) // key = conversation_id (string) atau 'peer_'+peerId
  const [inputText, setInputText] = useState('')
  const [selectedAttachment, setSelectedAttachment] = useState(null)
  const [sendError, setSendError] = useState(null)
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(false)

  useEffect(() => {
    const t = conversations.reduce((s, c) => s + (Number(c.unread_count) || 0), 0)
    setChatTotalUnread(t)
  }, [conversations, setChatTotalUnread])
  const [newChatOpen, setNewChatOpen] = useState(() => {
    if (variant === 'offcanvas') return false
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('new') === '1'
  })
  const [offcanvasClosing, setOffcanvasClosing] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [forwardingMessage, setForwardingMessage] = useState(null)
  const [forwardPickerOpen, setForwardPickerOpen] = useState(false)
  const [forwardPickerClosing, setForwardPickerClosing] = useState(false)
  const [openActionMenuId, setOpenActionMenuId] = useState(null)
  const [chatDetailOpen, setChatDetailOpen] = useState(false)
  const [chatDetailClosing, setChatDetailClosing] = useState(false)
  const [groupMembersLoading, setGroupMembersLoading] = useState(false)
  const [groupMembers, setGroupMembers] = useState([])
  const [groupCanManageMembers, setGroupCanManageMembers] = useState(false)
  const [editGroupNameOpen, setEditGroupNameOpen] = useState(false)
  const [editGroupNameInput, setEditGroupNameInput] = useState('')
  const [updatingGroupProfile, setUpdatingGroupProfile] = useState(false)
  const groupDetailPhotoInputRef = useRef(null)
  const [addMemberSheetOpen, setAddMemberSheetOpen] = useState(false)
  const [addMemberSearch, setAddMemberSearch] = useState('')
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState([])
  const [addMemberSubmitting, setAddMemberSubmitting] = useState(false)
  const [removeMemberSubmittingId, setRemoveMemberSubmittingId] = useState(null)
  const [toggleAdminSubmittingId, setToggleAdminSubmittingId] = useState(null)
  const [showAllGroupMembers, setShowAllGroupMembers] = useState(false)
  const [deleteChatLoading, setDeleteChatLoading] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [chatUsers, setChatUsers] = useState([])
  const [chatUsersLoading, setChatUsersLoading] = useState(false)
  const [groupMode, setGroupMode] = useState(false)
  const [selectedGroupUserIds, setSelectedGroupUserIds] = useState([])
  const [groupNameSheetOpen, setGroupNameSheetOpen] = useState(false)
  const [groupNameInput, setGroupNameInput] = useState('')
  const [groupImageFile, setGroupImageFile] = useState(null)
  const [groupImagePreview, setGroupImagePreview] = useState(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [lastSeenByUserId, setLastSeenByUserId] = useState({}) // users.id -> last_seen_at (dari GET chat/users)
  const [newChatSearch, setNewChatSearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false) // loading riwayat dari DB saat buka chat
  /** ID pesan pertama yang belum dibaca (dari API sebelum last_read); garis "Pesan Baru" di atas pesan ini */
  const [firstUnreadBannerMessageId, setFirstUnreadBannerMessageId] = useState(null)
  /** Setelah riwayat siap: scroll ke banner unread atau ke bawah; dikosongkan setelah dipakai */
  const [pendingInitialScroll, setPendingInitialScroll] = useState(null) // 'unread' | 'bottom'
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false)
  const [historyPagingByKey, setHistoryPagingByKey] = useState({}) // { [messageKey]: { hasMoreServer: boolean } }
  const [userNamesMap, setUserNamesMap] = useState({}) // users.id -> username (lawan) dari API
  const userNamesMapRef = useRef(userNamesMap)
  useEffect(() => {
    userNamesMapRef.current = userNamesMap
  }, [userNamesMap])
  const [userPhotoMap, setUserPhotoMap] = useState({}) // users.id -> foto url (cache/local/api)
  const [groupPhotoMap, setGroupPhotoMap] = useState({}) // conversation_id -> blob url foto grup
  const [myUsersId, setMyUsersId] = useState(() => (user?.users_id != null ? Number(user.users_id) : null)) // users.id yang login (dari API); untuk isOwn & key percakapan
  const [peerTyping, setPeerTyping] = useState(false) // lawan sedang mengetik (private)
  /** Grup: beberapa pengirim mengetik — { user_id, label }[] */
  const [groupTypers, setGroupTypers] = useState([])
  const typingTimeoutRef = useRef(null) // clear saat stop mengetik
  const groupTyperTimersRef = useRef(new Map())
  const joinedConvRef = useRef(null)
  const draftDebounceRef = useRef(null)
  const [showArchivedSection, setShowArchivedSection] = useState(false)
  const [searchPanelOpen, setSearchPanelOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchHighlightId, setSearchHighlightId] = useState(null)
  const [infoMessageId, setInfoMessageId] = useState(null)
  const [pinnedRows, setPinnedRows] = useState([])
  const [pinnedLoading, setPinnedLoading] = useState(false)
  const [highlightMessageId, setHighlightMessageId] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null) // { id, text } | null
  // Override arsip: ref + sessionStorage agar tetap konsisten setelah pindah menu / remount ringan.
  const archiveOverrideRef = useRef(null)
  if (archiveOverrideRef.current === null) {
    archiveOverrideRef.current = readArchiveOverrideMapFromStorage()
  }
  const messagesContainerRef = useRef(null)
  const messageTextareaRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const skipAutoScrollOnceRef = useRef(false)
  const outboxQueueRef = useRef([])
  const outboxInflightRef = useRef(null)
  const outboxRetryTimerRef = useRef(null)
  const photoObjectUrlRef = useRef(new Map()) // userId -> blob:url
  const photoInflightRef = useRef(new Set()) // userId sedang fetch blob
  const groupPhotoObjectUrlRef = useRef(new Map()) // conversationId -> blob:url
  const groupPhotoInflightRef = useRef(new Set())
  /** Tinggi maks area ketik = 50% viewport (HP & PC) */
  const [composerMaxPx, setComposerMaxPx] = useState(() =>
    typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.5) : 200
  )
  const conversationIdsRef = useRef([]) // ID conversation yang ada di list (untuk cek "chat baru" realtime)
  const conversationsRef = useRef(conversations)
  const messagesByKeyRef = useRef(messagesByKey)
  conversationsRef.current = conversations
  messagesByKeyRef.current = messagesByKey
  // Hanya untuk cek "sudah login"; jangan dipakai untuk chat/socket (bisa pengurus.id). Pakai myUsersId (users.id dari API).
  const myId = user?.id ? Number(user.id) : null
  const getAttachmentUrlByMessageId = useCallback((messageId) => {
    if (messageId == null) return null
    const base = getApiBaseUrl().replace(/\/$/, '')
    return `${base}/chat/messages/${encodeURIComponent(messageId)}/attachment`
  }, [])

  const applyArchiveOverrides = useCallback((rows = []) => {
    const list = Array.isArray(rows) ? rows : []
    const refMap = archiveOverrideRef.current
    if (refMap.size > 0 && list.length > 0) {
      let pruned = false
      list.forEach((c) => {
        const cid = Number(c?.conversation_id)
        if (!cid || !refMap.has(cid)) return
        const want = Boolean(refMap.get(cid))
        const have = conversationArchivedRaw(c)
        if (want === have) {
          refMap.delete(cid)
          pruned = true
        }
      })
      if (pruned) writeArchiveOverrideMapToStorage(refMap)
    }
    if (refMap.size === 0) return list
    return list.map((c) => {
      const cid = Number(c?.conversation_id)
      if (!cid || !refMap.has(cid)) return c
      return { ...c, is_archived: Boolean(refMap.get(cid)) }
    })
  }, [])

  const resolvePhotoUrl = useCallback((rawPath) => {
    const raw = String(rawPath || '').trim()
    if (!raw) return null
    if (/^https?:\/\//i.test(raw)) {
      if (/\/api\/uploads\/pengurus\//i.test(raw) || /\/api\/uploads\/chat_groups\//i.test(raw)) return null
      return raw
    }
    if (/^blob:/i.test(raw)) return raw
    const rel = raw.startsWith('/') ? raw.slice(1) : raw
    if (
      rel.startsWith('uploads/pengurus/')
      || rel.startsWith('uploads/chat_groups/')
    ) {
      return null
    }
    let path = raw.startsWith('/') ? raw : `/${raw}`
    if (path === '/uploads' || path.startsWith('/uploads/')) {
      path = `/api${path}`
    }
    return `${window.location.origin}${path}`
  }, [])

  const handleAvatarError = useCallback((userId) => {
    if (userId == null) return
    const key = String(userId)
    setUserPhotoMap((prev) => {
      if (!prev || !prev[key]) return prev
      return { ...prev, [key]: null }
    })
  }, [])

  const handleGroupPhotoError = useCallback((conversationId) => {
    if (conversationId == null) return
    const key = String(conversationId)
    setGroupPhotoMap((prev) => {
      if (!prev?.[key]) return prev
      return { ...prev, [key]: null }
    })
  }, [])

  const hydrateGroupPhotoBlob = useCallback((conversationId) => {
    const cid = Number(conversationId)
    if (!cid) return
    if (groupPhotoInflightRef.current.has(cid)) return
    groupPhotoInflightRef.current.add(cid)
    chatUserAPI.getGroupPhotoBlob(cid).then((blob) => {
      if (!(blob instanceof Blob)) return
      const prevUrl = groupPhotoObjectUrlRef.current.get(cid)
      if (prevUrl) URL.revokeObjectURL(prevUrl)
      const nextUrl = URL.createObjectURL(blob)
      groupPhotoObjectUrlRef.current.set(cid, nextUrl)
      setGroupPhotoMap((prev) => ({ ...prev, [String(cid)]: nextUrl }))
    }).catch(() => {}).finally(() => {
      groupPhotoInflightRef.current.delete(cid)
    })
  }, [])

  const hydrateUserPhotoBlob = useCallback((userId, rawFotoPath) => {
    const uid = Number(userId)
    if (!uid || !rawFotoPath) return
    if (photoInflightRef.current.has(uid)) return
    photoInflightRef.current.add(uid)
    chatUserAPI.getUserPhotoBlob(uid).then((blob) => {
      if (!(blob instanceof Blob)) return
      const prevUrl = photoObjectUrlRef.current.get(uid)
      if (prevUrl) URL.revokeObjectURL(prevUrl)
      const nextUrl = URL.createObjectURL(blob)
      photoObjectUrlRef.current.set(uid, nextUrl)
      setUserPhotoMap((prev) => ({ ...prev, [String(uid)]: nextUrl }))
    }).catch(() => {}).finally(() => {
      photoInflightRef.current.delete(uid)
    })
  }, [])

  useEffect(() => () => {
    photoObjectUrlRef.current.forEach((url) => {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    })
    photoObjectUrlRef.current.clear()
    photoInflightRef.current.clear()
    groupPhotoObjectUrlRef.current.forEach((url) => {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    })
    groupPhotoObjectUrlRef.current.clear()
    groupPhotoInflightRef.current.clear()
  }, [])

  // Foto grup: load blob (pakai cookie), bukan URL /uploads di tag img.
  useEffect(() => {
    if (!myUsersId || !Array.isArray(conversations) || conversations.length === 0) return
    conversations.forEach((c) => {
      if (c.peer_id != null) return
      const cid = Number(c.conversation_id)
      const hasPhoto = String(c.group_photo || '').trim() !== ''
      if (cid && hasPhoto) hydrateGroupPhotoBlob(cid)
    })
  }, [myUsersId, conversations, hydrateGroupPhotoBlob])

  useEffect(() => {
    if (!selectedConversationId || selectedUserId) return
    const c = conversations.find((x) => Number(x.conversation_id) === Number(selectedConversationId))
    const hasPhoto = String(c?.group_photo || '').trim() !== ''
    if (hasPhoto) hydrateGroupPhotoBlob(selectedConversationId)
  }, [selectedConversationId, selectedUserId, conversations, hydrateGroupPhotoBlob])

  useEffect(() => {
    conversationIdsRef.current = conversations.map((c) => Number(c.conversation_id))
  }, [conversations])

  // Ambil users.id secepat mungkin agar cache Dexie bisa dipakai sejak awal.
  useEffect(() => {
    if (user?.users_id != null) {
      const uid = Number(user.users_id)
      if (uid > 0 && uid !== myUsersId) {
        setMyUsersId(uid)
        return
      }
    }
    if (!myId || myUsersId) return
    chatUserAPI.getMe().then((res) => {
      if (res?.success && res?.my_user_id != null) {
        setMyUsersId(Number(res.my_user_id))
      }
    }).catch(() => {})
  }, [myId, myUsersId, user?.users_id])

  // Hydrate cache lokal (Dexie) lebih dulu untuk mengurangi hit server.
  useEffect(() => {
    if (!myUsersId) return
    chatDexieStore.pruneOldData(myUsersId).catch(() => {})
    chatDexieStore.getConversations(myUsersId).then((cachedConversations) => {
      if (Array.isArray(cachedConversations) && cachedConversations.length > 0) {
        setConversations((prev) => (prev.length > 0 ? prev : applyArchiveOverrides(cachedConversations)))
        setConversationsLoading(false)
      }
    }).catch(() => {})
    chatDexieStore.getUsers(myUsersId).then((cachedUsers) => {
      if (!Array.isArray(cachedUsers) || cachedUsers.length === 0) return
      const nameMap = {}
      const seenMap = {}
      const photoMap = {}
      const prefetchItems = []
      cachedUsers.forEach((u) => {
        const id = Number(u.user_id ?? u.id)
        if (!id) return
        if (u.last_seen_at !== undefined) seenMap[String(id)] = u.last_seen_at
        if (u.display_name) nameMap[id] = u.display_name
        if (u.foto_url) {
          photoMap[id] = u.foto_url
          prefetchItems.push({ url: u.foto_url, version: u.foto_version || u.foto_profil || u.foto_url })
        }
        if (u.foto_profil) hydrateUserPhotoBlob(id, u.foto_profil)
      })
      if (Object.keys(seenMap).length > 0) setLastSeenByUserId((prev) => ({ ...prev, ...seenMap }))
      if (Object.keys(nameMap).length > 0) setUserNamesMap((prev) => ({ ...prev, ...nameMap }))
      if (Object.keys(photoMap).length > 0) setUserPhotoMap((prev) => ({ ...prev, ...photoMap }))
      if (prefetchItems.length > 0) prefetchChatPhotos(prefetchItems.slice(0, 20))
    }).catch(() => {})
  }, [myUsersId, hydrateUserPhotoBlob, applyArchiveOverrides])

  // Desktop chat 2 kolom hanya untuk layar besar; tablet tetap mode bergantian seperti HP.
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  /** Halaman: dari md ke atas = dua kolom. Offcanvas header: satu layar, list ↔ thread bergantian dengan geser. */
  const splitLayoutDesktop = isDesktop && variant !== 'offcanvas'

  useEffect(() => {
    const onResize = () => setComposerMaxPx(Math.round(window.innerHeight * 0.5))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const adjustComposerTextareaHeight = useCallback(() => {
    const el = messageTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const cap = composerMaxPx
    const next = Math.min(el.scrollHeight, cap)
    el.style.height = `${Math.max(next, 44)}px`
  }, [composerMaxPx])

  useLayoutEffect(() => {
    adjustComposerTextareaHeight()
  }, [inputText, composerMaxPx, adjustComposerTextareaHeight])

  // Sinkronkan room + panel kontak dari URL: reload atau back tetap konsisten
  useEffect(() => {
    const c = searchParams.get('c')
    const u = searchParams.get('u')
    const panelNew = searchParams.get('new') === '1'
    const convId = c != null && c !== '' ? parseInt(c, 10) : null
    const peerId = u != null && u !== '' ? String(u) : null
    if (convId != null && !Number.isNaN(convId) && convId > 0) {
      setSelectedConversationId(convId)
      setSelectedUserId(peerId || null)
    } else if (peerId != null && peerId !== '') {
      setSelectedConversationId(null)
      setSelectedUserId(peerId)
    } else {
      setSelectedConversationId(null)
      setSelectedUserId(null)
    }
    if (panelNew) setNewChatOpen(true)
    else if (!offcanvasClosing) setNewChatOpen(false)
  }, [searchParams, offcanvasClosing])

  // Notifikasi PWA: /chat?u=…&reply=1 → buka room lalu fokus kolom ketik
  const hasSelectedRoomForReply = Boolean(selectedConversationId || selectedUserId)
  useEffect(() => {
    if (searchParams.get('reply') !== '1') return
    if (!hasSelectedRoomForReply || !myUsersId) return
    if (historyLoading) return

    const t = window.setTimeout(() => {
      const el = messageTextareaRef.current
      if (el) {
        el.focus()
        try {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        } catch {
          /* ignore */
        }
      }
      const next = new URLSearchParams(searchParams)
      next.delete('reply')
      setSearchParams(next, { replace: true })
    }, 400)
    return () => window.clearTimeout(t)
  }, [
    searchParams,
    setSearchParams,
    hasSelectedRoomForReply,
    myUsersId,
    historyLoading,
  ])

  // Update URL ketika user memilih room. Pakai push (bukan replace) agar di HP tombol Back = kembali ke list chat.
  const preloadRoomFromDexie = useCallback(async (conversationId, peerId) => {
    if (!myUsersId) return
    const conv = conversationId != null ? Number(conversationId) : null
    const peer = peerId != null && peerId !== '' ? Number(peerId) : null
    const key = conv ? String(conv) : (peer ? `peer_${peer}` : '')
    if (!key) return
    const cached = await chatDexieStore.getMessages(myUsersId, {
      conversationId: conv,
      peerId: peer,
      limit: MESSAGE_PAGE_SIZE,
    }).catch(() => [])
    if (!Array.isArray(cached) || cached.length === 0) return
    setMessagesByKey((prev) => {
      if (prev[key]?.length) return prev
      const normalized = cached.map((m) => ({
        ...m,
        created_at: m.created_at ?? m.tanggal_dibuat,
        isOwn: myUsersId != null ? Number(m.sender_id ?? m.from_user_id) === myUsersId : Boolean(m.is_own),
        attachment_url: (m?.attachment_url || (m?.has_attachment && m?.id != null ? getAttachmentUrlByMessageId(m.id) : null)),
      }))
      return { ...prev, [key]: normalized }
    })
  }, [myUsersId, getAttachmentUrlByMessageId])

  const openRoom = (conversationId, peerId) => {
    setFirstUnreadBannerMessageId(null)
    setPendingInitialScroll(null)
    preloadRoomFromDexie(conversationId ?? null, peerId ?? null).catch(() => {})
    setSelectedConversationId(conversationId ?? null)
    setSelectedUserId(peerId != null ? String(peerId) : null)
    const next = new URLSearchParams()
    if (conversationId != null && conversationId > 0) {
      next.set('c', String(conversationId))
      if (peerId != null && peerId !== '') next.set('u', String(peerId))
    } else if (peerId != null && peerId !== '') {
      next.set('u', String(peerId))
    }
    setSearchParams(next, { replace: false })
  }

  const closeRoom = () => {
    setDeleteConfirmOpen(false)
    setChatDetailOpen(false)
    setChatDetailClosing(false)
    setSelectedConversationId(null)
    setSelectedUserId(null)
    setFirstUnreadBannerMessageId(null)
    setPendingInitialScroll(null)
    setSearchParams({}, { replace: true })
  }

  const openChatDetail = useCallback(() => {
    setChatDetailClosing(false)
    setChatDetailOpen(true)
  }, [])

  const closeChatDetail = useCallback(() => {
    setDeleteConfirmOpen(false)
    setEditGroupNameOpen(false)
    setEditGroupNameInput('')
    setChatDetailClosing(true)
    window.setTimeout(() => {
      setChatDetailOpen(false)
      setChatDetailClosing(false)
    }, 220)
  }, [])

  const applyGroupProfileToState = useCallback((conversationId, patch = {}) => {
    const cid = Number(conversationId)
    if (cid < 1) return
    const nextName = patch.name != null ? String(patch.name) : null
    const nextPhoto = patch.group_photo !== undefined ? patch.group_photo : undefined
    setConversations((prev) => prev.map((c) => {
      if (Number(c.conversation_id) !== cid) return c
      const next = { ...c }
      if (nextName != null) next.peer_name = nextName
      if (nextPhoto !== undefined) next.group_photo = nextPhoto
      return next
    }))
    if (myUsersId) {
      chatUserAPI.getConversations({ include_archived: 1 }).then((r) => {
        if (r?.success && Array.isArray(r.data)) {
          setConversations(applyArchiveOverrides(r.data))
          chatDexieStore.upsertConversations(myUsersId, r.data).catch(() => {})
        }
      }).catch(() => {})
    }
  }, [myUsersId])

  const acknowledgeRoomDelivered = useCallback((conversationId) => {
    const cid = Number(conversationId)
    if (cid > 0) {
      chatUserAPI.markConversationDelivered(cid).catch(() => {})
    }
  }, [])

  const receiptRank = (status) => {
    if (status === 'read') return 2
    if (status === 'delivered') return 1
    return 0
  }

  const mergeReceiptStatus = (current, incoming) => {
    const cur = current || 'sent'
    const inc = incoming || 'sent'
    return receiptRank(inc) >= receiptRank(cur) ? inc : cur
  }

  const refreshReceiptsRef = useRef(() => {})

  const refreshReceiptsForRoom = useCallback(async (overrideConvId) => {
    const cid =
      overrideConvId != null
        ? Number(overrideConvId)
        : selectedConversationId != null
          ? Number(selectedConversationId)
          : 0
    if (cid < 1 || !myUsersId) return
    const key = String(cid)
    const res = await chatUserAPI.getMessages({ conversation_id: cid, limit: MESSAGE_PAGE_SIZE }).catch(() => null)
    if (!res?.success || !Array.isArray(res.data)) return
    const freshMap = new Map(res.data.map((m) => [Number(m.id), m]))
    setMessagesByKey((prev) => {
      const list = prev[key]
      if (!list) return prev
      const merged = list.map((m) => {
        const mid = Number(m.id)
        if (!mid || m.tempId != null) return m
        const u = freshMap.get(mid)
        if (!u) return m
        const next = { ...m }
        if (u.receipt_status != null) next.receipt_status = u.receipt_status
        if (u.receipt_delivered_count != null) next.receipt_delivered_count = u.receipt_delivered_count
        if (u.receipt_read_count != null) next.receipt_read_count = u.receipt_read_count
        if (u.receipt_recipient_count != null) next.receipt_recipient_count = u.receipt_recipient_count
        if (u.edited_at !== undefined) next.edited_at = u.edited_at
        if (u.deleted_at !== undefined) next.deleted_at = u.deleted_at
        if (u.is_deleted !== undefined) next.is_deleted = u.is_deleted
        if (u.message !== undefined) next.message = u.message
        if (u.reply_preview !== undefined) next.reply_preview = u.reply_preview
        if (u.forward_from !== undefined) next.forward_from = u.forward_from
        if (u.reaction_summary !== undefined) next.reaction_summary = u.reaction_summary
        return next
      })
      return { ...prev, [key]: merged }
    })
    if (myUsersId && res.data.length > 0) {
      chatDexieStore
        .upsertMessages(
          myUsersId,
          res.data.map((m) => ({
            ...m,
            created_at: m.created_at ?? m.tanggal_dibuat,
          })),
          { conversationId: cid },
        )
        .catch(() => {})
    }
  }, [selectedConversationId, myUsersId])

  refreshReceiptsRef.current = refreshReceiptsForRoom

  const scheduleReceiptRefresh = useCallback((conversationId, delayMs = 450) => {
    const cid = Number(conversationId)
    if (cid < 1) return
    window.setTimeout(() => {
      refreshReceiptsRef.current(cid)
    }, delayMs)
  }, [])

  const patchReceiptsOptimistic = useCallback((conversationId, kind) => {
    const cid = Number(conversationId)
    if (cid < 1) return
    const target = kind === 'read' ? 'read' : kind === 'delivered' ? 'delivered' : null
    if (!target) return
    const key = String(cid)
    setMessagesByKey((prev) => {
      const list = prev[key]
      if (!list?.length) return prev
      let changed = false
      const merged = list.map((m) => {
        if (m.tempId != null || !m.id) return m
        const isOwnMsg = Boolean(m.isOwn || m.is_own)
        if (!isOwnMsg) return m
        const nextStatus = mergeReceiptStatus(m.receipt_status, target)
        if (nextStatus === (m.receipt_status || 'sent')) return m
        changed = true
        return { ...m, receipt_status: nextStatus }
      })
      return changed ? { ...prev, [key]: merged } : prev
    })
  }, [])

  useEffect(() => {
    if (!selectedConversationId) return
    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshReceiptsRef.current(selectedConversationId)
    }
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [selectedConversationId])

  // Fetch percakapan (TTL: skip GET jika meta masih fresh; tetap pakai cache Dexie)
  useEffect(() => {
    if (!myId) return
    let cancelled = false
    ;(async () => {
      let ownerUsersId = myUsersId
      if (!ownerUsersId) {
        const me = await chatUserAPI.getMe().catch(() => null)
        if (cancelled) return
        if (me?.success && me?.my_user_id != null) {
          ownerUsersId = Number(me.my_user_id)
          setMyUsersId(ownerUsersId)
        }
      }
      if (!ownerUsersId) {
        setConversationsLoading(true)
        const res = await chatUserAPI.getConversations({ include_archived: 1 }).catch(() => null)
        if (cancelled) return
        if (res?.success && Array.isArray(res.data)) {
          const oid = res?.my_user_id != null ? Number(res.my_user_id) : null
          if (oid) setMyUsersId(oid)
          setConversations(applyArchiveOverrides(res.data))
          if (oid) {
            chatDexieStore.upsertConversations(oid, res.data).catch(() => {})
            chatDexieStore.setMeta(oid, 'last_conversations_sync_at', { at: new Date().toISOString() }).catch(() => {})
          }
          setUserNamesMap((prev) => {
            const next = { ...prev }
            res.data.forEach((c) => {
              const id = Number(c.peer_id ?? c.user_id)
              if (id && (c.peer_name ?? c.name ?? c.nama)) next[id] = c.peer_name ?? c.name ?? c.nama
            })
            return next
          })
        } else setConversations([])
        setConversationsLoading(false)
        return
      }

      const meta = await chatDexieStore.getMeta(ownerUsersId, 'last_conversations_sync_at')
      if (!shouldSyncFromServer(meta, CHAT_CACHE_TTL_MS.CONVERSATIONS)) {
        const cached = await chatDexieStore.getConversations(ownerUsersId)
        if (cancelled) return
        if (cached.length > 0) {
          setConversations(applyArchiveOverrides(cached))
          setUserNamesMap((prev) => {
            const next = { ...prev }
            cached.forEach((c) => {
              const id = Number(c.peer_id ?? c.user_id)
              if (id && (c.peer_name ?? c.name ?? c.nama)) next[id] = c.peer_name ?? c.name ?? c.nama
            })
            return next
          })
        }
        setConversationsLoading(false)
        return
      }

      setConversationsLoading(true)
      const res = await chatUserAPI.getConversations({ include_archived: 1 }).catch(() => null)
      if (cancelled) return
      if (res?.success && Array.isArray(res.data)) {
        const oid = res?.my_user_id != null ? Number(res.my_user_id) : ownerUsersId
        if (res?.my_user_id != null) setMyUsersId(oid)
        setConversations(applyArchiveOverrides(res.data))
        chatDexieStore.upsertConversations(oid, res.data).catch(() => {})
        chatDexieStore.setMeta(oid, 'last_conversations_sync_at', { at: new Date().toISOString() }).catch(() => {})
        setUserNamesMap((prev) => {
          const next = { ...prev }
          res.data.forEach((c) => {
            const id = Number(c.peer_id ?? c.user_id)
            if (id && (c.peer_name ?? c.name ?? c.nama)) next[id] = c.peer_name ?? c.name ?? c.nama
          })
          return next
        })
      } else setConversations([])
      setConversationsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [myId, myUsersId, variant])

  // Muat daftar user + last_seen (TTL: skip GET jika meta masih fresh)
  useEffect(() => {
    if (!myUsersId) return
    let cancelled = false
    ;(async () => {
      const meta = await chatDexieStore.getMeta(myUsersId, 'last_users_sync_at')
      if (!shouldSyncFromServer(meta, CHAT_CACHE_TTL_MS.USERS)) return
      const res = await chatUserAPI.getUsers().catch(() => null)
      if (cancelled || !res?.success || !Array.isArray(res.data)) return
      const byId = {}
      const map = {}
      const photoMap = {}
      const prefetchItems = []
      res.data.forEach((u) => {
        const id = Number(u.id)
        if (u.id != null && u.last_seen_at !== undefined) byId[String(u.id)] = u.last_seen_at
        const displayName = u.display_name ?? (u.nama && u.username ? `${u.nama} @${u.username}` : null) ?? u.nama ?? u.username ?? `User ${id}`
        if (id) map[id] = displayName
        if (id) {
          const photoUrl = resolvePhotoUrl(u.foto_profil)
          if (photoUrl) {
            photoMap[id] = photoUrl
            prefetchItems.push({ url: photoUrl, version: u.foto_profil || photoUrl })
          }
          if (u.foto_profil) hydrateUserPhotoBlob(id, u.foto_profil)
        }
      })
      setLastSeenByUserId((prev) => ({ ...prev, ...byId }))
      setUserNamesMap((prev) => ({ ...prev, ...map }))
      if (Object.keys(photoMap).length > 0) setUserPhotoMap((prev) => ({ ...prev, ...photoMap }))
      chatDexieStore.upsertUsers(myUsersId, res.data).catch(() => {})
      chatDexieStore.setMeta(myUsersId, 'last_users_sync_at', { at: new Date().toISOString() }).catch(() => {})
      if (prefetchItems.length > 0) prefetchChatPhotos(prefetchItems.slice(0, 20))
    })()
    return () => {
      cancelled = true
    }
  }, [myUsersId, resolvePhotoUrl])

  // Buka satu chat: load riwayat (TTL: skip GET jika meta room masih fresh dan ada cache)
  useEffect(() => {
    const hasConv = selectedConversationId != null && selectedConversationId > 0
    const peerId = selectedUserId != null ? Number(selectedUserId) : 0
    const hasPeer = peerId > 0
    if (!myId || (!hasConv && !hasPeer)) return
    let cancelled = false
    const convIdForKey = hasConv ? selectedConversationId : null
    const roomMetaKey = `last_messages_sync_${convIdForKey != null ? String(convIdForKey) : `peer_${peerId}`}`

    const applyCached = (cachedMessages, myUid) => {
      const key = selectedConversationId ? String(selectedConversationId) : (hasPeer ? `peer_${peerId}` : '')
      const normalized = cachedMessages.map((m) => ({
        ...m,
        created_at: m.created_at ?? m.tanggal_dibuat,
        isOwn: myUid != null ? Number(m.sender_id ?? m.from_user_id) === myUid : Boolean(m.is_own),
        attachment_url: (m?.attachment_url || (m?.has_attachment && m?.id != null ? getAttachmentUrlByMessageId(m.id) : null)),
      }))
      setMessagesByKey((prev) => (prev[key]?.length ? prev : { ...prev, [key]: normalized }))
      setHistoryPagingByKey((prev) => ({
        ...prev,
        [key]: {
          hasMoreServer: normalized.length >= MESSAGE_PAGE_SIZE,
        },
      }))
    }

    ;(async () => {
      let ownerUsersId = myUsersId
      if (!ownerUsersId) {
        const me = await chatUserAPI.getMe().catch(() => null)
        if (cancelled) return
        if (me?.success && me?.my_user_id != null) {
          ownerUsersId = Number(me.my_user_id)
          setMyUsersId(ownerUsersId)
        }
      }
      const myUid = ownerUsersId

      let cached = []
      if (ownerUsersId) {
        cached = await chatDexieStore.getMessages(ownerUsersId, {
          conversationId: hasConv ? selectedConversationId : null,
          peerId: hasPeer ? peerId : null,
          limit: MESSAGE_PAGE_SIZE,
        }).catch(() => [])
      }
      const msgMeta = ownerUsersId ? await chatDexieStore.getMeta(ownerUsersId, roomMetaKey) : null
      const hasSuspiciousBlank = cached.some((m) => {
        const noText = String(m?.message || '').trim() === ''
        const noAttachment = !m?.has_attachment && !m?.attachment_name && !m?.attachment_url
        return noText && noAttachment
      })
      const convList = conversationsRef.current
      const selectedConvMeta = hasConv
        ? convList.find((c) => Number(c.conversation_id) === Number(selectedConversationId))
        : convList.find((c) => c.peer_id != null && Number(c.peer_id) === peerId)
      const hasUnreadInRoom = Number(selectedConvMeta?.unread_count) > 0
      const roomKeyEarly = hasConv ? String(selectedConversationId) : hasPeer ? `peer_${peerId}` : ''
      const hasMessagesOnScreen = roomKeyEarly
        ? (messagesByKeyRef.current[roomKeyEarly] || []).length > 0
        : false
      const skipNetwork =
        ownerUsersId &&
        cached.length > 0 &&
        !hasSuspiciousBlank &&
        !hasUnreadInRoom &&
        !shouldSyncFromServer(msgMeta, CHAT_CACHE_TTL_MS.MESSAGES)
      if (cached.length > 0) applyCached(cached, myUid)
      if (skipNetwork) {
        setHistoryLoading(false)
        setFirstUnreadBannerMessageId(null)
        setPendingInitialScroll('bottom')
        const cidCached = hasConv ? Number(selectedConversationId) : (cached[0]?.conversation_id != null ? Number(cached[0].conversation_id) : 0)
        if (cidCached > 0) {
          acknowledgeRoomDelivered(cidCached)
        }
        setConversations((prev) =>
          prev.map((c) => {
            if (hasConv && Number(c.conversation_id) === Number(selectedConversationId)) {
              return { ...c, unread_count: 0 }
            }
            if (hasPeer && c.peer_id != null && Number(c.peer_id) === peerId) {
              return { ...c, unread_count: 0 }
            }
            return c
          })
        )
        if (!cancelled && cidCached > 0) {
          await refreshReceiptsForRoom(cidCached)
        }
        return
      }

      if (!hasMessagesOnScreen) setHistoryLoading(true)
      const params = hasConv ? { conversation_id: selectedConversationId, limit: MESSAGE_PAGE_SIZE } : { peer_id: peerId, limit: MESSAGE_PAGE_SIZE }
      const res = await chatUserAPI.getMessages(params).catch(() => null)
      if (cancelled) return
      if (res?.my_user_id != null) setMyUsersId(Number(res.my_user_id))
      const convId = res?.conversation_id != null ? Number(res.conversation_id) : null
      if (convId != null && !selectedConversationId) {
        setSelectedConversationId(convId)
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('c', String(convId))
          if (res?.peer_user_id != null) next.set('u', String(res.peer_user_id))
          return next
        }, { replace: true })
        const r = await chatUserAPI.getConversations({ include_archived: 1 }).catch(() => null)
        if (r?.success && Array.isArray(r.data)) {
          setConversations(applyArchiveOverrides(r.data))
          const oid = r?.my_user_id != null ? Number(r.my_user_id) : ownerUsersId
          if (oid) {
            chatDexieStore.upsertConversations(oid, r.data).catch(() => {})
            chatDexieStore.setMeta(oid, 'last_conversations_sync_at', { at: new Date().toISOString() }).catch(() => {})
          }
        }
      }
      if (res?.peer_user_id != null && selectedUserId === null) setSelectedUserId(String(res.peer_user_id))
      if (res?.peer_display_name != null) {
        const name = String(res.peer_display_name).trim()
        setUserNamesMap((prev) => {
          const next = { ...prev }
          if (res?.peer_user_id != null) next[Number(res.peer_user_id)] = name
          if (selectedUserId != null) next[String(selectedUserId)] = name
          return next
        })
      }
      if (!res) {
        const key = selectedConversationId ? String(selectedConversationId) : (hasPeer ? `peer_${peerId}` : '')
        setMessagesByKey((prev) => ({ ...prev, [key]: prev[key] || [] }))
        setHistoryLoading(false)
        setFirstUnreadBannerMessageId(null)
        setPendingInitialScroll('bottom')
        return
      }
      const list = Array.isArray(res?.data) ? res.data : []
      const myUidFinal = res?.my_user_id != null ? Number(res.my_user_id) : myUid
      const key = convId != null ? String(convId) : (hasPeer ? `peer_${peerId}` : '')
      const normalized = list.map((m) => ({
        ...m,
        created_at: m.created_at ?? m.tanggal_dibuat,
        isOwn: myUidFinal != null ? Number(m.sender_id ?? m.from_user_id) === myUidFinal : Boolean(m.is_own),
        attachment_url: m?.has_attachment && m?.id != null ? getAttachmentUrlByMessageId(m.id) : null,
      }))
      setMessagesByKey((prev) => ({ ...prev, [key]: normalized }))
      setHistoryPagingByKey((prev) => ({
        ...prev,
        [key]: {
          hasMoreServer: normalized.length >= MESSAGE_PAGE_SIZE,
        },
      }))
      const fidRaw = res?.first_unread_message_id
      const fid = fidRaw != null ? Number(fidRaw) : null
      const inUnreadList = fid != null && fid > 0 && normalized.some((m) => Number(m.id) === fid)
      setFirstUnreadBannerMessageId(inUnreadList ? fid : null)
      setPendingInitialScroll(inUnreadList ? 'unread' : 'bottom')
      const ownerFinal = res?.my_user_id != null ? Number(res.my_user_id) : ownerUsersId
      if (ownerFinal) {
        const metaKeyRoom = `last_messages_sync_${convId != null ? String(convId) : `peer_${peerId}`}`
        chatDexieStore.upsertMessages(ownerFinal, normalized, { conversationId: convId, peerId: hasPeer ? peerId : null }).catch(() => {})
        chatDexieStore.setMeta(ownerFinal, metaKeyRoom, { at: new Date().toISOString() }).catch(() => {})
      }
      if (convId != null && convId > 0) {
        acknowledgeRoomDelivered(convId)
        setConversations((prev) =>
          prev.map((c) => (Number(c.conversation_id) === convId ? { ...c, unread_count: 0 } : c))
        )
      }
      if (!cancelled && convId != null && convId > 0) {
        await refreshReceiptsForRoom(convId)
      }
      setHistoryLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [myId, myUsersId, selectedConversationId, selectedUserId, getAttachmentUrlByMessageId, acknowledgeRoomDelivered, refreshReceiptsForRoom])

  const meId = myUsersId ?? myId
  const isArchivedConversation = (conv) => conversationArchivedRaw(conv)
  const archivedConversationRows = conversations.filter((c) => isArchivedConversation(c))
  // Daftar dari API (conversation_id, peer_id, peer_name, last_message, last_at, unread_count, is_self); merge last message dari state
  const conversationList = (() => {
    const byConv = new Map()
    conversations.filter((c) => !isArchivedConversation(c)).forEach((c) => {
      const convId = Number(c.conversation_id)
      const peerId = c.peer_id != null ? Number(c.peer_id) : null
      byConv.set(convId, {
        conversation_id: convId,
        peer_id: peerId,
        peer_name: c.peer_name ?? c.name ?? (peerId ? `User ${peerId}` : 'Grup'),
        group_photo: c.group_photo ?? null,
        is_self: c.is_self === true,
        last_message: c.last_message,
        last_at: c.last_at,
        unread_count: c.unread_count ?? 0,
        draft_text: c.draft_text ?? null,
        isOnline: false,
      })
    })
    Object.keys(messagesByKey).forEach((key) => {
      const list = messagesByKey[key] || []
      const last = list[list.length - 1]
      if (!last) return
      const convId = key.startsWith('peer_') ? null : (Number(key) || 0)
      const item = convId ? byConv.get(convId) : null
      if (item && (!item.last_at || new Date(last.created_at || last.tanggal_dibuat) > new Date(item.last_at))) {
        item.last_message = last.message || (last.attachment_name ? `[File] ${last.attachment_name}` : '')
        item.last_at = last.created_at || last.tanggal_dibuat
      }
    })
    conversations.filter((c) => !isArchivedConversation(c)).forEach((c) => {
      const convId = Number(c.conversation_id)
      const item = byConv.get(convId)
      if (item && item.peer_id != null && onlineUsers.some((u) => String(u.user_id) === String(item.peer_id))) item.isOnline = true
    })
    return Array.from(byConv.values()).sort((a, b) => {
      const ta = a.last_at ? new Date(a.last_at).getTime() : 0
      const tb = b.last_at ? new Date(b.last_at).getTime() : 0
      return tb - ta
    })
  })()

  const selectedContact = (selectedConversationId != null || selectedUserId != null)
    ? conversationList.find((c) => c.conversation_id === selectedConversationId || String(c.peer_id) === String(selectedUserId)) ||
      archivedConversationRows.find((c) => c.conversation_id === selectedConversationId || String(c.peer_id) === String(selectedUserId)) ||
      (selectedUserId ? { peer_id: selectedUserId, peer_name: userNamesMap[selectedUserId] ?? `User ${selectedUserId}`, is_self: Number(selectedUserId) === Number(meId) } : null)
    : null
  const activeConvMeta = conversations.find((c) => Number(c.conversation_id) === Number(selectedConversationId))
  const selectedIsGroup = Boolean(selectedContact && selectedContact.peer_id == null)
  const selectedTitle = selectedIsGroup
    ? (selectedContact?.peer_name || 'Grup')
    : getPartnerDisplayName(selectedUserId, selectedContact?.peer_name || selectedContact?.nama)
  const selectedAvatar = selectedIsGroup
    ? (selectedConversationId != null ? groupPhotoMap[String(selectedConversationId)] : null)
    : userPhotoMap[String(selectedUserId)]

  // Nama lawan (untuk list & header). Untuk chat diri sendiri (peerId === meId) tampilkan nama saya.
  function getPartnerDisplayName(peerId, fallbackName) {
    if (peerId == null) return ''
    const name = (userNamesMap[peerId] ?? fallbackName ?? `User ${peerId}`).trim() || `User ${peerId}`
    if (Number(peerId) === Number(meId)) {
      const selfName = (user?.nama && user?.username ? `${user.nama} @${user.username}` : null) ?? user?.username ?? user?.nama ?? name
      return selfName.trim() || 'Anda'
    }
    return name
  }

  const peerDetailUser = !selectedIsGroup && selectedUserId
    ? chatUsers.find((u) => String(u.id) === String(selectedUserId))
    : null

  const detailSplit = splitPeerDisplayName(selectedContact?.peer_name || peerDetailUser?.display_name || '')
  const detailNama = selectedIsGroup
    ? (selectedContact?.peer_name || 'Grup')
    : (String(peerDetailUser?.nama || '').trim() || detailSplit.nama || selectedTitle)
  const detailUsername = selectedIsGroup
    ? 'Grup'
    : (peerDetailUser?.username
      ? `@${peerDetailUser.username}`
      : (detailSplit.username ? `@${detailSplit.username}` : '—'))

  useEffect(() => {
    if (!chatDetailOpen || !selectedIsGroup || !selectedConversationId) {
      setGroupMembers([])
      setGroupCanManageMembers(false)
      setShowAllGroupMembers(false)
      setAddMemberSheetOpen(false)
      setAddMemberSearch('')
      setSelectedAddMemberIds([])
      setGroupMembersLoading(false)
      return
    }
    let cancelled = false
    setGroupMembersLoading(true)
    chatUserAPI.getConversationMembers(selectedConversationId)
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res.members)) {
          const nextMembers = [...res.members].sort((a, b) => {
            const ad = Number(Boolean(b?.is_admin)) - Number(Boolean(a?.is_admin))
            if (ad !== 0) return ad
            const an = String(a?.display_name || a?.nama || a?.username || '').toLowerCase()
            const bn = String(b?.display_name || b?.nama || b?.username || '').toLowerCase()
            return an.localeCompare(bn, 'id')
          })
          setGroupMembers(nextMembers)
          setGroupCanManageMembers(Boolean(res?.can_manage_members))
        } else {
          setGroupMembers([])
          setGroupCanManageMembers(false)
        }
      })
      .catch(() => {
        if (cancelled) return
        setGroupMembers([])
        setGroupCanManageMembers(false)
      })
      .finally(() => {
        if (cancelled) return
        setGroupMembersLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [chatDetailOpen, selectedIsGroup, selectedConversationId])

  const loadChatUsers = useCallback(async () => {
    setChatUsersLoading(true)
    try {
      const res = await chatUserAPI.getUsers()
      if (res?.success && Array.isArray(res.data)) {
        setChatUsers(res.data)
        const byId = {}
        const photoById = {}
        const prefetchItems = []
        res.data.forEach((u) => {
          if (u.id != null && u.last_seen_at !== undefined) byId[String(u.id)] = u.last_seen_at
          if (u.id != null) {
            const photoUrl = resolvePhotoUrl(u.foto_profil)
            if (photoUrl) {
              photoById[String(u.id)] = photoUrl
              prefetchItems.push({ url: photoUrl, version: u.foto_profil || photoUrl })
            }
            if (u.foto_profil) hydrateUserPhotoBlob(Number(u.id), u.foto_profil)
          }
        })
        setLastSeenByUserId(byId)
        if (Object.keys(photoById).length > 0) setUserPhotoMap((prev) => ({ ...prev, ...photoById }))
        if (prefetchItems.length > 0) prefetchChatPhotos(prefetchItems.slice(0, 30))
      } else {
        setChatUsers([])
        setLastSeenByUserId({})
      }
    } catch {
      setChatUsers([])
      setLastSeenByUserId({})
    } finally {
      setChatUsersLoading(false)
    }
  }, [hydrateUserPhotoBlob, resolvePhotoUrl])

  const openDeleteConfirmModal = () => {
    if (!selectedConversationId) {
      showNotification('Tunggu sampai percakapan siap (sedang memuat…)', 'error', 3000)
      return
    }
    setDeleteConfirmOpen(true)
  }

  const performDeleteConversation = async () => {
    if (!selectedConversationId) return
    setDeleteChatLoading(true)
    try {
      const res = await chatUserAPI.deleteConversation(selectedConversationId)
      if (!res?.success) throw new Error(res?.message || 'Gagal menghapus')
      const cid = Number(selectedConversationId)
      const pid = selectedUserId != null ? Number(selectedUserId) : null
      if (myUsersId) {
        await chatDexieStore.removeConversationRoom(myUsersId, { conversationId: cid, peerId: Number.isFinite(pid) && pid > 0 ? pid : null }).catch(() => {})
      }
      if (selectedIsGroup) {
        const url = groupPhotoObjectUrlRef.current.get(cid)
        if (url) URL.revokeObjectURL(url)
        groupPhotoObjectUrlRef.current.delete(cid)
        setGroupPhotoMap((prev) => {
          const next = { ...prev }
          delete next[String(cid)]
          return next
        })
      }
      setMessagesByKey((prev) => {
        const next = { ...prev }
        delete next[String(cid)]
        if (pid) delete next[`peer_${pid}`]
        return next
      })
      setConversations((prev) => prev.filter((c) => Number(c.conversation_id) !== cid))
      setDeleteConfirmOpen(false)
      closeRoom()
      showNotification(res?.message || 'Percakapan dihapus', 'success', 2500)
    } catch (e) {
      showNotification(e?.message || 'Gagal menghapus', 'error', 3500)
    } finally {
      setDeleteChatLoading(false)
    }
  }

  const messageKey = selectedConversationId ? String(selectedConversationId) : (selectedUserId ? `peer_${selectedUserId}` : '')
  /** Grup: ada conversation_id, tidak ada peer user (bukan chat 1:1). */
  const roomIsGroup = Boolean(selectedConversationId && !selectedUserId)
  const getGroupMessageLabel = (msg) => {
    if (msg?.sender_display_name) return msg.sender_display_name
    if (msg?.sender_username) return `@${msg.sender_username}`
    const sid = Number(msg?.sender_id ?? msg?.from_user_id)
    if (sid && userNamesMap[String(sid)]) return userNamesMap[String(sid)]
    return sid ? `User ${sid}` : ''
  }
  const messages = messageKey ? (messagesByKey[messageKey] || []) : []
  const activePaging = historyPagingByKey[messageKey] || { hasMoreServer: true }

  useEffect(() => {
    if (!selectedConversationId) {
      setPinnedRows([])
      return
    }
    let cancelled = false
    setPinnedLoading(true)
    chatUserAPI
      .listPins(selectedConversationId)
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r?.data) ? r.data : []
        setPinnedRows(
          rows.map((p) => ({
            message_id: p.message_id,
            preview: p.message_preview || '',
          }))
        )
      })
      .catch(() => {
        if (!cancelled) setPinnedRows([])
      })
      .finally(() => {
        if (!cancelled) setPinnedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedConversationId])

  useEffect(() => {
    if (!socket?.connected) return
    const prev = joinedConvRef.current
    const cid = selectedConversationId != null ? Number(selectedConversationId) : 0
    if (prev && prev !== cid) {
      socket.emit('leave_chat_room', { conversation_id: prev })
    }
    if (cid > 0) {
      socket.emit('join_chat_room', { conversation_id: cid })
      joinedConvRef.current = cid
    } else {
      joinedConvRef.current = null
    }
    return () => {}
  }, [socket, socket?.connected, selectedConversationId])

  const patchTempMessage = useCallback((tempId, patcher) => {
    if (tempId == null) return
    setMessagesByKey((prev) => {
      const next = { ...prev }
      let changed = false
      Object.keys(next).forEach((k) => {
        const list = next[k] || []
        const idx = list.findIndex((m) => String(m?.tempId) === String(tempId))
        if (idx === -1) return
        const copy = [...list]
        copy[idx] = patcher(copy[idx], k)
        next[k] = copy
        changed = true
      })
      return changed ? next : prev
    })
  }, [])

  const flushOutbox = useCallback(() => {
    if (!socket?.connected || outboxInflightRef.current) return
    const next = outboxQueueRef.current[0]
    if (!next) return
    outboxInflightRef.current = next
    // Chat pribadi & grup: kirim langsung ke API (satu hop). Mengatasi pending lama karena
    // socket.send_message memakai Node → PHP dulu. Realtime ke peer lewat PHP → live server (receive_message).
    if (next.conversation_id != null && Number(next.conversation_id) > 0) {
      chatUserAPI.sendMessage({
        conversation_id: Number(next.conversation_id),
        message: next.message,
        file: next.file || undefined,
        reply_to_message_id: next.reply_to_message_id,
        forwarded_from_message_id: next.forwarded_from_message_id,
      }, {
        onUploadProgress: (evt) => {
          const total = Number(evt?.total || 0)
          const loaded = Number(evt?.loaded || 0)
          if (total <= 0) return
          const pct = Math.round((loaded / total) * 100)
          patchTempMessage(next.tempId, (old) => ({ ...old, uploadProgress: pct }))
        },
      }).then((res) => {
        const inflight = outboxInflightRef.current || outboxQueueRef.current[0]
        if (!inflight) return
        outboxInflightRef.current = null
        if (res?.success && res?.id != null) {
          outboxQueueRef.current.shift()
          patchTempMessage(inflight.tempId, (old) => {
            if (old?.local_attachment_preview_url) {
              try {
                URL.revokeObjectURL(old.local_attachment_preview_url)
              } catch {
                /* ignore */
              }
            }
            return {
              ...old,
              id: res.id,
              created_at: res.created_at || old.created_at,
              sender_username: res.sender_username ?? old.sender_username,
              sender_display_name: res.sender_display_name ?? old.sender_display_name,
              has_attachment: Boolean(res?.has_attachment ?? old?.has_attachment),
              attachment_name: res?.attachment_name ?? old?.attachment_name ?? null,
              attachment_mime: res?.attachment_mime ?? old?.attachment_mime ?? null,
              attachment_size: res?.attachment_size ?? old?.attachment_size ?? null,
              attachment_url: (res?.has_attachment && res?.id != null) ? getAttachmentUrlByMessageId(res.id) : (old?.attachment_url ?? null),
              local_attachment_preview_url: undefined,
              tempId: undefined,
              pending: false,
              failed: false,
              uploadProgress: undefined,
              receipt_status: res.receipt_status ?? 'sent',
              reply_preview: res.reply_preview ?? old.reply_preview,
              forward_from: res.forward_from ?? old.forward_from,
              reaction_summary: res.reaction_summary ?? old.reaction_summary,
            }
          })
          flushOutbox()
          scheduleReceiptRefresh(res.conversation_id ?? inflight.conversation_id)
          return
        }
        patchTempMessage(inflight.tempId, (old) => ({ ...old, pending: true, failed: false }))
        setSendError(res?.message || 'Koneksi kurang stabil, pesan masuk antrean kirim.')
        if (outboxRetryTimerRef.current) clearTimeout(outboxRetryTimerRef.current)
        outboxRetryTimerRef.current = setTimeout(() => {
          outboxRetryTimerRef.current = null
          flushOutbox()
        }, 3000)
      }).catch(() => {
        const inflight = outboxInflightRef.current || outboxQueueRef.current[0]
        if (!inflight) return
        outboxInflightRef.current = null
        patchTempMessage(inflight.tempId, (old) => ({ ...old, pending: true, failed: false }))
        setSendError('Koneksi kurang stabil, pesan masuk antrean kirim.')
        if (outboxRetryTimerRef.current) clearTimeout(outboxRetryTimerRef.current)
        outboxRetryTimerRef.current = setTimeout(() => {
          outboxRetryTimerRef.current = null
          flushOutbox()
        }, 3000)
      })
      return
    }
    socket.emit('send_message', {
      from_user_id: next.from_user_id,
      to_user_id: next.to_user_id,
      message: next.message,
    })
  }, [socket, patchTempMessage, getAttachmentUrlByMessageId, scheduleReceiptRefresh])

  const prependMessagesWithAnchor = useCallback((key, incoming) => {
    if (!key || !Array.isArray(incoming) || incoming.length === 0) return
    const el = messagesContainerRef.current
    const prevTop = el?.scrollTop ?? 0
    const prevHeight = el?.scrollHeight ?? 0
    skipAutoScrollOnceRef.current = true
    setMessagesByKey((prev) => {
      const current = prev[key] || []
      const seen = new Set(current.map((m) => (m?.id != null ? `id:${m.id}` : `temp:${m.tempId}`)))
      const onlyNew = incoming.filter((m) => {
        const mk = m?.id != null ? `id:${m.id}` : `temp:${m.tempId}`
        if (seen.has(mk)) return false
        seen.add(mk)
        return true
      })
      if (onlyNew.length === 0) return prev
      return { ...prev, [key]: [...onlyNew, ...current] }
    })
    requestAnimationFrame(() => {
      const node = messagesContainerRef.current
      if (!node) return
      const delta = node.scrollHeight - prevHeight
      node.scrollTop = Math.max(0, prevTop + delta)
    })
  }, [])

  const loadOlderMessages = useCallback(async () => {
    if (!messageKey || loadingOlderHistory || historyLoading) return
    if (!activePaging.hasMoreServer) return
    if (!myUsersId) return
    const current = messagesByKey[messageKey] || []
    if (current.length === 0) return

    setLoadingOlderHistory(true)
    const oldest = current[0]
    const oldestCreatedAt = oldest?.created_at || oldest?.tanggal_dibuat || null
    const oldestId = Number(oldest?.id || 0)
    let loadedAny = false

    try {
      const cachedOlder = await chatDexieStore.getMessages(myUsersId, {
        conversationId: selectedConversationId != null ? selectedConversationId : null,
        peerId: selectedUserId != null ? Number(selectedUserId) : null,
        limit: MESSAGE_PAGE_SIZE,
        beforeCreatedAt: oldestCreatedAt,
      }).catch(() => [])
      if (Array.isArray(cachedOlder) && cachedOlder.length > 0) {
        prependMessagesWithAnchor(messageKey, cachedOlder.map((m) => ({
          ...m,
          created_at: m.created_at ?? m.tanggal_dibuat,
          isOwn: myUsersId != null ? Number(m.sender_id ?? m.from_user_id) === myUsersId : Boolean(m.is_own),
        })))
        loadedAny = true
      }

      const hasConv = selectedConversationId != null && selectedConversationId > 0
      const peerId = selectedUserId != null ? Number(selectedUserId) : 0
      const params = hasConv
        ? { conversation_id: selectedConversationId, before_id: oldestId > 0 ? oldestId : undefined, limit: MESSAGE_PAGE_SIZE }
        : { peer_id: peerId, before_id: oldestId > 0 ? oldestId : undefined, limit: MESSAGE_PAGE_SIZE }
      const res = await chatUserAPI.getMessages(params).catch(() => null)
      const serverList = Array.isArray(res?.data) ? res.data : []
      if (serverList.length > 0) {
        const normalized = serverList.map((m) => ({
          ...m,
          created_at: m.created_at ?? m.tanggal_dibuat,
          isOwn: myUsersId != null ? Number(m.sender_id ?? m.from_user_id) === myUsersId : Boolean(m.is_own),
          attachment_url: m?.has_attachment && m?.id != null ? getAttachmentUrlByMessageId(m.id) : null,
        }))
        prependMessagesWithAnchor(messageKey, normalized)
        chatDexieStore.upsertMessages(myUsersId, normalized, {
          conversationId: hasConv ? selectedConversationId : null,
          peerId: hasConv ? null : peerId,
        }).catch(() => {})
        loadedAny = true
      }

      setHistoryPagingByKey((prev) => ({
        ...prev,
        [messageKey]: {
          hasMoreServer: serverList.length >= MESSAGE_PAGE_SIZE || loadedAny,
        },
      }))
    } finally {
      setLoadingOlderHistory(false)
    }
  }, [
    messageKey,
    loadingOlderHistory,
    historyLoading,
    activePaging.hasMoreServer,
    myUsersId,
    messagesByKey,
    selectedConversationId,
    selectedUserId,
    prependMessagesWithAnchor,
    getAttachmentUrlByMessageId,
  ])

  useEffect(() => {
    if (!socket) return
    const onReceive = (payload) => {
      const senderId = Number(payload.sender_id ?? payload.from_user_id)
      const convId = payload.conversation_id != null ? Number(payload.conversation_id) : null
      const isIncoming = myUsersId != null && senderId !== myUsersId
      const isOwn = myUsersId != null && senderId === myUsersId
      let merged = {
        ...payload,
        sender_id: senderId,
        created_at: payload.created_at,
        isOwn,
        attachment_url: payload?.has_attachment && payload?.id != null ? getAttachmentUrlByMessageId(payload.id) : null,
      }
      if (convId != null && !merged.sender_display_name && !merged.sender_username) {
        const fallback = userNamesMapRef.current[String(senderId)] ?? userNamesMapRef.current[senderId]
        if (fallback) merged = { ...merged, sender_display_name: fallback }
      }
      let keysToWrite = collectInboundMessageKeys(payload, myUsersId)
      if (keysToWrite.length === 0) {
        const fallbackKey = convId != null && convId > 0 ? String(convId) : convKey(payload.from_user_id, payload.to_user_id)
        keysToWrite = [fallbackKey]
      }
      setMessagesByKey((prev) => {
        let next = prev
        let changed = false
        for (const key of keysToWrite) {
          const list = (next === prev ? prev : next)[key] || []
          if (list.some((m) => messageIdsEqual(m.id, payload.id))) continue
          let appended = null
          if (isOwn) {
            // Echo realtime untuk pesan sendiri: merge ke bubble temp agar tidak dobel.
            const tempIdx = [...list].reverse().findIndex((m) => (
              m?.tempId != null
              && Number(m?.sender_id ?? m?.from_user_id) === senderId
              && Number(m?.conversation_id) === Number(merged?.conversation_id)
              && String(m?.message || '') === String(merged?.message || '')
            ))
            if (tempIdx !== -1) {
              const realIdx = list.length - 1 - tempIdx
              const copy = [...list]
              const prevRow = copy[realIdx]
              if (prevRow?.local_attachment_preview_url) {
                try {
                  URL.revokeObjectURL(prevRow.local_attachment_preview_url)
                } catch {
                  /* ignore */
                }
              }
              copy[realIdx] = {
                ...prevRow,
                ...merged,
                id: merged.id ?? prevRow.id,
                tempId: undefined,
                pending: false,
                failed: false,
                local_attachment_preview_url: undefined,
                receipt_status: merged.receipt_status ?? prevRow?.receipt_status ?? 'sent',
              }
              appended = copy
            }
          }
          if (!appended) appended = [...list, merged]
          if (!changed) {
            next = { ...prev, [key]: appended }
            changed = true
          } else {
            next = { ...next, [key]: appended }
          }
        }
        return changed ? next : prev
      })
      if (myUsersId) {
        const tid = Number(payload?.to_user_id)
        const isPrivateDm = tid > 0
        const peerForDexie = isPrivateDm && payload?.from_user_id != null ? Number(payload.from_user_id) : null
        chatDexieStore.upsertMessages(myUsersId, [merged], {
          conversationId: convId,
          peerId: peerForDexie,
        }).catch(() => {})
      }

      const isActiveRoom = Boolean(messageKey) && keysToWrite.includes(messageKey)
      if (convId != null && convId > 0) {
        setConversations((prev) => {
          if (!prev.some((c) => Number(c.conversation_id) === convId)) return prev
          return prev.map((c) => {
            if (Number(c.conversation_id) !== convId) return c
            const next = { ...c }
            if (merged.message || merged.attachment_name) {
              next.last_message = merged.message || `[File] ${merged.attachment_name}`
              next.last_at = merged.created_at || next.last_at
            }
            if (isIncoming) {
              next.unread_count = isActiveRoom ? 0 : (c.unread_count ?? 0) + 1
            }
            return next
          })
        })
      }

      if (convId != null && convId > 0 && isIncoming) {
        chatUserAPI.markConversationDelivered(convId).catch(() => {})
      }

      if (convId != null && isIncoming && !conversationIdsRef.current.includes(convId)) {
        chatUserAPI.getConversations({ include_archived: 1 }).then((r) => {
          if (r?.success && Array.isArray(r.data)) {
            setConversations(applyArchiveOverrides(r.data))
            const ownerUsersId = r?.my_user_id != null ? Number(r.my_user_id) : myUsersId
            if (ownerUsersId) chatDexieStore.upsertConversations(ownerUsersId, r.data).catch(() => {})
          }
        })
      }
    }
    const onResult = (payload) => {
      const inflight = outboxInflightRef.current || outboxQueueRef.current[0]
      if (!inflight) return
      outboxInflightRef.current = null
      if (payload?.success && payload?.id != null) {
        outboxQueueRef.current.shift()
        patchTempMessage(inflight.tempId, (old) => {
          if (old?.local_attachment_preview_url) {
            try {
              URL.revokeObjectURL(old.local_attachment_preview_url)
            } catch {
              /* ignore */
            }
          }
          return {
            ...old,
            id: payload.id,
            created_at: payload.created_at || old.created_at,
            tempId: undefined,
            pending: false,
            failed: false,
            local_attachment_preview_url: undefined,
            receipt_status: payload.receipt_status ?? 'sent',
            reply_preview: payload.reply_preview ?? old.reply_preview,
            forward_from: payload.forward_from ?? old.forward_from,
            reaction_summary: payload.reaction_summary ?? old.reaction_summary,
          }
        })
        flushOutbox()
        scheduleReceiptRefresh(payload.conversation_id ?? inflight.conversation_id)
      } else {
        // Data tidak valid = gagal permanen (mis. payload lama tanpa to_user_id). Jangan retry tanpa akhir.
        if (payload?.reason === 'invalid_data') {
          outboxQueueRef.current.shift()
          patchTempMessage(inflight.tempId, (old) => ({
            ...old,
            pending: false,
            failed: true,
          }))
          setSendError('Format pesan tidak valid. Coba kirim ulang.')
          flushOutbox()
          return
        }
        // Tetap di antrean dan coba kirim lagi di belakang layar.
        patchTempMessage(inflight.tempId, (old) => ({
          ...old,
          pending: true,
          failed: false,
        }))
        setSendError(payload?.reason === 'user_offline' ? 'User sedang offline, antrean akan dicoba lagi.' : 'Koneksi kurang stabil, pesan masuk antrean kirim.')
        if (outboxRetryTimerRef.current) clearTimeout(outboxRetryTimerRef.current)
        outboxRetryTimerRef.current = setTimeout(() => {
          outboxRetryTimerRef.current = null
          flushOutbox()
        }, 3000)
      }
    }
    socket.on('receive_message', onReceive)
    socket.on('send_message_result', onResult)
    return () => {
      socket.off('receive_message', onReceive)
      socket.off('send_message_result', onResult)
    }
  }, [socket, selectedUserId, myUsersId, messageKey, patchTempMessage, flushOutbox, getAttachmentUrlByMessageId, scheduleReceiptRefresh])

  useEffect(() => {
    if (!socket) return
    const onReceipt = (payload) => {
      const cid = payload?.conversation_id != null ? Number(payload.conversation_id) : 0
      if (cid < 1 || Number(selectedConversationId) !== cid) return
      patchReceiptsOptimistic(cid, payload?.kind)
      refreshReceiptsForRoom(cid)
    }
    const onMsgUpdated = (payload) => {
      const cid = Number(payload?.conversation_id)
      const mid = Number(payload?.id)
      if (!cid || !mid) return
      const key = String(cid)
      setMessagesByKey((prev) => {
        const list = prev[key]
        if (!list) return prev
        const copy = list.map((m) =>
          Number(m.id) === mid
            ? {
                ...m,
                message: payload.message ?? m.message,
                edited_at: payload.edited_at ?? m.edited_at,
              }
            : m
        )
        return { ...prev, [key]: copy }
      })
    }
    const onMsgDeleted = (payload) => {
      const cid = Number(payload?.conversation_id)
      const mid = Number(payload?.id)
      if (!cid || !mid) return
      const key = String(cid)
      setMessagesByKey((prev) => {
        const list = prev[key]
        if (!list) return prev
        const copy = list.map((m) =>
          Number(m.id) === mid
            ? {
                ...m,
                message: '',
                deleted_at: payload.deleted_at ?? m.deleted_at,
                is_deleted: true,
              }
            : m
        )
        return { ...prev, [key]: copy }
      })
    }
    const onPinnedChanged = (payload) => {
      const cid = Number(payload?.conversation_id)
      if (!cid || Number(selectedConversationId) !== cid) return
      chatUserAPI
        .listPins(cid)
        .then((r) => {
          const rows = Array.isArray(r?.data) ? r.data : []
          setPinnedRows(
            rows.map((p) => ({
              message_id: p.message_id,
              preview: p.message_preview || '',
            }))
          )
        })
        .catch(() => {})
    }
    const onDraftUpdated = (payload) => {
      const cid = Number(payload?.conversation_id)
      if (!cid) return
      setConversations((prev) =>
        prev.map((c) =>
          Number(c.conversation_id) === cid
            ? { ...c, draft_text: payload.draft_text ?? null, draft_updated_at: payload.draft_updated_at ?? null }
            : c
        )
      )
    }
    const onReaction = (payload) => {
      const cid = Number(payload?.conversation_id)
      const mid = Number(payload?.message_id)
      if (!cid || !mid) return
      const key = String(cid)
      const fromMe = Number(payload?.user_id) === Number(myUsersId)
      setMessagesByKey((prev) => {
        const list = prev[key]
        if (!list) return prev
        return {
          ...prev,
          [key]: list.map((m) =>
            Number(m.id) === mid
              ? {
                  ...m,
                  reaction_summary: {
                    love_count: Number(payload?.love_count ?? 0),
                    my_loved: fromMe ? Boolean(payload?.my_loved) : Boolean(m.reaction_summary?.my_loved),
                  },
                }
              : m,
          ),
        }
      })
    }
    const onChatTyping = (payload) => {
      const cid = Number(payload?.conversation_id)
      const from = Number(payload?.from_user_id)
      if (!cid || !from || !myUsersId || from === Number(myUsersId)) return
      if (Number(selectedConversationId) !== cid) return
      const label = payload?.from_name || `User ${from}`
      const state = payload?.state
      const timers = groupTyperTimersRef.current
      if (state === 'typing') {
        setGroupTypers((prev) => {
          const others = prev.filter((x) => x.user_id !== from)
          return [...others, { user_id: from, label }]
        })
        if (timers.get(from)) clearTimeout(timers.get(from))
        const t = setTimeout(() => {
          setGroupTypers((prev) => prev.filter((x) => x.user_id !== from))
          timers.delete(from)
        }, 4500)
        timers.set(from, t)
      } else {
        setGroupTypers((prev) => prev.filter((x) => x.user_id !== from))
        if (timers.get(from)) {
          clearTimeout(timers.get(from))
          timers.delete(from)
        }
      }
    }
    socket.on('chat_receipt', onReceipt)
    socket.on('message_updated', onMsgUpdated)
    socket.on('message_deleted', onMsgDeleted)
    socket.on('chat_pinned_changed', onPinnedChanged)
    socket.on('chat_draft_updated', onDraftUpdated)
    socket.on('chat_typing', onChatTyping)
    socket.on('chat_reaction', onReaction)
    return () => {
      socket.off('chat_receipt', onReceipt)
      socket.off('message_updated', onMsgUpdated)
      socket.off('message_deleted', onMsgDeleted)
      socket.off('chat_pinned_changed', onPinnedChanged)
      socket.off('chat_draft_updated', onDraftUpdated)
      socket.off('chat_typing', onChatTyping)
      socket.off('chat_reaction', onReaction)
    }
  }, [socket, selectedConversationId, myUsersId, refreshReceiptsForRoom, patchReceiptsOptimistic])

  useEffect(() => {
    setSendError(null)
    setPeerTyping(false)
    setGroupTypers([])
    groupTyperTimersRef.current.forEach((t) => clearTimeout(t))
    groupTyperTimersRef.current.clear()
  }, [selectedConversationId, selectedUserId])

  // Dengarkan lawan sedang mengetik / berhenti
  const peerTypingTimeoutRef = useRef(null)
  useEffect(() => {
    if (!socket) return
    const onTyping = (payload) => {
      const from = Number(payload?.from_user_id)
      if (from !== Number(selectedUserId)) return
      setPeerTyping(true)
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current)
      peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 4000)
    }
    const onTypingStop = (payload) => {
      const from = Number(payload?.from_user_id)
      if (from === Number(selectedUserId)) {
        if (peerTypingTimeoutRef.current) {
          clearTimeout(peerTypingTimeoutRef.current)
          peerTypingTimeoutRef.current = null
        }
        setPeerTyping(false)
      }
    }
    socket.on('user_typing', onTyping)
    socket.on('user_typing_stop', onTypingStop)
    return () => {
      socket.off('user_typing', onTyping)
      socket.off('user_typing_stop', onTypingStop)
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current)
    }
  }, [socket, selectedUserId])

  // Kirim typing_start saat user mengetik; typing_stop setelah diam (debounce 2s)
  const TYPING_STOP_MS = 2000
  const emitTypingStart = () => {
    if (!socket?.connected || !myUsersId) return
    if (roomIsGroup && selectedConversationId) {
      socket.emit('typing_start', {
        conversation_id: Number(selectedConversationId),
        from_name: user?.nama || user?.username || 'User',
      })
      return
    }
    if (!selectedUserId) return
    socket.emit('typing_start', {
      from_user_id: myUsersId,
      to_user_id: Number(selectedUserId),
      from_name: user?.nama || user?.username || 'User',
    })
  }
  const emitTypingStop = () => {
    if (!socket?.connected || !myUsersId) return
    if (roomIsGroup && selectedConversationId) {
      socket.emit('typing_stop', { conversation_id: Number(selectedConversationId) })
      return
    }
    if (!selectedUserId) return
    socket.emit('typing_stop', {
      from_user_id: myUsersId,
      to_user_id: Number(selectedUserId),
    })
  }
  const scheduleTypingStop = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null
      emitTypingStop()
    }, TYPING_STOP_MS)
  }
  const handleInputChange = (e) => {
    setInputText(e.target.value)
    emitTypingStart()
    scheduleTypingStop()
  }
  const handleInputBlur = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }
    emitTypingStop()
  }

  // Scroll awal: ke garis "Pesan Baru" (tengah) jika ada unread di jendela; jika tidak, ke bawah.
  useLayoutEffect(() => {
    if (pendingInitialScroll == null) return
    const mode = pendingInitialScroll
    const container = messagesContainerRef.current
    if (!container) {
      setPendingInitialScroll(null)
      return
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = messagesContainerRef.current
        if (!c) {
          setPendingInitialScroll(null)
          return
        }
        if (mode === 'unread') {
          const el = c.querySelector('[data-chat-unread-banner="1"]')
          if (el) {
            const targetTop = el.offsetTop - c.clientHeight / 2 + el.offsetHeight / 2
            c.scrollTop = Math.max(0, targetTop)
          } else {
            c.scrollTop = c.scrollHeight
          }
        } else {
          c.scrollTop = c.scrollHeight
        }
        setPendingInitialScroll(null)
      })
    })
  }, [pendingInitialScroll])

  // Auto-follow ke bawah saat ada pesan baru jika posisi user masih dekat bawah.
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    if (skipAutoScrollOnceRef.current) {
      skipAutoScrollOnceRef.current = false
      return
    }
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    if (distanceFromBottom < 120) {
      const raf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
      return () => cancelAnimationFrame(raf)
    }
    return undefined
  }, [messages])

  const handleMessagesScroll = useCallback((e) => {
    const el = e.currentTarget
    if (!el) return
    if (el.scrollTop <= 48) loadOlderMessages()
  }, [loadOlderMessages])

  const handleAttachmentChange = (evt) => {
    const f = evt?.target?.files?.[0]
    if (!f) return
    if (Number(f.size || 0) > CHAT_ATTACHMENT_MAX_BYTES) {
      setSendError('Ukuran file maksimal 5MB.')
      evt.target.value = ''
      return
    }
    setSendError(null)
    setSelectedAttachment(f)
    evt.target.value = ''
  }

  const sendMessage = () => {
    const text = inputText.trim()
    if (!text && !selectedAttachment) return
    if (editingMessage?.id) {
      const mid = Number(editingMessage.id)
      if (!mid) return
      setSendError(null)
      chatUserAPI
        .editChatMessage(mid, { message: text })
        .then((r) => {
          if (!r?.success) {
            setSendError(r?.message || 'Gagal mengedit')
            return
          }
          setMessagesByKey((prev) => {
            const list = prev[messageKey] || []
            const copy = list.map((m) =>
              Number(m.id) === mid
                ? { ...m, message: text, edited_at: r.edited_at || new Date().toISOString() }
                : m
            )
            return { ...prev, [messageKey]: copy }
          })
          setEditingMessage(null)
          setInputText('')
          emitTypingStop()
        })
        .catch(() => setSendError('Gagal mengedit pesan'))
      return
    }
    if (!socket) return
    // Wajib pakai users.id (dari API my_user_id). Jangan pakai user.id dari auth (bisa id pengurus).
    const fromUsersId = myUsersId
    const toUsersId = selectedUserId ? Number(selectedUserId) : 0
    if (fromUsersId == null) {
      setSendError('Memuat data pengguna. Coba lagi sebentar.')
      return
    }
    if (!selectedConversationId && !selectedUserId) {
      setSendError('Pilih percakapan dulu.')
      return
    }
    setSendError(null)
    const fileToSend = selectedAttachment
    const local_attachment_preview_url =
      fileToSend && String(fileToSend.type || '').startsWith('image/')
        ? URL.createObjectURL(fileToSend)
        : null
    const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const key = messageKey
    const isGroupRoom = Boolean(selectedConversationId && !selectedUserId)
    const groupSenderMeta =
      isGroupRoom && user?.username
        ? {
            sender_username: user.username,
            sender_display_name:
              (user.nama && user.username ? `${user.nama} @${user.username}` : null) ?? user.username,
          }
        : {}
    setMessagesByKey((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), {
        id: tempId,
        tempId,
        conversation_id: selectedConversationId,
        sender_id: fromUsersId,
        from_user_id: fromUsersId,
        to_user_id: toUsersId,
        message: text,
        has_attachment: Boolean(fileToSend),
        attachment_name: fileToSend?.name || null,
        attachment_mime: fileToSend?.type || null,
        attachment_size: fileToSend?.size || null,
        local_attachment_preview_url,
        created_at: new Date().toISOString(),
        isOwn: true,
        pending: true,
        failed: false,
        uploadProgress: fileToSend ? 0 : undefined,
        ...groupSenderMeta,
      }],
    }))
    setInputText('')
    setSelectedAttachment(null)
    emitTypingStop()
    const replyToId = replyingTo?.id ? Number(replyingTo.id) : undefined
    outboxQueueRef.current.push({
      tempId,
      key,
      conversation_id: selectedConversationId,
      from_user_id: fromUsersId,
      to_user_id: toUsersId,
      message: text,
      file: fileToSend || null,
      reply_to_message_id: replyToId,
    })
    if (replyToId) {
      setMessagesByKey((prev) => {
        const list = prev[key] || []
        const idx = list.findIndex((m) => String(m?.tempId) === String(tempId))
        if (idx === -1) return prev
        const copy = [...list]
        copy[idx] = {
          ...copy[idx],
          reply_preview: {
            id: replyToId,
            sender_display_name: replyingTo.senderName,
            message: replyingTo.snippet,
          },
        }
        return { ...prev, [key]: copy }
      })
    }
    setReplyingTo(null)
    flushOutbox()
  }

  useEffect(() => {
    if (!selectedConversationId || myUsersId == null) return
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current)
    draftDebounceRef.current = setTimeout(() => {
      chatUserAPI.setConversationDraft(selectedConversationId, { text: inputText }).catch(() => {})
    }, 800)
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current)
    }
  }, [inputText, selectedConversationId, myUsersId])

  useEffect(() => {
    setSelectedAttachment(null)
  }, [selectedConversationId, selectedUserId])

  const inviteCodeFromUrl = searchParams.get('invite')
  useEffect(() => {
    const code = String(inviteCodeFromUrl || '').trim()
    if (!code || !myUsersId) return
    let cancelled = false
    chatUserAPI
      .joinInvite(code)
      .then((r) => {
        if (cancelled) return
        if (r?.success && r?.conversation_id) {
          openRoom(Number(r.conversation_id), null)
          showNotification(r?.message || 'Bergabung ke grup', 'success', 2500)
          chatUserAPI.getConversations({ include_archived: 1 }).then((x) => {
            if (x?.success && Array.isArray(x.data)) setConversations(applyArchiveOverrides(x.data))
          })
        } else {
          showNotification(r?.message || 'Undangan gagal', 'error', 3500)
        }
      })
      .catch(() => {
        if (!cancelled) showNotification('Undangan tidak valid', 'error', 3000)
      })
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev)
      n.delete('invite')
      return n
    }, { replace: true })
    return () => {
      cancelled = true
    }
  }, [inviteCodeFromUrl, myUsersId, showNotification, setSearchParams])

  useEffect(() => {
    if (socket?.connected) flushOutbox()
  }, [socket?.connected, flushOutbox])

  useEffect(() => {
    const onOnline = () => flushOutbox()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flushOutbox])

  useEffect(() => () => {
    if (outboxRetryTimerRef.current) clearTimeout(outboxRetryTimerRef.current)
  }, [])

  const OFFCANVAS_CLOSE_MS = 220

  const closeOffcanvas = useCallback(() => {
    setOffcanvasClosing(true)
    setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      }, { replace: true })
      setNewChatOpen(false)
      setNewChatSearch('')
      setGroupMode(false)
      setSelectedGroupUserIds([])
      setGroupNameSheetOpen(false)
      setGroupNameInput('')
      setGroupImageFile(null)
      setGroupImagePreview(null)
      setOffcanvasClosing(false)
    }, OFFCANVAS_CLOSE_MS)
  }, [setSearchParams])

  const messageSnippet = useCallback((m) => {
    const t = String(m?.message || '').trim()
    if (t) return t.length > 120 ? `${t.slice(0, 119)}…` : t
    if (m?.attachment_name) return `[File] ${m.attachment_name}`
    return '…'
  }, [])

  const startReplyToMessage = useCallback((m) => {
    const mid = Number(m?.id)
    if (!mid || m?.tempId) return
    setReplyingTo({
      id: mid,
      senderName: m.sender_display_name || m.sender_username || 'Pengguna',
      snippet: messageSnippet(m),
    })
    setForwardingMessage(null)
    setForwardPickerOpen(false)
    messageTextareaRef.current?.focus()
  }, [messageSnippet])

  const startForwardMessage = useCallback((m) => {
    const mid = Number(m?.id)
    if (!mid || m?.tempId) return
    setForwardingMessage({ messageId: mid, preview: messageSnippet(m) })
    setForwardPickerOpen(true)
    setForwardPickerClosing(false)
    setReplyingTo(null)
  }, [messageSnippet])

  const closeForwardPicker = useCallback(() => {
    setForwardPickerClosing(true)
    setTimeout(() => {
      setForwardPickerOpen(false)
      setForwardPickerClosing(false)
      setForwardingMessage(null)
    }, 220)
  }, [])

  const handleForwardToConversation = useCallback(
    (targetConversationId) => {
      if (!forwardingMessage?.messageId || !targetConversationId) return
      setSendError(null)
      chatUserAPI
        .sendMessage({
          conversation_id: Number(targetConversationId),
          message: '',
          forwarded_from_message_id: forwardingMessage.messageId,
        })
        .then((r) => {
          if (!r?.success) {
            setSendError(r?.message || 'Gagal meneruskan pesan')
            return
          }
          closeForwardPicker()
          if (Number(selectedConversationId) === Number(targetConversationId)) {
            const key = String(targetConversationId)
            setMessagesByKey((prev) => ({
              ...prev,
              [key]: [
                ...(prev[key] || []),
                {
                  id: r.id,
                  conversation_id: targetConversationId,
                  sender_id: myUsersId,
                  message: '',
                  created_at: r.created_at || new Date().toISOString(),
                  isOwn: true,
                  is_own: true,
                  forward_from: r.forward_from,
                  reply_preview: r.reply_preview,
                  reaction_summary: r.reaction_summary,
                },
              ],
            }))
          }
        })
        .catch(() => setSendError('Gagal meneruskan pesan'))
    },
    [forwardingMessage, closeForwardPicker, selectedConversationId, myUsersId],
  )

  const patchMessageReaction = useCallback((conversationKey, messageId, summary) => {
    setMessagesByKey((prev) => {
      const list = prev[conversationKey]
      if (!list) return prev
      return {
        ...prev,
        [conversationKey]: list.map((m) =>
          Number(m.id) === Number(messageId) ? { ...m, reaction_summary: summary } : m,
        ),
      }
    })
  }, [])

  const handleToggleLove = useCallback(
    (m) => {
      const mid = Number(m?.id)
      if (!mid || m?.tempId) return
      const key = messageKey
      const prevSummary = m.reaction_summary || { love_count: 0, my_loved: false }
      const optimistic = {
        love_count: Math.max(0, (prevSummary.love_count || 0) + (prevSummary.my_loved ? -1 : 1)),
        my_loved: !prevSummary.my_loved,
      }
      patchMessageReaction(key, mid, optimistic)
      chatUserAPI.toggleMessageReaction(mid).then((r) => {
        if (r?.success && r.reaction_summary) {
          patchMessageReaction(key, mid, r.reaction_summary)
        } else {
          patchMessageReaction(key, mid, prevSummary)
        }
      }).catch(() => patchMessageReaction(key, mid, prevSummary))
    },
    [messageKey, patchMessageReaction],
  )

  const newChatFilteredUsers = useMemo(() => {
    const q = newChatSearch.trim().toLowerCase()
    if (!q) return chatUsers
    return chatUsers.filter(
      (u) =>
        (u.display_name && String(u.display_name).toLowerCase().includes(q)) ||
        (u.username && String(u.username).toLowerCase().includes(q)) ||
        (u.nama && String(u.nama).toLowerCase().includes(q)) ||
        String(u.id).toLowerCase().includes(q),
    )
  }, [chatUsers, newChatSearch])

  /** Tombol Kembali (mobile): tutup modal → offcanvas detail → offcanvas kontak baru → keluar thread. */
  const handleThreadBack = useCallback(() => {
    if (deleteConfirmOpen) {
      setDeleteConfirmOpen(false)
      return
    }
    if (chatDetailOpen || chatDetailClosing) {
      closeChatDetail()
      return
    }
    if (newChatOpen || offcanvasClosing) {
      closeOffcanvas()
      return
    }
    closeRoom()
  }, [
    deleteConfirmOpen,
    chatDetailOpen,
    chatDetailClosing,
    newChatOpen,
    offcanvasClosing,
    closeChatDetail,
    closeOffcanvas,
    closeRoom,
  ])

  const openNewChatOffcanvas = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('new', '1')
      return next
    }, { replace: false })
    setNewChatOpen(true)
    setGroupMode(false)
    setSelectedGroupUserIds([])
    setGroupNameSheetOpen(false)
    setGroupNameInput('')
    setGroupImageFile(null)
    setGroupImagePreview(null)
    loadChatUsers().catch(() => {})
  }

  // peerId = users.id dari list kontak; dipakai sebagai to_user_id saat kirim.
  const selectUserForNewChat = (peerId) => {
    if (groupMode) {
      const id = Number(peerId)
      setSelectedGroupUserIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id)
        return [...prev, id]
      })
      return
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('new')
      return next
    }, { replace: true })
    setNewChatOpen(false)
    setNewChatSearch('')
    openRoom(null, String(peerId))
  }

  const submitCreateGroup = async () => {
    const name = groupNameInput.trim()
    if (!name) {
      showNotification('Nama grup wajib diisi.', 'error', 3000)
      return
    }
    if (selectedGroupUserIds.length < 1) {
      showNotification('Pilih minimal 1 anggota.', 'error', 3000)
      return
    }
    setCreatingGroup(true)
    try {
      const res = await chatUserAPI.createGroup({
        name,
        member_user_ids: selectedGroupUserIds,
        group_photo: groupImageFile,
      })
      if (!(res?.success && res?.conversation_id)) {
        showNotification(res?.message || 'Gagal membuat grup', 'error', 3500)
        return
      }
      const convId = Number(res.conversation_id)
      setGroupNameSheetOpen(false)
      setGroupMode(false)
      setSelectedGroupUserIds([])
      setGroupNameInput('')
      setGroupImageFile(null)
      setGroupImagePreview(null)
      closeOffcanvas()
      openRoom(convId, null)
      chatUserAPI.getConversations({ include_archived: 1 }).then((r) => {
        if (r?.success && Array.isArray(r.data)) {
          setConversations(applyArchiveOverrides(r.data))
          const ownerUsersId = r?.my_user_id != null ? Number(r.my_user_id) : myUsersId
          if (ownerUsersId) {
            chatDexieStore.upsertConversations(ownerUsersId, r.data).catch(() => {})
            chatDexieStore.setMeta(ownerUsersId, 'last_conversations_sync_at', { at: new Date().toISOString() }).catch(() => {})
          }
        }
      })
      showNotification('Grup berhasil dibuat.', 'success', 2500)
    } catch {
      showNotification('Gagal membuat grup', 'error', 3500)
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleGroupImageChange = (e) => {
    const file = e?.target?.files?.[0]
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      showNotification('File harus berupa gambar.', 'error', 2500)
      return
    }
    if (groupImagePreview) {
      try { URL.revokeObjectURL(groupImagePreview) } catch { /* ignore */ }
    }
    const preview = URL.createObjectURL(file)
    setGroupImageFile(file)
    setGroupImagePreview(preview)
  }

  useEffect(() => () => {
    if (groupImagePreview) {
      try { URL.revokeObjectURL(groupImagePreview) } catch { /* ignore */ }
    }
  }, [groupImagePreview])

  const openEditGroupName = () => {
    setEditGroupNameInput(detailNama || '')
    setEditGroupNameOpen(true)
  }

  const submitEditGroupName = async () => {
    const cid = Number(selectedConversationId)
    const name = editGroupNameInput.trim()
    if (cid < 1) return
    if (!name) {
      showNotification('Nama grup wajib diisi.', 'error', 3000)
      return
    }
    if (name === (detailNama || '').trim()) {
      setEditGroupNameOpen(false)
      return
    }
    setUpdatingGroupProfile(true)
    try {
      const res = await chatUserAPI.updateGroup(cid, { name })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal mengubah nama grup', 'error', 3500)
        return
      }
      applyGroupProfileToState(cid, { name: res.name ?? name })
      setEditGroupNameOpen(false)
      showNotification('Nama grup diperbarui.', 'success', 2500)
    } catch {
      showNotification('Gagal mengubah nama grup', 'error', 3500)
    } finally {
      setUpdatingGroupProfile(false)
    }
  }

  const handleEditGroupPhotoChange = async (e) => {
    const file = e?.target?.files?.[0]
    if (e?.target) e.target.value = ''
    if (!file || !selectedConversationId) return
    if (!String(file.type || '').startsWith('image/')) {
      showNotification('File harus berupa gambar.', 'error', 2500)
      return
    }
    const cid = Number(selectedConversationId)
    setUpdatingGroupProfile(true)
    try {
      const res = await chatUserAPI.updateGroup(cid, { group_photo: file })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal mengubah foto grup', 'error', 3500)
        return
      }
      const prevUrl = groupPhotoObjectUrlRef.current.get(cid)
      if (prevUrl) {
        try { URL.revokeObjectURL(prevUrl) } catch { /* ignore */ }
        groupPhotoObjectUrlRef.current.delete(cid)
      }
      setGroupPhotoMap((prev) => {
        const next = { ...prev }
        delete next[String(cid)]
        return next
      })
      applyGroupProfileToState(cid, { group_photo: res.group_photo ?? null })
      hydrateGroupPhotoBlob(cid)
      showNotification('Foto grup diperbarui.', 'success', 2500)
    } catch {
      showNotification('Gagal mengubah foto grup', 'error', 3500)
    } finally {
      setUpdatingGroupProfile(false)
    }
  }

  const toggleAddMember = (userId) => {
    const id = Number(userId)
    if (!id) return
    setSelectedAddMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const openAddMemberSheet = async () => {
    setAddMemberSheetOpen((prev) => !prev)
    setSelectedAddMemberIds([])
    setAddMemberSearch('')
    if (chatUsers.length === 0) {
      await loadChatUsers().catch(() => {})
    }
  }

  const submitAddMembers = async () => {
    if (!selectedConversationId || selectedAddMemberIds.length < 1) {
      showNotification('Pilih minimal 1 anggota.', 'error', 3000)
      return
    }
    setAddMemberSubmitting(true)
    try {
      const res = await chatUserAPI.addConversationMembers(selectedConversationId, {
        member_user_ids: selectedAddMemberIds,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menambah anggota', 'error', 3500)
        return
      }
      setSelectedAddMemberIds([])
      setAddMemberSheetOpen(false)
      setAddMemberSearch('')
      showNotification(res?.message || 'Anggota berhasil ditambahkan', 'success', 2500)
      setGroupMembersLoading(true)
      const refresh = await chatUserAPI.getConversationMembers(selectedConversationId)
      if (refresh?.success && Array.isArray(refresh.members)) {
        const nextMembers = [...refresh.members].sort((a, b) => {
          const ad = Number(Boolean(b?.is_admin)) - Number(Boolean(a?.is_admin))
          if (ad !== 0) return ad
          const an = String(a?.display_name || a?.nama || a?.username || '').toLowerCase()
          const bn = String(b?.display_name || b?.nama || b?.username || '').toLowerCase()
          return an.localeCompare(bn, 'id')
        })
        setGroupMembers(nextMembers)
        setGroupCanManageMembers(Boolean(refresh?.can_manage_members))
      }
    } catch {
      showNotification('Gagal menambah anggota', 'error', 3500)
    } finally {
      setAddMemberSubmitting(false)
      setGroupMembersLoading(false)
    }
  }

  const removeMemberFromGroup = async (member) => {
    const memberId = Number(member?.user_id)
    if (!selectedConversationId || !memberId) return
    if (!groupCanManageMembers) return
    if (member?.is_self) {
      showNotification('Untuk diri sendiri, gunakan keluar grup.', 'error', 3000)
      return
    }
    if (member?.is_admin) {
      showNotification('Admin tidak bisa mengeluarkan admin lain.', 'error', 3000)
      return
    }
    setRemoveMemberSubmittingId(memberId)
    try {
      const res = await chatUserAPI.removeConversationMember(selectedConversationId, memberId)
      if (!res?.success) {
        showNotification(res?.message || 'Gagal mengeluarkan anggota', 'error', 3500)
        return
      }
      showNotification(res?.message || 'Anggota dikeluarkan', 'success', 2500)
      setGroupMembers((prev) => prev.filter((m) => Number(m?.user_id) !== memberId))
      setSelectedAddMemberIds((prev) => prev.filter((id) => id !== memberId))
    } catch {
      showNotification('Gagal mengeluarkan anggota', 'error', 3500)
    } finally {
      setRemoveMemberSubmittingId(null)
    }
  }

  const toggleMemberAdmin = async (member) => {
    const memberId = Number(member?.user_id)
    if (!selectedConversationId || !memberId || !groupCanManageMembers) return
    const nextIsAdmin = !Boolean(member?.is_admin)
    setToggleAdminSubmittingId(memberId)
    try {
      const res = await chatUserAPI.setConversationMemberAdmin(selectedConversationId, memberId, nextIsAdmin)
      if (!res?.success) {
        showNotification(res?.message || 'Gagal mengubah status admin', 'error', 3500)
        return
      }
      showNotification(res?.message || 'Status admin diperbarui', 'success', 2500)
      setGroupMembers((prev) => {
        const updated = prev.map((m) => (
          Number(m?.user_id) === memberId
            ? { ...m, is_admin: Boolean(nextIsAdmin) }
            : m
        ))
        return [...updated].sort((a, b) => {
          const ad = Number(Boolean(b?.is_admin)) - Number(Boolean(a?.is_admin))
          if (ad !== 0) return ad
          const an = String(a?.display_name || a?.nama || a?.username || '').toLowerCase()
          const bn = String(b?.display_name || b?.nama || b?.username || '').toLowerCase()
          return an.localeCompare(bn, 'id')
        })
      })
    } catch {
      showNotification('Gagal mengubah status admin', 'error', 3500)
    } finally {
      setToggleAdminSubmittingId(null)
    }
  }

  const scrollToMessageId = useCallback((rawId) => {
    const id = Number(rawId)
    if (!id) return
    requestAnimationFrame(() => {
      const root = messagesContainerRef.current
      const el = root?.querySelector(`[data-chat-msg-id="${id}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setHighlightMessageId(id)
        window.setTimeout(() => setHighlightMessageId(null), 1600)
      }
    })
  }, [])

  const getReceiptPhase = (msg) => {
    if (msg.tempId != null) return msg.failed ? 'failed' : 'pending'
    if (msg.failed) return 'failed'
    const rs = msg.receipt_status
    if (rs === 'read') return 'read'
    if (rs === 'delivered') return 'delivered'
    return 'sent'
  }

  const withinMinutesOf = (msg, minutes) => {
    const t = msg?.created_at ? new Date(msg.created_at).getTime() : 0
    if (!t) return false
    return Date.now() - t < minutes * 60 * 1000
  }

  const canPinMessages = Boolean(selectedConversationId && (!roomIsGroup || groupCanManageMembers))

  const handlePinToggle = async (msgId) => {
    if (!selectedConversationId || !canPinMessages) return
    const mid = Number(msgId)
    const alreadyPinned = pinnedRows.some((p) => Number(p.message_id) === mid)
    try {
      if (alreadyPinned) {
        const u = await chatUserAPI.removePin(selectedConversationId, mid)
        if (!u?.success) {
          showNotification(u?.message || 'Gagal melepas sematan', 'error', 3000)
          return
        }
        showNotification('Sematan dilepas', 'success', 2000)
      } else {
        const r = await chatUserAPI.addPin(selectedConversationId, mid)
        if (!r?.success) {
          showNotification(r?.message || 'Gagal menyematkan', 'error', 3000)
          return
        }
        showNotification('Disematkan', 'success', 2000)
      }
      const p = await chatUserAPI.listPins(selectedConversationId)
      const rows = Array.isArray(p?.data) ? p.data : []
      setPinnedRows(rows.map((x) => ({ message_id: x.message_id, preview: x.message_preview || '' })))
    } catch {
      showNotification(alreadyPinned ? 'Gagal melepas sematan' : 'Gagal menyematkan', 'error', 3000)
    }
  }

  const handleDeleteMessage = async (msgId) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Hapus pesan untuk semua orang di chat ini?')) return
    try {
      const r = await chatUserAPI.deleteChatMessage(msgId)
      if (!r?.success) {
        showNotification(r?.message || 'Gagal', 'error', 3500)
        return
      }
      setMessagesByKey((prev) => {
        const list = prev[messageKey] || []
        const copy = list.map((m) =>
          Number(m.id) === Number(msgId)
            ? { ...m, message: '', deleted_at: new Date().toISOString(), is_deleted: true }
            : m
        )
        return { ...prev, [messageKey]: copy }
      })
    } catch {
      showNotification('Gagal menghapus', 'error', 3500)
    }
  }

  const handleArchiveRow = async (e, convId, shouldArchive) => {
    e.stopPropagation()
    try {
      const r = shouldArchive
        ? await chatUserAPI.archiveConversation(convId)
        : await chatUserAPI.unarchiveConversation(convId)
      if (!r?.success) throw new Error(r?.message || 'Gagal')
      archiveOverrideRef.current.set(Number(convId), Boolean(shouldArchive))
      writeArchiveOverrideMapToStorage(archiveOverrideRef.current)
      setConversations((prev) => {
        const next = prev.map((c) =>
          Number(c.conversation_id) === Number(convId)
            ? { ...c, is_archived: Boolean(shouldArchive) }
            : c
        )
        if (myUsersId) {
          chatDexieStore.upsertConversations(myUsersId, next).catch(() => {})
          chatDexieStore.setMeta(myUsersId, 'last_conversations_sync_at', { at: new Date().toISOString() }).catch(() => {})
        }
        return next
      })
      const refresh = await chatUserAPI.getConversations({ include_archived: 1 })
      if (refresh?.success && Array.isArray(refresh.data)) {
        const target = refresh.data.find((c) => Number(c?.conversation_id) === Number(convId))
        const serverMatches = target ? isArchivedConversation(target) === Boolean(shouldArchive) : false
        // Hindari "kedip balik" saat backend/read replica belum sinkron sesaat.
        if (serverMatches) {
          archiveOverrideRef.current.delete(Number(convId))
          writeArchiveOverrideMapToStorage(archiveOverrideRef.current)
          setConversations(applyArchiveOverrides(refresh.data))
          if (myUsersId) {
            chatDexieStore.upsertConversations(myUsersId, refresh.data).catch(() => {})
            chatDexieStore.setMeta(myUsersId, 'last_conversations_sync_at', { at: new Date().toISOString() }).catch(() => {})
          }
        }
      }
      showNotification(shouldArchive ? 'Diarsipkan' : 'Dikembalikan dari arsip', 'success', 2000)
    } catch (err) {
      showNotification(err?.message || 'Gagal', 'error', 3000)
    }
  }

  const runSearchInRoom = async (q) => {
    if (!selectedConversationId || !q.trim()) return
    setSearchLoading(true)
    try {
      const r = await chatUserAPI.searchConversation(selectedConversationId, { q: q.trim(), limit: 30 })
      setSearchResults(Array.isArray(r?.data) ? r.data : [])
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  if (!myId) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-gray-500 dark:text-gray-400">
        Silakan login untuk menggunakan Chat.
      </div>
    )
  }

  const hasSelectedRoom = Boolean(selectedConversationId || selectedUserId)
  const mobileThreadOpen = !splitLayoutDesktop && hasSelectedRoom && variant !== 'offcanvas'

  const listColumnClass =
    variant === 'offcanvas'
      ? 'box-border flex h-full min-h-0 w-1/2 min-w-0 shrink-0 flex-col overflow-hidden pr-1'
      : `col-span-1 h-full min-h-0 overflow-hidden flex flex-1 flex-col ${!splitLayoutDesktop && hasSelectedRoom ? 'hidden' : ''} ${splitLayoutDesktop ? '!flex' : ''}`

  const threadColumnClass =
    variant === 'offcanvas'
      ? 'box-border flex h-full min-h-0 w-1/2 min-w-0 shrink-0 flex-col overflow-hidden pl-1'
      : `col-span-1 min-h-0 overflow-hidden flex flex-1 flex-col ${!splitLayoutDesktop && !hasSelectedRoom ? 'hidden' : ''} ${splitLayoutDesktop ? '!flex md:h-full' : ''} ${
          mobileThreadOpen
            ? 'max-sm:fixed max-sm:inset-0 max-sm:z-[85] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full flex flex-col max-sm:pt-[env(safe-area-inset-top,0px)] max-sm:pb-[env(safe-area-inset-bottom,0px)]'
            : 'h-full'
        }`

  const renderListColumn = () => (
      <div className={listColumnClass}>
            <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-none md:rounded-lg shadow-md h-full flex flex-col overflow-hidden min-h-0">
              <div className="shrink-0 px-2 md:px-4 py-3 bg-teal-600 text-white flex items-center justify-between gap-2 rounded-none md:rounded-t-lg">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {variant === 'offcanvas' && typeof onRequestClose === 'function' ? (
                    <button
                      type="button"
                      onClick={onRequestClose}
                      className="shrink-0 p-2 rounded-full hover:bg-teal-500 text-white"
                      title="Tutup"
                      aria-label="Tutup chat"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                  <div className="min-w-0">
                    <h1 className="text-lg font-semibold">Chat</h1>
                    <p className="text-xs text-teal-100 mt-0.5 truncate">
                      {isConnected ? 'Terhubung' : 'Menghubungkan...'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {variant === 'offcanvas' && typeof onToggleOffcanvasPinned === 'function' ? (
                    <button
                      type="button"
                      className={`hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-lg border text-white transition hover:bg-teal-500 ${
                        offcanvasIsPinned
                          ? 'border-white bg-white/25'
                          : 'border-white/55'
                      }`}
                      onClick={onToggleOffcanvasPinned}
                      title={
                        offcanvasIsPinned
                          ? 'Lepas pin (panel mengambang)'
                          : 'Pin panel — konten halaman bergeser ke kiri'
                      }
                      aria-pressed={offcanvasIsPinned}
                      aria-label={offcanvasIsPinned ? 'Lepas pin panel' : 'Pin panel di kanan'}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 10.5c0 7.143-7.036 11.25-7.036 11.25a.75.75 0 01-1.464 0S4.5 17.643 4.5 10.5a7.5 7.5 0 1115 0z"
                        />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={openNewChatOffcanvas}
                    className="inline-flex shrink-0 p-2 rounded-full hover:bg-teal-500 text-white"
                    title="Tambah chat baru"
                    aria-label="Tambah chat baru"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden chat-scrollbar">
                {conversationsLoading ? (
                  <div className="px-2 py-4 md:p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat percakapan...</div>
                ) : conversationList.length === 0 ? (
                  <div className="px-2 py-4 md:p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Belum ada percakapan. Gunakan tombol + untuk mulai chat.
                  </div>
                ) : (
                  <ul className="">
                    {conversationList.map((c) => {
                      const isGroup = c.peer_id == null
                      const avatarSrc = isGroup
                        ? groupPhotoMap[String(c.conversation_id)]
                        : userPhotoMap[String(c.peer_id)]
                      return (
                      <li key={c.conversation_id} className="flex items-stretch border-b border-gray-100 dark:border-gray-700/80 last:border-0">
                        <button
                          type="button"
                          onClick={() => openRoom(c.conversation_id, c.peer_id != null ? String(c.peer_id) : null)}
                          className={`min-w-0 flex flex-1 items-center gap-3 px-2 md:px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                            selectedConversationId === c.conversation_id || (c.peer_id != null && selectedUserId === String(c.peer_id)) ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                          }`}
                        >
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white overflow-hidden">
                              {avatarSrc ? (
                                <img
                                  src={avatarSrc}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={() => {
                                    if (isGroup) handleGroupPhotoError(c.conversation_id)
                                    else handleAvatarError(c.peer_id)
                                  }}
                                />
                              ) : (
                                getInitial(c.peer_name || '?')
                              )}
                            </div>
                            {c.unread_count > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center px-1 dark:bg-red-600">
                                {c.unread_count > 99 ? '99+' : c.unread_count}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              <NamaUsernameDisplay text={c.peer_name || 'Chat'} className="truncate inline" />
                              {c.is_self && <span className="text-gray-500 dark:text-gray-400 font-normal"> (Anda)</span>}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {c.last_message ? (c.last_message.length > 40 ? c.last_message.slice(0, 40) + '…' : c.last_message) : '—'}
                            </p>
                            {c.draft_text ? (
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 truncate">
                                Draft: {c.draft_text.length > 36 ? `${c.draft_text.slice(0, 36)}…` : c.draft_text}
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right flex flex-col items-end gap-0.5">
                            {c.isOnline && (
                              <span className="text-[10px] text-teal-600 dark:text-teal-400 flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-400" aria-hidden />
                                Online
                              </span>
                            )}
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatLastAt(c.last_at)}</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          title="Arsipkan"
                          aria-label="Arsipkan percakapan"
                          className="shrink-0 px-2 text-gray-400 hover:bg-gray-100 hover:text-teal-700 dark:hover:bg-gray-700/60 dark:hover:text-teal-300"
                          onClick={(e) => handleArchiveRow(e, c.conversation_id, true)}
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                        </button>
                      </li>
                      )
                    })}
                  </ul>
                )}
                <ArchivedChatList
                  showArchived={showArchivedSection}
                  onToggleShowArchived={() => setShowArchivedSection((v) => !v)}
                  archivedConversations={archivedConversationRows}
                  onOpenConversation={(c) => openRoom(c.conversation_id, c.peer_id != null ? String(c.peer_id) : null)}
                />
              </div>
            </div>
      </div>
  )

  const renderThreadColumn = () => (
      <div className={threadColumnClass} style={{ minHeight: 0 }}>
            <div
              className={`bg-transparent dark:bg-transparent shadow-md h-full min-h-0 flex flex-col overflow-hidden ${
                mobileThreadOpen ? 'rounded-none md:rounded-lg' : 'rounded-lg'
              }`}
            >
              {selectedContact ? (
                <>
                  <div className="shrink-0 z-20 flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-teal-600 text-white border-b border-teal-700/30 md:rounded-t-lg rounded-none shadow-sm">
                    {!splitLayoutDesktop && (
                      <button
                        type="button"
                        onClick={handleThreadBack}
                        className="p-2 -ml-1 rounded-full hover:bg-teal-500 shrink-0"
                        aria-label="Kembali"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSearchPanelOpen(true)}
                      className="shrink-0 rounded-full p-2 hover:bg-teal-500"
                      title="Cari dalam percakapan"
                      aria-label="Cari dalam percakapan"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={openChatDetail}
                      className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 rounded-xl py-0.5 pr-1 text-left hover:bg-teal-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                      aria-label="Detail percakapan"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-500">
                        {selectedAvatar ? (
                          <img
                            src={selectedAvatar}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={() => {
                              if (selectedIsGroup) handleGroupPhotoError(selectedConversationId)
                              else handleAvatarError(selectedUserId)
                            }}
                          />
                        ) : (
                          getInitial(selectedTitle)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          <NamaUsernameDisplay
                            text={selectedTitle}
                            className="inline truncate text-white"
                            variant="onBrand"
                          />
                          {selectedContact?.is_self && <span className="font-normal text-teal-100"> (Anda)</span>}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-teal-100">
                          {selectedIsGroup ? (
                            groupTypers.length > 0 ? (
                              <span className="italic">{groupTypers.map((t) => t.label).join(', ')} mengetik…</span>
                            ) : (
                              <span>Grup</span>
                            )
                          ) : peerTyping ? (
                            <span className="italic">Mengetik...</span>
                          ) : onlineUsers.some((u) => String(u.user_id) === String(selectedUserId)) ? (
                            <>
                              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-300" aria-hidden />
                              <span>Online</span>
                            </>
                          ) : (
                            (() => {
                              const lastSeen = lastSeenByUserId[String(selectedUserId)]
                              const txt = formatLastSeen(lastSeen)
                              return txt ? `Terakhir online: ${txt}` : ''
                            })()
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 opacity-90" aria-hidden>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    </button>
                  </div>

                  <PinnedMessagesBar pins={pinnedRows} loading={pinnedLoading} onJump={scrollToMessageId} />

                  {activeConvMeta?.is_archived ? (
                    <div className="flex shrink-0 items-center justify-between gap-2 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
                      <span>Chat ini diarsipkan</span>
                      <button
                        type="button"
                        className="shrink-0 font-semibold text-teal-800 underline hover:no-underline dark:text-teal-200"
                        onClick={() =>
                          selectedConversationId &&
                          handleArchiveRow({ stopPropagation() {} }, selectedConversationId, false)
                        }
                      >
                        Kembalikan
                      </button>
                    </div>
                  ) : null}

                  <div
                    ref={messagesContainerRef}
                    onScroll={handleMessagesScroll}
                    className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-2 bg-[#e5ddd5] dark:bg-gray-900/50 chat-scrollbar overscroll-contain"
                  >
                    {loadingOlderHistory && (
                      <p className="text-center text-gray-500 dark:text-gray-400 text-xs py-1">Memuat pesan lama...</p>
                    )}
                    {historyLoading ? (
                      <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">Memuat riwayat...</p>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">Belum ada pesan. Mulai obrolan.</p>
                    ) : null}
                    {messages.map((msg, i) => {
                      const showUnreadBanner =
                        firstUnreadBannerMessageId != null &&
                        Number(msg.id) === Number(firstUnreadBannerMessageId)
                      const bubbleKey =
                        msg.tempId != null
                          ? `temp-${msg.tempId}`
                          : msg.id != null
                            ? `id-${messageKey}-${msg.id}-${i}`
                            : `m-${messageKey}-${i}`
                      return (
                        <Fragment key={bubbleKey}>
                          {showUnreadBanner ? (
                            <div
                              data-chat-unread-banner="1"
                              className="flex w-full items-center gap-2 py-2"
                              role="separator"
                              aria-label="Pesan baru"
                            >
                              <span className="h-px min-w-0 flex-1 bg-gray-400/70 dark:bg-gray-500/60" />
                              <span className="shrink-0 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Pesan Baru
                              </span>
                              <span className="h-px min-w-0 flex-1 bg-gray-400/70 dark:bg-gray-500/60" />
                            </div>
                          ) : null}
                          <ChatMessageRow
                            msg={msg}
                            isOwn={Boolean(msg.isOwn || msg.is_own) || (myUsersId != null && Number(msg.sender_id ?? msg.from_user_id) === myUsersId)}
                            isGroup={roomIsGroup}
                            groupSenderLabel={roomIsGroup ? getGroupMessageLabel(msg) : ''}
                            receiptPhase={
                              Boolean(msg.isOwn || msg.is_own) || (myUsersId != null && Number(msg.sender_id ?? msg.from_user_id) === myUsersId)
                                ? getReceiptPhase(msg)
                                : null
                            }
                            highlight={highlightMessageId != null && Number(highlightMessageId) === Number(msg.id)}
                            swipeDisabled={openActionMenuId != null || Boolean(msg.deleted_at || msg.is_deleted)}
                            onSwipeReply={() => startReplyToMessage(msg)}
                            actionMenuProps={
                              !msg.deleted_at && !msg.is_deleted
                                ? {
                                    open: openActionMenuId === Number(msg.id),
                                    onToggleOpen: (v) => setOpenActionMenuId(v ? Number(msg.id) : null),
                                    onReply: () => startReplyToMessage(msg),
                                    onForward: () => startForwardMessage(msg),
                                    onLove: () => handleToggleLove(msg),
                                    loved: Boolean(msg?.reaction_summary?.my_loved),
                                    canEdit:
                                      Boolean(msg.isOwn || msg.is_own) &&
                                      withinMinutesOf(msg, 15) &&
                                      !msg.tempId &&
                                      Number(msg.id) > 0,
                                    canDelete:
                                      Boolean(msg.isOwn || msg.is_own) &&
                                      withinMinutesOf(msg, 60) &&
                                      !msg.tempId &&
                                      Number(msg.id) > 0,
                                    canPin: canPinMessages && !msg.tempId && Number(msg.id) > 0,
                                    isPinned: pinnedRows.some((p) => Number(p.message_id) === Number(msg.id)),
                                    onCopy: () => {
                                      const t = String(msg.message || '')
                                      if (t) navigator.clipboard?.writeText(t).catch(() => {})
                                    },
                                    onEdit: () => {
                                      if (!withinMinutesOf(msg, 15)) return
                                      setEditingMessage({ id: Number(msg.id), text: String(msg.message || '') })
                                      setInputText(String(msg.message || ''))
                                    },
                                    onDelete: () => handleDeleteMessage(msg.id),
                                    onPin: () => handlePinToggle(msg.id),
                                    onInfo: () => setInfoMessageId(Number(msg.id)),
                                    disabled: Boolean(msg.tempId),
                                  }
                                : null
                            }
                          />
                        </Fragment>
                      )
                    })}
                  </div>

                  {sendError && (
                    <div className="shrink-0 px-3 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
                      {sendError}
                    </div>
                  )}
                  <div className="sticky bottom-0 sm:bottom-2 shrink-0 z-20 p-2 pb-2 max-sm:pb-[max(env(safe-area-inset-bottom),0.5rem)] bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    {replyingTo ? (
                      <div className="mb-2 flex items-stretch gap-2 rounded-lg border-l-4 border-teal-500 bg-white px-2 py-1.5 dark:bg-gray-700">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 truncate">{replyingTo.senderName}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{replyingTo.snippet}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 self-center rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600"
                          aria-label="Batalkan balasan"
                          onClick={() => setReplyingTo(null)}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : null}
                    {selectedAttachment ? (
                      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                        <span className="min-w-0 truncate">{selectedAttachment.name}</span>
                        <button
                          type="button"
                          className="rounded px-2 py-1 text-[11px] hover:bg-gray-100 dark:hover:bg-gray-600"
                          onClick={() => setSelectedAttachment(null)}
                        >
                          Hapus
                        </button>
                      </div>
                    ) : null}
                    <div className="flex gap-2 items-end min-w-0 w-full max-w-full overflow-x-hidden">
                      <button
                        type="button"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={!myUsersId || !(selectedConversationId || selectedUserId)}
                        className="shrink-0 self-end mb-0.5 min-h-[44px] min-w-[44px] rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 inline-flex items-center justify-center"
                        title="Lampirkan file"
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M16.5 6.5v9a4.5 4.5 0 1 1-9 0V6.75a2.75 2.75 0 1 1 5.5 0V15a1 1 0 0 1-2 0V8h-1.5v7a2.5 2.5 0 0 0 5 0V6.75a4.25 4.25 0 1 0-8.5 0v8.75a6 6 0 0 0 12 0v-9h-1.5z" />
                        </svg>
                      </button>
                      <input ref={attachmentInputRef} type="file" accept={CHAT_ATTACHMENT_ACCEPT} className="hidden" onChange={handleAttachmentChange} />
                      <textarea
                        ref={messageTextareaRef}
                        rows={1}
                        value={inputText}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendMessage()
                          }
                        }}
                        placeholder={editingMessage ? 'Edit pesan…' : 'Ketik pesan…'}
                        style={{ maxHeight: composerMaxPx }}
                        className="flex-1 min-w-0 max-w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2.5 text-sm leading-snug focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none overflow-y-auto"
                        aria-label="Isi pesan"
                      />
                      <button
                        type="button"
                        onClick={sendMessage}
                        disabled={!myUsersId || !(selectedConversationId || selectedUserId) || (!inputText.trim() && !selectedAttachment)}
                        title={!myUsersId ? 'Memuat data pengguna...' : 'Kirim'}
                        className="shrink-0 self-end mb-0.5 min-h-[44px] min-w-[44px] px-3 rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
                      >
                        <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 bg-[#e5ddd5] dark:bg-gray-900/50 min-h-0">
                  <div className="text-center px-4">
                    <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      {getIcon('chat', 'w-8 h-8 text-gray-500')}
                    </div>
                    <p className="text-sm">
                      {variant === 'offcanvas'
                        ? 'Pilih percakapan di daftar atau tombol + untuk chat baru.'
                        : 'Pilih percakapan di kiri atau tombol + untuk chat baru.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
      </div>
  )

  return (
    <div
      className={`h-full overflow-hidden min-h-0 ${
        mobileThreadOpen ? 'p-0 sm:p-3' : 'p-0 sm:p-3'
      }`}
    >
      <motion.div
        initial={variant === 'offcanvas' ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: variant === 'offcanvas' ? 0.15 : 0.5 }}
        className={`h-full flex flex-col overflow-x-hidden overflow-hidden min-h-0 ${
          mobileThreadOpen ? 'max-md:min-h-[100dvh] max-md:max-h-[100dvh]' : ''
        }`}
      >
        {/* Offcanvas: geser kiri saat buka thread, geser kanan kembali ke daftar. Halaman: grid / mobile seperti sebelumnya. */}
        {variant === 'offcanvas' ? (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <motion.div
              className="flex h-full"
              style={{ width: '200%' }}
              initial={false}
              animate={{ x: hasSelectedRoom ? '-50%' : '0%' }}
              transition={{ type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            >
              {renderListColumn()}
              {renderThreadColumn()}
            </motion.div>
          </div>
        ) : (
          <div
            className={`flex flex-col gap-6 flex-1 min-h-0 overflow-hidden ${
              splitLayoutDesktop ? 'md:grid md:grid-cols-2 md:grid-rows-1' : ''
            }`}
          >
            {renderListColumn()}
            {renderThreadColumn()}
          </div>
        )}
      </motion.div>

      <NewChatContactOffcanvas
        open={newChatOpen || offcanvasClosing}
        closing={offcanvasClosing}
        onClose={closeOffcanvas}
        groupMode={groupMode}
        onToggleGroupMode={() => {
          setGroupMode((prev) => !prev)
          setSelectedGroupUserIds([])
          setGroupNameSheetOpen(false)
          setGroupNameInput('')
          setGroupImageFile(null)
          if (groupImagePreview) {
            try { URL.revokeObjectURL(groupImagePreview) } catch { /* ignore */ }
          }
          setGroupImagePreview(null)
        }}
        newChatSearch={newChatSearch}
        onNewChatSearchChange={setNewChatSearch}
        chatUsersLoading={chatUsersLoading}
        chatUsers={chatUsers}
        filteredUsers={newChatFilteredUsers}
        onlineUsers={onlineUsers}
        lastSeenByUserId={lastSeenByUserId}
        formatLastSeen={formatLastSeen}
        userPhotoMap={userPhotoMap}
        getInitial={getInitial}
        handleAvatarError={handleAvatarError}
        selectedGroupUserIds={selectedGroupUserIds}
        onSelectUser={selectUserForNewChat}
        groupNameSheetOpen={groupNameSheetOpen}
        onToggleGroupNameSheet={() => setGroupNameSheetOpen((prev) => !prev)}
        groupNameInput={groupNameInput}
        onGroupNameInputChange={setGroupNameInput}
        groupImageFile={groupImageFile}
        groupImagePreview={groupImagePreview}
        onGroupImageChange={handleGroupImageChange}
        creatingGroup={creatingGroup}
        onSubmitCreateGroup={submitCreateGroup}
      />

      <ForwardMessageOffcanvas
        open={forwardPickerOpen || forwardPickerClosing}
        closing={forwardPickerClosing}
        onClose={closeForwardPicker}
        conversations={conversations}
        currentConversationId={selectedConversationId}
        onSelectConversation={handleForwardToConversation}
        forwardingPreview={forwardingMessage?.preview}
      />

      {/* Offcanvas kanan: detail percakapan (z di atas thread mobile z-[85] & FAB z-[90]) */}
      {(chatDetailOpen || chatDetailClosing) && selectedContact && (
        <>
          <div
            className={`fixed inset-0 z-[100] backdrop-blur-[2px] transition-opacity duration-200 ${chatDetailClosing ? 'bg-black/0' : 'bg-black/30'}`}
            onClick={closeChatDetail}
            aria-hidden="true"
          />
          <div
            className={`fixed top-0 right-0 bottom-0 z-[101] flex w-full max-w-sm flex-col overflow-hidden rounded-l-2xl border-l border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 ${chatDetailClosing ? 'animate-[slideOutRight_0.22s_ease-in_forwards]' : 'animate-[slideInRight_0.22s_ease-out]'}`}
          >
            <style>{`
              @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
              @keyframes slideOutRight { from { transform: translateX(0); } to { transform: translateX(100%); } }
            `}</style>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5 dark:border-gray-700/80">
              <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">Detail</h2>
              <button
                type="button"
                onClick={closeChatDetail}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Tutup"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-scrollbar flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-4 pb-6 pt-6">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-2xl font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {selectedAvatar ? (
                  <img
                    src={selectedAvatar}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => {
                      if (selectedIsGroup) handleGroupPhotoError(selectedConversationId)
                      else handleAvatarError(selectedUserId)
                    }}
                  />
                ) : (
                  getInitial(detailNama)
                )}
              </div>
              {selectedIsGroup && groupCanManageMembers ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    ref={groupDetailPhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleEditGroupPhotoChange}
                  />
                  <button
                    type="button"
                    disabled={updatingGroupProfile}
                    onClick={() => groupDetailPhotoInputRef.current?.click()}
                    className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    title="Ganti foto grup"
                    aria-label="Ganti foto grup"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16l5-5a2 2 0 012.828 0l5.172 5M14 14l1-1a2 2 0 012.828 0L21 16m-9-9h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={updatingGroupProfile}
                    onClick={openEditGroupName}
                    className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    title="Edit nama grup"
                    aria-label="Edit nama grup"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L12 15l-4 1 1-4 8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              ) : null}
              {editGroupNameOpen ? (
                <div className="mt-4 w-full max-w-xs space-y-2 px-2">
                  <input
                    type="text"
                    value={editGroupNameInput}
                    onChange={(e) => setEditGroupNameInput(e.target.value)}
                    placeholder="Nama grup"
                    maxLength={120}
                    disabled={updatingGroupProfile}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEditGroupName()
                      if (e.key === 'Escape') {
                        setEditGroupNameOpen(false)
                        setEditGroupNameInput('')
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={updatingGroupProfile}
                      onClick={submitEditGroupName}
                      className="flex-1 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                    >
                      {updatingGroupProfile ? 'Menyimpan…' : 'Simpan'}
                    </button>
                    <button
                      type="button"
                      disabled={updatingGroupProfile}
                      onClick={() => {
                        setEditGroupNameOpen(false)
                        setEditGroupNameInput('')
                      }}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <h3 className="mt-4 px-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">{detailNama}</h3>
              )}
              <p className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">{detailUsername}</p>
              {selectedIsGroup && (
                <div className="mt-6 w-full max-w-xs p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Anggota Grup</p>
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                      {groupMembers.length}
                    </span>
                  </div>
                  {groupCanManageMembers && (
                    <button
                      type="button"
                      onClick={openAddMemberSheet}
                      className="mb-2 w-full rounded-lg bg-teal-600 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-teal-500"
                    >
                      {addMemberSheetOpen ? 'Tutup Tambah Anggota' : 'Tambah Anggota'}
                    </button>
                  )}
                  {addMemberSheetOpen && (
                    <div className="mb-2 rounded-lg border border-gray-200 bg-white/80 p-2 dark:border-gray-700 dark:bg-gray-800/60">
                      <input
                        type="text"
                        value={addMemberSearch}
                        onChange={(e) => setAddMemberSearch(e.target.value)}
                        placeholder="Cari user..."
                        className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                      <ul className="max-h-36 space-y-1 overflow-y-auto">
                        {(() => {
                          const q = addMemberSearch.trim().toLowerCase()
                          const memberIdSet = new Set(groupMembers.map((m) => Number(m?.user_id)).filter((id) => Number.isFinite(id) && id > 0))
                          const candidates = chatUsers.filter((u) => {
                            const uid = Number(u?.id)
                            if (!uid || memberIdSet.has(uid)) return false
                            if (!q) return true
                            return (
                              String(u?.display_name || '').toLowerCase().includes(q)
                              || String(u?.nama || '').toLowerCase().includes(q)
                              || String(u?.username || '').toLowerCase().includes(q)
                              || String(uid).includes(q)
                            )
                          })
                          if (chatUsersLoading) return <li className="py-2 text-xs text-gray-500 dark:text-gray-400">Memuat user...</li>
                          if (candidates.length === 0) return <li className="py-2 text-xs text-gray-500 dark:text-gray-400">Tidak ada kandidat anggota.</li>
                          return candidates.map((u) => {
                            const uid = Number(u.id)
                            const selected = selectedAddMemberIds.includes(uid)
                            return (
                              <li key={uid}>
                                <button
                                  type="button"
                                  onClick={() => toggleAddMember(uid)}
                                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                    selected ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200' : 'hover:bg-gray-100 dark:hover:bg-gray-700/60'
                                  }`}
                                >
                                  <span className="truncate">
                                    <NamaUsernameDisplay
                                      text={u.display_name || (u.nama && u.username ? `${u.nama} @${u.username}` : null) || u.nama || u.username || `User ${uid}`}
                                      className="truncate"
                                    />
                                  </span>
                                  {selected ? <span className="ml-2 text-[10px] font-semibold">Dipilih</span> : null}
                                </button>
                              </li>
                            )
                          })
                        })()}
                      </ul>
                      <button
                        type="button"
                        onClick={submitAddMembers}
                        disabled={addMemberSubmitting || selectedAddMemberIds.length === 0}
                        className="mt-2 w-full rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {addMemberSubmitting ? 'Menambahkan...' : `Tambah (${selectedAddMemberIds.length})`}
                      </button>
                    </div>
                  )}
                  {groupMembersLoading ? (
                    <p className="py-2 text-xs text-gray-500 dark:text-gray-400">Memuat anggota…</p>
                  ) : groupMembers.length === 0 ? (
                    <p className="py-2 text-xs text-gray-500 dark:text-gray-400">Belum ada data anggota.</p>
                  ) : (
                    <>
                      <ul className="space-y-1.5">
                        {(showAllGroupMembers ? groupMembers : groupMembers.slice(0, 7)).map((member) => {
                        const memberId = Number(member?.user_id)
                        const isOnline = onlineUsers.some((u) => String(u.user_id) === String(memberId))
                        const memberPhoto = memberId > 0 ? userPhotoMap[String(memberId)] : null
                        const memberName = String(member?.display_name || member?.nama || member?.username || `User ${memberId || ''}`).trim() || 'User'
                        const memberLastSeen = member?.last_seen_at ?? lastSeenByUserId[String(memberId)]
                        return (
                          <li key={String(memberId || memberName)} className="flex items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 dark:bg-gray-800/60">
                            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-teal-500 text-xs font-semibold text-white">
                              {memberPhoto ? (
                                <img
                                  src={memberPhoto}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  onError={() => handleAvatarError(memberId)}
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center">{getInitial(memberName)}</span>
                              )}
                              {isOnline && <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 dark:border-gray-800" aria-hidden />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                                <NamaUsernameDisplay text={memberName} className="truncate" />
                                {member?.is_self ? <span className="text-gray-500 dark:text-gray-400"> (Anda)</span> : null}
                                {member?.is_admin ? (
                                  <span className="ml-1 inline-flex align-middle text-amber-600 dark:text-amber-300" title="Admin grup" aria-label="Admin grup">
                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                                      <path d="M12 2l2.2 4.5 5 .7-3.6 3.5.8 5-4.4-2.3-4.4 2.3.8-5-3.6-3.5 5-.7L12 2z" />
                                    </svg>
                                  </span>
                                ) : null}
                              </p>
                              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                {isOnline ? 'Online' : (formatLastSeen(memberLastSeen) || '—')}
                              </p>
                            </div>
                            {groupCanManageMembers && !member?.is_self && (
                              <details className="relative shrink-0">
                                <summary className="list-none cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/60 dark:hover:text-gray-100">
                                  <span className="sr-only">Aksi anggota</span>
                                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                  </svg>
                                </summary>
                                <div className="absolute right-0 top-full z-20 mt-1 min-w-[150px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                                  <button
                                    type="button"
                                    onClick={() => toggleMemberAdmin(member)}
                                    disabled={toggleAdminSubmittingId === memberId}
                                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
                                    title={member?.is_admin ? 'Turunkan dari admin' : 'Jadikan admin'}
                                  >
                                    {toggleAdminSubmittingId === memberId ? 'Memproses...' : (member?.is_admin ? 'Turunkan admin' : 'Jadikan admin')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeMemberFromGroup(member)}
                                    disabled={removeMemberSubmittingId === memberId || Boolean(member?.is_admin)}
                                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40"
                                    title={member?.is_admin ? 'Admin tidak bisa dikeluarkan' : 'Keluarkan anggota'}
                                  >
                                    {removeMemberSubmittingId === memberId ? 'Memproses...' : 'Keluarkan'}
                                  </button>
                                </div>
                              </details>
                            )}
                          </li>
                        )
                        })}
                      </ul>
                      {groupMembers.length > 7 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllGroupMembers((v) => !v)}
                          className="mt-2 w-full text-center text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                        >
                          {showAllGroupMembers ? 'Tampilkan lebih sedikit' : 'Tampilkan lebih banyak'}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              )}
              {selectedIsGroup && (
                <GroupInviteSection conversationId={selectedConversationId} enabled={groupCanManageMembers} />
              )}
              <button
                type="button"
                onClick={openDeleteConfirmModal}
                disabled={deleteChatLoading || !selectedConversationId}
                className="mt-8 w-full max-w-xs rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
              >
                {deleteChatLoading ? 'Memproses…' : selectedIsGroup ? 'Hapus grup' : 'Hapus chat'}
              </button>
              {!selectedConversationId && (
                <p className="mt-2 text-center text-xs text-gray-400">Tunggu sampai percakapan siap untuk menghapus.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal konfirmasi hapus (di atas offcanvas detail) */}
      <SearchInChatPanel
        open={searchPanelOpen}
        onClose={() => setSearchPanelOpen(false)}
        onSearch={(q) => runSearchInRoom(q)}
        results={searchResults}
        loading={searchLoading}
        highlightId={searchHighlightId}
        onPickResult={(row) => {
          const id = Number(row?.id)
          if (id) {
            setSearchHighlightId(id)
            scrollToMessageId(id)
            setSearchPanelOpen(false)
          }
        }}
      />

      <MessageInfoOffcanvas
        open={infoMessageId != null}
        onClose={() => setInfoMessageId(null)}
        messageId={infoMessageId}
        messageCreatedAt={
          infoMessageId != null
            ? (messages.find((m) => Number(m.id) === Number(infoMessageId))?.created_at ?? null)
            : null
        }
      />

      {deleteConfirmOpen && selectedContact && (
        <>
          <div
            className="fixed inset-0 z-[110] bg-black/45 backdrop-blur-[3px] transition-opacity dark:bg-black/60"
            onClick={() => !deleteChatLoading && setDeleteConfirmOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-delete-confirm-title"
            className="fixed left-1/2 top-1/2 z-[111] w-[min(100%,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-2xl dark:border-gray-600 dark:bg-gray-800"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/60">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 id="chat-delete-confirm-title" className="text-center text-base font-semibold text-gray-900 dark:text-gray-100">
              {selectedIsGroup ? 'Keluar dari grup?' : 'Hapus percakapan?'}
            </h3>
            <p className="mt-2 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {selectedIsGroup
                ? 'Anda akan keluar dari grup ini. Grup tetap ada untuk anggota lain.'
                : 'Percakapan akan dihapus dari daftar Anda.'}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => !deleteChatLoading && setDeleteConfirmOpen(false)}
                disabled={deleteChatLoading}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={performDeleteConversation}
                disabled={deleteChatLoading}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
              >
                {deleteChatLoading ? 'Memproses…' : selectedIsGroup ? 'Keluar' : 'Hapus'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
