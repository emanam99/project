import { useState, useEffect, forwardRef } from 'react'
import { paymentGatewayAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

// Icon Copy - kompak
const CopyIcon = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const PaymentGatewaySection = forwardRef(function PaymentGatewaySection(props, ref) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [configs, setConfigs] = useState([])
  const [activeConfig, setActiveConfig] = useState(null)
  const [serverInfo, setServerInfo] = useState(null)

  useEffect(() => {
    loadConfigs()
    loadServerInfo()
  }, [])

  const loadConfigs = async () => {
    setLoading(true)
    try {
      const response = await paymentGatewayAPI.getAllConfig()
      if (response.success) {
        setConfigs(response.data || [])
        const active = response.data?.find(c => c.is_active == 1)
        setActiveConfig(active)
      }
    } catch (error) {
      console.error('Error loading payment gateway config:', error)
      showNotification('Gagal memuat konfigurasi payment gateway', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadServerInfo = async () => {
    try {
      const response = await paymentGatewayAPI.getServerInfo()
      if (response.success) {
        setServerInfo(response.data)
      }
    } catch (error) {
      console.error('Error loading server info:', error)
    }
  }

  const handleSwitchMode = async (productionMode) => {
    if (saving) return
    setSaving(true)
    try {
      const response = await paymentGatewayAPI.switchMode(productionMode)
      if (response.success) {
        showNotification(response.message || 'Mode berhasil diubah', 'success')
        await loadConfigs()
      } else {
        showNotification(response.message || 'Gagal mengubah mode', 'error')
      }
    } catch (error) {
      console.error('Error switching mode:', error)
      showNotification('Gagal mengubah mode: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateConfig = async (id, field, value) => {
    if (saving) return
    setSaving(true)
    try {
      const response = await paymentGatewayAPI.updateConfig(id, { [field]: value })
      if (response.success) {
        showNotification('Konfigurasi berhasil diupdate', 'success')
        await loadConfigs()
      } else {
        showNotification(response.message || 'Gagal mengupdate konfigurasi', 'error')
      }
    } catch (error) {
      console.error('Error updating config:', error)
      showNotification('Gagal mengupdate konfigurasi: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text)
    showNotification(`${label} berhasil disalin ke clipboard`, 'success')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[8rem]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent"></div>
      </div>
    )
  }

  const sandboxConfig = configs.find(c => c.production_mode == 0)
  const productionConfig = configs.find(c => c.production_mode == 1)

  return (
    <div ref={ref} className="space-y-5 sm:space-y-6" id="payment-gateway-section">
      {/* Section Title - Modern */}
      <div className="flex items-center gap-3">
        <div className="h-1 w-10 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"></div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
          Payment Gateway (iPaymu)
        </h2>
      </div>

      {/* Mode Switch - Responsive & Modern */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/80 dark:from-gray-800/80 dark:to-gray-800/50 p-4 sm:p-5 border border-slate-200/80 dark:border-gray-700 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-0.5">
              Mode Pembayaran
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pilih mode untuk transaksi pembayaran
            </p>
          </div>
          <div className="flex gap-2 sm:flex-shrink-0">
            <button
              onClick={() => handleSwitchMode(0)}
              disabled={saving || activeConfig?.production_mode == 0}
              className={`flex-1 sm:flex-initial min-w-0 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeConfig?.production_mode == 0
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30 ring-2 ring-orange-400/50'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-600 border border-slate-200 dark:border-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Sandbox
            </button>
            <button
              onClick={() => handleSwitchMode(1)}
              disabled={saving || activeConfig?.production_mode == 1}
              className={`flex-1 sm:flex-initial min-w-0 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeConfig?.production_mode == 1
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400/50'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-600 border border-slate-200 dark:border-gray-600'
              } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Production
            </button>
          </div>
        </div>
        {activeConfig && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Mode aktif: <span className="font-semibold text-gray-700 dark:text-gray-300">{activeConfig.production_mode == 1 ? 'Production' : 'Sandbox'}</span>
          </p>
        )}
      </div>

      {/* Config Cards - Grid Responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Sandbox Config */}
        {sandboxConfig && (
          <div className="rounded-2xl bg-orange-50/80 dark:bg-orange-950/30 p-4 sm:p-5 border border-orange-200/80 dark:border-orange-800/50 shadow-sm">
            <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-orange-500"></span>
              Konfigurasi Sandbox
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">API Key</label>
                <input
                  type="text"
                  value={sandboxConfig.api_key || ''}
                  onChange={(e) => handleUpdateConfig(sandboxConfig.id, 'api_key', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-orange-200/80 dark:border-orange-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  placeholder="Masukkan API Key Sandbox"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Virtual Account (VA)</label>
                <input
                  type="text"
                  value={sandboxConfig.va || ''}
                  onChange={(e) => handleUpdateConfig(sandboxConfig.id, 'va', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-orange-200/80 dark:border-orange-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  placeholder="Masukkan Virtual Account"
                />
              </div>
            </div>
          </div>
        )}

        {/* Production Config */}
        {productionConfig && (
          <div className="rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 p-4 sm:p-5 border border-emerald-200/80 dark:border-emerald-800/50 shadow-sm">
            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-3 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              Konfigurasi Production
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">API Key</label>
                <input
                  type="text"
                  value={productionConfig.api_key || ''}
                  onChange={(e) => handleUpdateConfig(productionConfig.id, 'api_key', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  placeholder="Masukkan API Key Production"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Virtual Account (VA)</label>
                <input
                  type="text"
                  value={productionConfig.va || ''}
                  onChange={(e) => handleUpdateConfig(productionConfig.id, 'va', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  placeholder="Masukkan Virtual Account"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Server Info - Responsive & Modern */}
      {serverInfo && (
        <div className="rounded-2xl bg-violet-50/80 dark:bg-violet-950/30 p-4 sm:p-5 border border-violet-200/80 dark:border-violet-800/50 shadow-sm">
          <h3 className="font-semibold text-violet-800 dark:text-violet-300 mb-4 text-sm flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-violet-500"></span>
            Informasi Server (Whitelist iPayMu)
          </h3>
          <div className="space-y-4">
            {serverInfo.public_ip && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl bg-white/60 dark:bg-gray-900/40 border border-violet-200/60 dark:border-violet-800/40">
                <span className="text-violet-700 dark:text-violet-400 font-medium text-xs flex-shrink-0">IP Backend:</span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="flex-1 min-w-0 font-mono text-xs sm:text-sm text-violet-900 dark:text-violet-200 break-all bg-violet-100/80 dark:bg-violet-900/40 px-2.5 py-1.5 rounded-lg">
                    {serverInfo.public_ip}
                  </span>
                  <button
                    onClick={() => copyToClipboard(serverInfo.public_ip, 'IP')}
                    className="flex-shrink-0 p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800/60 transition-colors active:scale-95 touch-manipulation"
                    title="Salin IP"
                    type="button"
                  >
                    <CopyIcon className="w-4 h-4 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>
            )}
            {serverInfo.server_ip && serverInfo.server_ip !== serverInfo.public_ip && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl bg-white/60 dark:bg-gray-900/40 border border-violet-200/60 dark:border-violet-800/40">
                <span className="text-violet-700 dark:text-violet-400 font-medium text-xs flex-shrink-0">Server IP (Internal):</span>
                <span className="font-mono text-xs text-violet-900 dark:text-violet-200 break-all bg-violet-100/80 dark:bg-violet-900/40 px-2.5 py-1.5 rounded-lg">
                  {serverInfo.server_ip}
                </span>
              </div>
            )}
            {serverInfo.callback_url && (
              <div className="flex flex-col gap-2 sm:gap-3 p-3 rounded-xl bg-white/60 dark:bg-gray-900/40 border border-violet-200/60 dark:border-violet-800/40">
                <span className="text-violet-700 dark:text-violet-400 font-medium text-xs flex-shrink-0">Callback URL:</span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] sm:text-xs text-violet-900 dark:text-violet-200 break-all bg-violet-100/80 dark:bg-violet-900/40 px-2.5 py-1.5 rounded-lg">
                    {serverInfo.callback_url}
                  </span>
                  <button
                    onClick={() => copyToClipboard(serverInfo.callback_url, 'Callback URL')}
                    className="flex-shrink-0 self-start sm:self-center p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800/60 transition-colors active:scale-95 touch-manipulation"
                    title="Salin URL"
                    type="button"
                  >
                    <CopyIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-violet-200/80 dark:border-violet-800/50 space-y-1">
            <p className="text-[11px] sm:text-xs text-violet-600 dark:text-violet-400 leading-relaxed">
              <strong>Penting:</strong> IP Backend perlu ditambahkan ke whitelist di dashboard iPayMu (Settings → IP Whitelist) agar callback pembayaran berfungsi.
            </p>
            {serverInfo.note && (
              <p className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-400">
                <strong>Perhatian:</strong> {serverInfo.note}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Catatan - Modern & Responsive */}
      <div className="rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 p-4 sm:p-5 border border-sky-200/80 dark:border-sky-800/50 shadow-sm">
        <h3 className="font-semibold text-sky-800 dark:text-sky-300 mb-3 text-sm flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-sky-500"></span>
          Catatan
        </h3>
        <ul className="text-xs sm:text-sm text-sky-700 dark:text-sky-400 space-y-2 list-none">
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            <span>Sandbox untuk pengujian, Production untuk transaksi nyata</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            <span>Hanya satu mode yang aktif dalam satu waktu</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            <span>API Key dan VA tersimpan otomatis saat diubah</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            <span>Tambahkan IP backend ke whitelist iPayMu untuk mengaktifkan callback</span>
          </li>
        </ul>
      </div>
    </div>
  )
})

export default PaymentGatewaySection
