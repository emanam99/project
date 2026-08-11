import { useEffect, useState } from 'react'
import { chatUserAPI } from '../../../services/api'
import { NamaUsernameDisplay } from '../../../components/NamaUsernameDisplay'

/** Panel info baca/terkirim untuk satu pesan (grup / privat). */
export default function MessageInfoOffcanvas({
  open,
  onClose,
  messageId,
  messageCreatedAt,
}) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!open || !messageId) {
      setData(null)
      setErr(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setErr(null)
    chatUserAPI
      .getMessageReceipts(messageId)
      .then((r) => {
        if (cancelled) return
        if (r?.success) setData(r)
        else setErr(r?.message || 'Gagal memuat info')
      })
      .catch(() => {
        if (!cancelled) setErr('Gagal memuat info')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, messageId])

  if (!open) return null

  const delivered = Array.isArray(data?.delivered) ? data.delivered : []
  const read = Array.isArray(data?.read) ? data.read : []

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="fixed bottom-0 left-0 right-0 z-[111] max-h-[70vh] rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 md:right-auto md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Info pesan</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Tutup">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto px-4 py-3 text-sm">
          {messageCreatedAt ? (
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Dikirim:{' '}
              {new Date(messageCreatedAt).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          ) : null}
          {loading ? <p className="text-gray-500">Memuat…</p> : null}
          {err ? <p className="text-red-600 dark:text-red-400">{err}</p> : null}
          {!loading && !err && data?.success ? (
            <div className="space-y-4">
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Diterima</p>
                {delivered.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada</p>
                ) : (
                  <ul className="space-y-1">
                    {delivered.map((row) => (
                      <li key={String(row.user_id)} className="flex justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">
                          <NamaUsernameDisplay text={row.display_name || `User ${row.user_id}`} className="truncate" />
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                          {row.at ? new Date(row.at).toLocaleString('id-ID', { timeStyle: 'short' }) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Dibaca</p>
                {read.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada</p>
                ) : (
                  <ul className="space-y-1">
                    {read.map((row) => (
                      <li key={`r-${row.user_id}`} className="flex justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">
                          <NamaUsernameDisplay text={row.display_name || `User ${row.user_id}`} className="truncate" />
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                          {row.at ? new Date(row.at).toLocaleString('id-ID', { timeStyle: 'short' }) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
