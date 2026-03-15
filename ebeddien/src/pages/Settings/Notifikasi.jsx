import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'
import { notificationConfigAPI } from '../../services/api'

const PROVIDERS = [
  { value: 'wa_sendiri', label: 'WA server sendiri', description: 'Pakai koneksi WhatsApp yang dikelola di halaman WhatsApp (scan QR, multi-session).' },
  { value: 'watzap', label: 'WatZap', description: 'Pakai layanan WatZap (api.watzap.id). Kelola device & kirim pesan dari halaman WatZap.' }
]

const KATEGORI_LABELS = {
  biodata_terdaftar: 'Biodata tersimpan',
  berkas_lengkap: 'Berkas lengkap',
  sudah_diverifikasi: 'Sudah diverifikasi',
  verifikasi: 'Verifikasi',
  pembayaran_link: 'Pembayaran – link',
  pembayaran_berhasil: 'Pembayaran berhasil',
  pembayaran_gagal: 'Pembayaran gagal',
  pembayaran_kadaluarsa: 'Pembayaran kadaluarsa',
  pembayaran_ipaymu_order: 'Pembayaran iPayMu – order',
  pembayaran_ipaymu_qris: 'Pembayaran iPayMu – QRIS',
  pembayaran_dibatalkan: 'Pembayaran dibatalkan',
  incoming: 'Pesan masuk',
  custom: 'Pesan custom (riwayat data pendaftar)',
  daftar: 'Daftar user',
  auth: 'Ubah password / auth'
}

function getKategoriLabel(kategori) {
  return KATEGORI_LABELS[kategori] || kategori.replace(/_/g, ' ')
}

