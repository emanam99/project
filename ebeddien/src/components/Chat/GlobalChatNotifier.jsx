import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveSocket } from '../../contexts/LiveSocketContext'
import { useAuthStore } from '../../store/authStore'
import { chatUserAPI } from '../../services/api'
import {
  buildNotificationKey,
  isNotificationFresh,
  normalizeIncomingChatPayload,
} from '../../services/chatRealtimeNotificationService'

const AUTO_CLOSE_MS = 9000
const SEND_ACK_TIMEOUT_MS = 8000

export default function GlobalChatNotifier() {
  const { socket } = useLiveSocket()
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const navigate = useNavigate()
  const [myUsersId, setMyUsersId] = useState(null)
  const [activeNotif, setActiveNotif] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)
  const seenKeysRef = useRef(new Set())
  const closeTimerRef = useRef(null)
  const pendingReplyRef = useRef(null)

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const usersId = user?.users_id != null ? Number(user.users_id) : null
    if (usersId) {
      setMyUsersId(usersId)
      return
    }
    chatUserAPI.getMe().then((res) => {
      if (res?.success && res?.my_user_id != null) {
        setMyUsersId(Number(res.my_user_id))
      }
    }).catch(() => {})
  }, [user?.id, user?.users_id])

  useEffect(() => {
    if (!activeNotif) return
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setActiveNotif(null)
      setReplyText('')
      setReplyOpen(false)
    }, AUTO_CLOSE_MS)
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [activeNotif])

  useEffect(() => () => {
    if (pendingReplyRef.current?.timeoutId) {
      clearTimeout(pendingReplyRef.current.timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!socket) return
    const onReceive = (payload) => {
      const normalized = normalizeIncomingChatPayload(payload)
      if (!normalized) return
      if (!isNotificationFresh(normalized.createdAt)) return
      if (myUsersId != null && normalized.fromUserId === myUsersId) return
      const key = buildNotificationKey(normalized)
      if (seenKeysRef.current.has(key)) return
      seenKeysRef.current.add(key)
      if (location.pathname === '/chat') return
      setReplyText('')
      setReplyOpen(false)
      setActiveNotif(normalized)
    }
    socket.on('receive_message', onReceive)
    return () => {
      socket.off('receive_message', onReceive)
    }
  }, [socket, myUsersId, location.pathname])

  const dismiss = () => {
    setActiveNotif(null)
    setReplyText('')
    setReplyOpen(false)
    setSendError('')
    setIsSending(false)
    pendingReplyRef.current = null
  }

  const openChatRoom = () => {
    if (!activeNotif) return
    navigate(`/chat?u=${activeNotif.fromUserId}`)
    dismiss()
  }

  const sendQuickReply = () => {
    if (!socket?.connected || !activeNotif || !myUsersId) return
    const text = replyText.trim()
    if (!text || isSending) return
    setSendError('')
    setIsSending(true)
    if (pendingReplyRef.current?.timeoutId) {
      clearTimeout(pendingReplyRef.current.timeoutId)
    }
    const timeoutId = setTimeout(() => {
      pendingReplyRef.current = null
      setIsSending(false)
      setSendError('Balasan belum terkonfirmasi. Coba kirim lagi.')
    }, SEND_ACK_TIMEOUT_MS)
    pendingReplyRef.current = {
      toUserId: activeNotif.fromUserId,
      timeoutId,
    }
    socket.emit('send_message', {
      from_user_id: myUsersId,
      to_user_id: activeNotif.fromUserId,
      message: text,
    })
    setReplyText('')
  }

  useEffect(() => {
    if (!socket) return
    const onSendResult = (payload) => {
      const pending = pendingReplyRef.current
      if (!pending) return
      if (pending.timeoutId) clearTimeout(pending.timeoutId)
      pendingReplyRef.current = null
      if (payload?.success) {
        setIsSending(false)
        dismiss()
        return
      }
      setIsSending(false)
      const reason = payload?.reason === 'user_offline'
        ? 'Penerima sedang offline.'
        : (payload?.reason || 'Gagal mengirim balasan.')
      setSendError(reason)
    }
    socket.on('send_message_result', onSendResult)
    return () => {
      socket.off('send_message_result', onSendResult)
    }
  }, [socket])

  const wrapperClass = useMemo(() => (
    isDesktop
      ? 'fixed z-[90] bottom-4 right-4 w-[360px] max-w-[calc(100vw-1rem)]'
      : 'fixed z-[90] top-[calc(env(safe-area-inset-top,0px)+0.5rem)] left-2 right-2'
  ), [isDesktop])

  return (
    <AnimatePresence initial={false}>
      {activeNotif && (
        <motion.div
          key={String(activeNotif.id)}
          initial={isDesktop ? { opacity: 0, x: 40 } : { opacity: 0, y: -36 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={isDesktop ? { opacity: 0, x: 48 } : { opacity: 0, y: -48 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={wrapperClass}
        >
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">
            <div className="px-3 py-2 bg-teal-600 text-white flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-teal-100">Pesan baru</p>
                <p className="text-sm font-semibold truncate">{activeNotif.senderName}</p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="shrink-0 rounded-md p-1.5 hover:bg-teal-500"
                aria-label="Tutup notifikasi"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={openChatRoom}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/60"
            >
              <p className="text-sm text-gray-800 dark:text-gray-100 line-clamp-2">{activeNotif.message}</p>
            </button>
            <div className="px-3 pb-3">
              {sendError && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-2">{sendError}</p>
              )}
              {!replyOpen && (
                <button
                  type="button"
                  onClick={() => setReplyOpen(true)}
                  className="text-sm text-teal-700 dark:text-teal-300 font-medium hover:underline"
                >
                  Balas
                </button>
              )}
              <AnimatePresence initial={false}>
                {replyOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            sendQuickReply()
                          }
                        }}
                        placeholder="Balas cepat..."
                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      <button
                        type="button"
                        onClick={sendQuickReply}
                        disabled={!replyText.trim() || isSending}
                        className="rounded-lg bg-teal-600 text-white text-sm px-3 py-2 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Kirim
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
