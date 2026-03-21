import { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react'
import { aiTrainingAdminAPI } from '../../services/api'
import { useChatAiHeaderSlot } from '../../contexts/ChatAiHeaderContext'
import EbeddienChatHeaderTraining from './DeepseekChat/EbeddienChatHeaderTraining'

const ASSISTANT_NAME = 'eBeddien'

function senderStyle(sender) {
  if (sender === 'user') return 'bg-teal-600 text-white ml-8'
  if (sender === 'trainer') return 'bg-amber-600 text-white ml-8'
  return 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 mr-8'
}

export default function AiTrainingChat() {
  const [sessions, setSessions] = useState([])
  const [current, setCurrent] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [error, setError] = useState(null)
  const [sender, setSender] = useState('user')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')
  const [feedbackFor, setFeedbackFor] = useState(null)
  const [feedbackText, setFeedbackText] = useState('')

  const [activeTab, setActiveTab] = useState('sesi') // 'sesi' | 'chat' — mobile/tablet, pola UWABA
  const [isDesktop, setIsDesktop] = useState(false)
  const sidebarRef = useRef(null)
  const chatRef = useRef(null)
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)
  /** Gulir hanya area pesan — jangan pakai scrollIntoView (bisa menggulir window & membuat layout “meloncat”). */
  const messagesScrollRef = useRef(null)

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024)
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])

  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.style.display = isDesktop ? 'flex' : activeTab === 'sesi' ? 'flex' : 'none'
    }
    if (chatRef.current) {
      chatRef.current.style.display = isDesktop ? 'flex' : activeTab === 'chat' ? 'flex' : 'none'
    }
  }, [activeTab, isDesktop])

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    setError(null)
    try {
      const res = await aiTrainingAdminAPI.listSessions()
      if (!res?.success) {
        setError(res?.message || 'Gagal memuat sesi')
        setSessions([])
        return
      }
      setSessions(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Gagal memuat sesi')
      setSessions([])
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) {
      setMessages([])
      return
    }
    setLoadingMsg(true)
    try {
      const res = await aiTrainingAdminAPI.listMessages(sessionId)
      if (!res?.success) {
        setMessages([])
        return
      }
      setMessages(Array.isArray(res.data) ? res.data : [])
    } catch {
      setMessages([])
    } finally {
      setLoadingMsg(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const setHeaderFromLayout = useChatAiHeaderSlot()
  useLayoutEffect(() => {
    if (!setHeaderFromLayout) return
    setHeaderFromLayout(
      <EbeddienChatHeaderTraining
        assistantName={ASSISTANT_NAME}
        variant="training-chat"
        accountLoading={false}
        chatHeaderMenuOpen={chatHeaderMenuOpen}
        setChatHeaderMenuOpen={setChatHeaderMenuOpen}
      />
    )
    return () => setHeaderFromLayout(null)
  }, [setHeaderFromLayout, chatHeaderMenuOpen])

  useEffect(() => {
    if (current?.id) loadMessages(current.id)
  }, [current?.id, loadMessages])

  useEffect(() => {
    const el = messagesScrollRef.current
    if (!el || !current?.id) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, loadingMsg, current?.id])

  const openSession = (s) => {
    setCurrent(s)
    setActiveTab('chat')
  }

  const createSession = async () => {
    const t = newTitle.trim()
    if (!t) return
    try {
      const res = await aiTrainingAdminAPI.createSession(t)
      if (!res?.success) {
        alert(res?.message || 'Gagal membuat sesi')
        return
      }
      setNewTitle('')
      setShowNew(false)
      await loadSessions()
      const newId = res.data?.id
      if (newId) {
        setCurrent({ id: newId, title: t })
        setActiveTab('chat')
      }
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Gagal')
    }
  }

  const deleteSession = async () => {
    if (!current?.id) return
    if (!window.confirm('Hapus sesi ini beserta semua pesan?')) return
    try {
      const res = await aiTrainingAdminAPI.deleteSession(current.id)
      if (!res?.success) {
        alert(res?.message || 'Gagal')
        return
      }
      setCurrent(null)
      setMessages([])
      await loadSessions()
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Gagal')
    }
  }

  const send = async (e) => {
    e.preventDefault()
    if (!current?.id || !text.trim()) return
    setSending(true)
    try {
      const res = await aiTrainingAdminAPI.sendMessage({
        session_id: current.id,
        sender,
        message: text.trim(),
        parent_id: null
      })
      if (!res?.success) {
        alert(res?.message || 'Gagal mengirim')
        return
      }
      setText('')
      await loadMessages(current.id)
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Gagal')
    } finally {
      setSending(false)
    }
  }

  const saveEdit = async (id) => {
    if (!editText.trim()) return
    try {
      const res = await aiTrainingAdminAPI.patchMessage(id, editText.trim())
      if (!res?.success) {
        alert(res?.message || 'Gagal')
        return
      }
      setEditId(null)
      setEditText('')
      if (current?.id) await loadMessages(current.id)
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Gagal')
    }
  }

  const delMsg = async (id) => {
    if (!window.confirm('Hapus pesan ini?')) return
    try {
      const res = await aiTrainingAdminAPI.deleteMessage(id)
      if (!res?.success) {
        alert(res?.message || 'Gagal')
        return
      }
      if (current?.id) await loadMessages(current.id)
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Gagal')
    }
  }

  const approve = async (id) => {
    try {
      const res = await aiTrainingAdminAPI.approveMessage(id)
      if (!res?.success) alert(res?.message || 'Gagal')
      else if (current?.id) await loadMessages(current.id)
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Gagal')
    }
  }

  const sendFeedback = async (id) => {
    try {
      const res = await aiTrainingAdminAPI.feedbackMessage(id, feedbackText.trim())
      if (!res?.success) {
        alert(res?.message || 'Gagal')
        return
      }
      setFeedbackFor(null)
      setFeedbackText('')
      if (current?.id) await loadMessages(current.id)
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Gagal')
    }
  }

  const tabBtnClass = (key) =>
    `flex-1 py-2.5 text-center border-b-2 font-semibold flex items-center justify-center gap-2 transition-colors text-sm sm:text-base ${
      activeTab === key
        ? 'border-teal-600 dark:border-teal-400 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <div className="mb-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {/* Tab mobile/tablet — meniru UWABA (Biodata / Rincian) */}
        <div className="mb-2 flex flex-shrink-0 overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-800 lg:hidden">
          <button type="button" onClick={() => setActiveTab('sesi')} className={tabBtnClass('sesi')}>
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span>Sesi</span>
          </button>
          <button type="button" onClick={() => setActiveTab('chat')} className={tabBtnClass('chat')}>
            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span>Percakapan</span>
          </button>
        </div>

        {/* Desktop: 2 kolom — kiri daftar sesi, kanan chat (pola UWABA) */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:grid lg:grid-cols-[minmax(0,280px)_1fr]">
          <aside
            ref={sidebarRef}
            className="col-span-1 flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800"
            style={{ minHeight: 0 }}
          >
            <div className="border-b border-gray-100 p-3 dark:border-gray-700 sm:p-4">
              <button
                type="button"
                onClick={() => setShowNew(true)}
                className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white hover:bg-teal-700 dark:hover:bg-teal-500"
              >
                + Sesi baru
              </button>
            </div>
            <div className="chat-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-2 sm:p-3">
              {loadingSessions ? (
                <p className="p-2 text-xs text-gray-500">Memuat sesi…</p>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSession(s)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      current?.id === s.id
                        ? 'border-teal-500 bg-teal-50 dark:border-teal-500 dark:bg-teal-900/30'
                        : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/80'
                    }`}
                  >
                    <span className="line-clamp-2 font-medium text-gray-900 dark:text-gray-100">{s.title || 'Tanpa judul'}</span>
                    <span className="text-[10px] text-gray-500">{s.status || ''}</span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <div
            ref={chatRef}
            className="col-span-1 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800"
            style={{ minHeight: 0 }}
          >
            {!current ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-gray-500">
                <p className="text-sm">Pilih sesi di panel kiri atau buat sesi baru.</p>
                <p className="text-xs max-w-sm">
                  Di HP, buka tab <strong className="text-teal-600 dark:text-teal-400">Sesi</strong> untuk memilih. Jika peran{' '}
                  <strong>User</strong>, balasan otomatis dari bank Q&A + riwayat training.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('sesi')}
                  className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 lg:hidden dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
                >
                  Ke daftar sesi
                </button>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
                  <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{current.title}</h2>
                  <button
                    type="button"
                    onClick={deleteSession}
                    className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Hapus sesi
                  </button>
                </div>
                <div
                  ref={messagesScrollRef}
                  className="chat-scrollbar min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain p-3"
                >
                  {loadingMsg ? <p className="text-center text-xs text-gray-500">Memuat pesan…</p> : null}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-1 rounded-2xl px-3 py-2 text-sm ${senderStyle(m.sender)}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-medium opacity-80">
                        <span className="uppercase">{m.sender}</span>
                        {m.approved_as_training == 1 ? (
                          <span className="rounded bg-green-600/20 px-1.5 text-green-100 dark:text-green-300">disetujui</span>
                        ) : null}
                      </div>
                      {editId === m.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(m.id)}
                              className="rounded bg-teal-600 px-2 py-1 text-xs text-white"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(null)
                                setEditText('')
                              }}
                              className="rounded border px-2 py-1 text-xs"
                            >
                              Batal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                      )}
                      {m.feedback ? (
                        <p className="text-xs opacity-90 border-t border-white/20 pt-1 mt-1">Feedback: {m.feedback}</p>
                      ) : null}
                      {editId !== m.id ? (
                        <div className="flex flex-wrap gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditId(m.id)
                              setEditText(m.message || '')
                            }}
                            className="rounded bg-black/10 px-2 py-0.5 text-[10px] dark:bg-white/10"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => delMsg(m.id)}
                            className="rounded bg-black/10 px-2 py-0.5 text-[10px] dark:bg-white/10"
                          >
                            Hapus
                          </button>
                          {(m.sender === 'ai' || m.sender === 'trainer') && (
                            <>
                              <button
                                type="button"
                                onClick={() => approve(m.id)}
                                className="rounded bg-black/10 px-2 py-0.5 text-[10px] dark:bg-white/10"
                              >
                                Setujui Q&A
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFeedbackFor((x) => (x === m.id ? null : m.id))
                                  setFeedbackText('')
                                }}
                                className="rounded bg-black/10 px-2 py-0.5 text-[10px] dark:bg-white/10"
                              >
                                Feedback
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                      {feedbackFor === m.id ? (
                        <div className="mt-2 space-y-2 rounded-lg border border-white/30 p-2">
                          <textarea
                            placeholder="Koreksi / jawaban yang benar…"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            rows={2}
                            className="w-full rounded border border-gray-300 p-2 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          />
                          <button
                            type="button"
                            onClick={() => sendFeedback(m.id)}
                            className="rounded bg-teal-600 px-2 py-1 text-xs text-white"
                          >
                            Kirim feedback
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={send}
                  className="shrink-0 border-t border-gray-100 p-3 dark:border-gray-700"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="sm:w-36">
                      <label className="text-[10px] text-gray-500">Peran</label>
                      <select
                        value={sender}
                        onChange={(e) => setSender(e.target.value)}
                        className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                      >
                        <option value="user">User</option>
                        <option value="ai">AI</option>
                        <option value="trainer">Trainer</option>
                      </select>
                    </div>
                    <div className="min-w-0 flex-1">
                      <label className="text-[10px] text-gray-500">Pesan</label>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={2}
                        className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                        placeholder="Ketik pesan…"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sending || !text.trim()}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 sm:mb-0.5 dark:hover:bg-teal-500"
                    >
                      {sending ? '…' : 'Kirim'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>

        {showNew ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sesi baru</h3>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Judul sesi"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowNew(false)} className="rounded-lg px-3 py-2 text-sm text-gray-600">
                  Batal
                </button>
                <button
                  type="button"
                  onClick={createSession}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  Buat
                </button>
              </div>
            </div>
          </div>
        ) : null}
    </div>
  )
}
