import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { getLiveServerUrl, getLiveSocketOptions } from '../../config/liveServer'
import { NamaUsernameDisplay } from '../../components/NamaUsernameDisplay'
import api, { installActivityAPI } from '../../services/api'

// Audit Mei 2026: secret untuk endpoint admin server live SUDAH TIDAK di-bundle ke frontend.
// Backend menyediakan proxy `/api/super-admin/live-online` yang sudah JWT super_admin.
const APP_ORDER = ['ebeddien', 'mybeddien', 'nailul-murod']
const APP_LABEL = {
  ebeddien: 'eBeddien',
  mybeddien: 'myBeddien',
  'nailul-murod': 'Nailul Murod'
}

function formatTanggal(ms) {
  if (!ms) return '–'
  return new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatJam(ms) {
  if (!ms) return '–'
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DashboardSuperAdmin() {
  const [users, setUsers] = useState([])
  const [count, setCount] = useState(0)
  const [appRealtime, setAppRealtime] = useState({ total_active_now: 0, per_app: [], active_list: [], active_minutes: 5 })
  const [loading, setLoading] = useState(true)
  const [loadingRealtime, setLoadingRealtime] = useState(true)
  const [error, setError] = useState('')
  const socketRef = useRef(null)
  const appCards = APP_ORDER.map((key) => {
    const found = (appRealtime.per_app || []).find((r) => r.app_key === key)
    return {
      app_key: key,
      app_label: APP_LABEL[key],
      active_now: found?.active_now ?? 0
    }
  })

  const fetchOnline = useCallback(async () => {
    try {
      setError('')
      const res = await api.get('/super-admin/live-online')
      const data = res?.data || {}
      if (data.success) {
        setUsers(data.users || [])
        setCount(data.count ?? data.users?.length ?? 0)
      } else {
        setError(data.message || data.error || 'Gagal memuat data')
      }
    } catch (err) {
      const status = err?.response?.status
      const msg = err?.response?.data?.message
      if (status === 401 || status === 403) {
        setError(msg || 'Akses ditolak.')
      } else {
        setError(msg || err?.message || 'Tidak dapat terhubung ke server live.')
      }
      setUsers([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRealtimeInstallActivity = useCallback(async () => {
    try {
      const res = await installActivityAPI.getRealtime({ active_minutes: 5 })
      if (res?.success) {
        setAppRealtime(res.data || { total_active_now: 0, per_app: [], active_list: [], active_minutes: 5 })
      }
    } catch (_) {
      // biarkan panel existing tetap tampil
    } finally {
      setLoadingRealtime(false)
    }
  }, [])

  // Load awal + Socket.IO untuk update real-time (tanpa perlu tombol Segarkan)
  useEffect(() => {
    fetchOnline()
    fetchRealtimeInstallActivity()

    const socket = io(getLiveServerUrl(), getLiveSocketOptions())
    socketRef.current = socket

    socket.on('users_updated', (data) => {
      setUsers(data.users || [])
      setCount(data.count ?? (data.users?.length ?? 0))
    })

    socket.on('connect_error', () => {
      setError('Tidak dapat terhubung ke server live. Daftar akan diperbarui saat koneksi pulih.')
    })

    socket.on('app_install_activity_hint', () => {
      fetchRealtimeInstallActivity()
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [fetchOnline, fetchRealtimeInstallActivity])

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Aktif sekarang (semua app)</p>
          <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{loadingRealtime ? '…' : (appRealtime.total_active_now ?? 0)}</p>
        </div>
        {appCards.map((row) => (
          <div key={row.app_key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Aktif {row.app_label}</p>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{row.active_now ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-teal-600 dark:text-teal-400">{count}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">online eBeddien (socket)</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setLoadingRealtime(true); fetchRealtimeInstallActivity(); }}
            disabled={loadingRealtime}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {loadingRealtime ? 'Memuat app…' : 'Segarkan App'}
          </button>
          <button
            type="button"
            onClick={() => { setLoading(true); fetchOnline(); }}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {loading ? 'Memuat…' : 'Segarkan eBeddien'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && !users.length && !error ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
          Memuat…
        </div>
      ) : users.length === 0 && !error ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
          Belum ada yang online.
        </div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.socketId}
              className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-teal-200 dark:hover:border-teal-800 transition-colors"
            >
              <span
                className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center text-sm font-semibold"
                title="Online"
              >
                {(u.nama || u.ip || '?').charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 dark:text-gray-100 truncate">
                  <NamaUsernameDisplay text={u.nama || u.ip || '–'} className="truncate" />
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {u.halaman || '/'}
                  {u.ip ? ` · ${u.ip}` : ''}
                </p>
              </div>
              <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 flex flex-col items-end">
                <span>{formatTanggal(u.connectedAt)}</span>
                <span>{formatJam(u.connectedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
          Aktivitas App Realtime ({appRealtime.active_minutes || 5} menit terakhir)
        </h2>
        {loadingRealtime && !(appRealtime.active_list || []).length ? (
          <div className="py-6 text-center text-gray-500 dark:text-gray-400 text-sm">Memuat aktivitas app…</div>
        ) : (appRealtime.active_list || []).length === 0 ? (
          <div className="py-6 text-center text-gray-500 dark:text-gray-400 text-sm">Belum ada aktivitas app realtime.</div>
        ) : (
          <ul className="space-y-2">
            {(appRealtime.active_list || []).map((row) => (
              <li key={`${row.app_key}-${row.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <span className="text-xs px-2 py-1 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 uppercase">
                  {row.app_key}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {row.username || row.install_id}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {row.access_mode?.toUpperCase?.() || '-'} · {row.browser_name || 'Unknown browser'}
                  </p>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">{formatJam(row.last_active_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  )
}
