import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useNotification } from '../../contexts/NotificationContext'
import { evolutionApiAPI } from '../../services/api'

const DOCS_URL = 'https://doc.evolution-api.com/v2/en/get-started/introduction'

const DEFAULT_TEST_LIST = {
  title: 'Menu tes eBeddien',
  description: 'Pilih salah satu opsi di bawah (pesan interaktif tes).',
  buttonText: 'Lihat pilihan',
  footerText: 'Evolution WA · sendList',
  sections: [
    {
      title: 'Menu',
      rows: [
        { title: 'Informasi', description: 'Info singkat', rowId: 'ebeddien_info' },
        { title: 'Bantuan', description: 'Butuh bantuan?', rowId: 'ebeddien_help' }
      ]
    }
  ]
}

const DEFAULT_TEST_BUTTONS = {
  title: 'Konfirmasi tes',
  description: 'Ini pesan dengan tombol balasan (quick reply) dari eBeddien.',
  footer: 'Evolution · sendButtons',
  buttons: [
    { type: 'reply', displayText: 'Setuju', id: 'ebeddien_ok' },
    { type: 'reply', displayText: 'Batal', id: 'ebeddien_cancel' }
  ]
}

/** Pesan API kadang array/objek; hindari tampilan "Array" di notifikasi */
function formatApiMessage(msg, fallback) {
  if (msg == null || msg === '') return fallback
  if (typeof msg === 'string') return msg
  if (Array.isArray(msg)) {
    const parts = msg.map((x) => formatApiMessage(x, '')).filter(Boolean)
    return parts.length ? parts.join('; ') : fallback
  }
  if (typeof msg === 'object') {
    try {
      return JSON.stringify(msg)
    } catch {
      return fallback
    }
  }
  return String(msg)
}

function pickInstancesPayload(data) {
  if (data == null) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.response)) return data.response
  if (Array.isArray(data.instances)) return data.instances
  return []
}

function pickQrFromConnect(data) {
  if (data == null || typeof data !== 'object') return { imgSrc: null, qrValue: null, pairingCode: null }
  const pairingCode = typeof data.pairingCode === 'string' && data.pairingCode.trim() ? data.pairingCode.trim() : null
  if (typeof data.base64 === 'string' && data.base64.trim()) {
    const b = data.base64.trim()
    const imgSrc = b.startsWith('data:') ? b : `data:image/png;base64,${b}`
    return { imgSrc, qrValue: null, pairingCode }
  }
  const nested = data.qrcode
  if (nested && typeof nested === 'object' && typeof nested.base64 === 'string' && nested.base64.trim()) {
    const b = nested.base64.trim()
    const imgSrc = b.startsWith('data:') ? b : `data:image/png;base64,${b}`
    return { imgSrc, qrValue: null, pairingCode }
  }
  if (typeof data.code === 'string' && data.code.trim().length > 2) {
    return { imgSrc: null, qrValue: data.code.trim(), pairingCode }
  }
  return { imgSrc: null, qrValue: null, pairingCode }
}

/** Respons GET connectionState Evolution — state open = terhubung */
function isConnectionOpenFromApi(res) {
  if (!res?.success || res?.data == null || typeof res.data !== 'object') return false
  const d = res.data
  const inst = d.instance
  if (inst && typeof inst === 'object') {
    const st = String(inst.state ?? inst.status ?? '').toLowerCase()
    if (st === 'open' || st === 'connected') return true
  }
  const st2 = String(d.state ?? d.status ?? '').toLowerCase()
  return st2 === 'open' || st2 === 'connected'
}

const QR_POLL_MS = 2000

function QrLinkedSuccessAnimation() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center py-2"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.05 }}
        className="w-[5.5rem] h-[5.5rem] rounded-full bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30"
      >
        <svg className="w-12 h-12 text-white" viewBox="0 0 24 24" fill="none" aria-hidden>
          <motion.path
            d="M6 12.5l3.5 3.5L18 8"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ pathLength: { duration: 0.45, ease: 'easeOut', delay: 0.12 }, opacity: { duration: 0.15, delay: 0.12 } }}
          />
        </svg>
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.25 }}
        className="mt-4 text-lg font-semibold text-emerald-600 dark:text-emerald-400"
      >
        Berhasil terhubung
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.25 }}
        className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 text-center px-2"
      >
        WhatsApp sudah dipasangkan dengan instance ini
      </motion.p>
    </motion.div>
  )
}

