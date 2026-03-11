import { useState, useEffect } from 'react'
import { googleCalendarAPI } from '../../services/api'

const SLUG_PESANTREN = 'pesantren'

export default function KalenderPesantrenPengaturan() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({
    slug: SLUG_PESANTREN,
    name: 'Jadwal Pesantren',
    calendar_id: '',
    calendar_url: '',
    is_public: 1
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setMessage(null)
      try {
        const res = await googleCalendarAPI.getConfig()
        const list = res?.configs || []
        const pesantren = list.find((c) => c.slug === SLUG_PESANTREN)
        if (!cancelled) {
          if (pesantren) {
            setConfig(pesantren)
            setForm({
              slug: pesantren.slug,
              name: pesantren.name || 'Jadwal Pesantren',
              calendar_id: pesantren.calendar_id || '',
              calendar_url: pesantren.calendar_url || '',
              is_public: pesantren.is_public ?? 1
            })
          } else {
            setForm((f) => ({ ...f, name: 'Jadwal Pesantren' }))
          }
        }
      } catch (e) {
        if (!cancelled) setMessage(e?.message || 'Gagal memuat konfigurasi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await googleCalendarAPI.updateConfig(SLUG_PESANTREN, {
        slug: SLUG_PESANTREN,
        name: form.name,
        calendar_id: form.calendar_id,
        calendar_url: form.calendar_url || null,
        is_public: form.is_public
      })
      setMessage('Konfigurasi berhasil disimpan.')
    } catch (e) {
      setMessage(e?.message || 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Pengaturan Google Kalender (Pesantren)
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Isi Calendar ID dari Google Calendar yang sudah dijadikan public. Calendar ID bisa dilihat di Pengaturan kalender → Integrate calendar.
      </p>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('berhasil') ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nama tampilan
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="Jadwal Pesantren"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Calendar ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.calendar_id}
            onChange={(e) => setForm((f) => ({ ...f, calendar_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="xxx@group.calendar.google.com"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Format: id@group.calendar.google.com (dari Google Calendar → Setelan → Integrate calendar)
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            URL iCal (opsional)
          </label>
          <input
            type="url"
            value={form.calendar_url}
            onChange={(e) => setForm((f) => ({ ...f, calendar_url: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Kosongkan untuk memakai URL standar dari Calendar ID.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_public"
            checked={!!form.is_public}
            onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked ? 1 : 0 }))}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          <label htmlFor="is_public" className="text-sm text-gray-700 dark:text-gray-300">
            Kalender public
          </label>
        </div>
        <button
          type="submit"
          disabled={saving || !form.calendar_id.trim()}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
      </form>
    </div>
  )
}
