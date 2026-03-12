import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { waBackendAPI, whatsappTemplateAPI } from '../../services/api'

const POLL_INTERVAL_CONNECTING = 2000
const POLL_INTERVAL_IDLE = 5000
const KATEGORI_OPTIONS = ['umum', 'pendaftaran', 'uwaba', 'keuangan', 'lainnya']

const TABS = [
  { id: 'koneksi', label: 'Koneksi' },
  { id: 'tes', label: 'Tes' },
  { id: 'template', label: 'Template' }
]

export default function KoneksiWa() {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.is_real_super_admin === true

  const [activeTab, setActiveTab] = useState('koneksi')
  const [data, setData] = useState({
    status: 'disconnected',
    qrCode: null,
    phoneNumber: null
  })
  const [backendUnavailable, setBackendUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [checkPhone, setCheckPhone] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [checking, setChecking] = useState(false)

  // Template tab state
  const [templateList, setTemplateList] = useState([])
  const [templateLoading, setTemplateLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ kategori: 'umum', nama: '', isi_pesan: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await waBackendAPI.getStatus()
      setBackendUnavailable(false)
      if (res?.success && res?.data) {
        setData({
          status: res.data.status || 'disconnected',
          qrCode: res.data.qrCode || null,
          phoneNumber: res.data.phoneNumber || null
        })
      } else if (res?.statusCode === 503 || res?.statusCode >= 500) {
        setBackendUnavailable(true)
        setData({ status: 'disconnected', qrCode: null, phoneNumber: null })
      }
    } catch (e) {
      console.error('KoneksiWa fetchStatus:', e)
      setBackendUnavailable(true)
      setData({ status: 'disconnected', qrCode: null, phoneNumber: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(
      fetchStatus,
      data.status === 'connecting' ? POLL_INTERVAL_CONNECTING : POLL_INTERVAL_IDLE
    )
    return () => clearInterval(interval)
  }, [fetchStatus, data.status])

  const fetchTemplateList = useCallback(async () => {
    setTemplateLoading(true)
    try {
      const res = await whatsappTemplateAPI.list()
      const list = Array.isArray(res?.data) ? res.data : []
      setTemplateList(list)
    } catch (e) {
      console.error('Fetch template:', e)
      setTemplateList([])
      showNotification('Gagal memuat template', 'error')
    } finally {
      setTemplateLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    if (activeTab === 'template') fetchTemplateList()
  }, [activeTab, fetchTemplateList])

  const handleConnect = async () => {
    setActionLoading('connect')
    try {
      const res = await waBackendAPI.connect()
      if (res?.success) {
        showNotification(res?.message || 'Memulai koneksi. Scan QR code jika muncul.', 'success')
        setData(prev => ({
          ...prev,
          status: res?.data?.status ?? 'connecting',
          qrCode: res?.data?.qrCode ?? prev.qrCode
        }))
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal menghubungkan', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau. Pastikan server WA berjalan.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDisconnect = async () => {
    setActionLoading('disconnect')
    try {
      const res = await waBackendAPI.disconnect()
      if (res?.success) {
        showNotification(res?.message || 'Koneksi diputus.', 'success')
        setData({ status: 'disconnected', qrCode: null, phoneNumber: null })
      } else {
        showNotification(res?.message || 'Gagal memutus koneksi', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleLogout = async () => {
    if (!window.confirm('Logout akan menghapus sesi WhatsApp. Untuk pakai lagi harus scan QR. Lanjutkan?')) return
    setActionLoading('logout')
    try {
      const res = await waBackendAPI.logout()
      if (res?.success) {
        showNotification(res?.message || 'Logout berhasil.', 'success')
        setData({ status: 'disconnected', qrCode: null, phoneNumber: null })
      } else {
        showNotification(res?.message || 'Gagal logout', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendTest = async () => {
    const phone = testPhone.trim()
    const msg = testMessage.trim()
    if (!phone) {
      showNotification('Masukkan nomor tujuan', 'warning')
      return
    }
    if (!msg) {
      showNotification('Masukkan isi pesan', 'warning')
      return
    }
    setSendingTest(true)
    try {
      const res = await waBackendAPI.send(phone, msg)
      if (res?.success) {
        showNotification('Pesan tes terkirim', 'success')
      } else {
        showNotification(res?.message || 'Gagal mengirim', 'error')
      }
    } catch (e) {
      showNotification('Gagal mengirim: ' + (e?.message || 'Network error'), 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const handleCheckNumber = async () => {
    const phone = checkPhone.trim()
    if (!phone) {
      showNotification('Masukkan nomor yang ingin dicek', 'warning')
      return
    }
    setChecking(true)
    setCheckResult(null)
    try {
      const res = await waBackendAPI.checkNumber(phone)
      if (res?.success && res?.data) {
        setCheckResult({
          isRegistered: res.data.isRegistered,
          phoneNumber: res.data.phoneNumber ?? phone
        })
        showNotification(res?.message ?? (res.data.isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar'), res.data.isRegistered ? 'success' : 'info')
      } else {
        showNotification(res?.message || 'Gagal mengecek nomor', 'error')
      }
    } catch (e) {
      showNotification('Gagal mengecek: ' + (e?.message || 'Network error'), 'error')
    } finally {
      setChecking(false)
    }
  }

  // Template: add/edit/delete
  const openAddTemplate = () => {
    setEditingId(null)
    setForm({ kategori: 'umum', nama: '', isi_pesan: '' })
    setFormOpen(true)
  }
  const openEditTemplate = (row) => {
    setEditingId(row.id)
    setForm({
      kategori: row.kategori || 'umum',
      nama: row.nama || '',
      isi_pesan: row.isi_pesan || ''
    })
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm({ kategori: 'umum', nama: '', isi_pesan: '' })
  }

  const handleSaveTemplate = async () => {
    const nama = (form.nama || '').trim()
    const isi_pesan = (form.isi_pesan || '').trim()
    if (!nama) {
      showNotification('Nama template wajib diisi', 'warning')
      return
    }
    if (!isi_pesan) {
      showNotification('Isi pesan wajib diisi', 'warning')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const res = await whatsappTemplateAPI.update({ id: editingId, kategori: form.kategori || 'umum', nama, isi_pesan })
        if (res?.success) {
          showNotification('Template berhasil diubah', 'success')
          closeForm()
          fetchTemplateList()
        } else {
          showNotification(res?.message || 'Gagal mengubah template', 'error')
        }
      } else {
        const res = await whatsappTemplateAPI.create({ kategori: form.kategori || 'umum', nama, isi_pesan })
        if (res?.success) {
          showNotification('Template berhasil ditambah', 'success')
          closeForm()
          fetchTemplateList()
        } else {
          showNotification(res?.message || 'Gagal menambah template', 'error')
        }
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!id) return
    setSaving(true)
    try {
      const res = await whatsappTemplateAPI.delete(id)
      if (res?.success) {
        showNotification('Template berhasil dihapus', 'success')
        setDeleteConfirm(null)
        fetchTemplateList()
      } else {
        showNotification(res?.message || 'Gagal menghapus', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menghapus', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data.qrCode) {
    return (
      <div className="h-full flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  const isConnected = data.status === 'connected'
  const isConnecting = data.status === 'connecting'

  const byCategory = templateList.reduce((acc, t) => {
    const k = t.kategori || 'umum'
    if (!acc[k]) acc[k] = []
    acc[k].push(t)
    return acc
  }, {})
  const categories = Object.keys(byCategory).sort()

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden max-h-[calc(100vh-8rem)]">
      {/* Sticky tab bar */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 px-4 pt-2">
        <div className="flex -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#25D366] text-[#25D366] dark:text-[#25D366]'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Konten tab (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 max-w-lg mx-auto pb-8">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'koneksi' && (
              <motion.div
                key="koneksi"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
              >
              <div className="p-4 space-y-4">
                {backendUnavailable && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    Layanan status WA tidak terjangkau (503 / CORS). Pastikan server wa2 berjalan dan proxy mengizinkan origin ini.
                  </div>
                )}
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Status</span>
                  <span
                    className={`text-sm font-semibold px-2 py-0.5 rounded ${
                      isConnected ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                      : isConnecting ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {isConnected ? 'Terhubung' : isConnecting ? 'Menghubungkan...' : 'Terputus'}
                  </span>
                </div>
                {isConnected && data.phoneNumber && (
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Nomor</span>
                    <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{data.phoneNumber}</span>
                  </div>
                )}
                {isConnecting && data.qrCode && (
                  <div className="flex flex-col items-center py-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Scan QR code dengan WhatsApp di HP Anda</p>
                    <img src={data.qrCode} alt="QR WhatsApp" className="w-56 h-56 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  {isConnected ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Koneksi</span>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input type="checkbox" checked={true} onChange={() => { if (actionLoading) return; handleDisconnect() }} disabled={!!actionLoading} className="sr-only" />
                          <span className="w-11 h-6 bg-[#25D366] rounded-full" />
                          <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow pointer-events-none translate-x-5" />
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">On</span>
                        </label>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Klik On → Off untuk putus sementara</span>
                    </>
                  ) : isConnecting ? (
                    <span className="text-sm text-amber-600 dark:text-amber-400">Menghubungkan...</span>
                  ) : (
                    <button type="button" onClick={handleConnect} disabled={!!actionLoading} className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                      {actionLoading === 'connect' ? 'Memulai...' : 'Hubungkan'}
                    </button>
                  )}
                  <button type="button" onClick={handleLogout} disabled={!!actionLoading} className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">Logout (hapus sesi)</button>
                </div>
              </div>
            </motion.div>
            )}

            {activeTab === 'tes' && (
              <motion.div
                key="tes"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
              >
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Tes</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Cek nomor aktif dan kirim pesan uji coba.</p>
              </div>
              <div className="p-4 space-y-4">
                {!isConnected && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">Hubungkan WhatsApp di tab Koneksi terlebih dahulu.</p>
                )}
                {/* Cek nomor aktif */}
                {isConnected && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cek nomor aktif</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Cek apakah nomor terdaftar di WhatsApp.</p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nomor (08xxx / 62xxx)</label>
                        <input type="text" placeholder="08123456789" value={checkPhone} onChange={(e) => { setCheckPhone(e.target.value); setCheckResult(null) }} onKeyDown={(e) => e.key === 'Enter' && handleCheckNumber()} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                      </div>
                      <button type="button" onClick={handleCheckNumber} disabled={checking} className="px-4 py-2 rounded-lg bg-gray-700 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        {checking ? 'Mengecek...' : 'Cek'}
                      </button>
                    </div>
                    {checkResult !== null && (
                      <div className={`py-2 px-3 rounded-lg text-sm font-medium ${checkResult.isRegistered ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {checkResult.isRegistered ? 'Aktif (terdaftar di WhatsApp)' : 'Tidak terdaftar di WhatsApp'}
                        {checkResult.phoneNumber && <span className="block text-xs mt-1 font-mono opacity-90">{checkResult.phoneNumber}</span>}
                      </div>
                    )}
                  </div>
                )}
                {/* Tes kirim pesan */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Kirim pesan tes</h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nomor tujuan (08xxx / 62xxx)</label>
                    <input type="text" placeholder="08123456789" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Isi pesan</label>
                    <textarea placeholder="Pesan tes" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm resize-y" />
                  </div>
                  <button type="button" onClick={handleSendTest} disabled={sendingTest || !isConnected} className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    {sendingTest ? 'Mengirim...' : 'Kirim tes'}
                  </button>
                </div>
              </div>
            </motion.div>
            )}

            {activeTab === 'template' && (
              <motion.div
                key="template"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
              >
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Template WhatsApp</h2>
                {isSuperAdmin && (
                  <button type="button" onClick={openAddTemplate} className="px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
                    + Tambah
                  </button>
                )}
              </div>
              <div className="p-4">
                {templateLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                  </div>
                ) : templateList.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    Belum ada template. {isSuperAdmin && 'Klik "Tambah" untuk menambah template.'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {categories.map((kat) => (
                      <div key={kat} className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 font-medium text-sm text-gray-700 dark:text-gray-200 capitalize">{kat}</div>
                        <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                          {(byCategory[kat] || []).map((t) => (
                            <li key={t.id} className="px-3 py-2 flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm text-gray-800 dark:text-gray-200">{t.nama}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.isi_pesan}</div>
                              </div>
                              {isSuperAdmin && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button type="button" onClick={() => openEditTemplate(t)} className="p-1.5 rounded text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30" title="Edit">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button type="button" onClick={() => setDeleteConfirm(t)} className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30" title="Hapus">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Offcanvas bawah + modal hapus: di-render ke body agar di atas nav bawah (z-[100]) */}
      {createPortal(
        <>
          <AnimatePresence>
            {formOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={closeForm}
                  className="fixed inset-0 bg-black/40 z-[110]"
                />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  className="fixed bottom-0 left-0 right-0 z-[111] flex flex-col max-h-[85vh] w-full sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 rounded-t-xl bg-white dark:bg-gray-800 shadow-xl"
                >
                  <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
                    <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden />
                  </div>
                  <div className="px-4 pb-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{editingId ? 'Edit Template' : 'Tambah Template'}</h3>
                    <button type="button" onClick={closeForm} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300" aria-label="Tutup">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="px-4 py-3 space-y-4 overflow-y-auto flex-1 min-h-0">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
                      <select value={form.kategori} onChange={(e) => setForm((f) => ({ ...f, kategori: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        {KATEGORI_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama template</label>
                      <input type="text" value={form.nama} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))} placeholder="Contoh: Konfirmasi pendaftaran" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Isi pesan</label>
                      <textarea value={form.isi_pesan} onChange={(e) => setForm((f) => ({ ...f, isi_pesan: e.target.value }))} rows={4} placeholder="Teks yang akan dikirim..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-none" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 pb-6 sm:pb-3">
                    <button type="button" onClick={closeForm} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Batal</button>
                    <button type="button" onClick={handleSaveTemplate} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg">{saving ? 'Menyimpan...' : (editingId ? 'Simpan' : 'Tambah')}</button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {deleteConfirm && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteConfirm(null)} className="fixed inset-0 bg-black/30 z-[110]" />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl z-[111] p-4">
                  <p className="text-gray-700 dark:text-gray-200 mb-4">Hapus template &quot;{deleteConfirm.nama}&quot;?</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Batal</button>
                    <button type="button" onClick={() => handleDeleteTemplate(deleteConfirm.id)} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">{saving ? 'Menghapus...' : 'Hapus'}</button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}
    </div>
  )
}
