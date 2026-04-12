import { useState, useEffect, useRef, useCallback, useLayoutEffect, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveSocket } from '../../../contexts/LiveSocketContext'
import { useAuthStore } from '../../../store/authStore'
import { getIcon } from '../../../config/menuIcons'
import { chatUserAPI } from '../../../services/api'
import { chatDexieStore, CHAT_CACHE_TTL_MS, shouldSyncFromServer } from '../../../services/chatDexieStore'
import { prefetchChatPhotos } from '../../../services/chatPhotoPrefetchService'
import { NamaUsernameDisplay } from '../../../components/NamaUsernameDisplay'
import { useNotification } from '../../../contexts/NotificationContext'
import { useChatOffcanvas } from '../../../contexts/ChatOffcanvasContext'

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

/** Status kirim untuk bubble pesan sendiri (optimistic + ack server / socket). */
function OwnMessageSendStatus({ status }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex shrink-0 opacity-95" title="Mengirim…" aria-label="Mengirim">
        <svg className="h-3.5 w-3.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex shrink-0 text-red-200" title="Gagal mengirim" aria-label="Gagal mengirim">
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      </span>
    )
  }
  if (status === 'sent') {
    return (
      <span className="inline-flex shrink-0 opacity-95" title="Terkirim" aria-label="Terkirim">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    )
  }
  return null
}

