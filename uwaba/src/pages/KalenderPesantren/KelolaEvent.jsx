import { useState, useEffect, useCallback } from 'react'
import { googleCalendarAPI } from '../../services/api'

const SLUG = 'pesantren'

function toLocalDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function toISOWithTimezone(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const h = pad(d.getHours())
  const min = pad(d.getMinutes())
  const s = pad(d.getSeconds())
  return `${y}-${m}-${day}T${h}:${min}:${s}+07:00`
}

const emptyForm = () => ({
  summary: '',
  description: '',
  start: '',
  end: ''
})

export default function KelolaEvent() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [events, setEvents] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const timeMin = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const timeMax = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await googleCalendarAPI.getEvents({ slug: SLUG, timeMin, timeMax })
      setEvents(Array.isArray(res?.events) ? res.events : [])
      if (res?.error) setError(res.error)
    } catch (e) {
      setEvents([])
      setError(e?.message || 'Gagal memuat event.')
    } finally {
      setLoading(false)
    }
  }, [timeMin, timeMax])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const monthName = new Date(year, month, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const prevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else setMonth((m) => m + 1)
  }

  const openCreate = () => {
    const now = new Date()
    const start = new Date(now)
    start.setMinutes(0, 0)
    const end = new Date(start)
    end.setHours(end.getHours() + 1)
    setForm({
      summary: '',
      description: '',
      start: toLocalDateTime(start.toISOString()),
      end: toLocalDateTime(end.toISOString())
    })
    setEditingId(null)
    setShowForm(true)
    setSaveError(null)
  }

  const openEdit = (ev) => {
    setForm({
      summary: ev.summary || '',
      description: ev.description || '',
      start: toLocalDateTime(ev.start_iso || ev.start),
      end: toLocalDateTime(ev.end_iso || ev.end)
    })
    setEditingId(ev.id)
    setShowForm(true)
    setSaveError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    const startIso = toISOWithTimezone(form.start)
    const endIso = toISOWithTimezone(form.end)
    if (!form.summary.trim() || !startIso || !endIso) {
      setSaveError('Judul, waktu mulai, dan waktu selesai wajib diisi.')
      setSaving(false)
      return
    }
    try {
      if (editingId) {
        const res = await googleCalendarAPI.updateEvent(editingId, {
          slug: SLUG,
          summary: form.summary.trim(),
          description: form.description.trim(),
          start: startIso,
          end: endIso
        })
        if (res?.success) {
          setShowForm(false)
          fetchEvents()
        } else {
          setSaveError(res?.error || 'Gagal menyimpan.')
        }
      } else {
        // Create new event
        const res = await googleCalendarAPI.createEvent({
          slug: SLUG,
          summary: form.summary.trim(),
          description: form.description.trim(),
          start: startIso,
          end: endIso
        })
        if (res?.success) {
          setShowForm(false)
          fetchEvents()
        } else {
          setSaveError(res?.error || 'Gagal menyimpan.')
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Gagal menyimpan.'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (eventId) => {
    if (!window.confirm('Hapus event ini dari Google Calendar?')) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await googleCalendarAPI.deleteEvent(eventId, SLUG)
      if (res?.success) {
        fetchEvents()
      } else {
        setSaveError(res?.error || 'Gagal menghapus.')
      }
    } catch (e) {
      setSaveError(e?.message || 'Gagal menghapus.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Kelola Event (Google Calendar)
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Tambah, ubah, atau hapus event di kalender pesantren. Butuh Service Account yang sudah di-share ke kalender.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ‹
          </button>
          <span className="font-medium text-gray-800 dark:text-gray-200 capitalize min-w-[180px] text-center">
            {monthName}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
        >
          + Tambah Event
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm">
          {error}
        </div>
      )}

      {saveError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {saveError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Tidak ada event untuk bulan ini.
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((ev, i) => (
            <li
              key={ev.id || i}
              className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex flex-wrap items-start justify-between gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {ev.summary || '(Tanpa judul)'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {ev.start_iso || ev.start} – {ev.end_iso || ev.end}
                </div>
                {ev.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 whitespace-pre-wrap line-clamp-2">
                    {ev.description}
                  </p>
                )}
              </div>
              {ev.id ? (
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(ev)}
                    className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ev.id)}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-400">Hanya baca (tanpa ID)</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              {editingId ? 'Edit Event' : 'Tambah Event'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Judul *</label>
                <input
                  type="text"
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keterangan</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mulai *</label>
                <input
                  type="datetime-local"
                  value={form.start}
                  onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Selesai *</label>
                <input
                  type="datetime-local"
                  value={form.end}
                  onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : editingId ? 'Simpan' : 'Buat'}
                </button>
                <button
                  type="button"
                  onClick={() => !saving && setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
