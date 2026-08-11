import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useNotification } from '../../contexts/NotificationContext'
import { watzapAPI } from '../../services/api'

const WATZAP_DOCS_URL = 'https://api-docs.watzap.id/'
const WATZAP_ADD_NUMBER_URL = 'https://docs.watzap.id/help/integrations/menambahkan-nomor-wa-untuk-api'

export default function Watzap() {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState(null)
  const [devices, setDevices] = useState([])
  const [sendPhone, setSendPhone] = useState('')
  const [sendMessage, setSendMessage] = useState('')
  const [numberKey, setNumberKey] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSetting, setWebhookSetting] = useState(false)
  const [webhooksList, setWebhooksList] = useState([])
  const [configNumberKey, setConfigNumberKey] = useState('')
  const [configSaving, setConfigSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([watzapAPI.getStatus(), watzapAPI.getDevices(), watzapAPI.getWebhookUrl(), watzapAPI.getWebhooks()])
      .then(([statusRes, devicesRes, webhookRes, webhooksRes]) => {
        if (cancelled) return
        if (statusRes?.success && statusRes?.data) {
          setStatus(statusRes.data)
          setConfigNumberKey(statusRes.data?.number_key ?? '')
        } else setStatus(null)
        if (devicesRes?.success && Array.isArray(devicesRes?.data)) {
          setDevices(devicesRes.data)
        } else {
          setDevices([])
        }
        setWebhookUrl(webhookRes?.url ?? '')
        if (webhooksRes?.success && Array.isArray(webhooksRes?.data)) {
          setWebhooksList(webhooksRes.data)
        } else {
          setWebhooksList([])
        }
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err?.response?.data?.message || err?.message || 'Gagal memuat status WatZap'
        if (err?.response?.status === 404 || err?.response?.status === 501) {
          setError('Backend belum mengaktifkan integrasi WatZap. Hubungi pengembang untuk menambahkan endpoint /watzap/* dan API key WatZap di server.')
        } else {
          setError(msg)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleCopyWebhook = () => {
    if (!webhookUrl) {
      showNotification('URL webhook belum di-set (API_PUBLIC_URL / WATZAP_WEBHOOK_URL di .env)', 'warning')
      return
    }
    navigator.clipboard.writeText(webhookUrl).then(
      () => showNotification('URL webhook disalin', 'success'),
      () => showNotification('Gagal menyalin', 'error')
    )
  }

  const handleSetWebhook = async () => {
    setWebhookSetting(true)
    try {
      const res = await watzapAPI.setWebhook()
      showNotification(res?.message ?? (res?.success ? 'Webhook didaftarkan' : 'Gagal'), res?.success ? 'success' : 'error')
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal set webhook', 'error')
    } finally {
      setWebhookSetting(false)
    }
  }

  const handleSaveConfig = async () => {
    setConfigSaving(true)
    try {
      const res = await watzapAPI.putConfig({ number_key: configNumberKey })
      showNotification(res?.message ?? 'Pengaturan disimpan', 'success')
      if (status != null && res?.data?.number_key !== undefined) {
        setStatus((prev) => (prev ? { ...prev, number_key: res.data.number_key } : null))
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan pengaturan', 'error')
    } finally {
      setConfigSaving(false)
    }
  }

  const handleSendTest = async (e) => {
    e.preventDefault()
    const phone = sendPhone.trim().replace(/^0/, '62')
    const msg = sendMessage.trim()
    if (!phone || !msg) {
      showNotification('Nomor dan isi pesan wajib diisi', 'warning')
      return
    }
    setSending(true)
    try {
      const res = await watzapAPI.sendMessage(phone, msg, numberKey || undefined)
      if (res?.success) {
        showNotification('Pesan tes terkirim', 'success')
      } else {
        showNotification(res?.message || 'Gagal mengirim', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal mengirim', 'error')
    } finally {
      setSending(false)
    }
  }

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
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">WatZap</h1>

      {error && (
        <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Pengaturan WatZap</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Number key dari dashboard WatZap (untuk kirim pesan). Kosongkan atau isi &quot;ALL&quot; untuk pakai semua nomor. Bisa juga di-set di .env backend: WATZAP_NUMBER_KEY.</p>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number key</label>
              <input
                type="text"
                value={configNumberKey}
                onChange={(e) => setConfigNumberKey(e.target.value)}
                placeholder="ALL atau key dari dashboard WatZap (mis. 7gp463pjj5X5znd5)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={configSaving}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {configSaving ? 'Menyimpan...' : 'Simpan pengaturan'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Status WatZap</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Konfigurasi backend. WatZap pakai api_key + number_key (&quot;ALL&quot; = semua nomor terhubung).</p>
          </div>
          <div className="p-4">
            {status != null ? (
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto">{JSON.stringify(status, null, 2)}</pre>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Tidak ada data status. Pastikan backend sudah mengaktifkan integrasi WatZap.</p>
            )}
            {devices.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Number key (jika API mengembalikan):</p>
                <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {devices.map((d, i) => (
                    <li key={d.id || d.number_key || i}>
                      {d.name || d.number_key || d.id || `Key ${i + 1}`}
                      {d.status && <span className="ml-2 text-gray-500">({d.status})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Tes kirim pesan</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Kirim pesan uji coba lewat WatZap. Backend memakai number_key &quot;ALL&quot; (atau dari .env).</p>
          </div>
          <form onSubmit={handleSendTest} className="p-4 space-y-4">
            {devices.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number key (opsional)</label>
                <select
                  value={numberKey}
                  onChange={(e) => setNumberKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
                >
                  <option value="">Default (ALL dari backend)</option>
                  {devices.map((d, i) => (
                    <option key={d.id || d.number_key || i} value={d.number_key || d.id || ''}>
                      {d.name || d.number_key || d.id || `Key ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nomor tujuan (08xxx / 62xxx)</label>
              <input
                type="text"
                value={sendPhone}
                onChange={(e) => setSendPhone(e.target.value)}
                placeholder="08123456789"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Isi pesan</label>
              <textarea
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                rows={3}
                placeholder="Pesan tes..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm resize-y"
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Mengirim...' : 'Kirim tes'}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Webhook WatZap</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">URL ini dipakai WatZap untuk mengirim event ke API. Staging: api2.alutsmani.id, production: api.alutsmani.id. Set API_PUBLIC_URL atau WATZAP_WEBHOOK_URL di .env backend.</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm font-mono"
              />
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Salin
              </button>
              <button
                type="button"
                onClick={handleSetWebhook}
                disabled={webhookSetting || !webhookUrl}
                className="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {webhookSetting ? 'Memproses...' : 'Daftar ke WatZap'}
              </button>
            </div>
            {!webhookUrl && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Set API_PUBLIC_URL (mis. https://api2.alutsmani.id atau https://api.alutsmani.id) di .env backend, lalu muat ulang halaman.</p>
            )}
            {webhooksList.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Webhook tersedia di WatZap (dari API get webhook)</p>
                <ul className="space-y-2">
                  {webhooksList.map((wh, i) => (
                    <li key={wh.url || i} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-xs font-mono truncate" title={wh.url}>
                        {wh.url}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(wh.url).then(
                            () => showNotification('URL webhook disalin', 'success'),
                            () => showNotification('Gagal menyalin', 'error')
                          )
                        }}
                        className="shrink-0 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Salin
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Dokumentasi WatZap</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Tambahkan nomor WA dan kelola device di dashboard WatZap.</p>
          </div>
          <div className="p-4 flex flex-wrap gap-3">
            <a
              href={WATZAP_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
            >
              API Documentation →
            </a>
            <a
              href={WATZAP_ADD_NUMBER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
            >
              Menambahkan nomor WA untuk API →
            </a>
          </div>
        </div>
        </div>

      <div className="mt-6">
        <Link to="/settings/notifikasi" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
          ← Kembali ke Notifikasi
        </Link>
      </div>
        </div>
      </div>
    </div>
  )
}
