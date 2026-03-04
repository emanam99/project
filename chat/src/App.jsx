import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  const defaultModel = import.meta.env.VITE_OPENROUTER_MODEL || 'qwen/qwen3-next-80b-a3b-instruct:free'
  const [model, setModel] = useState(defaultModel)

  const freeModels = [
    { id: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'Qwen3 Next 80B' },
    { id: 'stepfun/step-3.5-flash:free', label: 'Step 3.5 Flash (256K)' },
    { id: 'arcee-ai/trinity-large-preview:free', label: 'Trinity Large (131K)' },
    { id: 'liquid/lfm-2.5-1.2b-instruct:free', label: 'LFM 1.2B (ringan)' },
    { id: 'liquid/lfm-2.5-1.2b-thinking:free', label: 'LFM 1.2B Thinking' },
  ]
  const modelOptions = freeModels.some((m) => m.id === model)
    ? freeModels
    : [...freeModels, { id: model, label: model.split('/').pop() || model }]

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  async function sendMessage(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    if (!apiKey) {
      setError('VITE_OPENROUTER_API_KEY belum di-set. Buat file .env dari .env.example.')
      return
    }

    setError(null)
    setInput('')
    const userMessage = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin || 'https://chat-openrouter.local',
          'X-Title': 'Chat OpenRouter',
        },
        body: JSON.stringify({
          model,
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          stream: false,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Terlalu banyak permintaan (rate limit). Tunggu beberapa detik lalu coba lagi.')
        }
        throw new Error(data.error?.message || data.error?.code || `Error ${response.status}`)
      }

      if (data.error) {
        throw new Error(data.error?.message || data.error?.code || 'Unknown error')
      }

      const assistantContent = data.choices?.[0]?.message?.content ?? ''
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }])
    } catch (err) {
      setError(err.message || 'Gagal mengirim pesan')
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="app"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: 720,
        margin: '0 auto',
        padding: '16px',
        width: '100%',
      }}
    >
      {/* Header */}
      <motion.header
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.35 }}
        style={{
          padding: '12px 0 16px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
          Chat
        </h1>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Model:</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </motion.header>

      {/* Messages */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingBottom: 8,
        }}
      >
        <AnimatePresence initial={false}>
          {messages.length === 0 && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                padding: '48px 24px',
              }}
            >
              Mulai percakapan — ketik pesan di bawah.
            </motion.div>
          )}
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              exit={{ opacity: 0 }}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: msg.role === 'user' ? 'var(--user-msg)' : 'var(--assistant-msg)',
                border: '1px solid var(--border)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '0.95rem',
                lineHeight: 1.5,
              }}
            >
              {msg.content}
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                alignSelf: 'flex-start',
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                background: 'var(--assistant-msg)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
              >
                Mengetik
              </motion.span>
              <span style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map((j) => (
                  <motion.span
                    key={j}
                    animate={{ y: [0, -5, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.6,
                      delay: j * 0.15,
                    }}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                    }}
                  />
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              padding: '8px 12px',
              marginBottom: 8,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <motion.form
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        onSubmit={sendMessage}
        style={{
          display: 'flex',
          gap: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(e)}
          placeholder="Ketik pesan..."
          disabled={loading}
          autoFocus
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: '0.95rem',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <motion.button
          type="submit"
          disabled={loading || !input.trim()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: '12px 20px',
            borderRadius: 'var(--radius)',
            border: 'none',
            background: (loading || !input.trim()) ? 'var(--border)' : 'var(--accent)',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
          }}
        >
          Kirim
        </motion.button>
      </motion.form>
    </motion.div>
  )
}

export default App
