import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

const PROVIDERS = [
  {
    value: '',
    label: 'Ikuti pengaturan umum',
    description: 'Pakai provider yang sama dengan Pengaturan → Notifikasi.'
  },
  {
    value: 'wa_sendiri',
    label: 'WA server sendiri',
    description: 'Koneksi WhatsApp yang dikelola di halaman WhatsApp (scan QR).'
  },
  {
    value: 'evolution',
    label: 'Evolution API',
    description: 'Kirim lewat Evolution (atur instance di Setting → Evolution WA).'
  },
  {
    value: 'watzap',
    label: 'WatZap',
    description: 'Kirim lewat WatZap (api.watzap.id).'
  }
]

function providerLabel(value) {
  const p = PROVIDERS.find((x) => x.value === value)
  return p?.label || value || 'Ikuti pengaturan umum'
}

export default function PengeluaranPengaturanTab() {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [provider, setProvider] = useState('')
  const [globalProvider, setGlobalProvider] = useState('wa_sendiri')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    pengeluaranAPI
      .getNotificationConfig()
      .then((res) => {
        if (cancelled) return
        if (res?.success && res?.data) {
          const p = String(res.data.provider ?? '')
          setProvider(['', 'wa_sendiri', 'evolution', 'watzap'].includes(p) ? p : '')
          const g = String(res.data.global_provider ?? 'wa_sendiri')
          setGlobalProvider(['wa_sendiri', 'evolution', 'watzap'].includes(g) ? g : 'wa_sendiri')
        }
      })
      .catch((err) => {
        if (cancelled) return
        showNotification(err?.response?.data?.message || 'Gagal memuat pengaturan', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showNotification])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await pengeluaranAPI.saveNotificationConfig({ provider })
      if (res?.success) {
        const g = String(res.data?.global_provider ?? globalProvider)
        if (['wa_sendiri', 'evolution', 'watzap'].includes(g)) setGlobalProvider(g)
        showNotification('Pengaturan notifikasi pengeluaran disimpan.', 'success')
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (err) {
      showNotification(err?.response?.data?.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Provider WhatsApp pengeluaran
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Berlaku untuk semua notifikasi WA rencana, approve, tolak, dan draft. Pengaturan umum saat
            ini: <span className="font-medium text-gray-700 dark:text-gray-200">{providerLabel(globalProvider)}</span>.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {PROVIDERS.map((p) => (
            <label
              key={p.value || 'inherit'}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                provider === p.value
                  ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-900/20 dark:border-teal-600'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="pengeluaran-wa-provider"
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
              Halaman WhatsApp →
            </Link>
          )}
          {provider === 'evolution' && (
            <Link to="/settings/evolution-wa" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
              Evolution WA →
            </Link>
          )}
          {provider === 'watzap' && (
            <Link to="/settings/watzap" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
              WatZap →
            </Link>
          )}
          {provider === '' && (
            <Link to="/settings/notifikasi" className="text-sm text-teal-600 dark:text-teal-400 hover:underline">
              Pengaturan notifikasi umum →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
