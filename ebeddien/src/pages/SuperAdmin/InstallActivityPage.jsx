import { useCallback, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { installActivityAPI } from '../../services/api'
import { getLiveServerUrl, getLiveSocketOptions } from '../../config/liveServer'

function fmtDateTime(v) {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const APP_OPTIONS = [
  { value: '', label: 'Semua App' },
  { value: 'ebeddien', label: 'eBeddien' },
  { value: 'mybeddien', label: 'MyBeddien' },
  { value: 'nailul-murod', label: 'Nailul Murod' }
]

export default function InstallActivityPage() {
  const [days, setDays] = useState(30)
  const [items, setItems] = useState([])
  const [realtime, setRealtime] = useState({ active_list: [], total_active_now: 0 })
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total_pages: 1, total_rows: 0 })
  const [filters, setFilters] = useState({ app_key: '', access_mode: '', search: '' })
  const [loading, setLoading] = useState(true)
  const [loadingRealtime, setLoadingRealtime] = useState(true)
  const [error, setError] = useState('')

  const fetchList = useCallback(async (nextPage = 1, nextFilters = filters, nextDays = days) => {
    const params = { page: nextPage, limit: pagination.limit, days: nextDays }
    if (nextFilters.app_key) params.app_key = nextFilters.app_key
    if (nextFilters.access_mode) params.access_mode = nextFilters.access_mode
    if (nextFilters.search?.trim()) params.search = nextFilters.search.trim()
    const res = await installActivityAPI.getList(params)
    if (!res?.success) throw new Error(res?.message || 'Gagal memuat daftar')
    setItems(Array.isArray(res.data) ? res.data : [])
    setPagination((prev) => ({
      ...prev,
      ...(res.pagination || {}),
      page: (res.pagination?.page ?? nextPage),
      limit: (res.pagination?.limit ?? prev.limit)
    }))
  }, [days, filters, pagination.limit])

  const fetchRealtime = useCallback(async () => {
    const res = await installActivityAPI.getRealtime({ active_minutes: 5 })
    if (!res?.success) throw new Error(res?.message || 'Gagal memuat realtime')
    setRealtime(res.data || { active_list: [], total_active_now: 0 })
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        await fetchList(1, filters, days)
      } catch (e) {
        if (mounted) setError(e?.message || 'Gagal memuat data')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [days, filters, fetchList])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoadingRealtime(true)
        await fetchRealtime()
      } catch (_) {
        // ignore
      } finally {
        if (mounted) setLoadingRealtime(false)
      }
    })()
    return () => { mounted = false }
  }, [fetchRealtime])

  useEffect(() => {
    const socket = io(getLiveServerUrl(), getLiveSocketOptions())
    const refresh = async () => {
      try {
        await Promise.all([fetchRealtime(), fetchList(1, filters, days)])
      } catch (_) {
        // ignore
      }
    }
    socket.on('app_install_activity_hint', refresh)
    return () => {
      socket.off('app_install_activity_hint', refresh)
      socket.disconnect()
    }
  }, [days, filters, fetchList, fetchRealtime])

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 30)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            >
              <option value={7}>7 hari</option>
              <option value={30}>30 hari</option>
              <option value={90}>90 hari</option>
            </select>
            <a
              href={installActivityAPI.getExportCsvUrl()}
              className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm hover:bg-teal-700"
            >
              Export CSV
            </a>
          </div>
        </div>

        {error ? (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
        ) : null}

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Realtime (5 menit terakhir)</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Aktif: <span className="font-semibold text-teal-600 dark:text-teal-400">{realtime.total_active_now || 0}</span></p>
          </div>
          {loadingRealtime && !(realtime.active_list || []).length ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Memuat realtime...</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-auto pr-1">
              {(realtime.active_list || []).slice(0, 20).map((row) => (
                <li key={`rt-${row.id}-${row.app_key}`} className="flex items-center justify-between gap-2 text-xs border-b border-gray-100 dark:border-gray-700 pb-1">
                  <span className="text-gray-500 dark:text-gray-400 uppercase">{row.app_key}</span>
                  <span className="text-gray-700 dark:text-gray-200 truncate flex-1">{row.username || row.install_id}</span>
                  <span className="text-gray-400 dark:text-gray-500">{fmtDateTime(row.last_active_at)}</span>
                </li>
              ))}
              {!(realtime.active_list || []).length && <li className="text-xs text-gray-500 dark:text-gray-400">Belum ada aktivitas realtime.</li>}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <div className="flex flex-wrap gap-2 mb-3">
            <select
              value={filters.app_key}
              onChange={(e) => setFilters((s) => ({ ...s, app_key: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            >
              {APP_OPTIONS.map((opt) => <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>)}
            </select>
            <select
              value={filters.access_mode}
              onChange={(e) => setFilters((s) => ({ ...s, access_mode: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            >
              <option value="">Semua Akses</option>
              <option value="browser">Browser</option>
              <option value="pwa">PWA</option>
            </select>
            <input
              value={filters.search}
              onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))}
              placeholder="Cari install_id, browser, username"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 pr-3">App</th>
                  <th className="py-2 pr-3">Install ID</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Akses</th>
                  <th className="py-2 pr-3">Browser</th>
                  <th className="py-2 pr-3">Installed</th>
                  <th className="py-2 pr-3">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="py-4 text-gray-500" colSpan={7}>Memuat data...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td className="py-4 text-gray-500" colSpan={7}>Belum ada data.</td></tr>
                ) : items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-3">{row.app_label}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.install_id}</td>
                    <td className="py-2 pr-3">{row.username || '-'}</td>
                    <td className="py-2 pr-3 uppercase text-xs">{row.access_mode}</td>
                    <td className="py-2 pr-3">{row.browser_name || '-'}</td>
                    <td className="py-2 pr-3">{fmtDateTime(row.installed_at)}</td>
                    <td className="py-2 pr-3">{fmtDateTime(row.last_active_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Total: {pagination.total_rows || 0}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={(pagination.page || 1) <= 1}
                onClick={() => fetchList((pagination.page || 1) - 1, filters, days)}
                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <span>Hal {pagination.page || 1} / {pagination.total_pages || 1}</span>
              <button
                type="button"
                disabled={(pagination.page || 1) >= (pagination.total_pages || 1)}
                onClick={() => fetchList((pagination.page || 1) + 1, filters, days)}
                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
