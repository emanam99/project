import { useState, useEffect, useCallback } from 'react'
import { googleCalendarAPI } from '../../services/api'

function formatDateIso(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTimeIso(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const h = d.getHours()
  const m = d.getMinutes()
  if (h === 0 && m === 0) return ''
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function KalenderPesantren() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [events, setEvents] = useState([])
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const timeMin = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const timeMax = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await googleCalendarAPI.getEvents({
        slug: 'pesantren',
        timeMin,
        timeMax
      })
      if (res && res.events) {
        setEvents(Array.isArray(res.events) ? res.events : [])
        setConfig(res.config || null)
        if (res.error) setError(res.error)
      } else {
        setEvents([])
        setConfig(null)
        setError(res?.error || 'Gagal memuat jadwal.')
      }
    } catch (e) {
      setEvents([])
      setConfig(null)
      setError(e?.message || 'Gagal memuat jadwal.')
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
    } else {
      setMonth((m) => m - 1)
    }
  }
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Jadwal Pesantren
      </h1>
      {config?.name && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Sumber: {config.name}
        </p>
      )}

      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          ‹ Bulan sebelumnya
        </button>
        <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">
          {monthName}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          Bulan berikutnya ›
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Tidak ada jadwal untuk periode ini.
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((ev, i) => (
            <li
              key={i}
              className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
            >
              <div className="font-medium text-gray-900 dark:text-gray-100">
                {ev.summary || '(Tanpa judul)'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {formatDateIso(ev.start_iso)}
                {formatTimeIso(ev.start_iso) && ` · ${formatTimeIso(ev.start_iso)}`}
                {ev.end_iso && ev.end_iso !== ev.start_iso && (
                  <> – {formatTimeIso(ev.end_iso) || formatDateIso(ev.end_iso)}</>
                )}
              </div>
              {ev.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 whitespace-pre-wrap">
                  {ev.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
