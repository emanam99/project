import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import api, { waBackendAPI, whatsappTemplateAPI, warmerAPI, warmerNodeAPI } from '../../services/api'
import { checkWhatsAppNumber } from '../../utils/whatsappCheck'

const POLL_INTERVAL_CONNECTING = 2000
const POLL_INTERVAL_IDLE = 10000
const MAX_WA_SESSIONS = 10
const KATEGORI_OPTIONS = ['umum', 'pendaftaran', 'uwaba', 'keuangan', 'lainnya']

/** Kategori warmer: bisa pilih preset atau ketik sendiri (Lainnya). Backend terima kategori apa saja. */
const WARMER_CATEGORY_OPTIONS = [
  { value: 'education', label: 'Pendidikan' },
  { value: 'finance', label: 'Keuangan' },
  { value: 'general', label: 'Umum' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'support', label: 'Support' },
  { value: 'other', label: 'Lainnya (ketik di bawah)' }
]

/** SessionId untuk slot baru: wa2, wa3, ... wa10 (default sudah slot pertama) */
function getNextSessionId(sessions) {
  const keys = Object.keys(sessions || {})
  for (let i = 2; i <= MAX_WA_SESSIONS; i++) {
    const id = `wa${i}`
    if (!keys.includes(id)) return id
  }
  return null
}

function sessionSlotLabel(sessionId) {
  if (sessionId === 'default') return 'WhatsApp 1'
  return `WhatsApp ${String(sessionId).replace(/^wa/, '')}`
}

/** Selesai alur di lembar koneksi: WA Web sudah connected; Baileys selesai atau tidak perlu scan lanjut. */
function isSlotConnectFlowDone(s) {
  if (!s || s.status !== 'connected') return false
  if (s.baileysStatus === 'connected') return true
  if (s.baileysStatus === 'connecting' || s.baileysQrCode) return false
  return true
}

const TABS = [
  { id: 'koneksi', label: 'Koneksi' },
  { id: 'tes', label: 'Tes' },
  { id: 'template', label: 'Template' },
  { id: 'warmer', label: 'Warmer' }
]

/** WA mengganti QR sekitar tiap 20 d — hitung mundur; refresh status hanya jika autoPollStatus (hemat request). */
const QR_COUNTDOWN_SECONDS = 20

