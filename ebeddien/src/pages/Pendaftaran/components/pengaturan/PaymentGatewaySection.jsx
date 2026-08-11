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
  const [mybeddianProvider, setMybeddianProvider] = useState('ipaymu')
  const [mybeddianProviderMeta, setMybeddianProviderMeta] = useState({
    ipaymu_configured: true,
    xendit_configured: false,
    production_mode: false,
  })

  useEffect(() => {
    loadConfigs()
    loadServerInfo()
    loadMybeddianProvider()
  }, [])

  const loadMybeddianProvider = async () => {
    try {
      const response = await paymentGatewayAPI.getMybeddianProvider()
      if (response.success && response.data) {
        if (response.data.provider) {
          setMybeddianProvider(response.data.provider)
        }
        setMybeddianProviderMeta({
          ipaymu_configured: !!response.data.ipaymu_configured,
          xendit_configured: !!response.data.xendit_configured,
          production_mode: !!response.data.production_mode,
        })
      }
    } catch (error) {
      console.error('Error loading mybeddian provider:', error)
    }
  }

  const handleSetMybeddianProvider = async (provider) => {
    if (saving) return
    setSaving(true)
    try {
      const response = await paymentGatewayAPI.putMybeddianProvider(provider)
      if (response.success) {
        const isWarn = response.data?.provider_configured === false
        showNotification(
          response.message || 'Gateway myBeddian diperbarui',
          isWarn ? 'warning' : 'success'
        )
        setMybeddianProvider(provider)
        await loadMybeddianProvider()
      } else {
        showNotification(response.message || 'Gagal menyimpan', 'error')
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Unknown error'
      showNotification('Gagal menyimpan: ' + msg, 'error')
    } finally {
      setSaving(false)
    }
  }

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
        await loadMybeddianProvider()
      } else {
        showNotification(response.message || 'Gagal mengupdate konfigurasi', 'error')
      }
    } catch (error) {
      console.error('Error updating config:', error)
      const msg = error.response?.data?.message || error.message || 'Unknown error'
      showNotification('Gagal mengupdate konfigurasi: ' + msg, 'error')
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

  const ipaymuSandbox = configs.find((c) => c.name === 'iPaymu' && c.production_mode == 0)
  const ipaymuProduction = configs.find((c) => c.name === 'iPaymu' && c.production_mode == 1)
  const xenditSandbox = configs.find((c) => c.name === 'Xendit' && c.production_mode == 0)
  const xenditProduction = configs.find((c) => c.name === 'Xendit' && c.production_mode == 1)

  return (
    <div ref={ref} className="space-y-5 sm:space-y-6" id="payment-gateway-section">
      {/* Section Title - Modern */}
      <div className="flex items-center gap-3">
        <div className="h-1 w-10 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"></div>
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
          Payment Gateway
        </h2>
      </div>

      {/* Gateway aktif myBeddian */}
      <div className="rounded-2xl bg-teal-50/80 dark:bg-teal-950/30 p-4 sm:p-5 border border-teal-200/80 dark:border-teal-800/50 shadow-sm">
        <h3 className="text-sm font-semibold text-teal-800 dark:text-teal-300 mb-2">Gateway untuk myBeddian</h3>
        <p className="text-xs text-teal-700/90 dark:text-teal-400 mb-2">
          Aplikasi myBeddian memakai gateway yang dipilih di sini. Aplikasi daftar tetap iPayMu.
        </p>
        <p className="text-xs text-teal-600/80 dark:text-teal-500 mb-3">
          Mode aktif: <strong>{mybeddianProviderMeta.production_mode ? 'Production' : 'Sandbox'}</strong>
          {' · '}
          iPayMu {mybeddianProviderMeta.ipaymu_configured ? 'siap (API Key + VA)' : 'belum lengkap (API Key/VA)'}
          {' · '}
          Xendit {mybeddianProviderMeta.xendit_configured ? 'siap' : 'belum ada Secret API key'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleSetMybeddianProvider('ipaymu')}
            disabled={saving || mybeddianProvider === 'ipaymu'}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mybeddianProvider === 'ipaymu'
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-teal-200 dark:border-teal-800'
            }`}
          >
            iPayMu
          </button>
          <button
            type="button"
            onClick={() => handleSetMybeddianProvider('xendit')}
            disabled={saving || mybeddianProvider === 'xendit'}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mybeddianProvider === 'xendit'
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-teal-200 dark:border-teal-800'
            }`}
          >
            Xendit
          </button>
        </div>
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
        {activeConfig?.production_mode == 1 && ipaymuProduction && (!(ipaymuProduction.api_key || '').trim() || !(ipaymuProduction.va || '').trim()) && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Mode Production aktif, tetapi API Key atau VA merchant iPayMu production belum lengkap. Pembayaran aplikasi <strong>daftar</strong> akan gagal sampai keduanya diisi (dari dashboard iPayMu production).
          </p>
        )}
      </div>

      {/* iPayMu */}
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">iPayMu</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {ipaymuSandbox && (
          <div className="rounded-2xl bg-orange-50/80 dark:bg-orange-950/30 p-4 sm:p-5 border border-orange-200/80 dark:border-orange-800/50 shadow-sm">
            <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-3">Sandbox</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">API Key</label>
                <input
                  type="text"
                  value={ipaymuSandbox.api_key || ''}
                  onChange={(e) => handleUpdateConfig(ipaymuSandbox.id, 'api_key', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-orange-200/80 dark:border-orange-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="API Key Sandbox"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Virtual Account (VA)</label>
                <input
                  type="text"
                  value={ipaymuSandbox.va || ''}
                  onChange={(e) => handleUpdateConfig(ipaymuSandbox.id, 'va', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-orange-200/80 dark:border-orange-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="VA iPayMu"
                />
              </div>
            </div>
          </div>
        )}
        {!ipaymuProduction && (
          <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 p-4 sm:p-5 border border-amber-300/80 dark:border-amber-700/50 shadow-sm lg:col-span-2">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">Production — belum tersedia</h4>
            <p className="text-xs text-amber-800/90 dark:text-amber-400 leading-relaxed">
              Baris konfigurasi iPayMu Production belum ada di database. Muat ulang halaman ini (API akan membuat baris otomatis), atau jalankan migrasi terbaru di server API. Setelah muncul, isi API Key dan VA dari dashboard iPayMu production.
            </p>
          </div>
        )}
        {ipaymuProduction && (
          <div className="rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 p-4 sm:p-5 border border-emerald-200/80 dark:border-emerald-800/50 shadow-sm">
            <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-3">Production</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">API Key</label>
                <input
                  type="text"
                  value={ipaymuProduction.api_key || ''}
                  onChange={(e) => handleUpdateConfig(ipaymuProduction.id, 'api_key', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="API Key Production"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Virtual Account (VA)</label>
                <input
                  type="text"
                  value={ipaymuProduction.va || ''}
                  onChange={(e) => handleUpdateConfig(ipaymuProduction.id, 'va', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="VA iPayMu"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Xendit */}
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 pt-2">Xendit</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {xenditSandbox && (
          <div className="rounded-2xl bg-blue-50/80 dark:bg-blue-950/30 p-4 sm:p-5 border border-blue-200/80 dark:border-blue-800/50 shadow-sm">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">Sandbox</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Secret API Key</label>
                <input
                  type="password"
                  value={xenditSandbox.api_key || ''}
                  onChange={(e) => handleUpdateConfig(xenditSandbox.id, 'api_key', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-blue-200/80 dark:border-blue-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="xnd_development_..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Webhook Token (api_secret)</label>
                <input
                  type="password"
                  value={xenditSandbox.api_secret || ''}
                  onChange={(e) => handleUpdateConfig(xenditSandbox.id, 'api_secret', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-blue-200/80 dark:border-blue-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Token dari dashboard Xendit"
                />
              </div>
            </div>
          </div>
        )}
        {xenditProduction && (
          <div className="rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/30 p-4 sm:p-5 border border-indigo-200/80 dark:border-indigo-800/50 shadow-sm">
            <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 mb-3">Production</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Secret API Key</label>
                <input
                  type="password"
                  value={xenditProduction.api_key || ''}
                  onChange={(e) => handleUpdateConfig(xenditProduction.id, 'api_key', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="xnd_production_..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Webhook Token (api_secret)</label>
                <input
                  type="password"
                  value={xenditProduction.api_secret || ''}
                  onChange={(e) => handleUpdateConfig(xenditProduction.id, 'api_secret', e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/50 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 text-sm"
                  placeholder="Token callback production"
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
            Informasi Server & Callback URL
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
                <span className="text-violet-700 dark:text-violet-400 font-medium text-xs flex-shrink-0">Callback iPayMu:</span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] sm:text-xs text-violet-900 dark:text-violet-200 break-all bg-violet-100/80 dark:bg-violet-900/40 px-2.5 py-1.5 rounded-lg">
                    {serverInfo.callback_url}
                  </span>
                  <button
                    onClick={() => copyToClipboard(serverInfo.callback_url, 'Callback iPayMu')}
                    className="flex-shrink-0 self-start sm:self-center p-2 rounded-lg bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800/60 transition-colors active:scale-95 touch-manipulation"
                    title="Salin URL"
                    type="button"
                  >
                    <CopyIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {serverInfo.callback_url_xendit && (
              <div className="flex flex-col gap-2 sm:gap-3 p-3 rounded-xl bg-white/60 dark:bg-gray-900/40 border border-violet-200/60 dark:border-violet-800/40">
                <span className="text-violet-700 dark:text-violet-400 font-medium text-xs flex-shrink-0">Callback Xendit:</span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] sm:text-xs text-violet-900 dark:text-violet-200 break-all bg-violet-100/80 dark:bg-violet-900/40 px-2.5 py-1.5 rounded-lg">
                    {serverInfo.callback_url_xendit}
                  </span>
                  <button
                    onClick={() => copyToClipboard(serverInfo.callback_url_xendit, 'Callback Xendit')}
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
            <span>Tambahkan IP backend ke whitelist iPayMu; daftarkan URL callback Xendit di dashboard Xendit (Settings → Webhooks)</span>
          </li>
        </ul>
      </div>
    </div>
  )
})

export default PaymentGatewaySection
