import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import {
  waBackendAPI,
  whatsappTemplateAPI,
  getWaBackendUrl,
  isWaDockerHostControlEnabled,
  postWaDockerStop,
  postWaDockerStart
} from '../../services/api'

const POLL_INTERVAL_CONNECTING = 2000
const POLL_INTERVAL_IDLE = 10000
/** ID sesi tunggal yang dipakai body ke backend Node (kompatibilitas; tidak ditampilkan di UI). */
const INTERNAL_WA_SESSION = 'default'
const KATEGORI_OPTIONS = ['umum', 'pendaftaran', 'uwaba', 'keuangan', 'lainnya']

/** Alur koneksi selesai jika Baileys (satu QR) sudah terhubung. */
function isSlotConnectFlowDone(s) {
  if (!s) return false
  return s.status === 'connected' || s.baileysStatus === 'connected'
}

const TABS = [
  { id: 'koneksi', label: 'Koneksi' },
  { id: 'tes', label: 'Tes' },
  { id: 'template', label: 'Template' }
]

/** WA mengganti QR sekitar tiap 20 d — hitung mundur; refresh status hanya jika autoPollStatus (hemat request). */
const QR_COUNTDOWN_SECONDS = 20

function WaQrCountdownBlock({ title, qrSrc, alt, fetchStatus, onReloadQr, reloadDisabled, autoPollStatus = true }) {
  const [sec, setSec] = useState(QR_COUNTDOWN_SECONDS)

  useEffect(() => {
    if (!qrSrc || !autoPollStatus) return undefined
    let remaining = QR_COUNTDOWN_SECONDS
    setSec(QR_COUNTDOWN_SECONDS)
    const id = setInterval(() => {
      remaining -= 1
      if (remaining < 1) {
        remaining = QR_COUNTDOWN_SECONDS
        fetchStatus()
      }
      setSec(remaining)
    }, 1000)
    return () => clearInterval(id)
  }, [qrSrc, fetchStatus, autoPollStatus])

  return (
    <div className="flex flex-col items-center py-3">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 text-center px-1">{title}</p>
      <img src={qrSrc} alt={alt} className="w-48 h-48 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white" />
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 w-full max-w-sm">
        <p className="text-xs text-gray-600 dark:text-gray-400 text-center sm:text-left">
          {autoPollStatus ? (
            <>
              QR berubah otomatis sekitar{' '}
              <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{sec}</span>
              {' '}detik — segera scan.
            </>
          ) : (
            <>
              QR WhatsApp biasanya kedaluwarsa sekitar{' '}
              <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{sec}</span>
              {' '}detik. Jika tidak jalan, klik Muat ulang.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => onReloadQr()}
          disabled={reloadDisabled}
          className="shrink-0 self-center px-2.5 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Muat ulang QR
        </button>
      </div>
    </div>
  )
}

export default function KoneksiWa() {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.is_real_super_admin === true
  /** Super admin + env: stop/start memanggil PHP → docker compose (bukan hanya matikan engine di Node). */
  const useDockerHostCtl = isWaDockerHostControlEnabled() && isSuperAdmin

  const [activeTab, setActiveTab] = useState('koneksi')
  const emptyWa = {
    status: 'disconnected',
    qrCode: null,
    phoneNumber: null,
    baileysStatus: 'disconnected',
    baileysQrCode: null,
    baileysPhoneNumber: null
  }
  const [wa, setWa] = useState(() => ({ ...emptyWa }))
  const [backendUnavailable, setBackendUnavailable] = useState(false)
  const [backendErrorHint, setBackendErrorHint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [checkPhone, setCheckPhone] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [checking, setChecking] = useState(false)
  const [waEngineEnabled, setWaEngineEnabled] = useState(true)
  const fetchStatusInFlightRef = useRef(false)
  /** Lembar hubungkan WA: tidak spam getQr; QR hanya lewat tombol Muat QR. */
  const [showConnectDrawer, setShowConnectDrawer] = useState(false)
  const [connectDrawerSuccess, setConnectDrawerSuccess] = useState(false)
  const [connectDrawerError, setConnectDrawerError] = useState(null)
  const [connectDrawerBusy, setConnectDrawerBusy] = useState(false)

  // Template tab state
  const [templateList, setTemplateList] = useState([])
  const [templateLoading, setTemplateLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ kategori: 'umum', nama: '', isi_pesan: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchStatus = useCallback(async () => {
    if (fetchStatusInFlightRef.current) return
    fetchStatusInFlightRef.current = true
    try {
      const res = await waBackendAPI.getStatus()
      setBackendUnavailable(false)
      setBackendErrorHint(null)
      if (res?.success && res?.data) {
        const d = res.data
        setWaEngineEnabled(d.waEngineEnabled !== false)
        let back = {
          status: d.status || 'disconnected',
          qrCode: d.qrCode ?? null,
          phoneNumber: d.phoneNumber ?? null,
          baileysStatus: d.baileysStatus || 'disconnected',
          baileysQrCode: d.baileysQrCode ?? null,
          baileysPhoneNumber: d.baileysPhoneNumber ?? null
        }
        if (d.sessions && typeof d.sessions === 'object') {
          const slot = d.sessions[INTERNAL_WA_SESSION] || Object.values(d.sessions)[0]
          if (slot && typeof slot === 'object') {
            back = {
              status: slot.status ?? back.status,
              qrCode: slot.qrCode ?? back.qrCode,
              phoneNumber: slot.phoneNumber ?? back.phoneNumber,
              baileysStatus: slot.baileysStatus ?? back.baileysStatus,
              baileysQrCode: slot.baileysQrCode ?? back.baileysQrCode,
              baileysPhoneNumber: slot.baileysPhoneNumber ?? back.baileysPhoneNumber
            }
          }
        }
        setWa((prev) => {
          const backStatus = back.status || back.baileysStatus
          const prevStatus = prev.status || prev.baileysStatus
          if (prevStatus === 'connected' && backStatus === 'connecting') return prev
          const next = { ...back }
          if (next.status === 'connected' || next.baileysStatus === 'connected') {
            next.qrCode = null
            next.baileysQrCode = null
          }
          const isConnecting = next.status === 'connecting' || next.baileysStatus === 'connecting'
          if (isConnecting) {
            if (next.qrCode == null && prev.qrCode) next.qrCode = prev.qrCode
            if (next.baileysQrCode == null && prev.baileysQrCode) next.baileysQrCode = prev.baileysQrCode
          }
          const same =
            prev.status === next.status &&
            prev.phoneNumber === next.phoneNumber &&
            prev.baileysStatus === next.baileysStatus &&
            prev.baileysPhoneNumber === next.baileysPhoneNumber &&
            prev.qrCode === next.qrCode &&
            prev.baileysQrCode === next.baileysQrCode
          return same ? prev : next
        })
      } else if (res?.statusCode === 503 || res?.statusCode >= 500) {
        setBackendUnavailable(true)
      }
    } catch (e) {
      console.error('KoneksiWa fetchStatus:', e)
      setBackendUnavailable(true)
      setBackendErrorHint(
        (e?.message === 'Failed to fetch' || e?.name === 'TypeError')
          ? 'Koneksi gagal (SSL/CORS/network). Jika ERR_CERT_COMMON_NAME_INVALID, set VITE_WA_BACKEND_URL di .env ke URL backend WA yang valid.'
          : null
      )
    } finally {
      fetchStatusInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const hasConnecting = wa.status === 'connecting' || wa.baileysStatus === 'connecting'
  const connectDrawerOpen = showConnectDrawer

  useEffect(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return undefined
    fetchStatus()
    const ms = connectDrawerOpen
      ? POLL_INTERVAL_CONNECTING
      : (hasConnecting ? 5000 : POLL_INTERVAL_IDLE)
    const interval = setInterval(fetchStatus, ms)
    return () => clearInterval(interval)
  }, [fetchStatus, hasConnecting, connectDrawerOpen])

  /** Saat lembar hubungkan mencapai langkah selesai, tampilkan layar sukses (tanpa menutup otomatis). */
  useEffect(() => {
    if (!showConnectDrawer || connectDrawerSuccess) return
    if (isSlotConnectFlowDone(wa)) {
      setConnectDrawerSuccess(true)
      setConnectDrawerError(null)
    }
  }, [showConnectDrawer, connectDrawerSuccess, wa])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchStatus()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchStatus])

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

  const openConnectDrawer = () => {
    if (!waEngineEnabled) {
      showNotification('Server WA sedang dihentikan. Jalankan dulu server WA.', 'warning')
      return
    }
    setShowConnectDrawer(true)
    setConnectDrawerSuccess(false)
    setConnectDrawerError(null)
  }

  const isSignedSession = (session) => {
    if (!session) return false
    return !!(session.phoneNumber || session.baileysPhoneNumber)
  }

  const handleConnectClick = async () => {
    if (!waEngineEnabled) {
      showNotification('Server WA sedang dihentikan. Jalankan dulu server WA.', 'warning')
      return
    }

    const session = wa
    const shouldQuickConnect = isSignedSession(session)
    if (!shouldQuickConnect) {
      openConnectDrawer()
      return
    }

    setActionLoading('connect-wa')
    try {
      const res = await waBackendAPI.connect(INTERNAL_WA_SESSION, { refreshQr: false })
      if (!res?.success) {
        openConnectDrawer()
        showNotification(res?.message || 'Gagal menghubungkan. Silakan muat QR.', 'warning')
        return
      }

      const payload = res?.data || {}
      setWa((prev) => ({
        ...prev,
        status: payload.status ?? prev.status ?? 'connecting',
        qrCode: payload.qrCode ?? prev.qrCode ?? null,
        phoneNumber: payload.phoneNumber ?? prev.phoneNumber ?? null,
        baileysStatus: payload.baileysStatus ?? prev.baileysStatus ?? 'disconnected',
        baileysQrCode: payload.baileysQrCode ?? prev.baileysQrCode ?? null,
        baileysPhoneNumber: payload.baileysPhoneNumber ?? prev.baileysPhoneNumber ?? null
      }))

      await fetchStatus()
      const merged = { ...(session || {}), ...payload }
      const needQr = !!(merged.qrCode || merged.baileysQrCode)
      if (isSlotConnectFlowDone(merged)) {
        showNotification('WhatsApp sudah login. Koneksi diproses langsung ke server.', 'success')
        return
      }
      if (needQr || merged.status === 'connecting' || merged.baileysStatus === 'connecting') {
        openConnectDrawer()
        return
      }
      showNotification('Permintaan hubungkan dikirim ke server.', 'info')
    } catch (e) {
      openConnectDrawer()
      showNotification(e?.message || 'Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const closeConnectDrawer = useCallback(() => {
    setShowConnectDrawer(false)
    setConnectDrawerSuccess(false)
    setConnectDrawerError(null)
    fetchStatus()
  }, [fetchStatus])

  /** Ambil QR dari endpoint /qr dengan beberapa percobaan (QR bisa muncul sedikit setelah connect). */
  const fetchQrWithRetry = async (attempts = 18, intervalMs = 400) => {
    for (let i = 0; i < attempts; i++) {
      const qrRes = await waBackendAPI.getQr(INTERNAL_WA_SESSION)
      const row = qrRes?.data
      if (row && (row.qrCode || row.baileysQrCode)) return row
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return null
  }

  /** Satu klik = connect + getQr (retry jika perlu). */
  const handleDrawerLoadQr = async (refreshQr = false) => {
    if (!showConnectDrawer) return
    setConnectDrawerBusy(true)
    setConnectDrawerError(null)
    try {
      const res = await waBackendAPI.connect(INTERNAL_WA_SESSION, { refreshQr: refreshQr === true })
      if (!res?.success) {
        const raw = String(res?.message || '')
        if (/timeout/i.test(raw)) {
          const qrRes = await waBackendAPI.getQr(INTERNAL_WA_SESSION)
          const qr = qrRes?.data
          if (qr && (qr.qrCode || qr.baileysQrCode)) {
            setWa((prev) => ({
              ...prev,
              qrCode: qr.qrCode ?? prev.qrCode ?? null,
              baileysQrCode: qr.baileysQrCode ?? prev.baileysQrCode ?? null
            }))
            await fetchStatus()
            return
          }
        }
        const msg = /timeout/i.test(raw)
          ? 'Permintaan ke server WA terlalu lama. Sesi mungkin tetap berjalan di latar — tunggu beberapa detik lalu klik Muat QR lagi.'
          : (raw || 'Gagal memulai koneksi')
        setConnectDrawerError(msg)
        return
      }
      const payload = res?.data || {}
      setWa((prev) => ({
        ...prev,
        status: payload.status ?? prev.status ?? 'connecting',
        qrCode: payload.qrCode ?? prev.qrCode ?? null,
        phoneNumber: payload.phoneNumber ?? prev.phoneNumber ?? null,
        baileysStatus: payload.baileysStatus ?? prev.baileysStatus ?? 'disconnected',
        baileysQrCode: payload.baileysQrCode ?? prev.baileysQrCode ?? null,
        baileysPhoneNumber: payload.baileysPhoneNumber ?? prev.baileysPhoneNumber ?? null
      }))
      const qr = (await fetchQrWithRetry()) || (await waBackendAPI.getQr(INTERNAL_WA_SESSION))?.data
      if (qr && (qr.qrCode || qr.baileysQrCode)) {
        setWa((prev) => ({
          ...prev,
          qrCode: qr.qrCode ?? prev.qrCode ?? null,
          baileysQrCode: qr.baileysQrCode ?? prev.baileysQrCode ?? null
        }))
      }
      await fetchStatus()
    } catch (e) {
      setConnectDrawerError(e?.message || 'Backend WA tidak terjangkau.')
    } finally {
      setConnectDrawerBusy(false)
    }
  }

  const handleDrawerReloadQr = () => handleDrawerLoadQr(true)

  const handleDisconnect = async () => {
    if (showConnectDrawer) {
      setShowConnectDrawer(false)
      setConnectDrawerSuccess(false)
      setConnectDrawerError(null)
    }
    setActionLoading('disconnect-wa')
    try {
      const res = await waBackendAPI.disconnect(INTERNAL_WA_SESSION)
      if (res?.success) {
        showNotification(res?.message || 'Koneksi diputus.', 'success')
        setWa({ ...emptyWa })
        fetchStatus()
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
    const s = wa
    const connected =
      s?.status === 'connected' || s?.baileysStatus === 'connected'
    const msg = connected
      ? 'Logout akan menghapus sesi WhatsApp di server (file auth). Untuk pakai lagi harus scan QR. Lanjutkan?'
      : 'Bersihkan file sesi di server?\n\nDirekomendasikan jika QR tidak muncul, koneksi macet, atau sisa sesi lama setelah pembaruan. Setelah ini Anda harus scan QR lagi. Lanjutkan?'
    if (!window.confirm(msg)) return
    if (showConnectDrawer) {
      setShowConnectDrawer(false)
      setConnectDrawerSuccess(false)
      setConnectDrawerError(null)
    }
    setActionLoading('logout-wa')
    try {
      const res = await waBackendAPI.logout(INTERNAL_WA_SESSION)
      if (res?.success) {
        showNotification(res?.message || 'Sesi server dibersihkan.', 'success')
        setWa({ ...emptyWa })
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal membersihkan sesi', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendTest = async () => {
    if (!waEngineEnabled) {
      showNotification('Server WA sedang dihentikan. Jalankan dulu server WA.', 'warning')
      return
    }
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
      const res = await waBackendAPI.send(phone, msg, null, null, INTERNAL_WA_SESSION)
      if (res?.success) {
        showNotification('Pesan tes terkirim', 'success')
      } else {
        const pesan = res?.message || 'Gagal mengirim'
        showNotification(pesan, 'error')
        if (typeof pesan === 'string' && (pesan.toLowerCase().includes('belum login') || pesan.toLowerCase().includes('scan qr'))) {
          showNotification('Buka tab Koneksi → scan QR sekali untuk login. Setelah itu kirim pesan & cek nomor aktif.', 'info')
        }
      }
    } catch (e) {
      showNotification('Gagal mengirim: ' + (e?.message || 'Network error'), 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const handleCheckNumber = async () => {
    if (!waEngineEnabled) {
      showNotification('Server WA sedang dihentikan. Jalankan dulu server WA.', 'warning')
      return
    }
    const phone = checkPhone.trim()
    if (!phone) {
      showNotification('Masukkan nomor yang ingin dicek', 'warning')
      return
    }
    const s0 = wa
    const waOk = s0 && (s0.status === 'connected' || s0.baileysStatus === 'connected')
    if (!waOk) {
      showNotification('Hubungkan WhatsApp di tab Koneksi (scan QR) terlebih dahulu.', 'warning')
      return
    }
    setChecking(true)
    setCheckResult(null)
    try {
      // Harus pakai slot yang sama dengan dropdown (Node /check), bukan PHP /wa/check tanpa sessionId.
      const res = await waBackendAPI.checkNumber(phone, INTERNAL_WA_SESSION)
      if (res?.success && res?.data) {
        const isRegistered = !!res.data.isRegistered
        setCheckResult({
          isRegistered,
          phoneNumber: res.data.phoneNumber || phone
        })
        const msg =
          res.message ||
          (isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp')
        showNotification(msg, isRegistered ? 'success' : 'info')
      } else {
        const pesan = res?.message || 'Gagal mengecek nomor'
        showNotification(pesan, 'error')
        if (typeof pesan === 'string' && (pesan.toLowerCase().includes('belum login') || pesan.toLowerCase().includes('scan qr'))) {
          showNotification('Pastikan WhatsApp sudah terhubung di tab Koneksi.', 'info')
        }
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

  const s = wa
  const anyConnecting = s?.status === 'connecting' || s?.baileysStatus === 'connecting'
  const anyHasQr = !!(s?.qrCode || s?.baileysQrCode)
  const isConnected =
    s?.status === 'connected' || s?.baileysStatus === 'connected'
  const isBaileysReady = s?.baileysStatus === 'connected'

  const handleStopWaServer = async () => {
    const confirmMsg = useDockerHostCtl
      ? 'Hentikan stack Docker WA?\n\nDocker compose down: container mati dan dihapus; proses Node berhenti sepenuhnya. Folder sesi di host (whatsapp-sessions) tetap.\n\nLanjut?'
      : 'Stop server WA sementara? Semua sesi WA akan diputus.'
    if (!window.confirm(confirmMsg)) return
    setShowConnectDrawer(false)
    setConnectDrawerSuccess(false)
    setConnectDrawerError(null)
    setActionLoading('wa-server-stop')
    try {
      if (useDockerHostCtl) {
        try {
          await Promise.race([
            waBackendAPI.stopServer(),
            new Promise((resolve) => setTimeout(resolve, 4500))
          ])
        } catch (_) {
          /* Node mungkin sudah tidak merespons — lanjut down Docker */
        }
        const res = await postWaDockerStop()
        if (res?.success) {
          showNotification(res?.message || 'Stack Docker WA dihentikan.', 'success')
          setWaEngineEnabled(false)
          setBackendUnavailable(true)
        } else {
          showNotification(res?.message || 'Gagal menghentikan Docker WA', 'error')
        }
        return
      }
      const res = await waBackendAPI.stopServer()
      if (res?.success) {
        showNotification(res?.message || 'Server WA dihentikan', 'success')
        setWaEngineEnabled(false)
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal menghentikan server WA', 'error')
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message
      showNotification(msg || (useDockerHostCtl ? 'Gagal memanggil API kontrol Docker.' : 'Backend WA tidak terjangkau.'), 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStartWaServer = async () => {
    setActionLoading('wa-server-start')
    try {
      if (useDockerHostCtl) {
        const res = await postWaDockerStart()
        if (res?.success) {
          showNotification(res?.message || 'Stack Docker WA dijalankan.', 'success')
          setWaEngineEnabled(true)
          setBackendUnavailable(true)
          let up = false
          for (let i = 0; i < 45; i++) {
            await new Promise((r) => setTimeout(r, 2000))
            try {
              const h = await fetch(`${getWaBackendUrl()}/health`, { method: 'GET', credentials: 'omit' })
              if (h.ok) {
                up = true
                break
              }
            } catch (_) {
              /* masih boot */
            }
          }
          if (!up) {
            showNotification('Container sudah di-up; backend WA belum merespons /health. Cek server atau coba muat ulang halaman.', 'warning')
          }
          setBackendUnavailable(false)
          await fetchStatus()
        } else {
          showNotification(res?.message || 'Gagal menjalankan Docker WA', 'error')
        }
        return
      }
      const res = await waBackendAPI.startServer()
      if (res?.success) {
        showNotification(res?.message || 'Server WA dijalankan', 'success')
        setWaEngineEnabled(true)
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal menjalankan server WA', 'error')
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message
      showNotification(msg || (useDockerHostCtl ? 'Gagal memanggil API kontrol Docker.' : 'Backend WA tidak terjangkau.'), 'error')
    } finally {
      setActionLoading(null)
    }
  }

  /** Putus + init ulang di Node — jika UI “terhubung” tapi kirim/cek gagal, atau wake macet. */
  const handleForceWakeSlot = async () => {
    if (!waEngineEnabled) {
      showNotification('Server WA dihentikan. Start dulu.', 'warning')
      return
    }
    setActionLoading('wake-force-wa')
    try {
      const res = await waBackendAPI.wake(INTERNAL_WA_SESSION, true)
      if (res?.success) {
        showNotification(res?.message || 'Meminta sambung ulang ke WhatsApp...', 'info')
        await fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal paksa sambung ulang', 'error')
      }
    } catch (e) {
      showNotification(e?.message || 'Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading && !anyHasQr) {
    return (
      <div className="h-full flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

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
        <div className="p-4 max-w-lg md:max-w-4xl lg:max-w-5xl mx-auto pb-8 w-full">
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
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 space-y-1">
                    <p>Layanan status WA tidak terjangkau (503 / CORS / network). Pastikan backend WA berjalan dan proxy mengizinkan origin ini.</p>
                    {backendErrorHint && <p className="text-xs mt-1 opacity-90">{backendErrorHint}</p>}
                  </div>
                )}
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Koneksi</span>
                    {useDockerHostCtl && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Mode Docker: stop/start = compose down/up lewat API (proses WA benar-benar mati/hidup lagi).
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-sm font-semibold px-2 py-0.5 rounded ${
                        !waEngineEnabled
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                          : isConnected
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                            : anyConnecting
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {!waEngineEnabled
                        ? 'Server WA berhenti'
                        : `${isConnected ? 'Terhubung' : anyConnecting ? 'Menghubungkan…' : 'Putus'}`}
                    </span>
                    {waEngineEnabled ? (
                      <button
                        type="button"
                        onClick={handleStopWaServer}
                        disabled={!!actionLoading}
                        className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                      >
                        {actionLoading === 'wa-server-stop' ? 'Stopping...' : 'Stop server WA'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartWaServer}
                        disabled={!!actionLoading}
                        className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm disabled:opacity-50"
                      >
                        {actionLoading === 'wa-server-start' ? 'Starting...' : 'Start server WA'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        WhatsApp
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${(s?.status || s?.baileysStatus) === 'connected' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : (s?.status || s?.baileysStatus) === 'connecting' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`}>
                        {(s?.status || s?.baileysStatus) === 'connected' ? 'Terhubung' : (s?.status || s?.baileysStatus) === 'connecting' ? 'Menghubungkan...' : 'Putus'}
                      </span>
                    </div>
                    {(s?.phoneNumber || s?.baileysPhoneNumber) && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Nomor: {s.phoneNumber || s.baileysPhoneNumber}</div>
                    )}
                    {(s?.status || s?.baileysStatus) === 'connecting' && !showConnectDrawer && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 px-2 border border-amber-200/80 dark:border-amber-800/60">
                        Sesi sedang dipersiapkan di server. Buka lembar koneksi untuk memuat QR (tombol di bawah).
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {(s?.status || s?.baileysStatus) === 'connected' ? (
                        <button
                          type="button"
                          onClick={() => handleDisconnect()}
                          disabled={!!actionLoading}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Putus
                        </button>
                      ) : (s?.status || s?.baileysStatus) === 'connecting' ? (
                        <button
                          type="button"
                          onClick={() => handleConnectClick()}
                          disabled={!!actionLoading}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm disabled:opacity-50"
                        >
                          {showConnectDrawer ? 'Lembar koneksi…' : 'Buka lembar koneksi'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConnectClick()}
                          disabled={!!actionLoading}
                          className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Hubungkan
                        </button>
                      )}
                      {((s?.status || s?.baileysStatus) === 'connected' || (s?.status || s?.baileysStatus) === 'connecting') && (
                        <button
                          type="button"
                          onClick={() => handleForceWakeSlot()}
                          disabled={!!actionLoading}
                          title="Memutus socket internal lalu menyambung lagi. Pakai jika tampilan terhubung tapi tidak bisa kirim/cek, atau setelah server lama jalan."
                          className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-600 text-blue-800 dark:text-blue-200 text-sm hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50"
                        >
                          {actionLoading === 'wake-force-wa' ? 'Menyambung...' : 'Paksa sambung ulang'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleLogout()}
                        disabled={!!actionLoading}
                        title="Hapus data sesi & auth Baileys di server. Pakai jika QR tidak keluar atau koneksi macet setelah update."
                        className="px-3 py-1.5 rounded-lg border border-amber-400/80 dark:border-amber-600 text-amber-900 dark:text-amber-100 text-sm bg-amber-50/90 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === 'logout-wa' ? 'Membersihkan...' : 'Bersihkan sesi server'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                      Tombol bersihkan selalu bisa dipakai walau belum terhubung: menghapus sisa sesi di disk agar QR baru bisa muncul.
                    </p>
                  </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
                  Satu backend WA = satu nomor. Setelah scan QR, server menyambung ulang otomatis saat restart (auth tersimpan di folder whatsapp-sessions).
                </p>
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
                  <p className="text-sm text-amber-600 dark:text-amber-400">Hubungkan WhatsApp di tab Koneksi terlebih dahulu (scan QR).</p>
                )}
                {isConnected && !isBaileysReady && (
                  <p className="text-sm text-green-600 dark:text-green-400 mb-2">Sesi terhubung sebagian. Pastikan Baileys &quot;Terhubung&quot; di tab Koneksi untuk kirim/cek nomor penuh.</p>
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
            {showConnectDrawer && (
              <>
                <motion.div
                  key="wa-connect-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => !connectDrawerBusy && closeConnectDrawer()}
                  className="fixed inset-0 bg-black/40 z-[110]"
                />
                <motion.div
                  key="wa-connect-panel"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  className="fixed bottom-0 inset-x-0 z-[111] flex flex-col max-h-[90vh] w-full sm:left-0 sm:right-0 sm:mx-auto sm:w-[calc(100%-2rem)] sm:max-w-md sm:max-h-[calc(100vh-2rem)] rounded-t-xl sm:rounded-xl bg-white dark:bg-gray-800 shadow-xl border-t sm:border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
                    <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden />
                  </div>
                  <div className="px-4 pb-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 pr-2">
                      Hubungkan WhatsApp
                    </h3>
                    <button
                      type="button"
                      disabled={connectDrawerBusy}
                      onClick={closeConnectDrawer}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300 disabled:opacity-50"
                      aria-label="Tutup"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="px-4 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
                    {connectDrawerSuccess ? (
                      <div className="flex flex-col items-center justify-center py-8 px-2 text-center">
                        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-4">
                          <svg className="w-9 h-9 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">Koneksi berhasil</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-xs">
                          WhatsApp sudah terhubung. Tekan Oke untuk kembali.
                        </p>
                        <button
                          type="button"
                          onClick={closeConnectDrawer}
                          className="mt-6 px-6 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm font-semibold"
                        >
                          Oke
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Satu kali klik <span className="font-medium text-gray-800 dark:text-gray-200">Muat QR</span> mengirim permintaan ke server (tidak diperbarui otomatis berulang). Scan dengan WhatsApp di HP: menu Perangkat tertaut.
                        </p>
                        {connectDrawerError && (
                          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/25 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                            {connectDrawerError}
                          </div>
                        )}
                        {(() => {
                          const ds = wa
                          const connected = ds?.status === 'connected' || ds?.baileysStatus === 'connected'
                          const connecting = ds?.status === 'connecting' || ds?.baileysStatus === 'connecting'
                          const primarySrc = ds?.qrCode || ds?.baileysQrCode || null

                          return (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-3">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Scan QR — WhatsApp (Baileys)</p>
                              {connected ? (
                                <p className="text-sm text-green-700 dark:text-green-300 py-4 text-center">Sudah terhubung.</p>
                              ) : primarySrc ? (
                                <WaQrCountdownBlock
                                  title="Scan QR ini di WhatsApp di HP Anda (Perangkat tertaut)"
                                  qrSrc={primarySrc}
                                  alt="QR WhatsApp"
                                  fetchStatus={fetchStatus}
                                  onReloadQr={() => handleDrawerReloadQr()}
                                  reloadDisabled={connectDrawerBusy}
                                  autoPollStatus={false}
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center min-h-[200px] rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 px-4 text-center">
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {connecting
                                      ? 'Menunggu QR dari server… Klik Muat QR lagi jika belum muncul dalam beberapa detik.'
                                      : 'Tekan Muat QR untuk meminta kode dari server.'}
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                        <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={connectDrawerBusy}
                            onClick={() => handleDrawerLoadQr(false)}
                            className="flex-1 min-w-[140px] px-4 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {connectDrawerBusy ? 'Memuat…' : 'Muat QR'}
                          </button>
                          <button
                            type="button"
                            disabled={connectDrawerBusy}
                            onClick={() => handleDrawerReloadQr()}
                            className="flex-1 min-w-[140px] px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            Muat ulang QR
                          </button>
                          <button
                            type="button"
                            disabled={connectDrawerBusy}
                            onClick={closeConnectDrawer}
                            className="flex-1 min-w-[100px] px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            Tutup
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
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