function WaQrCountdownBlock({ title, qrSrc, alt, sessionId, fetchStatus, onReloadQr, reloadDisabled, autoPollStatus = true }) {
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
          onClick={() => onReloadQr(sessionId)}
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

  const [activeTab, setActiveTab] = useState('koneksi')
  const [data, setData] = useState({ sessions: {} })
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
  const [testSessionId, setTestSessionId] = useState('default')
  const [waEngineEnabled, setWaEngineEnabled] = useState(true)
  const fetchStatusInFlightRef = useRef(false)
  /** Lembar hubungkan WA: tidak spam getQr; QR hanya lewat tombol Muat QR. */
  const [connectDrawerSessionId, setConnectDrawerSessionId] = useState(null)
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

  // Warmer tab state
  const [warmerPairs, setWarmerPairs] = useState([])
  const [warmerMessages, setWarmerMessages] = useState([])
  const [warmerCategories, setWarmerCategories] = useState([])
  const [warmerNodeStatus, setWarmerNodeStatus] = useState({ running: false })
  const [warmerLoading, setWarmerLoading] = useState(false)
  const [warmerPairFormOpen, setWarmerPairFormOpen] = useState(false)
  const [warmerPairForm, setWarmerPairForm] = useState({
    session_id_1: 'default',
    session_id_2: 'wa2',
    wait_min_sec: 5,
    wait_max_sec: 90,
    stop_after_conversations: 200,
    rest_minutes: 15,
    language: 'id',
    category: 'education',
    use_typing: true,
    is_active: true
  })
  const [warmerEditingPairId, setWarmerEditingPairId] = useState(null)
  const [warmerPairCategoryOther, setWarmerPairCategoryOther] = useState('')
  const [warmerImportOpen, setWarmerImportOpen] = useState(false)
  const [warmerImportFormat, setWarmerImportFormat] = useState('txt')
  const [warmerImportContent, setWarmerImportContent] = useState('')
  const [warmerImportCategory, setWarmerImportCategory] = useState('education')
  const [warmerImportCategoryOther, setWarmerImportCategoryOther] = useState('')
  const [warmerImportLanguage, setWarmerImportLanguage] = useState('id')
  const [warmerExample, setWarmerExample] = useState('')
  const [warmerDeletePairConfirm, setWarmerDeletePairConfirm] = useState(null)
  const [warmerDeleteMessageConfirm, setWarmerDeleteMessageConfirm] = useState(null)
  const [warmerDeleteThemeConfirm, setWarmerDeleteThemeConfirm] = useState(null)
  const [warmerSubTab, setWarmerSubTab] = useState('pasangan')

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
        if (d.sessions && typeof d.sessions === 'object') {
          // Gabungkan dengan state saat ini; setiap slot punya ruang sendiri agar tidak saling bentrok
          setData(prev => {
            const merged = { ...prev.sessions }
            let changed = false
            for (const [sid, back] of Object.entries(d.sessions)) {
              const prevS = merged[sid]
              const backStatus = back?.status || back?.baileysStatus
              const prevStatus = prevS?.status || prevS?.baileysStatus
              // Jangan timpa slot yang sudah "connected" jadi "connecting" (agar slot lain tidak ikut loading saat connect slot baru)
              if (prevStatus === 'connected' && backStatus === 'connecting') {
                merged[sid] = { ...prevS }
                continue
              }
              const nextObj = { ...(back || {}) }
              // Status endpoint sekarang ringan (tanpa QR). Jangan timpa QR existing dengan null saat masih connecting.
              const isConnecting = (nextObj.status === 'connecting' || nextObj.baileysStatus === 'connecting')
              if (isConnecting && prevS) {
                if (nextObj.qrCode == null && prevS.qrCode) nextObj.qrCode = prevS.qrCode
                if (nextObj.baileysQrCode == null && prevS.baileysQrCode) nextObj.baileysQrCode = prevS.baileysQrCode
              }
              const isSame =
                prevS &&
                prevS.status === nextObj.status &&
                prevS.phoneNumber === nextObj.phoneNumber &&
                prevS.baileysStatus === nextObj.baileysStatus &&
                prevS.baileysPhoneNumber === nextObj.baileysPhoneNumber &&
                prevS.qrCode === nextObj.qrCode &&
                prevS.baileysQrCode === nextObj.baileysQrCode
              if (!isSame) {
                merged[sid] = nextObj
                changed = true
              }
            }
            for (const sid of Object.keys(merged)) {
              if (!Object.prototype.hasOwnProperty.call(d.sessions, sid)) {
                delete merged[sid]
                changed = true
              }
            }
            return changed ? { sessions: merged } : prev
          })
        } else {
          setData(prev => ({
            sessions: {
              ...prev.sessions,
              default: {
                status: d.status || 'disconnected',
                qrCode: d.qrCode || null,
                phoneNumber: d.phoneNumber || null,
                baileysStatus: d.baileysStatus || 'disconnected',
                baileysQrCode: d.baileysQrCode || null,
                baileysPhoneNumber: d.baileysPhoneNumber || null
              }
            }
          }))
        }
      } else if (res?.statusCode === 503 || res?.statusCode >= 500) {
        setBackendUnavailable(true)
        setData(prev => ({ ...prev, sessions: prev.sessions || {} }))
      }
    } catch (e) {
      console.error('KoneksiWa fetchStatus:', e)
      setBackendUnavailable(true)
      setBackendErrorHint(
        (e?.message === 'Failed to fetch' || e?.name === 'TypeError')
          ? 'Koneksi gagal (SSL/CORS/network). Jika ERR_CERT_COMMON_NAME_INVALID, set VITE_WA_BACKEND_URL di .env ke URL backend WA yang valid.'
          : null
      )
      setData(prev => ({ ...prev, sessions: prev.sessions || {} }))
    } finally {
      fetchStatusInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const hasConnecting = Object.values(data.sessions || {}).some(s => s?.status === 'connecting' || s?.baileysStatus === 'connecting')
  const connectDrawerOpen = !!connectDrawerSessionId

  useEffect(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return undefined
    fetchStatus()
    const ms = connectDrawerOpen
      ? POLL_INTERVAL_CONNECTING
      : (hasConnecting ? 5000 : POLL_INTERVAL_IDLE)
    const interval = setInterval(fetchStatus, ms)
    return () => clearInterval(interval)
  }, [fetchStatus, hasConnecting, connectDrawerOpen])

  /** Saat slot di lembar hubungkan mencapai langkah selesai, tampilkan layar sukses (tanpa menutup otomatis). */
  useEffect(() => {
    if (!connectDrawerSessionId || connectDrawerSuccess) return
    const s = data.sessions?.[connectDrawerSessionId]
    if (isSlotConnectFlowDone(s)) {
      setConnectDrawerSuccess(true)
      setConnectDrawerError(null)
    }
  }, [connectDrawerSessionId, connectDrawerSuccess, data.sessions])

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

  const fetchWarmerPairs = useCallback(async () => {
    try {
      const res = await warmerAPI.getPairs()
      setWarmerPairs(Array.isArray(res?.data) ? res.data : [])
    } catch (e) {
      console.error('Warmer pairs:', e)
      setWarmerPairs([])
    }
  }, [])
  const fetchWarmerMessages = useCallback(async () => {
    try {
      const res = await warmerAPI.getMessages({})
      setWarmerMessages(Array.isArray(res?.data) ? res.data : [])
    } catch (e) {
      console.error('Warmer messages:', e)
      setWarmerMessages([])
    }
  }, [])
  const fetchWarmerCategories = useCallback(async () => {
    try {
      const res = await warmerAPI.getCategories()
      setWarmerCategories(Array.isArray(res?.data) ? res.data : [])
    } catch (e) {
      setWarmerCategories([])
    }
  }, [])
  const fetchWarmerNodeStatus = useCallback(async () => {
    try {
      const res = await warmerNodeAPI.getStatus()
      if (res?.success && res?.data) setWarmerNodeStatus(res.data)
    } catch (e) {
      setWarmerNodeStatus({ running: false })
    }
  }, [])
  useEffect(() => {
    if (activeTab === 'warmer') {
      setWarmerLoading(true)
      Promise.all([fetchWarmerPairs(), fetchWarmerMessages(), fetchWarmerCategories(), fetchWarmerNodeStatus()]).finally(() => setWarmerLoading(false))
    }
  }, [activeTab, fetchWarmerPairs, fetchWarmerMessages, fetchWarmerCategories, fetchWarmerNodeStatus])

  // Auto refresh status warmer (pasangan) tiap 5 detik saat tab Warmer > Pasangan aktif
  useEffect(() => {
    if (activeTab !== 'warmer' || warmerSubTab !== 'pasangan') return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return undefined
    const t = setInterval(fetchWarmerNodeStatus, 5000)
    return () => clearInterval(t)
  }, [activeTab, warmerSubTab, fetchWarmerNodeStatus])
  const pairCategoryOptions = warmerCategories.length > 0
    ? [...warmerCategories.map((c) => ({ value: c, label: c })), { value: 'other', label: 'Tema baru (ketik di bawah)' }]
    : [{ value: 'other', label: 'Tema baru (ketik di bawah)' }]
  const openAddWarmerPair = () => {
    setWarmerEditingPairId(null)
    setWarmerPairCategoryOther('')
    const sessionIds = Object.keys(data.sessions || {}).length ? Object.keys(data.sessions) : ['default']
    const defaultCat = warmerCategories?.length ? warmerCategories[0] : 'other'
    setWarmerPairForm({
      session_id_1: sessionIds[0] || 'default',
      session_id_2: sessionIds[1] || 'wa2',
      wait_min_sec: 5,
      wait_max_sec: 90,
      stop_after_conversations: 200,
      rest_minutes: 15,
      language: 'id',
      category: defaultCat,
      use_typing: true,
      is_active: true
    })
    setWarmerPairFormOpen(true)
  }
  const openEditWarmerPair = (row) => {
    setWarmerEditingPairId(row.id)
    const catInList = warmerCategories.includes(row.category)
    setWarmerPairForm({
      session_id_1: row.session_id_1 || 'default',
      session_id_2: row.session_id_2 || 'wa2',
      wait_min_sec: row.wait_min_sec ?? 5,
      wait_max_sec: row.wait_max_sec ?? 90,
      stop_after_conversations: row.stop_after_conversations ?? 200,
      rest_minutes: row.rest_minutes ?? 15,
      language: row.language || 'id',
      category: catInList ? (row.category || 'education') : 'other',
      use_typing: !!row.use_typing,
      is_active: !!row.is_active
    })
    setWarmerPairCategoryOther(catInList ? '' : (row.category || ''))
    setWarmerPairFormOpen(true)
  }
  const handleSaveWarmerPair = async () => {
    const f = warmerPairForm
    if (!f.session_id_1 || !f.session_id_2 || f.session_id_1 === f.session_id_2) {
      showNotification('Pilih dua session yang berbeda', 'warning')
      return
    }
    const pairCategory = f.category === 'other' ? (warmerPairCategoryOther.trim() || 'other') : f.category
    setSaving(true)
    try {
      if (warmerEditingPairId) {
        const res = await warmerAPI.updatePair({
          id: warmerEditingPairId,
          session_id_1: f.session_id_1,
          session_id_2: f.session_id_2,
          wait_min_sec: Math.max(5, Math.min(90, f.wait_min_sec)),
          wait_max_sec: Math.max(f.wait_min_sec, Math.min(90, f.wait_max_sec)),
          stop_after_conversations: Math.max(1, Math.min(10000, f.stop_after_conversations)),
          rest_minutes: Math.max(1, Math.min(120, f.rest_minutes)),
          language: f.language,
          category: pairCategory,
          use_typing: f.use_typing,
          is_active: f.is_active
        })
        if (res?.success) {
          showNotification('Pasangan warmer berhasil diubah', 'success')
          setWarmerPairFormOpen(false)
          fetchWarmerPairs()
        } else showNotification(res?.message || 'Gagal mengubah', 'error')
      } else {
        const res = await warmerAPI.createPair({
          session_id_1: f.session_id_1,
          session_id_2: f.session_id_2,
          wait_min_sec: Math.max(5, Math.min(90, f.wait_min_sec)),
          wait_max_sec: Math.max(f.wait_min_sec, Math.min(90, f.wait_max_sec)),
          stop_after_conversations: Math.max(1, Math.min(10000, f.stop_after_conversations)),
          rest_minutes: Math.max(1, Math.min(120, f.rest_minutes)),
          language: f.language,
          category: pairCategory,
          use_typing: f.use_typing,
          is_active: f.is_active
        })
        if (res?.success) {
          showNotification('Pasangan warmer berhasil ditambah', 'success')
          setWarmerPairFormOpen(false)
          fetchWarmerPairs()
        } else showNotification(res?.message || 'Gagal menambah', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }
  const handleDeleteWarmerPair = async (id) => {
    if (!id) return
    setSaving(true)
    try {
      const res = await warmerAPI.deletePair(id)
      if (res?.success) {
        showNotification('Pasangan warmer dihapus', 'success')
        setWarmerDeletePairConfirm(null)
        fetchWarmerPairs()
      } else showNotification(res?.message || 'Gagal menghapus', 'error')
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menghapus', 'error')
    } finally {
      setSaving(false)
    }
  }
  const handleWarmerStart = async () => {
    try {
      const res = await warmerNodeAPI.start()
      if (res?.success) {
        showNotification('Warmer dimulai', 'success')
        fetchWarmerNodeStatus()
      } else showNotification(res?.message || 'Gagal memulai warmer', 'error')
    } catch (e) {
      showNotification('Gagal memulai warmer', 'error')
    }
  }
  const handleWarmerStop = async () => {
    try {
      const res = await warmerNodeAPI.stop()
      if (res?.success) {
        showNotification('Warmer dihentikan', 'success')
        fetchWarmerNodeStatus()
      } else showNotification(res?.message || 'Gagal menghentikan', 'error')
    } catch (e) {
      showNotification('Gagal menghentikan warmer', 'error')
    }
  }
  const loadWarmerExample = async (format) => {
    try {
      const res = await warmerAPI.getExamples(format)
      setWarmerExample(res?.example || '')
    } catch (e) {
      setWarmerExample('')
    }
  }
  const handleWarmerImport = async (fileOrNull) => {
    const effectiveCategory = warmerImportCategory === 'other' ? (warmerImportCategoryOther.trim() || 'other') : warmerImportCategory
    setSaving(true)
    try {
      if (fileOrNull && fileOrNull instanceof File) {
        const formData = new FormData()
        formData.append('file', fileOrNull)
        formData.append('format', warmerImportFormat)
        formData.append('category', effectiveCategory)
        formData.append('language', warmerImportLanguage)
        const res = await api.post('/warmer/messages/import', formData)
        const data = res?.data || {}
        if (data?.success) {
          const msg = data.imported ? `${data.imported} pesan diimpor` : 'Import berhasil'
          showNotification(data.skipped > 0 ? `${msg}. ${data.skipped} baris dilewati (teks tidak valid).` : msg, 'success')
          setWarmerImportOpen(false)
          setWarmerImportContent('')
          fetchWarmerMessages()
          fetchWarmerCategories()
        } else showNotification(data?.message || 'Gagal import', 'error')
      } else {
        const res = await warmerAPI.importMessages({
          format: warmerImportFormat,
          content: warmerImportContent,
          category: effectiveCategory,
          language: warmerImportLanguage
        })
        if (res?.success) {
          const msg = res.imported ? `${res.imported} pesan diimpor` : 'Import berhasil'
          showNotification(res.skipped > 0 ? `${msg}. ${res.skipped} baris dilewati (teks tidak valid).` : msg, 'success')
          setWarmerImportOpen(false)
          setWarmerImportContent('')
          fetchWarmerMessages()
          fetchWarmerCategories()
        } else showNotification(res?.message || 'Gagal import', 'error')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || e?.message || 'Gagal import', 'error')
    } finally {
      setSaving(false)
    }
  }
  const handleDeleteWarmerMessage = async (id) => {
    if (!id) return
    setSaving(true)
    try {
      const res = await warmerAPI.deleteMessage(id)
      if (res?.success) {
        showNotification('Pesan dihapus', 'success')
        setWarmerDeleteMessageConfirm(null)
        fetchWarmerMessages()
      } else showNotification(res?.message || 'Gagal menghapus', 'error')
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menghapus', 'error')
    } finally {
      setSaving(false)
    }
  }
  const handleDeleteWarmerTheme = async (theme) => {
    if (!theme) return
    setSaving(true)
    try {
      const res = await warmerAPI.deleteTheme(theme)
      if (res?.success) {
        showNotification(res?.message || 'Tema dihapus', 'success')
        setWarmerDeleteThemeConfirm(null)
        fetchWarmerCategories()
        fetchWarmerMessages()
      } else showNotification(res?.message || 'Gagal menghapus tema', 'error')
    } catch (e) {
      showNotification(e?.response?.data?.message || 'Gagal menghapus tema', 'error')
    } finally {
      setSaving(false)
    }
  }
  const sessionIds = Object.keys(data.sessions || {}).length ? Object.keys(data.sessions) : ['default']
  const connectedSessionsForTest = Object.entries(data.sessions || {}).filter(([, s]) => s?.status === 'connected' || s?.baileysStatus === 'connected')
  const effectiveTestSessionId = connectedSessionsForTest.some(([id]) => id === testSessionId) ? testSessionId : (connectedSessionsForTest[0]?.[0] || 'default')

  const openConnectDrawer = (sessionId = 'default') => {
    if (!waEngineEnabled) {
      showNotification('Server WA sedang dihentikan. Jalankan dulu server WA.', 'warning')
      return
    }
    setConnectDrawerSessionId(sessionId)
    setConnectDrawerSuccess(false)
    setConnectDrawerError(null)
  }

  const isSignedSession = (session) => {
    if (!session) return false
    return !!(session.phoneNumber || session.baileysPhoneNumber)
  }

  const handleConnectClick = async (sessionId = 'default') => {
    if (!waEngineEnabled) {
      showNotification('Server WA sedang dihentikan. Jalankan dulu server WA.', 'warning')
      return
    }

    const session = data.sessions?.[sessionId]
    const shouldQuickConnect = isSignedSession(session)
    if (!shouldQuickConnect) {
      openConnectDrawer(sessionId)
      return
    }

    setActionLoading(`connect-${sessionId}`)
    try {
      const res = await waBackendAPI.connect(sessionId, { refreshQr: false })
      if (!res?.success) {
        openConnectDrawer(sessionId)
        showNotification(res?.message || 'Gagal menghubungkan sesi. Silakan muat QR.', 'warning')
        return
      }

      const payload = res?.data || {}
      setData((prev) => ({
        sessions: {
          ...prev.sessions,
          [sessionId]: {
            ...(prev.sessions?.[sessionId] || {}),
            status: payload.status ?? prev.sessions?.[sessionId]?.status ?? 'connecting',
            qrCode: payload.qrCode ?? prev.sessions?.[sessionId]?.qrCode ?? null,
            phoneNumber: payload.phoneNumber ?? prev.sessions?.[sessionId]?.phoneNumber ?? null,
            baileysStatus: payload.baileysStatus ?? prev.sessions?.[sessionId]?.baileysStatus ?? 'disconnected',
            baileysQrCode: payload.baileysQrCode ?? prev.sessions?.[sessionId]?.baileysQrCode ?? null,
            baileysPhoneNumber: payload.baileysPhoneNumber ?? prev.sessions?.[sessionId]?.baileysPhoneNumber ?? null
          }
        }
      }))

      await fetchStatus()
      const merged = { ...(session || {}), ...payload }
      const needQr = !!(merged.qrCode || merged.baileysQrCode)
      if (isSlotConnectFlowDone(merged)) {
        showNotification('Sesi sudah login. Koneksi diproses langsung ke server.', 'success')
        return
      }
      if (needQr || merged.status === 'connecting' || merged.baileysStatus === 'connecting') {
        openConnectDrawer(sessionId)
        return
      }
      showNotification('Permintaan hubungkan dikirim ke server.', 'info')
    } catch (e) {
      openConnectDrawer(sessionId)
      showNotification(e?.message || 'Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const closeConnectDrawer = useCallback(() => {
    setConnectDrawerSessionId(null)
    setConnectDrawerSuccess(false)
    setConnectDrawerError(null)
    fetchStatus()
  }, [fetchStatus])

  /** Satu klik = satu pasangan request connect (opsional refresh) + getQr — tidak ada polling QR otomatis. */
  const handleDrawerLoadQr = async (refreshQr = false) => {
    const sid = connectDrawerSessionId
    if (!sid) return
    setConnectDrawerBusy(true)
    setConnectDrawerError(null)
    try {
      const res = await waBackendAPI.connect(sid, { refreshQr: refreshQr === true })
      if (!res?.success) {
        const raw = String(res?.message || '')
        if (/timeout/i.test(raw)) {
          const qrRes = await waBackendAPI.getQr(sid)
          const qr = qrRes?.data
          if (qr?.sessionId === sid && (qr?.qrCode || qr?.baileysQrCode)) {
            setData(prev => {
              const cur = prev.sessions?.[sid] || {}
              return {
                sessions: {
                  ...prev.sessions,
                  [sid]: {
                    ...cur,
                    qrCode: qr.qrCode ?? cur.qrCode ?? null,
                    baileysQrCode: qr.baileysQrCode ?? cur.baileysQrCode ?? null
                  }
                }
              }
            })
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
      setData(prev => ({
        sessions: {
          ...prev.sessions,
          [sid]: {
            ...(prev.sessions?.[sid] || {}),
            status: payload.status ?? prev.sessions?.[sid]?.status ?? 'connecting',
            qrCode: payload.qrCode ?? prev.sessions?.[sid]?.qrCode ?? null,
            phoneNumber: payload.phoneNumber ?? prev.sessions?.[sid]?.phoneNumber ?? null,
            baileysStatus: payload.baileysStatus ?? prev.sessions?.[sid]?.baileysStatus ?? 'disconnected',
            baileysQrCode: payload.baileysQrCode ?? prev.sessions?.[sid]?.baileysQrCode ?? null,
            baileysPhoneNumber: payload.baileysPhoneNumber ?? prev.sessions?.[sid]?.baileysPhoneNumber ?? null
          }
        }
      }))
      const qrRes = await waBackendAPI.getQr(sid)
      const qr = qrRes?.data
      if (qr && qr.sessionId === sid) {
        setData(prev => {
          const cur = prev.sessions?.[sid] || {}
          return {
            sessions: {
              ...prev.sessions,
              [sid]: {
                ...cur,
                qrCode: qr.qrCode ?? cur.qrCode ?? null,
                baileysQrCode: qr.baileysQrCode ?? cur.baileysQrCode ?? null
              }
            }
          }
        })
      }
      await fetchStatus()
    } catch (e) {
      setConnectDrawerError(e?.message || 'Backend WA tidak terjangkau.')
    } finally {
      setConnectDrawerBusy(false)
    }
  }

  const handleDrawerReloadQr = () => handleDrawerLoadQr(true)

  const handleDisconnect = async (sessionId = 'default') => {
    if (connectDrawerSessionId === sessionId) {
      setConnectDrawerSessionId(null)
      setConnectDrawerSuccess(false)
      setConnectDrawerError(null)
    }
    setActionLoading(`disconnect-${sessionId}`)
    try {
      const res = await waBackendAPI.disconnect(sessionId)
      if (res?.success) {
        showNotification(res?.message || 'Koneksi diputus.', 'success')
        setData(prev => ({
          sessions: {
            ...prev.sessions,
            [sessionId]: {
              status: 'disconnected',
              qrCode: null,
              phoneNumber: null,
              baileysStatus: 'disconnected',
              baileysQrCode: null,
              baileysPhoneNumber: null
            }
          }
        }))
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

  const handleLogout = async (sessionId = 'default') => {
    const s = data.sessions?.[sessionId]
    const connected =
      s?.status === 'connected' || s?.baileysStatus === 'connected'
    const msg = connected
      ? 'Logout akan menghapus sesi WhatsApp ini di server (file auth). Untuk pakai lagi harus scan QR. Lanjutkan?'
      : 'Bersihkan file sesi di server untuk slot ini?\n\nDirekomendasikan jika QR tidak muncul, koneksi macet, atau sisa sesi lama setelah pembaruan. Setelah ini Anda harus scan QR lagi. Lanjutkan?'
    if (!window.confirm(msg)) return
    if (connectDrawerSessionId === sessionId) {
      setConnectDrawerSessionId(null)
      setConnectDrawerSuccess(false)
      setConnectDrawerError(null)
    }
    setActionLoading(`logout-${sessionId}`)
    try {
      const res = await waBackendAPI.logout(sessionId)
      if (res?.success) {
        showNotification(res?.message || 'Sesi server dibersihkan.', 'success')
        setData((prev) => {
          const next = { ...prev.sessions }
          delete next[sessionId]
          return { sessions: next }
        })
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

  const handleTambahKoneksi = () => {
    if (!waEngineEnabled) {
      showNotification('Server WA sedang dihentikan. Jalankan dulu server WA.', 'warning')
      return
    }
    const nextId = getNextSessionId(data.sessions)
    if (!nextId) {
      showNotification(`Maksimal ${MAX_WA_SESSIONS} koneksi WA.`, 'warning')
      return
    }
    setData(prev => ({
      sessions: {
        ...prev.sessions,
        [nextId]: {
          status: 'disconnected',
          qrCode: null,
          phoneNumber: null,
          baileysStatus: 'disconnected',
          baileysQrCode: null,
          baileysPhoneNumber: null
        }
      }
    }))
    showNotification('Slot baru ditambahkan. Tekan "Hubungkan" pada slot untuk mulai koneksi.', 'info')
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
      const res = await waBackendAPI.send(phone, msg, null, null, effectiveTestSessionId || undefined)
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
    setChecking(true)
    setCheckResult(null)
    try {
      const result = await checkWhatsAppNumber(phone)
      if (result.success) {
        setCheckResult({
          isRegistered: result.isRegistered,
          phoneNumber: phone
        })
        showNotification(result.message ?? (result.isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar'), result.isRegistered ? 'success' : 'info')
      } else {
        showNotification(result.message || 'Gagal mengecek nomor', 'error')
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

  const sessionsList = Object.entries(data.sessions || {}).length
    ? Object.entries(data.sessions)
    : [['default', { status: 'disconnected', qrCode: null, phoneNumber: null, baileysStatus: 'disconnected', baileysQrCode: null, baileysPhoneNumber: null }]]
  const canTambah = sessionsList.length < MAX_WA_SESSIONS
  const anyConnecting = sessionsList.some(([, s]) => s?.status === 'connecting')
  const anyHasQr = sessionsList.some(([, s]) => s?.qrCode || s?.baileysQrCode)
  const isConnected = sessionsList.some(([, s]) => s?.status === 'connected')
  const isBaileysReady = sessionsList.some(([, s]) => s?.baileysStatus === 'connected')

  const handleDeleteSlot = async (sessionId = 'default') => {
    if (!window.confirm('Hapus slot ini dari daftar dan bersihkan file sesi di server?')) return
    if (connectDrawerSessionId === sessionId) {
      setConnectDrawerSessionId(null)
      setConnectDrawerSuccess(false)
      setConnectDrawerError(null)
    }
    setActionLoading(`delete-slot-${sessionId}`)
    try {
      const res = await waBackendAPI.deleteSlot(sessionId)
      if (res?.success) {
        showNotification(res?.message || 'Slot WA dihapus', 'success')
        setData((prev) => {
          const next = { ...prev.sessions }
          delete next[sessionId]
          return { sessions: next }
        })
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal menghapus slot', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStopWaServer = async () => {
    if (!window.confirm('Stop server WA sementara? Semua sesi WA akan diputus.')) return
    setConnectDrawerSessionId(null)
    setConnectDrawerSuccess(false)
    setConnectDrawerError(null)
    setActionLoading('wa-server-stop')
    try {
      const res = await waBackendAPI.stopServer()
      if (res?.success) {
        showNotification(res?.message || 'Server WA dihentikan', 'success')
        setWaEngineEnabled(false)
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal menghentikan server WA', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStartWaServer = async () => {
    setActionLoading('wa-server-start')
    try {
      const res = await waBackendAPI.startServer()
      if (res?.success) {
        showNotification(res?.message || 'Server WA dijalankan', 'success')
        setWaEngineEnabled(true)
        fetchStatus()
      } else {
        showNotification(res?.message || 'Gagal menjalankan server WA', 'error')
      }
    } catch (e) {
      showNotification('Backend WA tidak terjangkau.', 'error')
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
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Koneksi</span>
                  <div className="flex items-center gap-2">
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
                        : `${sessionsList.length} slot · ${isConnected ? 'Ada yang terhubung' : anyConnecting ? 'Menghubungkan...' : 'Semua putus'}`}
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
                {sessionsList.map(([sessionId, s]) => (
                  <div key={sessionId} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {sessionId === 'default' ? 'WhatsApp 1' : `WhatsApp ${sessionId.replace(/^wa/, '')}`}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${(s?.status || s?.baileysStatus) === 'connected' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : (s?.status || s?.baileysStatus) === 'connecting' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`}>
                        {(s?.status || s?.baileysStatus) === 'connected' ? 'Terhubung' : (s?.status || s?.baileysStatus) === 'connecting' ? 'Menghubungkan...' : 'Putus'}
                      </span>
                    </div>
                    {(s?.phoneNumber || s?.baileysPhoneNumber) && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Nomor: {s.phoneNumber || s.baileysPhoneNumber}</div>
                    )}
                    {(s?.status || s?.baileysStatus) === 'connecting' && connectDrawerSessionId !== sessionId && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 px-2 border border-amber-200/80 dark:border-amber-800/60">
                        Sesi sedang dipersiapkan di server. Buka lembar koneksi untuk memuat QR (tombol di bawah).
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {s?.status === 'connected' ? (
                        <button
                          type="button"
                          onClick={() => handleDisconnect(sessionId)}
                          disabled={!!actionLoading}
                          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Putus
                        </button>
                      ) : (s?.status || s?.baileysStatus) === 'connecting' ? (
                        <button
                          type="button"
                          onClick={() => handleConnectClick(sessionId)}
                          disabled={!!actionLoading}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm disabled:opacity-50"
                        >
                          {connectDrawerSessionId === sessionId ? 'Lembar koneksi…' : 'Buka lembar koneksi'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConnectClick(sessionId)}
                          disabled={!!actionLoading}
                          className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Hubungkan
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleLogout(sessionId)}
                        disabled={!!actionLoading}
                        title="Hapus data sesi & auth di server WA (Baileys/Puppeteer). Pakai jika QR tidak keluar atau slot macet setelah update."
                        className="px-3 py-1.5 rounded-lg border border-amber-400/80 dark:border-amber-600 text-amber-900 dark:text-amber-100 text-sm bg-amber-50/90 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === `logout-${sessionId}` ? 'Membersihkan...' : 'Bersihkan sesi server'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(sessionId)}
                        disabled={!!actionLoading}
                        title="Hapus slot dari daftar (termasuk file sesi tersisa di server)."
                        className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === `delete-slot-${sessionId}` ? 'Menghapus...' : 'Hapus slot'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                      Tombol bersihkan selalu bisa dipakai walau belum terhubung: menghapus sisa sesi di disk agar QR baru bisa muncul.
                    </p>
                  </div>
                ))}
                {canTambah && (
                  <div className="pt-2">
                    <button type="button" onClick={handleTambahKoneksi} disabled={!!actionLoading} className="px-4 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-[#25D366] hover:text-[#25D366] text-sm font-medium disabled:opacity-50">
                      + Tambah koneksi WA (maks. {MAX_WA_SESSIONS})
                    </button>
                  </div>
                )}
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
                  <p className="text-sm text-amber-600 dark:text-amber-400">Hubungkan WhatsApp di tab Koneksi terlebih dahulu (scan QR Langkah 1).</p>
                )}
                {isConnected && !isBaileysReady && (
                  <p className="text-sm text-green-600 dark:text-green-400 mb-2">Login Langkah 1 berhasil. Kirim pesan & cek nomor sudah bisa dipakai (via Puppeteer). Scan Langkah 2 nanti untuk fitur tambahan.</p>
                )}
                {isConnected && connectedSessionsForTest.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pakai nomor</label>
                    <select value={effectiveTestSessionId} onChange={(e) => setTestSessionId(e.target.value)} className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm">
                      {connectedSessionsForTest.map(([sid, s]) => (
                        <option key={sid} value={sid}>
                          {sid === 'default' ? 'WhatsApp 1' : `WhatsApp ${sid.replace(/^wa/, '')}`}
                          {s?.phoneNumber || s?.baileysPhoneNumber ? ` (${s.phoneNumber || s.baileysPhoneNumber})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
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

            {activeTab === 'warmer' && (
              <motion.div
                key="warmer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden flex flex-col min-h-0 max-h-[calc(100vh-11rem)]"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Warmer</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Dua nomor WA saling chat otomatis agar akun terlihat aman & aktif.</p>
                </div>
                {/* Mobile: tab untuk beralih Pasangan | Tema & Import */}
                <div className="md:hidden flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                  <button type="button" onClick={() => setWarmerSubTab('pasangan')} className={`flex-1 py-3 text-sm font-medium ${warmerSubTab === 'pasangan' ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-500 -mb-px' : 'text-gray-500 dark:text-gray-400'}`}>
                    Pasangan
                  </button>
                  <button type="button" onClick={() => setWarmerSubTab('tema')} className={`flex-1 py-3 text-sm font-medium ${warmerSubTab === 'tema' ? 'text-teal-600 dark:text-teal-400 border-b-2 border-teal-500 -mb-px' : 'text-gray-500 dark:text-gray-400'}`}>
                    Tema & Import
                  </button>
                </div>
                <div className="p-4 flex-1 min-h-0 flex flex-col md:flex-row md:gap-6">
                  {warmerLoading ? (
                    <div className="flex justify-center py-8 md:col-span-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      {/* Kiri (PC) / Tab Pasangan (mobile): Status + Daftar pasangan — scroll di dalam kotak */}
                      <div className={`${warmerSubTab === 'pasangan' ? 'block' : 'hidden'} md:block md:flex-1 md:min-w-0 md:min-h-0 md:overflow-y-auto page-content-scroll md:pr-2 space-y-4`}>
                        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status Warmer</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${warmerNodeStatus?.running ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`}>
                              {warmerNodeStatus?.running ? 'Berjalan' : 'Berhenti'}
                            </span>
                            {warmerNodeStatus?.running ? (
                              <button type="button" onClick={handleWarmerStop} className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg">Stop</button>
                            ) : (
                              <button type="button" onClick={handleWarmerStart} disabled={warmerPairs.filter(p => p.is_active).length === 0} className="px-3 py-1.5 text-sm font-medium text-white bg-[#25D366] hover:bg-[#20BD5A] rounded-lg disabled:opacity-50">Start</button>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Pasangan nomor (session)</h3>
                            {isSuperAdmin && (
                              <button type="button" onClick={openAddWarmerPair} className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:underline">+ Tambah warmer</button>
                            )}
                          </div>
                          {warmerPairs.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Belum ada pasangan. Tambah pasangan agar Nomor 1 &lt;&gt; Nomor 2 saling chat otomatis.</p>
                          ) : (
                            <ul className="space-y-2">
                              {warmerPairs.map((p) => {
                                const pairKey = (p.id != null && p.id !== '') ? String(p.id) : `${p.session_id_1 || 'default'}_${p.session_id_2}`
                                const count = warmerNodeStatus?.pairCounts?.[pairKey] ?? 0
                                const totalInTheme = warmerMessages.filter((m) => (m.category || '') === (p.category || '')).length || p.stop_after_conversations || 0
                                const total = totalInTheme > 0 ? totalInTheme : (p.stop_after_conversations || 0)
                                const restUntil = warmerNodeStatus?.pairRestUntil?.[pairKey]
                                const isRest = restUntil && Date.now() < restUntil
                                return (
                                  <li key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div className="min-w-0">
                                      <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
                                        {p.session_id_1 === 'default' ? 'WhatsApp 1' : p.session_id_1} &lt;&gt; {p.session_id_2 === 'default' ? 'WhatsApp 1' : p.session_id_2}
                                      </span>
                                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                        Wait {p.wait_min_sec}–{p.wait_max_sec}s · Stop after {p.stop_after_conversations} · Rest {p.rest_minutes}m · {p.language} · {p.category} {p.use_typing ? '· Typing' : ''}
                                      </span>
                                      {!p.is_active && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(nonaktif)</span>}
                                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-medium text-teal-600 dark:text-teal-400" title="Chat ke berapa / total pesan di tema">
                                          {count}/{total}
                                        </span>
                                        {isRest && <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Rest.</span>}
                                      </div>
                                    </div>
                                    {isSuperAdmin && (
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <button type="button" onClick={() => openEditWarmerPair(p)} className="p-1.5 rounded text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30" title="Edit">✎</button>
                                        <button type="button" onClick={() => setWarmerDeletePairConfirm(p)} className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30" title="Hapus">🗑</button>
                                      </div>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                      </div>

                      {/* Kanan (PC) / Tab Tema & Import (mobile): Daftar tema + Import + Daftar pesan — scroll di dalam kotak */}
                      <div className={`${warmerSubTab === 'tema' ? 'block' : 'hidden'} md:block md:flex-1 md:min-w-0 md:min-h-0 md:overflow-y-auto page-content-scroll md:pl-6 md:pr-2 space-y-4 md:border-l md:border-gray-200 md:dark:border-gray-700`}>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Daftar tema</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Tema untuk mengelompokkan skrip. Hapus tema = hapus semua pesan dalam tema tersebut.</p>
                          {warmerCategories.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-1">Belum ada tema. Import pesan dengan tema baru untuk membuat.</p>
                          ) : (
                            <ul className="flex flex-wrap gap-2">
                              {warmerCategories.map((t) => (
                                <li key={t} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t}</span>
                                  {isSuperAdmin && (
                                    <button type="button" onClick={() => setWarmerDeleteThemeConfirm(t)} className="p-0.5 rounded text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30" title="Hapus tema">×</button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Import pesan</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Satu file = satu skrip: wa1 dan wa2 bergantian. TXT: &quot;1:&quot; / &quot;2:&quot;. JSON: from + text.</p>
                          {isSuperAdmin && (
                            <button type="button" onClick={() => { setWarmerImportCategory(warmerCategories[0] || 'other'); setWarmerImportCategoryOther(''); setWarmerImportOpen(true); loadWarmerExample(warmerImportFormat); setWarmerImportContent(''); }} className="px-3 py-1.5 text-sm font-medium text-teal-600 dark:text-teal-400 border border-teal-500 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/20">Import pesan</button>
                          )}
                          <div className="mt-2 flex gap-2">
                            <a href="#" onClick={(e) => { e.preventDefault(); warmerAPI.getExamples('txt').then(r => { const blob = new Blob([r?.example || ''], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'warmer-example.txt'; a.click(); URL.revokeObjectURL(a.href); }); }} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">Contoh .txt</a>
                            <a href="#" onClick={(e) => { e.preventDefault(); warmerAPI.getExamples('json').then(r => { const blob = new Blob([r?.example || '[]'], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'warmer-example.json'; a.click(); URL.revokeObjectURL(a.href); }); }} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">Contoh .json</a>
                            <a href="#" onClick={(e) => { e.preventDefault(); warmerAPI.getExamples('excel').then(r => { const blob = new Blob([r?.example || ''], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'warmer-example.csv'; a.click(); URL.revokeObjectURL(a.href); }); }} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">Contoh CSV</a>
                          </div>
                        </div>
                        {warmerMessages.length > 0 && (
                          <div className="rounded border border-gray-200 dark:border-gray-600 p-2 max-h-40 overflow-y-auto">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Daftar pesan ({warmerMessages.length}):</p>
                            <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
                              {warmerMessages.slice(0, 20).map((m) => (
                                <li key={m.id} className="flex justify-between gap-2">
                                  <span className="truncate">{(m.content || '').slice(0, 50)}{(m.content || '').length > 50 ? '…' : ''}</span>
                                  {isSuperAdmin && m.source === 'imported' && (
                                    <button type="button" onClick={() => setWarmerDeleteMessageConfirm(m)} className="text-red-500 hover:underline flex-shrink-0">Hapus</button>
                                  )}
                                </li>
                              ))}
                              {warmerMessages.length > 20 && <li className="text-gray-500">… dan {warmerMessages.length - 20} lainnya</li>}
                            </ul>
                          </div>
                        )}
                      </div>
                    </>
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
            {connectDrawerSessionId && (
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
                      Hubungkan {sessionSlotLabel(connectDrawerSessionId)}
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
                          WhatsApp untuk slot ini sudah terhubung. Tekan Oke untuk kembali ke daftar.
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
                          const ds = data.sessions?.[connectDrawerSessionId]
                          const wwebConnecting = ds?.status === 'connecting'
                          const wwebOk = ds?.status === 'connected'
                          const primarySrc = ds?.qrCode || (!wwebOk ? ds?.baileysQrCode : null)
                          const showPrimaryQr = !wwebOk && primarySrc
                          const baileysNeed =
                            wwebOk &&
                            (ds?.baileysStatus === 'connecting' || !!ds?.baileysQrCode) &&
                            ds?.baileysStatus !== 'connected'

                          return (
                            <>
                              {!wwebOk && (
                                <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-3">
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Langkah 1 — Login WhatsApp Web</p>
                                  {showPrimaryQr ? (
                                    <WaQrCountdownBlock
                                      title="Scan QR ini di WhatsApp di HP Anda"
                                      qrSrc={primarySrc}
                                      alt="QR WhatsApp"
                                      sessionId={connectDrawerSessionId}
                                      fetchStatus={fetchStatus}
                                      onReloadQr={() => handleDrawerReloadQr()}
                                      reloadDisabled={connectDrawerBusy}
                                      autoPollStatus={false}
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center min-h-[200px] rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 px-4 text-center">
                                      <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {wwebConnecting && !primarySrc
                                          ? 'Sesi sedang dimulai di server. Tekan Muat QR untuk mengambil gambar QR.'
                                          : 'Tekan Muat QR untuk meminta kode dari server.'}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                              {baileysNeed && (
                                <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40 p-3">
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Langkah 2 — Aktivasi pesan cepat (Baileys)</p>
                                  {ds?.baileysQrCode ? (
                                    <WaQrCountdownBlock
                                      title="Scan QR kedua jika diminta (kirim & cek nomor)"
                                      qrSrc={ds.baileysQrCode}
                                      alt="QR Baileys"
                                      sessionId={connectDrawerSessionId}
                                      fetchStatus={fetchStatus}
                                      onReloadQr={() => handleDrawerReloadQr()}
                                      reloadDisabled={connectDrawerBusy}
                                      autoPollStatus={false}
                                    />
                                  ) : (
                                    <p className="text-sm text-amber-700 dark:text-amber-300 py-4 text-center">Menunggu QR langkah 2… Klik Muat QR.</p>
                                  )}
                                </div>
                              )}
                            </>
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

          {/* Warmer: form tambah/edit pasangan */}
          <AnimatePresence>
            {warmerPairFormOpen && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWarmerPairFormOpen(false)} className="fixed inset-0 bg-black/40 z-[110]" />
                <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'tween', duration: 0.3 }} className="fixed bottom-0 left-0 right-0 z-[111] max-h-[90vh] overflow-y-auto rounded-t-xl bg-white dark:bg-gray-800 shadow-xl">
                  <div className="sticky top-0 bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{warmerEditingPairId ? 'Edit pasangan warmer' : 'Tambah pasangan warmer'}</h3>
                    <button type="button" onClick={() => setWarmerPairFormOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">✕</button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nomor / Session 1</label>
                        <select value={warmerPairForm.session_id_1} onChange={(e) => setWarmerPairForm(f => ({ ...f, session_id_1: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {sessionIds.map((sid) => (
                            <option key={sid} value={sid}>{sid === 'default' ? 'WhatsApp 1' : sid}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nomor / Session 2</label>
                        <select value={warmerPairForm.session_id_2} onChange={(e) => setWarmerPairForm(f => ({ ...f, session_id_2: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {sessionIds.filter(s => s !== warmerPairForm.session_id_1).map((sid) => (
                            <option key={sid} value={sid}>{sid === 'default' ? 'WhatsApp 1' : sid}</option>
                          ))}
                          {sessionIds.length < 2 && <option value="wa2">wa2</option>}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Wait (min detik)</label>
                        <input type="number" min={5} max={90} value={warmerPairForm.wait_min_sec} onChange={(e) => setWarmerPairForm(f => ({ ...f, wait_min_sec: Number(e.target.value) || 5 }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Wait (max detik)</label>
                        <input type="number" min={5} max={90} value={warmerPairForm.wait_max_sec} onChange={(e) => setWarmerPairForm(f => ({ ...f, wait_max_sec: Number(e.target.value) || 90 }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stop setelah (percakapan)</label>
                      <input type="number" min={1} max={10000} value={warmerPairForm.stop_after_conversations} onChange={(e) => setWarmerPairForm(f => ({ ...f, stop_after_conversations: Number(e.target.value) || 200 }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Istirahat (menit)</label>
                      <input type="number" min={1} max={120} value={warmerPairForm.rest_minutes} onChange={(e) => setWarmerPairForm(f => ({ ...f, rest_minutes: Number(e.target.value) || 15 }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" title="Setelah pair berhenti (mencapai batas percakapan), warmer istirahat selama X menit sebelum pair ini dijalankan lagi." />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Setelah mencapai batas percakapan, pair ini istirahat X menit lalu dijalankan lagi.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bahasa</label>
                        <select value={warmerPairForm.language} onChange={(e) => setWarmerPairForm(f => ({ ...f, language: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          <option value="id">Indonesia</option>
                          <option value="en">English</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tema</label>
                        <select value={warmerPairForm.category} onChange={(e) => setWarmerPairForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {pairCategoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {warmerPairForm.category === 'other' && (
                          <input type="text" value={warmerPairCategoryOther} onChange={(e) => setWarmerPairCategoryOther(e.target.value)} placeholder="Nama tema baru" maxLength={50} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm mt-1" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="warmer-typing" checked={warmerPairForm.use_typing} onChange={(e) => setWarmerPairForm(f => ({ ...f, use_typing: e.target.checked }))} className="rounded border-gray-300 dark:border-gray-600" />
                      <label htmlFor="warmer-typing" className="text-sm text-gray-700 dark:text-gray-300">Simulasi mengetik sebelum kirim</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="warmer-active" checked={warmerPairForm.is_active} onChange={(e) => setWarmerPairForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300 dark:border-gray-600" />
                      <label htmlFor="warmer-active" className="text-sm text-gray-700 dark:text-gray-300">Aktif</label>
                    </div>
                  </div>
                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    <button type="button" onClick={() => setWarmerPairFormOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Batal</button>
                    <button type="button" onClick={handleSaveWarmerPair} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg">{saving ? 'Menyimpan...' : 'Simpan'}</button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Warmer: offcanvas kanan import pesan */}
          <AnimatePresence>
            {warmerImportOpen && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setWarmerImportOpen(false)} className="fixed inset-0 bg-black/40 z-[110]" />
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'tween', duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                  className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[111] flex flex-col"
                >
                  <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Import pesan warmer</h3>
                    <button type="button" onClick={() => setWarmerImportOpen(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" aria-label="Tutup">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Paste isi file atau unggah file .txt / .json (export chat WA).</p>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <select value={warmerImportFormat} onChange={(e) => { setWarmerImportFormat(e.target.value); loadWarmerExample(e.target.value); }} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm">
                          <option value="txt">TXT</option>
                          <option value="json">JSON</option>
                        </select>
                        <label className="sr-only">Tema</label>
                        <select value={warmerCategories.length === 0 ? 'other' : warmerImportCategory} onChange={(e) => setWarmerImportCategory(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm">
                          {warmerCategories.map((t) => <option key={t} value={t}>{t}</option>)}
                          <option value="other">+ Tema baru</option>
                        </select>
                        {warmerImportCategory === 'other' && (
                          <input type="text" value={warmerImportCategoryOther} onChange={(e) => setWarmerImportCategoryOther(e.target.value)} placeholder="Nama tema baru (contoh: promosi, event)" maxLength={50} className="flex-1 min-w-[140px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm" />
                        )}
                        <select value={warmerImportLanguage} onChange={(e) => setWarmerImportLanguage(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm">
                          <option value="id">ID</option>
                          <option value="en">EN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Paste isi atau unggah file</label>
                        <textarea value={warmerImportContent} onChange={(e) => setWarmerImportContent(e.target.value)} placeholder={warmerExample || 'Satu pesan per baris (txt) atau JSON array...'} rows={10} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-y text-sm" />
                        <input type="file" accept=".txt,.json" className="mt-2 text-sm text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-900/30 dark:file:text-teal-300" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleWarmerImport(f); e.target.value = ''; }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <button type="button" onClick={() => setWarmerImportOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Batal</button>
                    <button type="button" onClick={() => handleWarmerImport(null)} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg">{saving ? 'Mengimpor...' : 'Import (paste)'}</button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {warmerDeletePairConfirm && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setWarmerDeletePairConfirm(null)} className="fixed inset-0 bg-black/30 z-[110]" />
              <motion.div
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed left-0 right-0 bottom-0 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[calc(100%-2rem)] sm:max-w-sm bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl z-[111] p-4 pb-[env(safe-area-inset-bottom)] sm:pb-4"
              >
                <div className="flex justify-center pt-1 pb-2 sm:pt-0 sm:pb-3"><div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 sm:hidden" aria-hidden /></div>
                <p className="text-gray-700 dark:text-gray-200 mb-4">Hapus pasangan warmer {warmerDeletePairConfirm.session_id_1} &lt;&gt; {warmerDeletePairConfirm.session_id_2}?</p>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <button type="button" onClick={() => setWarmerDeletePairConfirm(null)} className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Batal</button>
                  <button type="button" onClick={() => handleDeleteWarmerPair(warmerDeletePairConfirm.id)} disabled={saving} className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">{saving ? 'Menghapus...' : 'Hapus'}</button>
                </div>
              </motion.div>
            </>
          )}

          {warmerDeleteMessageConfirm && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setWarmerDeleteMessageConfirm(null)} className="fixed inset-0 bg-black/30 z-[110]" />
              <motion.div
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed left-0 right-0 bottom-0 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[calc(100%-2rem)] sm:max-w-sm bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl z-[111] p-4 pb-[env(safe-area-inset-bottom)] sm:pb-4"
              >
                <div className="flex justify-center pt-1 pb-2 sm:pt-0 sm:pb-3"><div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 sm:hidden" aria-hidden /></div>
                <p className="text-gray-700 dark:text-gray-200 mb-4">Hapus pesan impor ini?</p>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <button type="button" onClick={() => setWarmerDeleteMessageConfirm(null)} className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Batal</button>
                  <button type="button" onClick={() => handleDeleteWarmerMessage(warmerDeleteMessageConfirm.id)} disabled={saving} className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">{saving ? 'Menghapus...' : 'Hapus'}</button>
                </div>
              </motion.div>
            </>
          )}

          {warmerDeleteThemeConfirm && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setWarmerDeleteThemeConfirm(null)} className="fixed inset-0 bg-black/30 z-[110]" />
              <motion.div
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed left-0 right-0 bottom-0 sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[calc(100%-2rem)] sm:max-w-sm bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl z-[111] p-4 pb-[env(safe-area-inset-bottom)] sm:pb-4"
              >
                <div className="flex justify-center pt-1 pb-2 sm:pt-0 sm:pb-3"><div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 sm:hidden" aria-hidden /></div>
                <p className="text-gray-700 dark:text-gray-200 mb-4">Hapus tema &quot;{warmerDeleteThemeConfirm}&quot;? Semua pesan dalam tema ini akan terhapus.</p>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                  <button type="button" onClick={() => setWarmerDeleteThemeConfirm(null)} className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Batal</button>
                  <button type="button" onClick={() => handleDeleteWarmerTheme(warmerDeleteThemeConfirm)} disabled={saving} className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">{saving ? 'Menghapus...' : 'Hapus tema'}</button>
                </div>
              </motion.div>
            </>
          )}
        </>,
        document.body
      )}
    </div>
  )
}
