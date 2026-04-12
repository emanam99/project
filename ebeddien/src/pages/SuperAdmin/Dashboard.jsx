import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { getLiveServerUrl } from '../../config/liveServer'
import { NamaUsernameDisplay } from '../../components/NamaUsernameDisplay'

const LIVE_SECRET = import.meta.env.VITE_LIVE_ADMIN_SECRET || ''

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const socketRef = useRef(null)

  const fetchOnline = useCallback(async () => {
    try {
      setError('')
      const base = getLiveServerUrl()
      const url = LIVE_SECRET
        ? `${base}/admin/online?secret=${encodeURIComponent(LIVE_SECRET)}`
        : `${base}/admin/online`
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 401) throw new Error('Akses ditolak. Periksa VITE_LIVE_ADMIN_SECRET.')
        throw new Error(`Server: ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        setUsers(data.users || [])
        setCount(data.count ?? data.users?.length ?? 0)
      } else {
        setError(data.error || 'Gagal memuat data')
      }
    } catch (err) {
      setError(err.message || 'Tidak dapat terhubung ke server live. Pastikan server berjalan.')
      setUsers([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load awal + Socket.IO untuk update real-time (tanpa perlu tombol Segarkan)
  useEffect(() => {
    fetchOnline()

    const socket = io(getLiveServerUrl(), { transports: ['polling', 'websocket'] })
    socketRef.current = socket

    socket.on('users_updated', (data) => {
      setUsers(data.users || [])
      setCount(data.count ?? (data.users?.length ?? 0))
    })

    socket.on('connect_error', () => {
      setError('Tidak dapat terhubung ke server live. Daftar akan diperbarui saat koneksi pulih.')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [fetchOnline])

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-teal-600 dark:text-teal-400">{count}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">online</span>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchOnline(); }}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          {loading ? 'Memuat…' : 'Segarkan'}
        </button>
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
    </div>
  )
}
