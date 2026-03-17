import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useLiveSocket } from '../../../contexts/LiveSocketContext'
import { useAuthStore } from '../../../store/authStore'
import { getIcon } from '../../../config/menuIcons'
import { chatUserAPI } from '../../../services/api'

/** Key untuk menyimpan messages: "from_to" dengan id kecil dulu */
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

export default function Chat() {
  const { socket, onlineUsers, isConnected } = useLiveSocket()
  const user = useAuthStore((s) => s.user)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [messagesByKey, setMessagesByKey] = useState({})
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(true)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [chatUsers, setChatUsers] = useState([])
  const [chatUsersLoading, setChatUsersLoading] = useState(false)
  const [newChatSearch, setNewChatSearch] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false) // loading riwayat dari DB saat buka chat
  const [userNamesMap, setUserNamesMap] = useState({}) // users.id -> username (lawan) dari API
  const [myUsersId, setMyUsersId] = useState(null) // users.id yang login (dari API); untuk isOwn & key percakapan
  const [peerTyping, setPeerTyping] = useState(false) // lawan sedang mengetik (realtime)
  const typingTimeoutRef = useRef(null) // clear saat stop mengetik
  const messagesContainerRef = useRef(null)
  const myId = user?.id ? Number(user.id) : null

  // Mode 2 kotak dari md (768px) ke atas; di bawah itu = satu panel (list atau chat)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
              if (id && (c.peer_name || c.nama)) next[id] = c.peer_name || c.nama
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
            const nama = u.nama ?? u.username ?? `User ${id}`
            if (id) map[id] = nama
          })
          setUserNamesMap((prev) => ({ ...prev, ...map }))
        }
      })
      .catch(() => {})
  }, [myId])

  // Saat buka satu chat, load riwayat dari DB. Key percakapan = (my_user_id, peer_user_id).
  useEffect(() => {
    const peerId = selectedUserId != null ? Number(selectedUserId) : 0
    if (!myId || !selectedUserId || peerId < 1) return
    setHistoryLoading(true)
    chatUserAPI
      .getMessages(selectedUserId, { limit: 20 })
      .then((res) => {
        if (res?.my_user_id != null) setMyUsersId(Number(res.my_user_id))
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
        const key = myUid != null ? convKey(myUid, peerId) : convKey(myId, peerId)
        const normalized = list.map((m) => ({
          ...m,
          isOwn: myUid != null ? Number(m.from_user_id) === myUid : (m.is_own === true),
        }))
        setMessagesByKey((prev) => ({ ...prev, [key]: normalized }))
      })
      .catch(() => {
        const key = myUsersId != null ? convKey(myUsersId, peerId) : convKey(myId, peerId)
        setMessagesByKey((prev) => ({ ...prev, [key]: prev[key] || [] }))
      })
      .finally(() => setHistoryLoading(false))
  }, [myId, myUsersId, selectedUserId])

  // Daftar chat: hanya percakapan yang melibatkan saya (from/to = my user). Nama = lawan (users.username).
  const meId = myUsersId ?? myId
  const conversationList = (() => {
    const byPeer = new Map()
    conversations.forEach((c) => {
      const pid = Number(c.peer_id)
      if (pid === meId) return
      byPeer.set(pid, {
        peer_id: pid,
        peer_name: c.peer_name || `User ${pid}`,
        last_message: c.last_message,
        last_at: c.last_at,
        isOnline: false,
      })
    })
    Object.keys(messagesByKey).forEach((key) => {
      const [a, b] = key.split('_').map(Number)
      const peer = a === meId ? b : a
      if (peer === meId) return
      const list = messagesByKey[key] || []
      const last = list[list.length - 1]
      if (last) {
        const existing = byPeer.get(peer)
        if (!existing || new Date(last.created_at) > new Date(existing.last_at || 0)) {
          byPeer.set(peer, {
            peer_id: peer,
            peer_name: userNamesMap[peer] ?? existing?.peer_name ?? `User ${peer}`,
            last_message: last.message,
            last_at: last.created_at,
            isOnline: false,
          })
        }
      }
    })
    onlineUsers.forEach((u) => {
      const id = Number(u.user_id)
      if (id === meId) return
      const cur = byPeer.get(id)
      if (cur) cur.isOnline = true
    })
    return Array.from(byPeer.values()).sort((a, b) => {
      const ta = a.last_at ? new Date(a.last_at).getTime() : 0
      const tb = b.last_at ? new Date(b.last_at).getTime() : 0
      return tb - ta
    })
  })()

  const selectedContact = selectedUserId
    ? conversationList.find((c) => String(c.peer_id) === String(selectedUserId)) ||
      onlineUsers.find((u) => String(u.user_id) === String(selectedUserId)) || { peer_id: selectedUserId, peer_name: `User ${selectedUserId}` }
    : null

  // Nama lawan (untuk list & header). Selalu tampilkan username lawan, bukan nama user login.
  function getPartnerDisplayName(peerId, fallbackName) {
    if (peerId == null) return ''
    if (Number(peerId) === Number(meId)) return ''
    return (userNamesMap[peerId] ?? fallbackName ?? `User ${peerId}`).trim() || `User ${peerId}`
  }

  const messageKey = selectedUserId != null && meId != null ? convKey(meId, selectedUserId) : ''
  const messages = messageKey ? (messagesByKey[messageKey] || []) : []

  useEffect(() => {
    if (!socket) return
    const onReceive = (payload) => {
      const from = Number(payload.from_user_id)
      const to = Number(payload.to_user_id)
      const key = convKey(from, to)
      setMessagesByKey((prev) => {
        const list = prev[key] || []
        if (list.some((m) => m.id === payload.id)) return prev
        const isOwn = myUsersId != null && from === myUsersId
        return { ...prev, [key]: [...list, { ...payload, isOwn }] }
      })
    }
    const onResult = (payload) => {
      setSending(false)
      if (payload.success && payload.id != null && selectedUserId != null && myUsersId != null) {
        const key = convKey(myUsersId, Number(selectedUserId))
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
  }, [socket, selectedUserId, myUsersId])

  useEffect(() => {
    setSendError(null)
    setPeerTyping(false)
  }, [selectedUserId])

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
    if (!text || !socket || !selectedUserId) return
    const fromUsersId = myUsersId
    const toUsersId = Number(selectedUserId)
    if (fromUsersId == null) {
      setSendError('Memuat data pengguna. Coba lagi sebentar.')
      return
    }
    if (toUsersId === fromUsersId) {
      setSendError('Tidak bisa mengirim ke diri sendiri.')
      return
    }
    setSendError(null)
    setSending(true)
    const tempId = Date.now()
    const key = convKey(fromUsersId, toUsersId)
    setMessagesByKey((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), { id: tempId, tempId, from_user_id: fromUsersId, to_user_id: toUsersId, message: text, created_at: new Date().toISOString(), isOwn: true }],
    }))
    setInputText('')
    emitTypingStop()
    socket.emit('send_message', { from_user_id: fromUsersId, to_user_id: toUsersId, message: text })
  }

  const openNewChatOffcanvas = () => {
    setNewChatOpen(true)
    setChatUsersLoading(true)
    chatUserAPI
      .getUsers()
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) setChatUsers(res.data)
        else setChatUsers([])
      })
      .catch(() => setChatUsers([]))
      .finally(() => setChatUsersLoading(false))
  }

  const selectUserForNewChat = (peerId) => {
    setSelectedUserId(String(peerId))
    setNewChatOpen(false)
    setNewChatSearch('')
    const peer = chatUsers.find((u) => Number(u.id) === Number(peerId))
    if (peer && !conversationList.some((c) => Number(c.peer_id) === Number(peerId))) {
      setConversations((prev) => [...prev, { peer_id: peerId, peer_name: peer.nama || `User ${peerId}`, last_message: '', last_at: null }])
    }
  }

  if (!myId) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-gray-500 dark:text-gray-400">
        Silakan login untuk menggunakan Chat.
      </div>
    )
  }

  return (
    <div className="p-2 sm:p-3 h-full overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="h-full flex flex-col overflow-hidden"
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
              <div className="flex-1 min-h-0 overflow-y-auto">
                {conversationsLoading ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat percakapan...</div>
                ) : conversationList.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Belum ada percakapan. Gunakan tombol + untuk mulai chat.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {conversationList.map((c) => (
                      <li key={c.peer_id}>
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(String(c.peer_id))}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                            selectedUserId === String(c.peer_id) ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white shrink-0">
                            {getPartnerDisplayName(c.peer_id, c.peer_name).charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{getPartnerDisplayName(c.peer_id, c.peer_name)}</p>
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
            className={`col-span-1 h-full min-h-0 overflow-hidden flex flex-col ${!isDesktop && !selectedUserId ? 'hidden' : ''} md:!flex`}
            style={{ minHeight: 0 }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-full flex flex-col overflow-hidden min-h-0">
              {selectedContact ? (
                <>
                  <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-teal-600 text-white rounded-t-lg">
                    {!isDesktop && (
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(null)}
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
                        {getPartnerDisplayName(selectedUserId, selectedContact?.peer_name || selectedContact?.nama)}
                      </p>
                      <p className="text-xs text-teal-100 flex items-center gap-1.5">
                        {peerTyping ? (
                          <span className="italic">Mengetik...</span>
                        ) : (
                          <>
                            {onlineUsers.some((u) => String(u.user_id) === String(selectedUserId)) && (
                              <>
                                <span className="inline-block w-2 h-2 rounded-full bg-green-300 animate-pulse" aria-hidden />
                                <span>Online</span>
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div
                    ref={messagesContainerRef}
                    className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-2 bg-[#e5ddd5] dark:bg-gray-900/50"
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
                        isOwn={Boolean(msg.isOwn || msg.is_own) || (myUsersId != null && Number(msg.from_user_id) === myUsersId)}
                      />
                    ))}
                  </div>

                  {sendError && (
                    <div className="shrink-0 px-3 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
                      {sendError}
                    </div>
                  )}
                  <div className="shrink-0 p-2 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputText}
                        onChange={handleInputChange}
                        onBlur={handleInputBlur}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder="Ketik pesan..."
                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={sending}
                      />
                      <button
                        type="button"
                        onClick={sendMessage}
                        disabled={!myUsersId || !inputText.trim() || sending}
                        title={!myUsersId ? 'Memuat data pengguna...' : ''}
                        className="shrink-0 px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
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

      {/* Offcanvas kanan: pilih user untuk chat baru */}
      {newChatOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 md:z-40" onClick={() => { setNewChatOpen(false); setNewChatSearch('') }} aria-hidden="true" />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pilih kontak</h2>
              <button
                type="button"
                onClick={() => { setNewChatOpen(false); setNewChatSearch('') }}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="shrink-0 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                value={newChatSearch}
                onChange={(e) => setNewChatSearch(e.target.value)}
                placeholder="Cari nama atau user..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                aria-label="Cari kontak"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {chatUsersLoading ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat...</div>
              ) : (() => {
                const q = newChatSearch.trim().toLowerCase()
                const filtered = q
                  ? chatUsers.filter(
                      (u) =>
                        (u.nama && String(u.nama).toLowerCase().includes(q)) ||
                        (u.username && String(u.username).toLowerCase().includes(q)) ||
                        String(u.id).toLowerCase().includes(q)
                    )
                  : chatUsers
                if (filtered.length === 0) {
                  return (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                      {chatUsers.length === 0 ? 'Tidak ada user.' : 'Tidak ada hasil untuk pencarian.'}
                    </div>
                  )
                }
                return (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filtered.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => selectUserForNewChat(u.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white shrink-0">
                          {(u.nama || '?').charAt(0).toUpperCase()}
                        </div>
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{u.nama || `User ${u.id}`}</p>
                      </button>
                    </li>
                  ))}
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
