import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { waBackendAPI } from '../../services/api'

function formatTime(timestamp) {
  if (!timestamp || timestamp <= 0) return ''
  const d = new Date(timestamp * 1000)
  const now = new Date()
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (sameDay) {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth()) {
    return 'Kemarin'
  }
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function formatMessageTime(timestamp) {
  if (!timestamp || timestamp <= 0) return ''
  return new Date(timestamp * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function WaChatList() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const safeSessionId = sessionId || 'default'
  const messagesEndRef = useRef(null)

  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedChat, setSelectedChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    waBackendAPI.getChats(safeSessionId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res?.success && Array.isArray(res.data)) {
        setChats(res.data)
      } else {
        setError(res?.message || 'Gagal memuat daftar chat')
        setChats([])
      }
    }).catch((e) => {
      if (!cancelled) {
        setLoading(false)
        setError(e?.message || 'Network error')
        setChats([])
      }
    })
    return () => { cancelled = true }
  }, [safeSessionId])

  useEffect(() => {
    if (!selectedChat) {
      setMessages([])
      setMessagesError(null)
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    setMessagesError(null)
    setMessages([])
    const chatId = selectedChat.id
    waBackendAPI.getChatMessages(safeSessionId, chatId, 100).then((res) => {
      if (cancelled) return
      setMessagesLoading(false)
      if (res?.success && Array.isArray(res.data)) {
        setMessages(res.data)
        setMessagesError(res.data.length === 0 ? (res?.message || null) : null)
      } else {
        setMessages([])
        setMessagesError(res?.message || 'Gagal memuat pesan')
      }
    }).catch((e) => {
      if (!cancelled) {
        setMessagesLoading(false)
        setMessages([])
        setMessagesError(e?.message || 'Network error')
      }
    })
    return () => { cancelled = true }
  }, [safeSessionId, selectedChat?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredChats = search.trim()
    ? chats.filter((c) => (c.name || '').toLowerCase().includes(search.trim().toLowerCase()) || (c.lastMessageBody || '').toLowerCase().includes(search.trim().toLowerCase()))
    : chats

  const sessionLabel = safeSessionId === 'default' ? 'WhatsApp 1' : `WhatsApp ${safeSessionId.replace(/^wa/, '')}`

  const handleSend = async () => {
    const text = (replyText || '').trim()
    if (!text || !selectedChat) return
    setSending(true)
    const phoneNumber = selectedChat.id.includes('@') ? selectedChat.id.replace(/@.*/, '') : selectedChat.id
    const chatId = selectedChat.id.includes('@') ? selectedChat.id : undefined
    try {
      const res = await waBackendAPI.send(phoneNumber, text, null, null, safeSessionId, chatId)
      if (res?.success) {
        setReplyText('')
        setMessages((prev) => [
          ...prev,
          {
            id: res.messageId || Date.now().toString(),
            body: text,
            fromMe: true,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'sent',
          },
        ])
      }
    } finally {
      setSending(false)
    }
  }

  const showList = !selectedChat
  const showChat = !!selectedChat

  return (
    <div className="flex flex-col h-full min-h-0 bg-primary-50 dark:bg-gray-800/80 rounded-xl overflow-hidden border border-primary-200/60 dark:border-gray-700 shadow-sm">
      {/* Header — tema primary */}
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-primary-600 dark:bg-primary-700 text-white shadow-sm">
        <button
          type="button"
          onClick={() => navigate('/whatsapp-koneksi')}
          className="p-2 rounded-full hover:bg-white/15 transition-colors"
          aria-label="Kembali ke Koneksi"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-medium truncate">{sessionLabel}</h1>
          <p className="text-xs text-primary-100 dark:text-primary-200">Daftar chat</p>
        </div>
      </header>

      {/* Area utama: list + chat side by side */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Daftar chat — selalu ada di DOM, sembunyikan di mobile saat chat terbuka */}
        <div
          className={`flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 ${showList ? 'w-full md:w-80' : 'hidden md:flex md:w-80'}`}
          style={{ minHeight: 0 }}
        >
          <div className="flex-shrink-0 p-2 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder="Cari chat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
              </div>
            )}
            {error && !loading && (
              <div className="p-4 text-center text-red-600 dark:text-red-400 text-sm">
                {error}
                <button type="button" onClick={() => navigate('/whatsapp-koneksi')} className="block mt-2 text-primary-600 dark:text-primary-400 font-medium">Kembali ke Koneksi</button>
              </div>
            )}
            {!loading && !error && filteredChats.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                {search.trim() ? 'Tidak ada chat yang cocok.' : 'Belum ada chat.'}
              </div>
            )}
            {!loading && !error && filteredChats.length > 0 && (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredChats.map((chat) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedChat(chat)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors focus:outline-none ${selectedChat?.id === chat.id ? 'bg-primary-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                    >
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-medium ${chat.isGroup ? 'bg-gray-500 dark:bg-gray-600' : 'bg-primary-500 dark:bg-primary-600'}`}>
                        {chat.isGroup ? 'G' : (chat.name || chat.id || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{chat.name || chat.id || 'Unknown'}</span>
                          {chat.timestamp ? <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">{formatTime(chat.timestamp)}</span> : null}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-sm text-gray-600 dark:text-gray-400 truncate">{chat.lastMessageBody || '—'}</span>
                          {chat.unreadCount > 0 ? (
                            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium text-white bg-primary-500 dark:bg-primary-600 flex items-center justify-center">
                              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Panel percakapan — flex saja, tanpa absolute, agar layout tidak terangkat */}
        <div className={`flex flex-col flex-1 min-w-0 min-h-0 bg-primary-50/80 dark:bg-gray-800/60 overflow-hidden ${showChat ? 'flex' : 'hidden md:flex'}`}>
          {!selectedChat ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm p-4 min-h-0">
              Pilih chat untuk membuka percakapan
            </div>
          ) : (
            <>
              {/* Header chat */}
              <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800 border-b border-primary-200/60 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0 text-gray-600 dark:text-gray-300"
                  aria-label="Tutup chat"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ${selectedChat.isGroup ? 'bg-gray-500 dark:bg-gray-600' : 'bg-primary-500 dark:bg-primary-600'}`}>
                  {selectedChat.isGroup ? 'G' : (selectedChat.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{selectedChat.name || selectedChat.id || 'Unknown'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selectedChat.isGroup ? 'Grup' : 'Kontak'}</p>
                </div>
              </div>

              {/* Area pesan — scroll; flex-1 min-h-0 agar isi sisa tinggi */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-3" style={{ flex: '1 1 0%' }}>
                {messagesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
                  </div>
                ) : messagesError ? (
                  <div className="p-4 text-center text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg mx-2">
                    <p>{messagesError}</p>
                    <p className="mt-1 text-xs">Pastikan sudah scan QR Langkah 2 (Baileys) di tab Koneksi WA.</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Belum ada pesan di percakapan ini.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {messages.map((msg) => (
                      <div key={msg.id || `${msg.timestamp}-${(msg.body || '').slice(0, 30)}`} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] px-3 py-2 rounded-lg shadow-sm ${
                            msg.fromMe ? 'bg-primary-200 dark:bg-primary-700/80 text-gray-900 dark:text-gray-100 rounded-tr-none' : 'bg-white dark:bg-gray-700 rounded-tl-none'
                          }`}
                        >
                          <p className="text-sm text-gray-900 dark:text-gray-100 break-words">{msg.body || '[media]'}</p>
                          <p className={`text-[10px] mt-0.5 ${msg.fromMe ? 'text-gray-500 text-right' : 'text-gray-400'}`}>
                            {formatMessageTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input kirim */}
              <div className="flex-shrink-0 flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border-t border-primary-200/60 dark:border-gray-700">
                <input
                  type="text"
                  placeholder="Ketik pesan..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  className="p-2.5 rounded-full bg-primary-500 hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  aria-label="Kirim"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
