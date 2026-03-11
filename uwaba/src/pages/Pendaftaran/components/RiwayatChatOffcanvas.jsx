import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { chatAPI, waAPI, whatsappTemplateAPI } from '../../../services/api'
import { useAuthStore } from '../../../store/authStore'
import { useNotification } from '../../../contexts/NotificationContext'

const CHAT_PAGE_SIZE = 30
const AUTO_REFRESH_MS = 8000
/** Batas waktu edit pesan WA (15 menit). */
const EDIT_MESSAGE_WINDOW_MS = 15 * 60 * 1000

/** 4 status WA: Menunggu (jam), Terkirim (centang 1), Diterima (centang 2), Dibaca (centang biru). Ikon dibuat jelas terlihat. */
function StatusIcon({ status, className = '' }) {
  const s = (status || '').toString().trim().toLowerCase()
  const iconClass = 'w-5 h-5 shrink-0 inline-block'
  // 1. Menunggu / Pending — ikon jam
  if (s === 'pending' || s === 'menunggu') {
    return (
      <span className={className} title="Menunggu">
        <svg className={`${iconClass} text-amber-500 dark:text-amber-400`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      </span>
    )
  }
  // 2. Terkirim / Sent — centang 1
  if (s === 'sent' || s === 'berhasil' || s === 'terkirim') {
    return (
      <span className={className} title="Terkirim (centang 1)">
        <svg className={`${iconClass} text-gray-600 dark:text-gray-400`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </span>
    )
  }
  // 3. Diterima / Delivered — centang 2 (abu)
  if (s === 'delivered' || s === 'diterima') {
    return (
      <span className={className} title="Diterima (centang 2)">
        <svg className={`${iconClass} text-gray-600 dark:text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 16 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 6L4 8.5L9 2" />
          <path d="M6.5 6L9 8.5L14.5 2" />
        </svg>
      </span>
    )
  }
  // 4. Dibaca / Read — centang 2 biru
  if (s === 'read' || s === 'dibaca') {
    return (
      <span className={className} title="Dibaca (centang biru)">
        <svg className={`${iconClass} text-blue-500 dark:text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 16 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 6L4 8.5L9 2" />
          <path d="M6.5 6L9 8.5L14.5 2" />
        </svg>
      </span>
    )
  }
  if (s === 'gagal') {
    return (
      <span className={className} title="Gagal">
        <svg className={`${iconClass} text-red-500`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </span>
    )
  }
  return (
    <span className={className} title="Terkirim">
      <svg className={`${iconClass} text-gray-600 dark:text-gray-400`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </span>
  )
}

/**
 * Offcanvas kanan: riwayat chat berdasarkan nomor.
 * Load 30 terakhir; load more saat scroll ke atas; append saat kirim (tanpa reload penuh); auto refresh hanya saat offcanvas terbuka.
 */
function RiwayatChatOffcanvas({
  isOpen,
  onClose,
  nomorTujuan,
  idSantri = '',
  namaSantri = ''
}) {
  const { user } = useAuthStore()
  const { showNotification } = useNotification()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [inputPesan, setInputPesan] = useState('')
  const [sending, setSending] = useState(false)
  const [showTemplateList, setShowTemplateList] = useState(false)
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [syncingFromWa, setSyncingFromWa] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSending, setEditSending] = useState(false)
  const listEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const skipMergeRef = useRef(false)
  /** Sync dari WA hanya 1 kali per buka offcanvas; reset saat tutup. */
  const syncOnceDoneRef = useRef(false)

  /** Nama pengirim: dari API (JOIN pengurus) atau fallback Admin. */
  const namaPengirim = (item) => (item.nama_pengirim && String(item.nama_pengirim).trim()) || 'Admin'

  const nomor = (nomorTujuan || '').trim()

  const normId = (id) => {
    if (id == null || id === '') return ''
    const s = String(id)
    if (s.startsWith('c_') || s.startsWith('w_')) return s
    if (s.startsWith('temp-')) return s
    if (typeof id === 'number') return `c_${id}`
    return `c_${s}`
  }

  /** Satu pesan = satu bubble: hapus duplikat yang sama isi + arah + waktu (dalam 2 menit).
   * Prioritas: tetap pakai item dari tabel chat (id c_*, punya nama_pengirim) supaya nama pengurus tampil, bukan item dari whatsapp (w_*) yang nama_pengirim null/Admin. */
  const dedupeByContent = (items) => {
    const byKey = new Map()
    for (const it of items) {
      const pesan = (it.pesan || '').trim()
      const arah = it.arah || 'keluar'
      const t = it.tanggal_dibuat ? new Date(it.tanggal_dibuat).getTime() : 0
      const bucket = Math.floor(t / 120000)
      const key = `${arah}\t${pesan}\t${bucket}`
      const hasNama = (it.nama_pengirim && String(it.nama_pengirim).trim()) !== ''
      const fromChat = String(it.id || '').startsWith('c_')
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, it)
        continue
      }
      const existingHasNama = (existing.nama_pengirim && String(existing.nama_pengirim).trim()) !== ''
      const existingFromChat = String(existing.id || '').startsWith('c_')
      if (hasNama && !existingHasNama) byKey.set(key, it)
      else if (fromChat && !existingFromChat && !existingHasNama) byKey.set(key, it)
    }
    const out = Array.from(byKey.values())
    out.sort((a, b) => new Date(b.tanggal_dibuat || 0) - new Date(a.tanggal_dibuat || 0))
    return out
  }

  const fetchRiwayat = useCallback(async (beforeDate = null, append = false) => {
    if (!nomor) {
      if (!append) setList([])
      return
    }
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const res = await chatAPI.getChatByNomor(nomor, CHAT_PAGE_SIZE, beforeDate)
      const data = Array.isArray(res?.data) ? res.data : []
      if (append) {
        setList((prev) => {
          const ids = new Set(prev.map((p) => normId(p.id)))
          const olderBatch = data.filter((d) => !ids.has(normId(d.id)))
          if (olderBatch.length === 0) return prev
          return dedupeByContent([...prev, ...olderBatch])
        })
        setHasMore(data.length >= CHAT_PAGE_SIZE)
      } else {
        setList(dedupeByContent(data))
        setHasMore(data.length >= CHAT_PAGE_SIZE)
      }
    } catch (e) {
      console.error('Fetch riwayat chat:', e)
      if (!append) setList([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [nomor])

  useEffect(() => {
    if (isOpen && nomor) {
      // Tampilkan riwayat dari DB dulu
      fetchRiwayat()
      // Sinkron dari WA sekali per buka (pesan kirim lewat WA langsung / masuk saat WA off)
      if (!syncOnceDoneRef.current) {
        syncOnceDoneRef.current = true
        chatAPI.syncFromWa(nomor, 50).then((res) => {
          if (res?.success && (res?.synced_count ?? 0) > 0) {
            fetchRiwayat()
          }
        }).catch(() => {})
      }
    } else if (!isOpen) {
      syncOnceDoneRef.current = false
      setList([])
      setHasMore(true)
      setInputPesan('')
      setShowTemplateList(false)
      setExpandedCategories({})
      setEditingMessageId(null)
      setEditDraft('')
    }
  }, [isOpen, nomor, fetchRiwayat])

  /** Auto refresh: hanya saat offcanvas terbuka dan nomor ada. Skip merge saat baru saja kirim agar tidak duplikat. */
  useEffect(() => {
    if (!isOpen || !nomor) return
    const t = setInterval(() => {
      if (skipMergeRef.current) return
      chatAPI.getChatByNomor(nomor, CHAT_PAGE_SIZE).then((res) => {
        if (skipMergeRef.current) return
        const data = Array.isArray(res?.data) ? res.data : []
        setList((prev) => {
          const byId = new Map()
          data.forEach((d) => byId.set(normId(d.id), d))
          prev.forEach((p) => {
            const n = normId(p.id)
            if (byId.has(n)) return
            if (String(p.id || '').startsWith('temp-')) return
            byId.set(n, p)
          })
          const sorted = Array.from(byId.values()).sort((a, b) => new Date(b.tanggal_dibuat || 0) - new Date(a.tanggal_dibuat || 0))
          return dedupeByContent(sorted)
        })
      }).catch(() => {})
    }, AUTO_REFRESH_MS)
    return () => clearInterval(t)
  }, [isOpen, nomor])

  const fetchTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const res = await whatsappTemplateAPI.list()
      setTemplates(Array.isArray(res?.data) ? res.data : [])
    } catch (e) {
      console.error('Fetch templates:', e)
      setTemplates([])
    } finally {
      setTemplatesLoading(false)
    }
  }

  useEffect(() => {
    if (showTemplateList && templates.length === 0 && !templatesLoading) {
      fetchTemplates()
    }
  }, [showTemplateList])

  const templatesByCategory = templates.reduce((acc, t) => {
    const k = t.kategori || 'umum'
    if (!acc[k]) acc[k] = []
    acc[k].push(t)
    return acc
  }, {})
  const templateCategories = Object.keys(templatesByCategory).sort()

  const toggleCategory = (kat) => {
    setExpandedCategories((prev) => ({ ...prev, [kat]: !prev[kat] }))
  }

  const applyTemplate = (isiPesan) => {
    setInputPesan((prev) => (prev ? `${prev}\n${isiPesan}` : isiPesan))
    setShowTemplateList(false)
  }

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [list])

  /** Cek apakah pesan keluar bisa diedit (punya message_id & masih dalam 15 menit). */
  const canEditMessage = (item) => {
    if (!item || item.arah !== 'keluar') return false
    const msgId = item.message_id || item.messageId
    if (!msgId || typeof msgId !== 'string' || msgId.trim() === '') return false
    const t = item.tanggal_dibuat || item.created_at
    if (!t) return false
    const elapsed = Date.now() - new Date(t).getTime()
    return elapsed < EDIT_MESSAGE_WINDOW_MS
  }

  const handleStartEdit = (item) => {
    setEditingMessageId(item.id)
    setEditDraft(item.pesan || '')
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditDraft('')
  }

  const handleSaveEdit = async (item) => {
    const msgId = item.message_id || item.messageId
    if (!msgId || !nomor || !editDraft.trim()) {
      handleCancelEdit()
      return
    }
    setEditSending(true)
    try {
      const res = await waAPI.edit(nomor, msgId, editDraft.trim())
      if (res?.success) {
        setList((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, pesan: editDraft.trim() } : it
          )
        )
        showNotification('Pesan berhasil diedit', 'success')
        handleCancelEdit()
      } else {
        showNotification(res?.message || 'Gagal mengedit pesan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal mengedit pesan', 'error')
    } finally {
      setEditSending(false)
    }
  }

  const formatWaktu = (tanggal) => {
    if (!tanggal) return ''
    try {
      const d = new Date(tanggal)
      const now = new Date()
      const isToday = d.toDateString() === now.toDateString()
      if (isToday) {
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      }
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return tanggal
    }
  }

  const handleLoadMore = () => {
    if (list.length === 0 || loadingMore || !hasMore) return
    const oldest = list[list.length - 1]
    const before = oldest?.tanggal_dibuat || oldest?.created_at
    if (!before) return
    fetchRiwayat(before, true)
  }

  const handleSyncFromWa = async () => {
    if (!nomor || syncingFromWa) return
    setSyncingFromWa(true)
    try {
      const res = await chatAPI.syncFromWa(nomor, 50)
      if (res?.success) {
        showNotification(res?.message ?? (res?.synced_count > 0 ? `Berhasil menyinkronkan ${res.synced_count} pesan` : 'Tidak ada pesan baru'), 'success')
        fetchRiwayat()
      } else {
        showNotification(res?.message || 'Gagal sinkron dari WA', 'error')
      }
    } catch (e) {
      showNotification(e?.message || 'Gagal sinkron dari WA', 'error')
    } finally {
      setSyncingFromWa(false)
    }
  }

  const handleKirim = async () => {
    const pesan = (inputPesan || '').trim()
    if (!pesan || !nomor) {
      showNotification('Isi pesan dan pastikan nomor tersedia', 'warning')
      return
    }
    const tempId = `temp-${Date.now()}`
    const optimisticItem = {
      id: tempId,
      pesan,
      arah: 'keluar',
      tanggal_dibuat: new Date().toISOString(),
      status_pengiriman: 'pending',
      id_pengurus: user?.id_pengurus ?? user?.id ?? null,
      nama_pengirim: user?.nama || user?.username || 'Admin',
      message_id: null
    }
    skipMergeRef.current = true
    setList((prev) => [optimisticItem, ...prev])
    setInputPesan('')
    setSending(true)
    try {
      const idPengurus = user?.id_pengurus ?? user?.id ?? null
      const sendRes = await waAPI.send(nomor, pesan, 'uwaba1', {
        ...(idSantri ? { id_santri: idSantri } : {}),
        ...(idPengurus != null ? { id_pengurus: idPengurus } : {})
      })
      if (!sendRes?.success) {
        skipMergeRef.current = false
        setList((prev) => prev.filter((it) => it.id !== tempId))
        showNotification(sendRes?.message || 'Gagal mengirim pesan', 'error')
        return
      }
      // Backend sudah log ke tabel whatsapp; tidak perlu saveChat (menghindari duplikasi)
      const newItem = {
        id: tempId,
        pesan,
        arah: 'keluar',
        tanggal_dibuat: optimisticItem.tanggal_dibuat,
        status_pengiriman: 'sent',
        id_pengurus: idPengurus,
        nama_pengirim: user?.nama || user?.username || 'Admin',
        message_id: sendRes?.messageId ?? sendRes?.data?.messageId ?? null
      }
      setList((prev) => {
        const tanpaTemp = prev.filter((it) => it.id !== tempId)
        return dedupeByContent([newItem, ...tanpaTemp])
      })
      setTimeout(() => { skipMergeRef.current = false }, 2500)
    } catch (err) {
      console.error('Kirim pesan:', err)
      skipMergeRef.current = false
      setList((prev) => prev.filter((it) => it.id !== tempId))
      showNotification(err?.response?.data?.message || err?.message || 'Gagal mengirim pesan', 'error')
    } finally {
      setSending(false)
    }
  }

  const content = (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="riwayat-chat-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[9999]"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.div
              key="riwayat-chat-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[10000] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                    Riwayat Chat
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono truncate">
                    {nomor || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleSyncFromWa}
                    disabled={syncingFromWa || !nomor}
                    className="p-2 rounded-lg text-teal-600 dark:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    title="Sinkron pesan dari WA (pesan kirim lewat WA langsung / pesan masuk saat WA off)"
                    aria-label="Sinkron dari WA"
                  >
                    {syncingFromWa ? (
                      <span className="animate-spin inline-block w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                  </div>
                ) : list.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                    Belum ada riwayat chat untuk nomor ini.
                  </div>
                ) : (
                  <>
                    {hasMore && (
                      <div className="flex justify-center py-2">
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="text-sm text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50"
                        >
                          {loadingMore ? 'Memuat…' : 'Muat chat lebih banyak'}
                        </button>
                      </div>
                    )}
                    {[...list].reverse().map((item) => {
                      const isMasuk = item.arah === 'masuk'
                      const isEditingThis = editingMessageId === item.id
                      const showEditButton = !isMasuk && canEditMessage(item) && !isEditingThis
                      return (
                        <div
                          key={item.id}
                          className={`flex flex-col ${isMasuk ? 'items-start' : 'items-end'}`}
                        >
                          {isEditingThis ? (
                            <div className="max-w-[85%] w-full rounded-2xl rounded-tr-md bg-teal-600 dark:bg-teal-700 px-3 py-2 text-sm shadow-sm">
                              <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                className="w-full resize-none rounded-lg bg-white/10 text-white placeholder-white/70 border border-white/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                                placeholder="Edit pesan..."
                                disabled={editSending}
                              />
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(item)}
                                  disabled={editSending || !editDraft.trim()}
                                  className="px-3 py-1.5 rounded-lg bg-white text-teal-600 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                                >
                                  {editSending ? 'Menyimpan…' : 'Simpan'}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  disabled={editSending}
                                  className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs hover:bg-white/30 disabled:opacity-50"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                                isMasuk
                                  ? 'rounded-tl-md bg-gray-200 text-gray-900 dark:bg-gray-600 dark:text-gray-100'
                                  : 'rounded-tr-md bg-teal-600 text-white'
                              }`}
                            >
                              <div className="whitespace-pre-wrap break-words">{item.pesan}</div>
                            </div>
                          )}
                          {!isEditingThis && (
                            <div className={`flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400 ${isMasuk ? 'flex-row' : ''}`}>
                              <span>{formatWaktu(item.tanggal_dibuat)}</span>
                              {!isMasuk && (
                                <span className="truncate max-w-[140px]" title={namaPengirim(item)}>
                                  {namaPengirim(item)}
                                </span>
                              )}
                              {showEditButton && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(item)}
                                  className="text-teal-600 dark:text-teal-400 hover:underline"
                                  title="Edit pesan (maks 15 menit)"
                                >
                                  Edit
                                </button>
                              )}
                              {!isMasuk && (
                                <span className="inline-flex items-center min-w-[20px]" aria-hidden="true">
                                  <StatusIcon status={item.status_pengiriman} />
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div ref={listEndRef} />
                  </>
                )}
              </div>

              <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
                {/* Tombol template: buka/tutup accordion daftar template */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTemplateList((v) => !v)
                      if (!showTemplateList) fetchTemplates()
                    }}
                    className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Pilih template"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Template</span>
                </div>
                {/* Accordion list template per kategori */}
                <AnimatePresence>
                  {showTemplateList && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden mb-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 max-h-48 overflow-y-auto"
                    >
                      {templatesLoading ? (
                        <div className="p-3 flex justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-2 border-teal-500 border-t-transparent" />
                        </div>
                      ) : templateCategories.length === 0 ? (
                        <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Belum ada template.</p>
                      ) : (
                        <ul className="py-1">
                          {templateCategories.map((kat) => (
                            <li key={kat}>
                              <button
                                type="button"
                                onClick={() => toggleCategory(kat)}
                                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                              >
                                <span className="capitalize">{kat}</span>
                                <svg
                                  className={`w-4 h-4 transition-transform ${expandedCategories[kat] ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <AnimatePresence>
                                {expandedCategories[kat] && (
                                  <motion.ul
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden pl-3 border-l-2 border-gray-200 dark:border-gray-600 ml-3"
                                  >
                                    {(templatesByCategory[kat] || []).map((t) => (
                                      <li key={t.id}>
                                        <button
                                          type="button"
                                          onClick={() => applyTemplate(t.isi_pesan || '')}
                                          className="w-full text-left px-2 py-1.5 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded"
                                        >
                                          <span className="font-medium">{t.nama}</span>
                                          <span className="block truncate text-gray-500 dark:text-gray-400 mt-0.5">
                                            {(t.isi_pesan || '').slice(0, 60)}
                                            {(t.isi_pesan || '').length > 60 ? '…' : ''}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                  </motion.ul>
                                )}
                              </AnimatePresence>
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex gap-2 items-end">
                  <textarea
                    value={inputPesan}
                    onChange={(e) => setInputPesan(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleKirim()
                      }
                    }}
                    placeholder="Tulis pesan custom (informasi untuk pendaftar)..."
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    disabled={sending || !nomor}
                  />
                  <button
                    type="button"
                    onClick={handleKirim}
                    disabled={sending || !inputPesan.trim() || !nomor}
                    className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    title="Kirim"
                  >
                    {sending ? (
                      <span className="animate-spin block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                  Pesan dikirim via WhatsApp ke nomor di atas. Enter untuk kirim, Shift+Enter untuk baris baru.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )

  return createPortal(content, document.body)
}

export default RiwayatChatOffcanvas
