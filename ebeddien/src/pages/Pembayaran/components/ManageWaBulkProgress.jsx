import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveSocket } from '../../../contexts/LiveSocketContext'
import { dashboardAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

function normalizeJob(raw) {
  if (!raw || typeof raw !== 'object') return null
  const jobId = Number(raw.job_id ?? raw.id ?? 0)
  return {
    job_id: jobId,
    page: String(raw.page ?? ''),
    status: String(raw.status ?? ''),
    phase: raw.phase != null ? String(raw.phase) : null,
    total_items: Number(raw.total_items ?? 0),
    sent_ok: Number(raw.sent_ok ?? 0),
    sent_fail: Number(raw.sent_fail ?? 0),
    current_item_label: raw.current_item_label != null ? String(raw.current_item_label) : null,
    last_error: raw.last_error != null ? String(raw.last_error) : null,
    cancel_requested: !!(raw.cancel_requested === 1 || raw.cancel_requested === true || raw.cancel_requested === '1'),
  }
}

function isActiveStatus(status) {
  return status === 'queued' || status === 'running'
}

/**
 * Progress kirim WA massal Manage Data — sync via GET aktif + socket `manage_wa_bulk_progress`.
 */
export default function ManageWaBulkProgress({ page, onTerminal }) {
  const { socket } = useLiveSocket() || {}
  const { showNotification } = useNotification()
  const [job, setJob] = useState(null)
  const terminalTimerRef = useRef(null)

  const clearTerminalTimer = () => {
    if (terminalTimerRef.current) {
      clearTimeout(terminalTimerRef.current)
      terminalTimerRef.current = null
    }
  }

  const refreshActive = useCallback(async () => {
    try {
      const r = await dashboardAPI.getWaBulkActive(page)
      if (!r?.success) return
      const j = normalizeJob(r.job)
      setJob(j && isActiveStatus(j.status) ? j : null)
    } catch (_) {
      /* abaikan */
    }
  }, [page])

  useEffect(() => {
    refreshActive()
  }, [refreshActive])

  useEffect(() => {
    if (!socket) return
    const handler = (payload) => {
      if (!payload || String(payload.page) !== page) return
      const j = normalizeJob(payload)
      if (!j || !j.job_id) return

      setJob((prev) => {
        if (prev && prev.job_id !== j.job_id && isActiveStatus(prev.status)) {
          return prev
        }
        return j
      })

      if (payload.phase === 'finished' || payload.phase === 'cancelled') {
        clearTerminalTimer()
        terminalTimerRef.current = setTimeout(() => {
          setJob(null)
          terminalTimerRef.current = null
          if (typeof onTerminal === 'function') onTerminal()
        }, 14000)
      }
    }
    socket.on('manage_wa_bulk_progress', handler)
    return () => {
      socket.off('manage_wa_bulk_progress', handler)
      clearTerminalTimer()
    }
  }, [socket, page, onTerminal])

  useEffect(() => {
    if (!job || !isActiveStatus(job.status)) return
    const t = setInterval(refreshActive, 10000)
    return () => clearInterval(t)
  }, [job?.status, job?.job_id, refreshActive])

  const handleCancel = async () => {
    if (!job?.job_id) return
    try {
      const r = await dashboardAPI.cancelWaBulk(job.job_id)
      if (r?.success) {
        showNotification(r.message || 'Pembatalan dicatat', 'success')
      } else {
        showNotification(r?.message || 'Gagal membatalkan', 'warning')
      }
    } catch (e) {
      showNotification(e?.response?.data?.message || e?.message || 'Gagal membatalkan', 'error')
    }
  }

  if (!job) return null

  const total = Math.max(0, job.total_items)
  const done = job.sent_ok + job.sent_fail
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const labelPage = page === 'khusus' ? 'Khusus' : page === 'tunggakan' ? 'Tunggakan' : 'Uwaba'

  return (
    <div className="mx-4 mb-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/40 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="font-semibold text-emerald-800 dark:text-emerald-200">
          Pengiriman WA massal ({labelPage}) — job #{job.job_id}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/80 dark:bg-gray-900/60 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:text-emerald-100">
            {job.status === 'queued' ? 'Antri…' : 'Berjalan'}
          </span>
          {isActiveStatus(job.status) ? (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 text-[11px] font-medium"
            >
              Batal
            </button>
          ) : null}
        </div>
      </div>
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-1">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-700 dark:text-gray-300">
        Terkirim sukses: <strong>{job.sent_ok}</strong>, gagal: <strong>{job.sent_fail}</strong>
        {total > 0 ? (
          <>
            {' '}
            dari <strong>{total}</strong> pesan antrian (jeda acak 2–60 dtk di server antara pesan).
          </>
        ) : null}
      </p>
      {job.cancel_requested ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">Membatalkan setelah item berjalan selesai…</p>
      ) : null}
      {job.current_item_label ? (
        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 truncate" title={job.current_item_label}>
          Sedang: {job.current_item_label}
        </p>
      ) : null}
      {job.last_error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 truncate" title={job.last_error}>
          Terakhir error: {job.last_error}
        </p>
      ) : null}
    </div>
  )
}
