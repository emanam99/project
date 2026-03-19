import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLiveSocket } from '../../../contexts/LiveSocketContext'
import { useAuthStore } from '../../../store/authStore'
import { getIcon } from '../../../config/menuIcons'
import { chatUserAPI } from '../../../services/api'
import { NamaUsernameDisplay } from '../../../components/NamaUsernameDisplay'

function convKey(a, b) {
  const x = Number(a)
  const y = Number(b)
  return x <= y ? `${x}_${y}` : `${y}_${x}`
}

/** Bubble satu pesan */
function MessageBubble({ msg, isOwn }) {
  const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[65%] rounded-lg px-3 py-2 shadow-sm ${
          isOwn
            ? 'bg-teal-500 text-white rounded-br-md'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-600'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
        <p className={`text-[10px] mt-1 ${isOwn ? 'text-teal-100' : 'text-gray-500 dark:text-gray-400'}`}>{time}</p>
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

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { socket, onlineUsers, isConnected } = useLiveSocket()
  const user = useAuthStore((s) => s.user)
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(null) // peer_id (untuk private) untuk nama header & typing
  const [messagesByKey, setMessagesByKey] = useState({}) // key = conversation_id (string) atau 'peer_'+peerId
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [newChatOpen, setNewChatOpen] = useState(() => searchParams.get('new') === '1')
  const [offcanvasClosing, setOffcanvasClosing] = useState(false)
  const [chatUsers, setChatUsers] = useState([])
  const [chatUsersLoading, setChatUsersLoading] = useState(false)
  const [lastSeenByUserId, setLastSeenByUserId] = useState({}) // users.id -> last_seen_at (dari GET chat/users)
  const [newChatSearch, setNewChatSearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false) // loading riwayat dari DB saat buka chat
  const [userNamesMap, setUserNamesMap] = useState({}) // users.id -> username (lawan) dari API
  const [myUsersId, setMyUsersId] = useState(null) // users.id yang login (dari API); untuk isOwn & key percakapan
  const [peerTyping, setPeerTyping] = useState(false) // lawan sedang mengetik (realtime)
  const typingTimeoutRef = useRef(null) // clear saat stop mengetik
  const messagesContainerRef = useRef(null)
  const messageTextareaRef = useRef(null)
  /** Tinggi maks area ketik = 50% viewport (HP & PC) */
  const [composerMaxPx, setComposerMaxPx] = useState(() =>
    typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.5) : 200
  )
  const conversationIdsRef = useRef([]) // ID conversation yang ada di list (untuk cek "chat baru" realtime)
  // Hanya untuk cek "sudah login"; jangan dipakai untuk chat/socket (bisa pengurus.id). Pakai myUsersId (users.id dari API).
  const myId = user?.id ? Number(user.id) : null

  useEffect(() => {
    conversationIdsRef.current = conversations.map((c) => Number(c.conversation_id))
  }, [conversations])

  // Muat daftar kontak + last_seen sekali (untuk tampilan "Terakhir online" di header & offcanvas)
  useEffect(() => {
    if (!myUsersId) return
    chatUserAPI
      .getUsers()
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          const byId = {}
          res.data.forEach((u) => {
            if (u.id != null && u.last_seen_at !== undefined) byId[String(u.id)] = u.last_seen_at
          })
          setLastSeenByUserId((prev) => ({ ...prev, ...byId }))
        }
      })
      .catch(() => {})
  }, [myUsersId])

  // Mode 2 kotak dari md (768px) ke atas; di bawah itu = satu panel (list atau chat)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  // Update URL ketika user memilih room. Pakai push (bukan replace) agar di HP tombol Back = kembali ke list chat.
  const openRoom = (conversationId, peerId) => {
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
    setSelectedConversationId(null)
    setSelectedUserId(null)
    setSearchParams({}, { replace: true })
  }

  // Fetch percakapan (user yang pernah chat)
  useEffect(() => {
    if (!myId) return
    setConversationsLoading(true)
    chatUserAPI
      .getConversations()
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          if (res?.my_user_id != null) setMyUsersId(Number(res.my_user_id))
          setConversations(res.data)
          setUserNamesMap((prev) => {
            const next = { ...prev }
            res.data.forEach((c) => {
              const id = Number(c.peer_id ?? c.user_id)
              if (id && (c.peer_name ?? c.name ?? c.nama)) next[id] = c.peer_name ?? c.name ?? c.nama
            })
            return next
          })
        }
      })
      .catch(() => setConversations([]))
      .finally(() => setConversationsLoading(false))
  }, [myId])

  // Muat daftar user (users.id, username) untuk header/nama lawan
  useEffect(() => {
    if (!myId) return
    chatUserAPI
      .getUsers()
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          const map = {}
          res.data.forEach((u) => {
            const id = Number(u.id)
            const displayName = u.display_name ?? (u.nama && u.username ? `${u.nama} @${u.username}` : null) ?? u.nama ?? u.username ?? `User ${id}`
            if (id) map[id] = displayName
          })
          setUserNamesMap((prev) => ({ ...prev, ...map }))
        }
      })
      .catch(() => {})
  }, [myId])

  // Buka satu chat: load riwayat. conversation_id dari list; atau peer_id dari "chat baru" (API mengembalikan conversation_id).
  useEffect(() => {
    const hasConv = selectedConversationId != null && selectedConversationId > 0
    const peerId = selectedUserId != null ? Number(selectedUserId) : 0
    const hasPeer = peerId > 0
    if (!myId || (!hasConv && !hasPeer)) return
    setHistoryLoading(true)
    const params = hasConv ? { conversation_id: selectedConversationId, limit: 20 } : { peer_id: peerId, limit: 20 }
    chatUserAPI
      .getMessages(params)
      .then((res) => {
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
          chatUserAPI.getConversations().then((r) => { if (r?.success && Array.isArray(r.data)) setConversations(r.data) })
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
        const list = Array.isArray(res?.data) ? res.data : []
        const myUid = res?.my_user_id != null ? Number(res.my_user_id) : null
        const key = convId != null ? String(convId) : (hasPeer ? `peer_${peerId}` : '')
        const normalized = list.map((m) => ({
          ...m,
          created_at: m.created_at ?? m.tanggal_dibuat,
          isOwn: myUid != null ? Number(m.sender_id ?? m.from_user_id) === myUid : Boolean(m.is_own),
        }))
        setMessagesByKey((prev) => ({ ...prev, [key]: normalized }))
      })
      .catch(() => {
        const key = selectedConversationId ? String(selectedConversationId) : (hasPeer ? `peer_${peerId}` : '')
        setMessagesByKey((prev) => ({ ...prev, [key]: prev[key] || [] }))
      })
      .finally(() => setHistoryLoading(false))
  }, [myId, myUsersId, selectedConversationId, selectedUserId])

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

  const messageKey = selectedConversationId ? String(selectedConversationId) : (selectedUserId ? `peer_${selectedUserId}` : '')
  const messages = messageKey ? (messagesByKey[messageKey] || []) : []

  useEffect(() => {
    if (!socket) return
    const onReceive = (payload) => {
      const key = payload.conversation_id != null ? String(payload.conversation_id) : convKey(payload.from_user_id, payload.to_user_id)
      const senderId = Number(payload.sender_id ?? payload.from_user_id)
      const convId = payload.conversation_id != null ? Number(payload.conversation_id) : null
      const isIncoming = myUsersId != null && senderId !== myUsersId
      setMessagesByKey((prev) => {
        const list = prev[key] || []
        if (list.some((m) => m.id === payload.id)) return prev
        const isOwn = myUsersId != null && senderId === myUsersId
        return { ...prev, [key]: [...list, { ...payload, sender_id: senderId, created_at: payload.created_at, isOwn }] }
      })
      if (convId != null && isIncoming && !conversationIdsRef.current.includes(convId)) {
        chatUserAPI.getConversations().then((r) => {
          if (r?.success && Array.isArray(r.data)) setConversations(r.data)
        })
      }
    }
    const onResult = (payload) => {
      setSending(false)
      const key = payload.conversation_id != null ? String(payload.conversation_id) : (selectedUserId && myUsersId ? convKey(myUsersId, Number(selectedUserId)) : messageKey)
      if (payload.success && payload.id != null && key) {
        setMessagesByKey((prev) => {
          const list = prev[key] || []
          const idx = list.findIndex((m) => m.tempId != null)
          if (idx === -1) return prev
          const copy = [...list]
          copy[idx] = { ...copy[idx], id: payload.id, created_at: payload.created_at, tempId: undefined }
          return { ...prev, [key]: copy }
        })
      } else if (!payload.success) {
        setSendError(payload.reason === 'user_offline' ? 'User sedang offline' : payload.reason || 'Gagal mengirim')
      }
    }
    socket.on('receive_message', onReceive)
    socket.on('send_message_result', onResult)
    return () => {
      socket.off('receive_message', onReceive)
      socket.off('send_message_result', onResult)
    }
  }, [socket, selectedUserId, myUsersId, messageKey])

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

  // Scroll area pesan ke bawah hanya di dalam container (tanpa scrollIntoView agar dokumen tidak tergeser)
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [messages, selectedUserId])

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
    setSending(true)
    const tempId = Date.now()
    const key = messageKey
    setMessagesByKey((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), { id: tempId, tempId, conversation_id: selectedConversationId, sender_id: fromUsersId, from_user_id: fromUsersId, to_user_id: toUsersId, message: text, created_at: new Date().toISOString(), isOwn: true }],
    }))
    setInputText('')
    emitTypingStop()
    socket.emit('send_message', { from_user_id: fromUsersId, to_user_id: toUsersId, message: text })
  }

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
      setOffcanvasClosing(false)
    }, OFFCANVAS_CLOSE_MS)
  }, [setSearchParams])

  const openNewChatOffcanvas = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('new', '1')
      return next
    }, { replace: false })
    setNewChatOpen(true)
    setChatUsersLoading(true)
    chatUserAPI
      .getUsers()
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setChatUsers(res.data)
          const byId = {}
          res.data.forEach((u) => {
            if (u.id != null && u.last_seen_at !== undefined) byId[String(u.id)] = u.last_seen_at
          })
          setLastSeenByUserId(byId)
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
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('new')
      return next
    }, { replace: true })
    setNewChatOpen(false)
    setNewChatSearch('')
    openRoom(null, String(peerId))
  }

  if (!myId) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-gray-500 dark:text-gray-400">
        Silakan login untuk menggunakan Chat.
      </div>
    )
  }

  const mobileThreadOpen = !isDesktop && Boolean(selectedUserId)

  return (
    <div
      className={`h-full overflow-hidden min-h-0 ${
        mobileThreadOpen ? 'p-0 sm:p-3' : 'p-2 sm:p-3'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`h-full flex flex-col overflow-x-hidden overflow-hidden min-h-0 ${
          mobileThreadOpen ? 'max-md:min-h-[100dvh] max-md:max-h-[100dvh]' : ''
        }`}
      >
        {/* Layout 2 kotak seperti UWABA: kiri = list, kanan = chat. PC = selalu 2 kolom; mobile = pilih buka kanan */}
        <div className="flex flex-col md:grid md:grid-cols-2 md:grid-rows-1 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Kotak kiri: Daftar percakapan. Dari md (768px) ke atas selalu tampil; mobile sembunyikan saat chat terbuka */}
          <div
            className={`col-span-1 h-full min-h-0 overflow-hidden flex flex-col ${!isDesktop && selectedUserId ? 'hidden' : ''} md:!flex`}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-full flex flex-col overflow-hidden min-h-0">
              <div className="shrink-0 px-4 py-3 bg-teal-600 text-white flex items-center justify-between gap-2 rounded-t-lg">
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold">Chat</h1>
                  <p className="text-xs text-teal-100 mt-0.5">
                    {isConnected ? 'Terhubung' : 'Menghubungkan...'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewChatOffcanvas}
                  className="shrink-0 p-2 rounded-full hover:bg-teal-500 text-white"
                  title="Tambah chat baru"
                  aria-label="Tambah chat baru"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden chat-scrollbar">
                {conversationsLoading ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat percakapan...</div>
                ) : conversationList.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Belum ada percakapan. Gunakan tombol + untuk mulai chat.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {conversationList.map((c) => (
                      <li key={c.conversation_id}>
                        <button
                          type="button"
                          onClick={() => openRoom(c.conversation_id, c.peer_id != null ? String(c.peer_id) : null)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                            selectedConversationId === c.conversation_id || (c.peer_id != null && selectedUserId === String(c.peer_id)) ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                          }`}
                        >
                          <div className="relative w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white shrink-0">
                            {(c.peer_name || '?').charAt(0).toUpperCase()}
                            {c.unread_count > 0 && (
                              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center px-1">
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
                    ))}
                  </ul>
                )}
              </div>
              {/* Tombol tambah chat (mobile: pojok bawah) */}
              {!isDesktop && (
                <div className="shrink-0 p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                  <button
                    type="button"
                    onClick={openNewChatOffcanvas}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-teal-600 text-white hover:bg-teal-500 shadow"
                    aria-label="Tambah chat baru"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm font-medium">Chat baru</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Kotak kanan: Area chat. Dari md (768px) ke atas selalu tampil; mobile tampil saat ada pilihan */}
          <div
            className={`col-span-1 min-h-0 overflow-hidden flex flex-col ${!isDesktop && !selectedUserId ? 'hidden' : ''} md:!flex md:h-full ${
              mobileThreadOpen
                ? 'fixed inset-0 z-[85] h-[100dvh] max-h-[100dvh] w-full flex flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] md:static md:z-auto md:h-full md:max-h-none md:w-auto md:p-0 md:pt-0 md:pb-0'
                : 'h-full'
            }`}
            style={{ minHeight: 0 }}
          >
            <div
              className={`bg-white dark:bg-gray-800 shadow-md h-full min-h-0 flex flex-col overflow-hidden ${
                mobileThreadOpen ? 'rounded-none md:rounded-lg' : 'rounded-lg'
              }`}
            >
              {selectedContact ? (
                <>
                  <div className="shrink-0 z-20 flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-teal-600 text-white border-b border-teal-700/30 md:rounded-t-lg rounded-none shadow-sm">
                    {!isDesktop && (
                      <button
                        type="button"
                        onClick={closeRoom}
                        className="p-2 -ml-1 rounded-full hover:bg-teal-500"
                        aria-label="Kembali"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center shrink-0">
                      {getPartnerDisplayName(selectedUserId, selectedContact?.peer_name || selectedContact?.nama).charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        <NamaUsernameDisplay
                          text={getPartnerDisplayName(selectedUserId, selectedContact?.peer_name || selectedContact?.nama)}
                          className="truncate inline text-white"
                          variant="onBrand"
                        />
                        {selectedContact?.is_self && <span className="text-teal-100 font-normal"> (Anda)</span>}
                      </p>
                      <p className="text-xs text-teal-100 flex items-center gap-1.5">
                        {peerTyping ? (
                          <span className="italic">Mengetik...</span>
                        ) : onlineUsers.some((u) => String(u.user_id) === String(selectedUserId)) ? (
                          <>
                            <span className="inline-block w-2 h-2 rounded-full bg-green-300 animate-pulse" aria-hidden />
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
                  </div>

                  <div
                    ref={messagesContainerRef}
                    className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-2 bg-[#e5ddd5] dark:bg-gray-900/50 chat-scrollbar overscroll-contain"
                  >
                    {historyLoading ? (
                      <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">Memuat riwayat...</p>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">Belum ada pesan. Mulai obrolan.</p>
                    ) : null}
                    {messages.map((msg, i) => (
                      <MessageBubble
                        key={msg.tempId != null ? `temp-${msg.tempId}` : msg.id != null ? `id-${msg.id}` : `m-${i}`}
                        msg={msg}
                        isOwn={Boolean(msg.isOwn || msg.is_own) || (myUsersId != null && Number(msg.sender_id ?? msg.from_user_id) === myUsersId)}
                      />
                    ))}
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
                        disabled={sending}
                        aria-label="Isi pesan"
                      />
                      <button
                        type="button"
                        onClick={sendMessage}
                        disabled={!myUsersId || !selectedUserId || !inputText.trim() || sending}
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
                    <p className="text-sm">Pilih percakapan di kiri atau tombol + untuk chat baru.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Offcanvas kanan: pilih user untuk chat baru — compact & modern, state di URL ?new=1 */}
      {(newChatOpen || offcanvasClosing) && (
        <>
          <div
            className={`fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity duration-200 ${offcanvasClosing ? 'bg-black/0' : 'bg-black/30'}`}
            onClick={closeOffcanvas}
            aria-hidden="true"
          />
          <div
            className={`fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col rounded-l-2xl border-l border-gray-200 dark:border-gray-700 overflow-hidden ${offcanvasClosing ? 'animate-[slideOutRight_0.22s_ease-in_forwards]' : 'animate-[slideInRight_0.22s_ease-out]'}`}
          >
            <style>{`
              @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
              @keyframes slideOutRight { from { transform: translateX(0); } to { transform: translateX(100%); } }
              .chat-scrollbar::-webkit-scrollbar { width: 6px; }
              .chat-scrollbar::-webkit-scrollbar-track { background: transparent; border-radius: 3px; }
              .chat-scrollbar::-webkit-scrollbar-thumb { background: rgba(20, 184, 166, 0.35); border-radius: 3px; }
              .chat-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(20, 184, 166, 0.5); }
              .dark .chat-scrollbar::-webkit-scrollbar-thumb { background: rgba(75, 85, 99, 0.6); }
              .dark .chat-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(75, 85, 99, 0.8); }
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
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-lg mx-1 hover:bg-gray-50 dark:hover:bg-gray-700/60 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                        >
                          <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white text-xs font-medium shrink-0 shadow-sm">
                            {(u.display_name || u.nama || u.username || '?').charAt(0).toUpperCase()}
                            {isOnline && (
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
          </div>
        </>
      )}
    </div>
  )
}