export default function EvolutionWa() {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState(null)
  const [instanceName, setInstanceName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [instances, setInstances] = useState([])
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoData, setInfoData] = useState(null)
  const [stateLoading, setStateLoading] = useState(false)
  const [connectionState, setConnectionState] = useState(null)
  const [connectLoading, setConnectLoading] = useState(false)
  const [connectPayload, setConnectPayload] = useState(null)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [newInstanceName, setNewInstanceName] = useState('')
  const [pairPhone, setPairPhone] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [testTab, setTestTab] = useState('text')
  const [sendingTestKind, setSendingTestKind] = useState(null)
  const [listTitle, setListTitle] = useState(DEFAULT_TEST_LIST.title)
  const [listDescription, setListDescription] = useState(DEFAULT_TEST_LIST.description)
  const [listButtonText, setListButtonText] = useState(DEFAULT_TEST_LIST.buttonText)
  const [listFooterText, setListFooterText] = useState(DEFAULT_TEST_LIST.footerText)
  const [listSectionsJson, setListSectionsJson] = useState(() => JSON.stringify(DEFAULT_TEST_LIST.sections, null, 2))
  const [btnTitle, setBtnTitle] = useState(DEFAULT_TEST_BUTTONS.title)
  const [btnDescription, setBtnDescription] = useState(DEFAULT_TEST_BUTTONS.description)
  const [btnFooter, setBtnFooter] = useState(DEFAULT_TEST_BUTTONS.footer)
  const [btn1Text, setBtn1Text] = useState(DEFAULT_TEST_BUTTONS.buttons[0].displayText)
  const [btn1Id, setBtn1Id] = useState(DEFAULT_TEST_BUTTONS.buttons[0].id)
  const [btn2Text, setBtn2Text] = useState(DEFAULT_TEST_BUTTONS.buttons[1].displayText)
  const [btn2Id, setBtn2Id] = useState(DEFAULT_TEST_BUTTONS.buttons[1].id)
  const [qrLinkedSuccess, setQrLinkedSuccess] = useState(false)
  const linkedNotifyRef = useRef(false)

  const loadConfig = useCallback(async () => {
    const res = await evolutionApiAPI.getConfig()
    if (res?.success && res?.data) {
      setConfig(res.data)
      setInstanceName(res.data.instance_name || '')
    } else {
      setConfig(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    evolutionApiAPI
      .getConfig()
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data) {
          setConfig(res.data)
          setInstanceName(res.data.instance_name || '')
        }
      })
      .catch(() => {
        if (!cancelled) setConfig(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshInstances = async () => {
    setInstancesLoading(true)
    try {
      const res = await evolutionApiAPI.getInstances()
      if (res?.success) {
        setInstances(pickInstancesPayload(res.data))
      } else {
        setInstances([])
        showNotification(res?.message || 'Gagal memuat instance', 'error')
      }
    } catch (err) {
      setInstances([])
      showNotification(err?.response?.data?.message || err?.message || 'Gagal memuat instance', 'error')
    } finally {
      setInstancesLoading(false)
    }
  }

  const handleSaveInstanceName = async () => {
    setSavingName(true)
    try {
      const res = await evolutionApiAPI.putConfig({ instance_name: instanceName.trim() })
      if (res?.success) {
        showNotification(res?.message || 'Disimpan', 'success')
        await loadConfig()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSavingName(false)
    }
  }

  const handleFetchInfo = async () => {
    setInfoLoading(true)
    setInfoData(null)
    try {
      const res = await evolutionApiAPI.getInfo()
      setInfoData(res)
      if (!res?.success) {
        showNotification(res?.message || 'Endpoint info tidak tersedia atau gagal (normal jika Evolution hanya expose /instance/*)', 'warning')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal', 'error')
    } finally {
      setInfoLoading(false)
    }
  }

  const handleConnectionState = async () => {
    const name = instanceName.trim()
    if (!name) {
      showNotification('Isi nama instance dulu (atau simpan sebagai default)', 'warning')
      return
    }
    setStateLoading(true)
    setConnectionState(null)
    try {
      const res = await evolutionApiAPI.getConnectionState(name)
      setConnectionState(res)
      if (!res?.success) {
        showNotification(res?.message || 'Gagal membaca status', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal', 'error')
    } finally {
      setStateLoading(false)
    }
  }

  const handleConnect = async () => {
    const name = instanceName.trim()
    if (!name) {
      showNotification('Isi nama instance', 'warning')
      return
    }
    linkedNotifyRef.current = false
    setQrLinkedSuccess(false)
    setConnectLoading(true)
    setConnectPayload(null)
    try {
      const num = pairPhone.trim().replace(/\D/g, '')
      const res = await evolutionApiAPI.getConnect(name, num || undefined)
      setConnectPayload(res)
      if (!res?.success) {
        showNotification(res?.message || 'Gagal mengambil QR / pairing', 'error')
      } else {
        showNotification('Scan QR di WhatsApp → Perangkat tertaut, atau pakai kode pairing.', 'success')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal', 'error')
    } finally {
      setConnectLoading(false)
    }
  }

  const handleLogout = async () => {
    const name = instanceName.trim()
    if (!name) {
      showNotification('Isi nama instance', 'warning')
      return
    }
    setLogoutLoading(true)
    try {
      const res = await evolutionApiAPI.logout(name)
      if (res?.success) {
        showNotification('Instance logout diproses', 'success')
        linkedNotifyRef.current = false
        setQrLinkedSuccess(false)
        setConnectPayload(null)
        await handleConnectionState()
      } else {
        showNotification(res?.message || 'Gagal logout', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal', 'error')
    } finally {
      setLogoutLoading(false)
    }
  }

  const handleSendTest = async (e) => {
    e.preventDefault()
    const phone = testPhone.trim().replace(/^0/, '62').replace(/\D/g, '')
    const msg = testMessage.trim()
    if (!testPhone.trim() || !msg) {
      showNotification('Nomor dan isi pesan wajib diisi', 'warning')
      return
    }
    if (phone.length < 10) {
      showNotification('Nomor tidak valid', 'warning')
      return
    }
    setSendingTestKind('text')
    try {
      const res = await evolutionApiAPI.sendText({
        number: testPhone.trim(),
        text: msg,
        instance_name: instanceName.trim() || undefined
      })
      if (res?.success) {
        showNotification(formatApiMessage(res?.message, 'Pesan tes terkirim'), 'success')
      } else {
        showNotification(formatApiMessage(res?.message, 'Gagal mengirim'), 'error')
      }
    } catch (err) {
      showNotification(
        formatApiMessage(err?.response?.data?.message, err?.message || 'Gagal mengirim'),
        'error'
      )
    } finally {
      setSendingTestKind(null)
    }
  }

  const handleSendTestList = async () => {
    if (!testPhone.trim()) {
      showNotification('Nomor tujuan wajib diisi', 'warning')
      return
    }
    let sections
    try {
      sections = JSON.parse(listSectionsJson)
    } catch {
      showNotification('Format JSON "sections" tidak valid', 'error')
      return
    }
    if (!Array.isArray(sections) || sections.length === 0) {
      showNotification('sections harus array berisi minimal satu section (title + rows)', 'warning')
      return
    }
    setSendingTestKind('list')
    try {
      const res = await evolutionApiAPI.sendList({
        number: testPhone.trim(),
        instance_name: instanceName.trim() || undefined,
        title: listTitle.trim(),
        description: listDescription.trim(),
        buttonText: listButtonText.trim(),
        footerText: listFooterText.trim(),
        sections
      })
      if (res?.success) {
        showNotification(formatApiMessage(res?.message, 'List tes terkirim'), 'success')
      } else {
        showNotification(formatApiMessage(res?.message, 'Gagal mengirim list'), 'error')
      }
    } catch (err) {
      showNotification(
        formatApiMessage(err?.response?.data?.message, err?.message || 'Gagal mengirim list'),
        'error'
      )
    } finally {
      setSendingTestKind(null)
    }
  }

  const handleSendTestButtons = async () => {
    if (!testPhone.trim()) {
      showNotification('Nomor tujuan wajib diisi', 'warning')
      return
    }
    const b1t = btn1Text.trim()
    const b1i = btn1Id.trim()
    const b2t = btn2Text.trim()
    const b2i = btn2Id.trim()
    const buttons = []
    if (b1t && b1i) buttons.push({ type: 'reply', displayText: b1t, id: b1i })
    if (b2t && b2i) buttons.push({ type: 'reply', displayText: b2t, id: b2i })
    if (buttons.length === 0) {
      showNotification('Isi minimal satu tombol (teks + id)', 'warning')
      return
    }
    setSendingTestKind('buttons')
    try {
      const res = await evolutionApiAPI.sendButtons({
        number: testPhone.trim(),
        instance_name: instanceName.trim() || undefined,
        title: btnTitle.trim(),
        description: btnDescription.trim(),
        footer: btnFooter.trim(),
        buttons
      })
      if (res?.success) {
        showNotification(formatApiMessage(res?.message, 'Tombol tes terkirim'), 'success')
      } else {
        showNotification(formatApiMessage(res?.message, 'Gagal mengirim tombol'), 'error')
      }
    } catch (err) {
      showNotification(
        formatApiMessage(err?.response?.data?.message, err?.message || 'Gagal mengirim tombol'),
        'error'
      )
    } finally {
      setSendingTestKind(null)
    }
  }

  const handleCreateInstance = async (e) => {
    e.preventDefault()
    const n = newInstanceName.trim()
    if (!n) {
      showNotification('Nama instance baru wajib diisi', 'warning')
      return
    }
    setCreateLoading(true)
    try {
      const res = await evolutionApiAPI.createInstance({
        instanceName: n,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true
      })
      if (res?.success) {
        showNotification('Instance dibuat. Anda bisa set nama default lalu hubungkan.', 'success')
        setNewInstanceName('')
        setInstanceName(n)
        await loadConfig()
        await refreshInstances()
      } else {
        showNotification(
          typeof res?.data === 'object' && res?.data?.response?.message
            ? String(res.data.response.message)
            : res?.message || 'Gagal membuat instance',
          'error'
        )
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || err?.message || 'Gagal', 'error')
    } finally {
      setCreateLoading(false)
    }
  }

  const connectData = connectPayload?.success ? connectPayload?.data : null
  const { imgSrc, qrValue, pairingCode } = pickQrFromConnect(connectData)
  const hasQrOrPairing = Boolean(imgSrc || qrValue || pairingCode)

  useEffect(() => {
    const name = instanceName.trim()
    if (loading || !connectPayload?.success || !hasQrOrPairing || qrLinkedSuccess || !name || !config?.configured) {
      return undefined
    }
    let cancelled = false
    const check = async () => {
      try {
        const res = await evolutionApiAPI.getConnectionState(name)
        if (cancelled || !isConnectionOpenFromApi(res)) return
        setQrLinkedSuccess(true)
        if (!linkedNotifyRef.current) {
          linkedNotifyRef.current = true
          showNotification('WhatsApp berhasil terhubung', 'success')
        }
      } catch {
        /* abaikan error jaringan per tik */
      }
    }
    check()
    const id = setInterval(check, QR_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [
    loading,
    connectPayload?.success,
    hasQrOrPairing,
    qrLinkedSuccess,
    instanceName,
    config?.configured,
    showNotification
  ])

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
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">Evolution WA</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Koneksi WhatsApp lewat{' '}
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 hover:underline">
              Evolution API v2
            </a>
            . Di backend: <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">EVOLUTION_API_BASE_URL</code> +{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">EVOLUTION_API_KEY</code> untuk server deploy (mis.{' '}
            <span className="font-mono text-xs">evo.alutsmani.id</span>). Untuk dev lokal dengan{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">APP_ENV=local</code>, set{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">EVOLUTION_API_BASE_URL_LOCAL</code> agar mengarah ke Evolution di mesin Anda; di production variabel itu diabaikan.
          </p>

          {!config?.configured && (
            <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Backend belum mengisi Evolution API (base URL / API key). Set variabel di <code className="text-xs">api/.env</code> lalu muat ulang.
            </div>
          )}

          {config?.configured && (
            <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-sm text-blue-900 dark:text-blue-100 space-y-2">
              <p className="font-semibold">Webhook pesan masuk (Chat AI & balasan otomatis)</p>
              <p className="text-xs leading-relaxed">
                Di Evolution, set webhook untuk instance ini dengan event{' '}
                <code className="font-mono bg-white/70 dark:bg-gray-900/50 px-1 rounded">MESSAGES_UPSERT</code>. Lihat{' '}
                <a
                  href="https://doc.evolution-api.com/v2/en/configuration/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  dokumentasi Webhooks
                </a>
                . Di eBeddien: <strong>Setting → Notifikasi</strong> pilih provider <strong>Evolution API</strong> agar balasan dikirim lewat Evolution.
              </p>
              {config.inbound_webhook_url ? (
                <p className="text-xs font-mono break-all bg-white/80 dark:bg-gray-900/40 rounded px-2 py-1.5">{config.inbound_webhook_url}</p>
              ) : (
                <p className="text-xs">
                  Set <code className="font-mono bg-white/70 dark:bg-gray-900/50 px-1 rounded">API_PUBLIC_URL</code> di{' '}
                  <code className="font-mono">api/.env</code> (contoh URL publik API Anda) agar alamat webhook lengkap tampil di sini. Path backend:{' '}
                  <code className="font-mono break-all">{config.inbound_webhook_path || '/api/public/evolution-webhook'}</code>
                </p>
              )}
              <p className="text-xs opacity-90">
                Opsional: <code className="font-mono">EVOLUTION_WEBHOOK_SECRET</code> di <code className="font-mono">api/.env</code> — tambahkan{' '}
                <code className="font-mono">?secret=…</code> pada URL webhook atau header{' '}
                <code className="font-mono">X-Ebeddien-Webhook-Secret</code>.
              </p>
            </div>
          )}

          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Instance default</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Nama instance di Evolution (sama seperti di manager). Dipakai untuk status, QR, dan logout.
                </p>
              </div>
              <div className="p-4 space-y-3">
                {config?.base_url && (
                  <div className="space-y-1">
                    {config?.uses_local_evolution ? (
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                        Mode lokal: proxy memakai <span className="font-mono">EVOLUTION_API_BASE_URL_LOCAL</span> (bukan URL production).
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Mode deploy: URL production / terpusat (tanpa override lokal).
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
                      Server: {config.base_url}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama instance</label>
                  <input
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="contoh: ebeddien-prod"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveInstanceName}
                  disabled={savingName}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm disabled:opacity-50"
                >
                  {savingName ? 'Menyimpan...' : 'Simpan nama default'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Instance di Evolution</h2>
                <button
                  type="button"
                  onClick={refreshInstances}
                  disabled={instancesLoading || !config?.configured}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {instancesLoading ? 'Memuat...' : 'Muat ulang daftar'}
                </button>
              </div>
              <div className="p-4">
                {instances.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada data. Klik &quot;Muat ulang daftar&quot; atau buat instance baru di bawah.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {instances.map((row, i) => {
                      const name = row?.instanceName || row?.name || `instance-${i}`
                      const st = row?.status ?? row?.state ?? '—'
                      return (
                        <li
                          key={row?.instanceId || name || i}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          <span className="font-mono text-gray-800 dark:text-gray-200">{name}</span>
                          <span className="text-gray-500 dark:text-gray-400">{String(st)}</span>
                          <button
                            type="button"
                            className="text-teal-600 dark:text-teal-400 text-xs hover:underline"
                            onClick={() => {
                              setInstanceName(String(name))
                              showNotification('Nama instance diisi dari daftar — simpan jika ingin jadi default.', 'success')
                            }}
                          >
                            Pakai untuk QR
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Buat instance (WHATSAPP-BAILEYS)</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">POST ke Evolution <code className="text-xs">/instance/create</code> lewat proxy API.</p>
              </div>
              <form onSubmit={handleCreateInstance} className="p-4 space-y-3">
                <input
                  type="text"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="nama instance unik"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-mono"
                />
                <button
                  type="submit"
                  disabled={createLoading || !config?.configured}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-900 text-white dark:bg-gray-600 dark:hover:bg-gray-500 font-medium text-sm disabled:opacity-50"
                >
                  {createLoading ? 'Membuat...' : 'Buat instance'}
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Status &amp; koneksi</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  <a
                    href="https://doc.evolution-api.com/v2/api-reference/instance-controller/connection-state"
                    className="text-teal-600 dark:text-teal-400 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    connectionState
                  </a>
                  ,{' '}
                  <a
                    href="https://doc.evolution-api.com/v2/api-reference/instance-controller/instance-connect"
                    className="text-teal-600 dark:text-teal-400 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    connect (QR)
                  </a>
                </p>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleFetchInfo}
                    disabled={infoLoading || !config?.configured}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {infoLoading ? 'Memuat...' : 'Cek info server (GET /)'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectionState}
                    disabled={stateLoading || !config?.configured}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {stateLoading ? 'Memuat...' : 'Status koneksi instance'}
                  </button>
                </div>
                {infoData?.data != null && (
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto max-h-40">
                    {JSON.stringify(infoData.data, null, 2)}
                  </pre>
                )}
                {connectionState?.data != null && (
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(connectionState.data, null, 2)}
                  </pre>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nomor untuk pairing (opsional, kode 62…)
                  </label>
                  <input
                    type="text"
                    value={pairPhone}
                    onChange={(e) => setPairPhone(e.target.value)}
                    placeholder="62812…"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-mono mb-3"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connectLoading || !config?.configured}
                      className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50"
                    >
                      {connectLoading ? 'Memuat...' : 'Ambil QR / pairing'}
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={logoutLoading || !config?.configured}
                      className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    >
                      {logoutLoading ? 'Memproses...' : 'Logout instance'}
                    </button>
                  </div>
                </div>

                {(imgSrc || qrValue || pairingCode) && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 bg-gray-50 dark:bg-gray-900/40">
                    {qrLinkedSuccess ? (
                      <QrLinkedSuccessAnimation />
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 text-center">Scan dengan WhatsApp</p>
                        {imgSrc && (
                          <div className="flex justify-center">
                            <img src={imgSrc} alt="QR Evolution" className="w-52 h-52 object-contain rounded-lg bg-white border border-gray-200" />
                          </div>
                        )}
                        {qrValue && !imgSrc && (
                          <div className="flex flex-col items-center">
                            <QRCodeSVG value={qrValue} size={208} level="M" includeMargin className="rounded-lg bg-white p-2" />
                          </div>
                        )}
                        {pairingCode && (
                          <p className="text-center mt-3 text-lg font-mono font-semibold tracking-widest text-gray-800 dark:text-gray-100">
                            Pairing: {pairingCode}
                          </p>
                        )}
                        <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-3 flex items-center justify-center gap-1.5">
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" aria-hidden />
                          Menunggu scan… status dicek otomatis
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Tes kirim pesan</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Instance harus terhubung. Nomor: 08… atau 62…. Endpoint:{' '}
                  <a
                    href="https://doc.evolution-api.com/v2/api-reference/message-controller/send-text"
                    className="text-teal-600 dark:text-teal-400 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    sendText
                  </a>
                  ,{' '}
                  <a
                    href="https://doc.evolution-api.com/v2/api-reference/message-controller/send-list"
                    className="text-teal-600 dark:text-teal-400 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    sendList
                  </a>
                  ,{' '}
                  <a
                    href="https://doc.evolution-api.com/v2/api-reference/message-controller/send-button"
                    className="text-teal-600 dark:text-teal-400 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    sendButtons
                  </a>
                  . List/tombol bisa tidak tampil di semua klien (batasan WhatsApp).
                </p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nomor tujuan</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                  />
                </div>

                <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-600">
                  {[
                    { id: 'text', label: 'Teks' },
                    { id: 'list', label: 'List' },
                    { id: 'buttons', label: 'Tombol' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTestTab(t.id)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        testTab === t.id
                          ? 'bg-white dark:bg-gray-700 text-teal-700 dark:text-teal-300 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {testTab === 'text' && (
                  <form onSubmit={handleSendTest} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Isi pesan</label>
                      <textarea
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        rows={3}
                        placeholder="Pesan tes dari eBeddien…"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm resize-y"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sendingTestKind !== null || !config?.configured}
                      className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingTestKind === 'text' ? 'Mengirim...' : 'Kirim tes teks'}
                    </button>
                  </form>
                )}

                {testTab === 'list' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 space-y-2">
                      <p>
                        Pesan list interaktif kadang gagal di server Evolution/Baileys dengan error seperti{' '}
                        <code className="font-mono text-[11px]">this.isZero is not a function</code> — itu bug di sisi
                        Evolution (clone JSON/protobuf), bukan dari body yang dikirim eBeddien. Perbarui image Evolution
                        atau sementara pakai tab <strong>Teks</strong>.
                      </p>
                      <p>
                        Bahkan tanpa error, API bisa sukses tetapi list tidak muncul di chat penerima (keterbatasan Baileys).
                        Uji dengan tab <strong>Teks</strong> untuk memastikan nomor/instance benar.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Judul list</label>
                        <input
                          type="text"
                          value={listTitle}
                          onChange={(e) => setListTitle(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Teks tombol buka list</label>
                        <input
                          type="text"
                          value={listButtonText}
                          onChange={(e) => setListButtonText(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Deskripsi</label>
                      <textarea
                        value={listDescription}
                        onChange={(e) => setListDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm resize-y"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Footer</label>
                      <input
                        type="text"
                        value={listFooterText}
                        onChange={(e) => setListFooterText(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        sections (JSON — tiap item: title + rows[])
                      </label>
                      <textarea
                        value={listSectionsJson}
                        onChange={(e) => setListSectionsJson(e.target.value)}
                        rows={10}
                        spellCheck={false}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-mono resize-y"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendTestList}
                      disabled={sendingTestKind !== null || !config?.configured}
                      className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingTestKind === 'list' ? 'Mengirim...' : 'Kirim tes list'}
                    </button>
                  </div>
                )}

                {testTab === 'buttons' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 space-y-2">
                      <p>
                        Di{' '}
                        <a
                          href="https://doc.evolution-api.com/v2/api-reference/message-controller/send-button"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-medium"
                        >
                          dokumentasi Send Buttons
                        </a>
                        , skema OpenAPI menamai field jenis tombol sebagai <code className="font-mono text-[11px]">title</code>{' '}
                        per item — di server Evolution yang dipakai umumnya field yang divalidasi adalah{' '}
                        <code className="font-mono text-[11px]">type</code> (<code>reply</code> / <code>url</code> /{' '}
                        <code>call</code>) bersama <code className="font-mono text-[11px]">displayText</code> dan{' '}
                        <code className="font-mono text-[11px]">id</code>. Proxy API eBeddien mengirim format itu.
                      </p>
                      <p>
                        <code className="font-mono text-[11px]">TypeError: this.isZero is not a function</code> biasanya
                        muncul dari bug Baileys/Evolution saat mengenkode pesan interaktif, bukan karena JSON salah dari
                        halaman ini. Perbarui container Evolution ke rilis terbaru atau gunakan tab <strong>Teks</strong>{' '}
                        sebagai alternatif.
                      </p>
                      <p>
                        Jika notifikasi <strong>sukses</strong> tapi tidak ada pesan di WA: itu pola umum — endpoint tombol
                        sering mengembalikan HTTP sukses tanpa pesan benar-benar sampai lewat sesi Baileys (
                        <a
                          href="https://github.com/EvolutionAPI/evolution-api/issues/2404"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-medium"
                        >
                          contoh laporan
                        </a>
                        ). Bukan bug eBeddien; gunakan tab <strong>Teks</strong> untuk konten yang harus pasti sampai, atau
                        WhatsApp Business API resmi untuk tombol/list andal.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Judul</label>
                      <input
                        type="text"
                        value={btnTitle}
                        onChange={(e) => setBtnTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Deskripsi</label>
                      <textarea
                        value={btnDescription}
                        onChange={(e) => setBtnDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm resize-y"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Footer</label>
                      <input
                        type="text"
                        value={btnFooter}
                        onChange={(e) => setBtnFooter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Dua tombol balasan (reply). Kosongkan baris untuk hanya satu tombol.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Tombol 1</span>
                        <input
                          type="text"
                          value={btn1Text}
                          onChange={(e) => setBtn1Text(e.target.value)}
                          placeholder="Teks tombol"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                        />
                        <input
                          type="text"
                          value={btn1Id}
                          onChange={(e) => setBtn1Id(e.target.value)}
                          placeholder="id (unik)"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Tombol 2</span>
                        <input
                          type="text"
                          value={btn2Text}
                          onChange={(e) => setBtn2Text(e.target.value)}
                          placeholder="Teks tombol"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                        />
                        <input
                          type="text"
                          value={btn2Id}
                          onChange={(e) => setBtn2Id(e.target.value)}
                          placeholder="id (unik)"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSendTestButtons}
                      disabled={sendingTestKind !== null || !config?.configured}
                      className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingTestKind === 'buttons' ? 'Mengirim...' : 'Kirim tes tombol'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <Link to="/settings/watzap" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
              ← WatZap
            </Link>
            <Link to="/settings/notifikasi" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
              ← Notifikasi
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