/** Bubble satu pesan */
function MessageBubble({ msg, isOwn, isGroup, groupSenderLabel }) {
  const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''
  /** Grup: tampilkan nama hanya untuk pesan orang lain; pesan sendiri (bubble kanan) tanpa nama. */
  const showGroupLabel = Boolean(isGroup && groupSenderLabel && !isOwn)
  /** Pesan kita: pending = masih antre/menunggu ack; sent = sudah punya id server; failed = gagal kirim. */
  const ownSendStatus = isOwn
    ? (msg.failed ? 'failed' : msg.tempId != null ? 'pending' : 'sent')
    : null
  return (
    <div className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
      <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`inline-flex flex-col w-fit max-w-[85%] sm:max-w-[65%] ${
            showGroupLabel ? 'gap-0.5' : ''
          }`}
        >
          {showGroupLabel ? (
            <span
              className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 px-1 whitespace-normal break-words"
              title={groupSenderLabel}
            >
              {groupSenderLabel}
            </span>
          ) : null}
          <div
            className={`w-full rounded-lg px-3 py-2 shadow-sm ${
            isOwn
              ? 'bg-teal-500 text-white rounded-br-md'
              : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-600'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
            <p
              className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] tabular-nums ${
                isOwn ? 'text-teal-100' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <span>{time}</span>
              {ownSendStatus ? <OwnMessageSendStatus status={ownSendStatus} /> : null}
            </p>
          </div>
        </div>
      </div>
    </div>
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

export default function Chat({ variant = 'page', onRequestClose } = {}) {
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
  const [chatDetailOpen, setChatDetailOpen] = useState(false)
  const [chatDetailClosing, setChatDetailClosing] = useState(false)
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
  const [peerTyping, setPeerTyping] = useState(false) // lawan sedang mengetik (realtime)
  const typingTimeoutRef = useRef(null) // clear saat stop mengetik
  const messagesContainerRef = useRef(null)
  const messageTextareaRef = useRef(null)
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
  // Hanya untuk cek "sudah login"; jangan dipakai untuk chat/socket (bisa pengurus.id). Pakai myUsersId (users.id dari API).
  const myId = user?.id ? Number(user.id) : null

  const resolvePhotoUrl = useCallback((rawPath) => {
    const raw = String(rawPath || '').trim()
    if (!raw) return null
    if (/^https?:\/\//i.test(raw)) return raw
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
        setConversations((prev) => (prev.length > 0 ? prev : cachedConversations))
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
  }, [myUsersId, hydrateUserPhotoBlob])

  // Mode 2 kotak dari md (768px) ke atas; di bawah itu = satu panel (list atau chat)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
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
      }))
      return { ...prev, [key]: normalized }
    })
  }, [myUsersId])

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
    setChatDetailClosing(true)
    window.setTimeout(() => {
      setChatDetailOpen(false)
      setChatDetailClosing(false)
    }, 220)
  }, [])

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
        const res = await chatUserAPI.getConversations().catch(() => null)
        if (cancelled) return
        if (res?.success && Array.isArray(res.data)) {
          const oid = res?.my_user_id != null ? Number(res.my_user_id) : null
          if (oid) setMyUsersId(oid)
          setConversations(res.data)
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
      if (variant !== 'offcanvas' && !shouldSyncFromServer(meta, CHAT_CACHE_TTL_MS.CONVERSATIONS)) {
        const cached = await chatDexieStore.getConversations(ownerUsersId)
        if (cancelled) return
        if (cached.length > 0) {
          setConversations(cached)
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
      const res = await chatUserAPI.getConversations().catch(() => null)
      if (cancelled) return
      if (res?.success && Array.isArray(res.data)) {
        const oid = res?.my_user_id != null ? Number(res.my_user_id) : ownerUsersId
        if (res?.my_user_id != null) setMyUsersId(oid)
        setConversations(res.data)
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
      const skipNetwork =
        variant !== 'offcanvas' &&
        ownerUsersId &&
        cached.length > 0 &&
        !shouldSyncFromServer(msgMeta, CHAT_CACHE_TTL_MS.MESSAGES)
      if (cached.length > 0) applyCached(cached, myUid)
      if (skipNetwork) {
        setHistoryLoading(false)
        setFirstUnreadBannerMessageId(null)
        setPendingInitialScroll('bottom')
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
        return
      }

      setHistoryLoading(true)
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
        const r = await chatUserAPI.getConversations().catch(() => null)
        if (r?.success && Array.isArray(r.data)) {
          setConversations(r.data)
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
        setConversations((prev) =>
          prev.map((c) => (Number(c.conversation_id) === convId ? { ...c, unread_count: 0 } : c))
        )
      }
      setHistoryLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [myId, myUsersId, selectedConversationId, selectedUserId, variant])

  const meId = myUsersId ?? myId
  // Daftar dari API (conversation_id, peer_id, peer_name, last_message, last_at, unread_count, is_self); merge last message dari state
  const conversationList = (() => {
    const byConv = new Map()
    conversations.forEach((c) => {
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
        item.last_message = last.message
        item.last_at = last.created_at || last.tanggal_dibuat
      }
    })
    conversations.forEach((c) => {
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
      (selectedUserId ? { peer_id: selectedUserId, peer_name: userNamesMap[selectedUserId] ?? `User ${selectedUserId}`, is_self: Number(selectedUserId) === Number(meId) } : null)
    : null
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
      }).then((res) => {
        const inflight = outboxInflightRef.current || outboxQueueRef.current[0]
        if (!inflight) return
        outboxInflightRef.current = null
        if (res?.success && res?.id != null) {
          outboxQueueRef.current.shift()
          patchTempMessage(inflight.tempId, (old) => ({
            ...old,
            id: res.id,
            created_at: res.created_at || old.created_at,
            sender_username: res.sender_username ?? old.sender_username,
            sender_display_name: res.sender_display_name ?? old.sender_display_name,
            tempId: undefined,
            pending: false,
            failed: false,
          }))
          flushOutbox()
          return
        }
        patchTempMessage(inflight.tempId, (old) => ({ ...old, pending: true, failed: true }))
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
        patchTempMessage(inflight.tempId, (old) => ({ ...old, pending: true, failed: true }))
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
  }, [socket, patchTempMessage])

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
  ])

  useEffect(() => {
    if (!socket) return
    const onReceive = (payload) => {
      const senderId = Number(payload.sender_id ?? payload.from_user_id)
      const convId = payload.conversation_id != null ? Number(payload.conversation_id) : null
      const isIncoming = myUsersId != null && senderId !== myUsersId
      const isOwn = myUsersId != null && senderId === myUsersId
      let merged = { ...payload, sender_id: senderId, created_at: payload.created_at, isOwn }
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
          const appended = [...list, merged]
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
            if (merged.message) {
              next.last_message = merged.message
              next.last_at = merged.created_at || next.last_at
            }
            if (isIncoming) {
              next.unread_count = isActiveRoom ? 0 : (c.unread_count ?? 0) + 1
            }
            return next
          })
        })
      }

      if (convId != null && isIncoming && !conversationIdsRef.current.includes(convId)) {
        chatUserAPI.getConversations().then((r) => {
          if (r?.success && Array.isArray(r.data)) {
            setConversations(r.data)
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
        patchTempMessage(inflight.tempId, (old) => ({
          ...old,
          id: payload.id,
          created_at: payload.created_at || old.created_at,
          tempId: undefined,
          pending: false,
          failed: false,
        }))
        flushOutbox()
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
          failed: true,
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
  }, [socket, selectedUserId, myUsersId, messageKey, patchTempMessage, flushOutbox])

  useEffect(() => {
    setSendError(null)
    setPeerTyping(false)
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
    if (!socket?.connected || !myUsersId || !selectedUserId) return
    socket.emit('typing_start', {
      from_user_id: myUsersId,
      to_user_id: Number(selectedUserId),
      from_name: user?.nama || user?.username || 'User',
    })
  }
  const emitTypingStop = () => {
    if (!socket?.connected || !myUsersId || !selectedUserId) return
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

  const sendMessage = () => {
    const text = inputText.trim()
    if (!text || !socket) return
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
        created_at: new Date().toISOString(),
        isOwn: true,
        pending: true,
        failed: false,
        ...groupSenderMeta,
      }],
    }))
    setInputText('')
    emitTypingStop()
    outboxQueueRef.current.push({
      tempId,
      key,
      conversation_id: selectedConversationId,
      from_user_id: fromUsersId,
      to_user_id: toUsersId,
      message: text,
    })
    flushOutbox()
  }

  useEffect(() => {
    if (socket?.connected) flushOutbox()
  }, [socket?.connected, flushOutbox])

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
    setChatUsersLoading(true)
    chatUserAPI
      .getUsers()
      .then((res) => {
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
      })
      .catch(() => { setChatUsers([]); setLastSeenByUserId({}) })
      .finally(() => setChatUsersLoading(false))
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
      chatUserAPI.getConversations().then((r) => {
        if (r?.success && Array.isArray(r.data)) {
          setConversations(r.data)
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
      : `col-span-1 h-full min-h-0 overflow-hidden flex flex-col ${!splitLayoutDesktop && hasSelectedRoom ? 'hidden' : ''} ${splitLayoutDesktop ? '!flex' : 'md:!flex'}`

  const threadColumnClass =
    variant === 'offcanvas'
      ? 'box-border flex h-full min-h-0 w-1/2 min-w-0 shrink-0 flex-col overflow-hidden pl-1'
      : `col-span-1 min-h-0 overflow-hidden flex flex-col ${!splitLayoutDesktop && !hasSelectedRoom ? 'hidden' : ''} ${splitLayoutDesktop ? '!flex md:h-full' : 'md:!flex md:h-full'} ${
          mobileThreadOpen
            ? 'fixed inset-0 z-[85] h-[100dvh] max-h-[100dvh] w-full flex flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] md:static md:z-auto md:h-full md:max-h-none md:w-auto md:p-0 md:pt-0 md:pb-0'
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
                <button
                  type="button"
                  onClick={openNewChatOffcanvas}
                  className={`${variant === 'offcanvas' ? 'inline-flex' : 'hidden md:inline-flex'} shrink-0 p-2 rounded-full hover:bg-teal-500 text-white`}
                  title="Tambah chat baru"
                  aria-label="Tambah chat baru"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden chat-scrollbar">
                {conversationsLoading ? (
                  <div className="px-2 py-4 md:p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat percakapan...</div>
                ) : conversationList.length === 0 ? (
                  <div className="px-2 py-4 md:p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Belum ada percakapan. Gunakan tombol + untuk mulai chat.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {conversationList.map((c) => {
                      const isGroup = c.peer_id == null
                      const avatarSrc = isGroup
                        ? groupPhotoMap[String(c.conversation_id)]
                        : userPhotoMap[String(c.peer_id)]
                      return (
                      <li key={c.conversation_id}>
                        <button
                          type="button"
                          onClick={() => openRoom(c.conversation_id, c.peer_id != null ? String(c.peer_id) : null)}
                          className={`w-full flex items-center gap-3 px-2 md:px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
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
                      </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              {!isDesktop && variant !== 'offcanvas' && (
                <div className="pointer-events-none fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[90]">
                  <button
                    type="button"
                    onClick={openNewChatOffcanvas}
                    className="pointer-events-auto w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-white hover:from-teal-400 hover:to-teal-600 shadow-[0_14px_30px_rgba(13,148,136,0.45)] ring-1 ring-white/50 dark:ring-teal-300/20 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 animate-[floatChatFab_2.8s_ease-in-out_infinite]"
                    aria-label="Tambah chat baru"
                    title="Chat baru"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <style>{`
                    @keyframes floatChatFab {
                      0%, 100% { transform: translateY(0); }
                      50% { transform: translateY(-4px); }
                    }
                  `}</style>
                </div>
              )}
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
                          {peerTyping ? (
                            <span className="italic">Mengetik...</span>
                          ) : selectedIsGroup ? (
                            <span>Grup</span>
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
                          <MessageBubble
                            msg={msg}
                            isOwn={Boolean(msg.isOwn || msg.is_own) || (myUsersId != null && Number(msg.sender_id ?? msg.from_user_id) === myUsersId)}
                            isGroup={roomIsGroup}
                            groupSenderLabel={roomIsGroup ? getGroupMessageLabel(msg) : ''}
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
                  <div className="shrink-0 z-20 p-2 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2 items-end min-w-0 w-full max-w-full overflow-x-hidden">
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
                        placeholder="Ketik pesan…"
                        style={{ maxHeight: composerMaxPx }}
                        className="flex-1 min-w-0 max-w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2.5 text-sm leading-snug focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none overflow-y-auto"
                        aria-label="Isi pesan"
                      />
                      <button
                        type="button"
                        onClick={sendMessage}
                        disabled={!myUsersId || !selectedUserId || !inputText.trim()}
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
        initial={{ opacity: 0, y: variant === 'offcanvas' ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: variant === 'offcanvas' ? 0.2 : 0.5 }}
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
          <div className="flex flex-col md:grid md:grid-cols-2 md:grid-rows-1 gap-6 flex-1 min-h-0 overflow-hidden">
            {renderListColumn()}
            {renderThreadColumn()}
          </div>
        )}
      </motion.div>

      {/* Offcanvas kanan: pilih user untuk chat baru — z di atas bottom nav (z-[100]) agar konten bawah tidak tertutup */}
      {(newChatOpen || offcanvasClosing) && (
        <>
          <div
            className={`fixed inset-0 z-[102] backdrop-blur-[2px] transition-opacity duration-200 ${offcanvasClosing ? 'bg-black/0' : 'bg-black/30'}`}
            onClick={closeOffcanvas}
            aria-hidden="true"
          />
          <div
            className={`fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl z-[103] flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700 overflow-hidden ${offcanvasClosing ? 'animate-[slideOutRight_0.22s_ease-in_forwards]' : 'animate-[slideInRight_0.22s_ease-out]'}`}
          >
            <style>{`
              @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
              @keyframes slideOutRight { from { transform: translateX(0); } to { transform: translateX(100%); } }
            `}</style>
            <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/80">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Pilih kontak</h2>
              <button
                type="button"
                onClick={closeOffcanvas}
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
                onClick={() => {
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
                  onChange={(e) => setNewChatSearch(e.target.value)}
                  placeholder="Cari kontak..."
                  className="w-full rounded-xl border-0 bg-gray-100 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 pl-8 pr-3 py-1.5 text-xs placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500/50 focus:bg-white dark:focus:bg-gray-700 transition-colors"
                  aria-label="Cari kontak"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 chat-scrollbar">
              {chatUsersLoading ? (
                <div className="py-6 text-center text-gray-400 dark:text-gray-500 text-xs">Memuat...</div>
              ) : (() => {
                const q = newChatSearch.trim().toLowerCase()
                const filtered = q
                  ? chatUsers.filter(
                      (u) =>
                        (u.display_name && String(u.display_name).toLowerCase().includes(q)) ||
                        (u.username && String(u.username).toLowerCase().includes(q)) ||
                        (u.nama && String(u.nama).toLowerCase().includes(q)) ||
                        String(u.id).toLowerCase().includes(q)
                    )
                  : chatUsers
                if (filtered.length === 0) {
                  return (
                    <div className="py-6 px-3 text-center text-gray-400 dark:text-gray-500 text-xs">
                      {chatUsers.length === 0 ? 'Tidak ada user.' : 'Tidak ada hasil.'}
                    </div>
                  )
                }
                return (
                <ul className="py-1">
                  {filtered.map((u) => {
                    const isOnline = onlineUsers.some((o) => String(o.user_id) === String(u.id))
                    const lastSeen = u.last_seen_at ?? lastSeenByUserId[String(u.id)]
                    const lastSeenLabel = isOnline ? 'Online' : (formatLastSeen(lastSeen) ? formatLastSeen(lastSeen) : '—')
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => selectUserForNewChat(u.id)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg mx-1 hover:bg-gray-50 dark:hover:bg-gray-700/60 active:bg-gray-100 dark:active:bg-gray-700 transition-colors ${
                            groupMode && selectedGroupUserIds.includes(Number(u.id))
                              ? 'bg-teal-50 dark:bg-teal-900/20'
                              : ''
                          }`}
                        >
                          <div className="relative w-8 h-8 shrink-0" style={{ perspective: 800 }}>
                            <motion.div
                              className="relative w-full h-full"
                              style={{ transformStyle: 'preserve-3d' }}
                              animate={{ rotateY: groupMode && selectedGroupUserIds.includes(Number(u.id)) ? 180 : 0 }}
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
                            {isOnline && !(groupMode && selectedGroupUserIds.includes(Number(u.id))) && (
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
                )
              })()}
            </div>
            {groupMode && (
              <div className="shrink-0 border-t border-gray-100 dark:border-gray-700/80 px-2.5 py-2">
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
                          onChange={(e) => setGroupNameInput(e.target.value)}
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
                          <input type="file" accept="image/*" className="hidden" onChange={handleGroupImageChange} />
                        </label>
                        {groupImagePreview && (
                          <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                            <img src={groupImagePreview} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={submitCreateGroup}
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
                  onClick={() => setGroupNameSheetOpen((prev) => !prev)}
                  disabled={selectedGroupUserIds.length === 0}
                  className="w-full rounded-xl py-2.5 px-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {groupNameSheetOpen ? 'Tutup Form Grup' : `OK (${selectedGroupUserIds.length})`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

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
              <h3 className="mt-4 px-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">{detailNama}</h3>
              <p className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">{detailUsername}</p>
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