export default function Notifikasi() {
  const { showNotification } = useNotification()
  const [activeTab, setActiveTab] = useState('pengaturan')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [provider, setProvider] = useState('wa_sendiri')
  const [error, setError] = useState(null)
  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [offcanvasKategori, setOffcanvasKategori] = useState(null)
  const [offcanvasLabel, setOffcanvasLabel] = useState('')
  const [messages, setMessages] = useState([])
  const [messagesTotal, setMessagesTotal] = useState(0)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesPage, setMessagesPage] = useState(1)
  const limit = 30

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    notificationConfigAPI
      .getConfig()
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data?.provider) {
          setProvider(res.data.provider === 'watzap' ? 'watzap' : 'wa_sendiri')
        }
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.response?.data?.message || err?.message || 'Gagal memuat pengaturan notifikasi'
        if (err?.response?.status === 404) {
          setError(null)
          return
        }
        setError(msg)
        showNotification(msg, 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [showNotification])

  useEffect(() => {
    if (activeTab !== 'riwayat') return
    let cancelled = false
    setGroupsLoading(true)
    notificationConfigAPI.getNotificationGroups()
      .then((res) => {
        if (cancelled) return
        if (res?.success && Array.isArray(res?.data)) {
          setGroups(res.data)
        } else {
          setGroups([])
        }
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false)
      })
    return () => { cancelled = true }
  }, [activeTab])

  useEffect(() => {
    if (!offcanvasOpen || !offcanvasKategori) {
      setMessages([])
      setMessagesTotal(0)
      setMessagesPage(1)
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    notificationConfigAPI.getNotificationMessages(offcanvasKategori, 1, limit)
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data) {
          setMessages(res.data.items || [])
          setMessagesTotal(res.data.total ?? 0)
          setMessagesPage(1)
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false)
      })
    return () => { cancelled = true }
  }, [offcanvasOpen, offcanvasKategori])

  const loadMoreMessages = () => {
    if (!offcanvasKategori || messagesLoading) return
    const nextPage = messagesPage + 1
    setMessagesLoading(true)
    notificationConfigAPI.getNotificationMessages(offcanvasKategori, nextPage, limit)
      .then((res) => {
        if (res?.success && res?.data?.items?.length) {
          setMessages((prev) => [...prev, ...(res.data.items || [])])
          setMessagesPage(nextPage)
        }
      })
      .finally(() => setMessagesLoading(false))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await notificationConfigAPI.saveConfig({ provider })
      if (res?.success) {
        showNotification('Pengaturan notifikasi disimpan.', 'success')
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openOffcanvas = (kategori) => {
    setOffcanvasKategori(kategori)
    setOffcanvasLabel(getKategoriLabel(kategori))
    setOffcanvasOpen(true)
  }

  const closeOffcanvas = () => {
    setOffcanvasOpen(false)
    setOffcanvasKategori(null)
    setOffcanvasLabel('')
  }

  const formatDate = (str) => {
    if (!str) return '–'
    try {
      const d = new Date(str)
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return str
    }
  }

  const hasMoreMessages = messages.length < messagesTotal

  if (loading) {
    return (
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-center flex-1 min-h-[200px]">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto p-4 pb-8">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Notifikasi</h1>

          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
            <button
              type="button"
              onClick={() => setActiveTab('pengaturan')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'pengaturan'
                  ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Pengaturan
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('riwayat')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'riwayat'
                  ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Riwayat terkirim
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {activeTab === 'pengaturan' && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Provider notifikasi WA</h2>
              </div>
              <div className="p-4 space-y-4">
                {PROVIDERS.map((p) => (
                  <label
                    key={p.value}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      provider === p.value
                        ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-900/20 dark:border-teal-600'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={p.value}
                      checked={provider === p.value}
                      onChange={() => setProvider(p.value)}
                      className="mt-1 rounded-full border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{p.label}</span>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{p.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
                {provider === 'wa_sendiri' && (
                  <Link to="/whatsapp-koneksi" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                    Buka halaman WhatsApp →
                  </Link>
                )}
                {provider === 'watzap' && (
                  <Link to="/settings/watzap" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
                    Buka halaman WatZap →
                  </Link>
                )}
              </div>
            </div>
          )}

          {activeTab === 'riwayat' && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Notifikasi terkirim per tipe</h2>
              </div>
              <div className="p-4">
                {groupsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-9 w-9 border-2 border-teal-500 border-t-transparent" />
                  </div>
                ) : groups.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 mb-3">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada data notifikasi terkirim.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {groups.map((g) => (
                      <li key={g.kategori}>
                        <button
                          type="button"
                          onClick={() => openOffcanvas(g.kategori)}
                          className="w-full flex items-center gap-4 p-4 text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 hover:border-teal-200 dark:hover:border-teal-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                        >
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block font-medium text-gray-800 dark:text-gray-200 truncate">
                              {getKategoriLabel(g.kategori)}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {g.total} pesan terkirim
                            </span>
                          </div>
                          <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {offcanvasOpen ? [
            <motion.div
              key="notif-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={closeOffcanvas}
              aria-hidden
            />,
            <motion.div
              key="notif-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed right-0 top-0 bottom-0 z-[60] w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col"
            >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate pr-2">
                    {offcanvasLabel}
                  </h3>
                  <button
                    type="button"
                    onClick={closeOffcanvas}
                    className="flex-shrink-0 p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  {messagesLoading && messages.length === 0 ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-9 w-9 border-2 border-teal-500 border-t-transparent" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-6">Tidak ada pesan.</p>
                  ) : (
                    <ul className="space-y-3">
                      {messages.map((msg) => (
                        <li
                          key={msg.id}
                          className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-3 mb-2">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {msg.nomor_tujuan}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 break-words">
                            {(msg.isi_pesan || '').trim() || '(tanpa teks)'}
                          </p>
                          {msg.status && msg.status !== 'terkirim' && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 mt-2 block">{msg.status}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasMoreMessages && (
                    <div className="mt-5 flex justify-center">
                      <button
                        type="button"
                        onClick={loadMoreMessages}
                        disabled={messagesLoading}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 disabled:opacity-50 transition-colors"
                      >
                        {messagesLoading ? 'Memuat...' : `Muat lebih (${messages.length} / ${messagesTotal})`}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
          ] : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
