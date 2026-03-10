import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { chatAPI, waAPI, whatsappTemplateAPI } from '../../../services/api'
import { useAuthStore } from '../../../store/authStore'
import { useNotification } from '../../../contexts/NotificationContext'

/**
 * Offcanvas kanan: riwayat chat berdasarkan nomor.
 * Tampilan mirip chat, dengan input + tombol kirim di bawah untuk pesan custom dari admin.
 * Reload riwayat sesuai nomor saat dibuka / nomor berubah.
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
  const [inputPesan, setInputPesan] = useState('')
  const [sending, setSending] = useState(false)
  const [showTemplateList, setShowTemplateList] = useState(false)
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const listEndRef = useRef(null)

  const nomor = (nomorTujuan || '').trim()

  const fetchRiwayat = async () => {
    if (!nomor) {
      setList([])
      return
    }
    setLoading(true)
    try {
      const res = await chatAPI.getChatByNomor(nomor, 100)
      const data = Array.isArray(res?.data) ? res.data : []
      setList(data)
    } catch (e) {
      console.error('Fetch riwayat chat:', e)
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && nomor) {
      fetchRiwayat()
    } else if (!isOpen) {
      setList([])
      setInputPesan('')
      setShowTemplateList(false)
      setExpandedCategories({})
    }
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

  const handleKirim = async () => {
    const pesan = (inputPesan || '').trim()
    if (!pesan || !nomor) {
      showNotification('Isi pesan dan pastikan nomor tersedia', 'warning')
      return
    }
    setSending(true)
    try {
      const sendRes = await waAPI.send(nomor, pesan, 'uwaba1')
      if (!sendRes?.success) {
        showNotification(sendRes?.message || 'Gagal mengirim pesan', 'error')
        return
      }
      const adminNama = user?.nama || user?.username || 'Admin'
      await chatAPI.saveChat({
        id_santri: String(idSantri || ''),
        nama_santri: String(namaSantri || ''),
        nomor_tujuan: nomor,
        pesan,
        page: 'pendaftaran',
        source: 'edited',
        status_pengiriman: 'berhasil',
        admin_pengirim: adminNama
      })
      setInputPesan('')
      await fetchRiwayat()
      showNotification('Pesan terkirim', 'success')
    } catch (err) {
      console.error('Kirim pesan:', err)
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
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 flex-shrink-0"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
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
                    {[...list].reverse().map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col items-end"
                      >
                        <div className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2 bg-teal-600 text-white text-sm shadow-sm">
                          <div className="whitespace-pre-wrap break-words">{item.pesan}</div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          <span>{formatWaktu(item.tanggal_dibuat)}</span>
                          {item.admin_pengirim && (
                            <span className="truncate max-w-[120px]" title={item.admin_pengirim}>
                              {item.admin_pengirim}
                            </span>
                          )}
                          {item.status_pengiriman && (
                            <span className={
                              item.status_pengiriman === 'berhasil'
                                ? 'text-green-600 dark:text-green-400'
                                : item.status_pengiriman === 'gagal'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-yellow-600 dark:text-yellow-400'
                            }>
                              {item.status_pengiriman === 'berhasil' ? '✓' : item.status_pengiriman === 'gagal' ? '✗' : '⋯'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
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
