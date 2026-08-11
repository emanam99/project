import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { chatAPI, waAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { checkWhatsAppNumber as checkWaNumberUtil } from '../../utils/whatsappCheck'

function WhatsAppModal({ isOpen, onClose, santriId, namaSantri, noTelpon, page = 'uwaba' }) {
  const { showNotification } = useNotification()
  const [activeTab, setActiveTab] = useState('chat')
  const [message, setMessage] = useState('')
  const [editedMessage, setEditedMessage] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [waNumber, setWaNumber] = useState('')
  const [waStatus, setWaStatus] = useState(null) // null, 'checking', 'registered', 'not_registered'
  const [isChecking, setIsChecking] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [riwayatCount, setRiwayatCount] = useState(0)

  // Set nomor default saat modal dibuka
  useEffect(() => {
    if (isOpen && noTelpon) {
      setWaNumber(noTelpon)
      // Auto-cek nomor saat modal dibuka
      setTimeout(() => {
        checkWhatsAppNumber()
      }, 300)
    }
  }, [isOpen, noTelpon])

  // Load riwayat count
  useEffect(() => {
    if (isOpen && santriId) {
      loadRiwayatCount()
    }
  }, [isOpen, santriId])

  // Load chat history saat tab riwayat aktif
  useEffect(() => {
    if (isOpen && activeTab === 'riwayat' && santriId) {
      loadChatHistory()
    }
  }, [isOpen, activeTab, santriId])

  // Generate pesan WhatsApp
  useEffect(() => {
    if (isOpen && namaSantri) {
      generateMessage()
    }
  }, [isOpen, namaSantri, page])

  const loadRiwayatCount = async () => {
    if (!santriId) return
    try {
      const result = await chatAPI.getCountBySantri(santriId)
      if (result && result.success) {
        // Backend mengembalikan count langsung, bukan di data
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
        // Backend mengembalikan data langsung di result.data
        setChatHistory(Array.isArray(result.data) ? result.data : [])
      } else {
        // Jika tidak sukses, set empty array tanpa error
        setChatHistory([])
      }
    } catch (error) {
      // Error sudah di-handle di api.js, jadi di sini hanya log untuk debugging
      console.error('Error loading chat history:', error)
      setChatHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const generateMessage = async () => {
    // Untuk sekarang, gunakan template sederhana
    // Nanti bisa diintegrasikan dengan Gemini API
    const pageLabel = page === 'khusus' ? 'Khusus' : (page === 'tunggakan' ? 'Tunggakan' : 'Uwaba')
    
    // Gunakan domain yang sama (current origin) untuk print
    const printDomain = window.location.origin
    
    // Link ke halaman public santri (bukan kwitansi/print) agar wali bisa buka data santri
    const publicLink = `${printDomain}/public/${page}?id=${santriId}`

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

  const checkWhatsAppNumber = async () => {
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
        if (result.message) {
          showNotification(result.message, 'warning')
        }
      }
    } catch (error) {
      console.error('Error checking WhatsApp number:', error)
      setWaStatus('not_registered')
      showNotification('Gagal mengecek nomor WhatsApp', 'error')
    } finally {
      setIsChecking(false)
    }
  }

  const sendViaAPI = async (instance) => {
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

    let formattedNumber = waNumber.replace(/\D/g, '')
    if (formattedNumber.startsWith('0')) formattedNumber = '62' + formattedNumber.substring(1)
    else if (!formattedNumber.startsWith('62')) formattedNumber = '62' + formattedNumber
    formattedNumber = formattedNumber.trim()

    try {
      const result = await waAPI.send(formattedNumber, messageToSend.trim(), instance)
      const ok = result && (result.success === true || (result.success !== false && !result.message))
      if (ok) {
        try {
          const user = JSON.parse(localStorage.getItem('user') || '{}')
          const nomorPengirim = result?.senderPhoneNumber ?? result?.data?.senderPhoneNumber
          const viaWaLabel = nomorPengirim ? `WA ${nomorPengirim}` : (instance === 'uwaba2' ? 'WA 2' : instance === 'uwaba1' ? 'WA 1' : 'Manual')
          await chatAPI.saveChat({
            id_santri: santriId,
            nomor_tujuan: formattedNumber,
            pesan: messageToSend.trim(),
            page: page,
            source: isEditing ? 'edited' : 'template',
            status_pengiriman: 'berhasil',
            nomor_aktif: true,
            id_pengurus: user?.id ?? null,
            nomor_uwaba: nomorPengirim || instance,
            via_wa: viaWaLabel
          })

          // Reload riwayat
          loadRiwayatCount()
          if (activeTab === 'riwayat') {
            loadChatHistory()
          }
        } catch (error) {
          console.error('Error saving chat:', error)
        }

        showNotification('Pesan berhasil dikirim!', 'success')
        onClose()
      } else {
        throw new Error(result.message || 'Gagal mengirim pesan')
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

    // Format nomor untuk wa.me
    let formattedNumber = waNumber.replace(/\D/g, '')
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '62' + formattedNumber.substring(1)
    } else if (!formattedNumber.startsWith('62')) {
      formattedNumber = '62' + formattedNumber
    }

    // Encode pesan
    const encodedMessage = encodeURIComponent(messageToSend.trim())
    const waUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`

    // Simpan ke database
    if (santriId && namaSantri) {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      chatAPI.saveChat({
        id_santri: santriId,
        nomor_tujuan: formattedNumber,
        pesan: messageToSend.trim(),
        page: page,
        source: isEditing ? 'edited' : 'manual',
        status_pengiriman: 'berhasil',
        nomor_aktif: true,
        id_pengurus: user?.id ?? null,
        nomor_uwaba: 'manual',
        via_wa: 'Manual'
      }).then(() => {
        loadRiwayatCount()
        if (activeTab === 'riwayat') {
          loadChatHistory()
        }
      }).catch(error => {
        console.error('Error saving chat:', error)
      })
    }

    window.open(waUrl, '_blank')
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    setMessage(editedMessage)
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditedMessage(message)
    setIsEditing(false)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Pesan WhatsApp</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-4">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('chat')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'chat'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
                Chat
              </button>
              <button
                onClick={() => setActiveTab('riwayat')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'riwayat'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                Riwayat <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">({riwayatCount})</span>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'chat' ? (
            <div className="space-y-4">
              {/* Message Box */}
              <div className="border border-gray-200 rounded-lg p-4">
                {!isEditing ? (
                  <>
                    <div className="text-gray-800 mb-2 whitespace-pre-wrap">{message}</div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={handleEdit}
                        className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition-colors"
                      >
                        <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        Edit
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <textarea
                      value={editedMessage}
                      onChange={(e) => setEditedMessage(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg text-gray-800 mb-2 resize-none"
                      rows="6"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveEdit}
                        className="text-xs bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded transition-colors"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* WA Status Container */}
              <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-gray-600 font-medium">Nomor Tujuan:</label>
                  <input
                    type="text"
                    value={waNumber}
                    onChange={(e) => setWaNumber(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:border-teal-500 focus:outline-none"
                    placeholder="08xxxxxxxxxx"
                  />
                  <button
                    type="button"
                    onClick={checkWhatsAppNumber}
                    disabled={isChecking}
                    className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    {isChecking ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        Cek Nomor
                      </>
                    )}
                  </button>
                </div>
                <div className="text-xs">
                  {waStatus === 'checking' && (
                    <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">Sedang mengecek...</span>
                  )}
                  {waStatus === 'registered' && (
                    <span className="px-2 py-1 rounded bg-green-100 text-green-800">✓ Nomor terdaftar di WhatsApp</span>
                  )}
                  {waStatus === 'not_registered' && (
                    <span className="px-2 py-1 rounded bg-red-100 text-red-800">✗ Nomor tidak terdaftar di WhatsApp</span>
                  )}
                </div>
              </div>

              {/* Send Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => sendViaAPI('uwaba1')}
                  disabled={isSending || waStatus !== 'registered'}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                  </svg>
                  {isSending ? 'Mengirim...' : 'UWABA 1'}
                </button>
                <button
                  onClick={() => sendViaAPI('uwaba2')}
                  disabled={isSending || waStatus !== 'registered'}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                  </svg>
                  {isSending ? 'Mengirim...' : 'UWABA 2'}
                </button>
                <button
                  onClick={sendViaManual}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                  </svg>
                  Via Manual
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded-lg">
              {isLoadingHistory ? (
                <div className="text-center text-gray-500 py-4">
                  <svg className="w-6 h-6 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Memuat riwayat chat...
                </div>
              ) : chatHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                  </svg>
                  Belum ada riwayat chat untuk santri ini
                </div>
              ) : (
                <div className="space-y-2">
                  {chatHistory.map((chat, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm font-medium text-gray-800">
                          {new Date(chat.tanggal_dibuat).toLocaleString('id-ID')}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            chat.status_pengiriman === 'berhasil' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {chat.status_pengiriman}
                          </span>
                        </div>
                      </div>
                      {(chat.via_wa || chat.nomor_uwaba) && (
                        <div className="text-xs text-gray-500 mb-1">
                          Via: {chat.via_wa || (/^\d+$/.test(String(chat.nomor_uwaba || '')) ? `WA ${chat.nomor_uwaba}` : (chat.nomor_uwaba === 'uwaba2' ? 'WA 2' : chat.nomor_uwaba === 'manual' ? 'Manual' : 'WA 1'))}
                        </div>
                      )}
                      <div className="text-sm text-gray-600 mb-1">
                        Nomor: {chat.nomor_tujuan}
                      </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">
                        {chat.pesan}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Batal
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default WhatsAppModal

