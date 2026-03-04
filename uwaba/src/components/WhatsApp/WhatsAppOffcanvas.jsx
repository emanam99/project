import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { chatAPI, waAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { checkWhatsAppNumber as checkWaNumberUtil } from '../../utils/whatsappCheck'

function WhatsAppOffcanvas({ isOpen, onClose, santriId, namaSantri, noTelpon, page = 'uwaba' }) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('chat')
  const [message, setMessage] = useState('')
  const [editedMessage, setEditedMessage] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [waNumber, setWaNumber] = useState('')
  const [waStatus, setWaStatus] = useState(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [riwayatCount, setRiwayatCount] = useState(0)
  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  useEffect(() => {
    if (isOpen && noTelpon) {
      setWaNumber(noTelpon)
      setTimeout(() => checkWaNumber(), 300)
    }
  }, [isOpen, noTelpon])

  useEffect(() => {
    if (isOpen && santriId) loadRiwayatCount()
  }, [isOpen, santriId])

  useEffect(() => {
    if (isOpen && activeTab === 'riwayat' && santriId) loadChatHistory()
  }, [isOpen, activeTab, santriId])

  useEffect(() => {
    if (isOpen && namaSantri) generateMessage()
  }, [isOpen, namaSantri, page])

  const loadRiwayatCount = async () => {
    if (!santriId) return
    try {
      const result = await chatAPI.getCountBySantri(santriId)
      if (result && result.success) {
        setRiwayatCount(result.count || result.data || 0)
      } else {
        setRiwayatCount(0)
      }
    } catch (error) {
      console.error('Error loading riwayat count:', error)
      setRiwayatCount(0)
    }
  }

  const loadChatHistory = async () => {
    if (!santriId) return
    setIsLoadingHistory(true)
    try {
      const result = await chatAPI.getChatBySantri(santriId)
      if (result && result.success) {
        setChatHistory(Array.isArray(result.data) ? result.data : [])
      } else {
        setChatHistory([])
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
      setChatHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const generateMessage = () => {
    const pageLabel = page === 'khusus' ? 'Khusus' : (page === 'tunggakan' ? 'Tunggakan' : 'Uwaba')
    const origin = window.location.origin
    // Link ke halaman public santri (bukan kwitansi/print) agar wali bisa buka data santri
    const publicLink = `${origin}/public/${page}?id=${santriId}`

    const template = `Assalamualaikum,
Kepada wali santri *${namaSantri}*, santri tersebut belum melakukan pembayaran ${pageLabel} bulanan.
Mohon segera melakukan pembayaran di kantor UWABA Al-Utsmani. Jam buka kantor 08.00 - 16.00 WIB.

Terima kasih.

Lihat riwayat ${pageLabel}: ${publicLink}

> Simpan nomor ini untuk informasi pembayaran.
> Pembayaran ini akan menjadi persyaratan Kwartal ke 3`

    setMessage(template)
    setEditedMessage(template)
  }

  const checkWaNumber = async () => {
    if (!waNumber.trim()) {
      showNotification('Masukkan nomor terlebih dahulu', 'error')
      return
    }
    setIsChecking(true)
    setWaStatus('checking')
    try {
      const result = await checkWaNumberUtil(waNumber)
      if (result.success && result.isRegistered) {
        setWaStatus('registered')
      } else {
        setWaStatus('not_registered')
        if (result.message) showNotification(result.message, 'warning')
      }
    } catch (error) {
      console.error('Error checking WhatsApp number:', error)
      setWaStatus('not_registered')
      showNotification('Gagal mengecek nomor WhatsApp', 'error')
    } finally {
      setIsChecking(false)
    }
  }

  const formatPhoneForWa = (num) => {
    let n = (num || '').replace(/\D/g, '')
    if (n.startsWith('0')) n = '62' + n.substring(1)
    else if (!n.startsWith('62')) n = '62' + n
    return n.trim()
  }

  const sendViaBackend = async (instance) => {
    if (!waNumber.trim()) {
      showNotification('Masukkan nomor tujuan terlebih dahulu!', 'error')
      return
    }
    if (waStatus !== 'registered') {
      showNotification('Nomor belum terdaftar di WhatsApp. Silakan cek nomor terlebih dahulu.', 'warning')
      return
    }
    const messageToSend = isEditing ? editedMessage : message
    if (!messageToSend.trim()) {
      showNotification('Pesan tidak boleh kosong', 'error')
      return
    }

    setIsSending(true)
    const formattedNumber = formatPhoneForWa(waNumber)
    const adminName = user?.nama || user?.id || 'admin'

    try {
      const result = await waAPI.send(formattedNumber, messageToSend.trim(), instance)
      const ok = result && (result.success === true || (result.success !== false && !result.message))
      if (ok) {
        const viaWaLabel = instance === 'uwaba2' ? 'WA 2' : instance === 'uwaba1' ? 'WA 1' : 'Manual'
        await chatAPI.saveChat({
          id_santri: santriId,
          nama_santri: namaSantri,
          nomor_tujuan: formattedNumber,
          pesan: messageToSend.trim(),
          page: page,
          source: isEditing ? 'edited' : 'template',
          status_pengiriman: 'berhasil',
          nomor_aktif: true,
          admin_pengirim: adminName,
          nomor_uwaba: instance,
          via_wa: viaWaLabel
        })
        loadRiwayatCount()
        if (activeTab === 'riwayat') loadChatHistory()
        showNotification('Pesan berhasil dikirim!', 'success')
        onClose()
      } else {
        throw new Error(result?.message || 'Gagal mengirim pesan')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      showNotification(error.response?.data?.message || error.message || 'Gagal mengirim pesan', 'error')
    } finally {
      setIsSending(false)
    }
  }

  const sendViaManual = () => {
    const messageToSend = isEditing ? editedMessage : message
    if (!waNumber.trim()) {
      showNotification('Masukkan nomor tujuan terlebih dahulu!', 'error')
      return
    }
    const formattedNumber = formatPhoneForWa(waNumber)
    const encodedMessage = encodeURIComponent(messageToSend.trim())
    const waUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`

    if (santriId && namaSantri) {
      const adminName = user?.nama || user?.id || 'admin'
      chatAPI.saveChat({
        id_santri: santriId,
        nama_santri: namaSantri,
        nomor_tujuan: formattedNumber,
        pesan: messageToSend.trim(),
        page: page,
        source: isEditing ? 'edited' : 'manual',
        status_pengiriman: 'berhasil',
        nomor_aktif: true,
        admin_pengirim: adminName,
        nomor_uwaba: 'manual',
        via_wa: 'Manual'
      }).then(() => {
        loadRiwayatCount()
        if (activeTab === 'riwayat') loadChatHistory()
      }).catch(err => console.error('Error saving chat:', err))
    }
    window.open(waUrl, '_blank')
  }

  const handleEdit = () => setIsEditing(true)
  const handleSaveEdit = () => {
    setMessage(editedMessage)
    setIsEditing(false)
  }
  const handleCancelEdit = () => {
    setEditedMessage(message)
    setIsEditing(false)
  }

  const offcanvasContent = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && (
        <>
          <motion.div
            key="wa-offcanvas-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
          />
          <motion.div
            key="wa-offcanvas-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] z-[9999] overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Pesan WhatsApp</h3>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'chat' ? 'border-teal-600 text-teal-600 dark:text-teal-400' : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveTab('riwayat')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'riwayat' ? 'border-teal-600 text-teal-600 dark:text-teal-400' : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Riwayat ({riwayatCount})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'chat' ? (
                <div className="space-y-4">
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                    {!isEditing ? (
                      <>
                        <div className="text-gray-800 dark:text-gray-200 mb-2 whitespace-pre-wrap">{message}</div>
                        <button onClick={handleEdit} className="text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                          Edit
                        </button>
                      </>
                    ) : (
                      <>
                        <textarea
                          value={editedMessage}
                          onChange={(e) => setEditedMessage(e.target.value)}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 resize-none"
                          rows={6}
                        />
                        <div className="flex gap-2 mt-2">
                          <button onClick={handleSaveEdit} className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded">Simpan</button>
                          <button onClick={handleCancelEdit} className="text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 px-3 py-1 rounded">Batal</button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">Nomor Tujuan:</label>
                      <input
                        type="text"
                        value={waNumber}
                        onChange={(e) => setWaNumber(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        placeholder="08xxxxxxxxxx"
                      />
                      <button type="button" onClick={checkWaNumber} disabled={isChecking} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded disabled:opacity-50">
                        {isChecking ? '⏳' : 'Cek Nomor'}
                      </button>
                    </div>
                    <div className="text-xs">
                      {waStatus === 'checking' && <span className="text-yellow-600 dark:text-yellow-400">Sedang mengecek...</span>}
                      {waStatus === 'registered' && <span className="text-green-600 dark:text-green-400">✓ Nomor terdaftar di WhatsApp</span>}
                      {waStatus === 'not_registered' && <span className="text-red-600 dark:text-red-400">✗ Nomor tidak terdaftar</span>}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => sendViaBackend('uwaba1')}
                      disabled={isSending || waStatus !== 'registered'}
                      className="flex-1 min-w-[100px] bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? 'Mengirim...' : 'UWABA 1'}
                    </button>
                    <button
                      onClick={() => sendViaBackend('uwaba2')}
                      disabled={isSending || waStatus !== 'registered'}
                      className="flex-1 min-w-[100px] bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? 'Mengirim...' : 'UWABA 2'}
                    </button>
                    <button onClick={sendViaManual} className="flex-1 min-w-[100px] bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      Via Manual
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  {isLoadingHistory ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-4">Memuat riwayat...</div>
                  ) : chatHistory.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-4">Belum ada riwayat chat untuk santri ini</div>
                  ) : (
                    <div className="space-y-2">
                      {chatHistory.map((chat, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                              {new Date(chat.tanggal_dibuat).toLocaleString('id-ID')}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${chat.status_pengiriman === 'berhasil' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                              {chat.status_pengiriman}
                            </span>
                          </div>
                          {chat.admin_pengirim && <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Pengirim: {chat.admin_pengirim}</div>}
                          {(chat.via_wa || chat.nomor_uwaba) && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                              Via: {chat.via_wa || (chat.nomor_uwaba === 'uwaba2' ? 'WA 2' : chat.nomor_uwaba === 'manual' ? 'Manual' : 'WA 1')}
                            </div>
                          )}
                          <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">Nomor: {chat.nomor_tujuan}</div>
                          <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{chat.pesan}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  if (!showPortal) return null
  return createPortal(offcanvasContent, document.body)
}

export default WhatsAppOffcanvas
