import { useState, useEffect, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { settingsAPI } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'

/**
 * Offcanvas kanan (di atas FiturMenuRoleOffcanvas): checklist pengurus untuk satu role.
 * Yang punya role di atas (tercentang); yang belum di bawah.
 */
export default function RolePengurusChecklistOffcanvas({
  isOpen,
  onClose,
  role,
  onCountChange,
}) {
  const { showNotification } = useNotification()
  const [showPortal, setShowPortal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !role?.id) return
    let cancelled = false
    setLoading(true)
    setQ('')
    settingsAPI
      .getRolePengurusChecklist(role.id)
      .then((res) => {
        if (cancelled) return
        if (!res?.success) {
          showNotification(res?.message || 'Gagal memuat pengurus', 'error')
          setItems([])
          return
        }
        setItems(Array.isArray(res.data?.items) ? res.data.items : [])
        const cnt = res.data?.role?.pengurus_count
        // Sync count ke parent hanya jika beda — hindari re-render roles yang bisa ganggu parent.
        if (typeof cnt === 'number' && onCountChange && cnt !== Number(role.pengurus_count)) {
          onCountChange(role.id, cnt)
        }
      })
      .catch((err) => {
        if (cancelled) return
        showNotification(err.response?.data?.message || err.message || 'Gagal memuat pengurus', 'error')
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, role?.id])

  const filteredSorted = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = !ql
      ? [...items]
      : items.filter((it) => {
          const nama = (it.nama || '').toLowerCase()
          const user = (it.username || '').toLowerCase()
          return nama.includes(ql) || user.includes(ql) || String(it.pengurus_id).includes(ql)
        })
    list.sort((a, b) => {
      if (Boolean(a.has_role) !== Boolean(b.has_role)) return a.has_role ? -1 : 1
      return String(a.nama || '').localeCompare(String(b.nama || ''), 'id')
    })
    return list
  }, [items, q])

  const withCount = useMemo(() => items.filter((it) => it.has_role).length, [items])

  const toggle = async (row) => {
    if (!role?.id || togglingId != null) return
    const next = !row.has_role
    setTogglingId(row.pengurus_id)
    // Optimistic
    setItems((prev) =>
      prev.map((it) =>
        it.pengurus_id === row.pengurus_id
          ? { ...it, has_role: next, pengurus_role_id: next ? it.pengurus_role_id : null }
          : it
      )
    )
    try {
      const res = await settingsAPI.putRolePengurusChecklist(role.id, {
        pengurus_id: row.pengurus_id,
        has_role: next,
      })
      if (!res?.success) {
        setItems((prev) =>
          prev.map((it) =>
            it.pengurus_id === row.pengurus_id
              ? { ...it, has_role: !next, pengurus_role_id: row.pengurus_role_id }
              : it
          )
        )
        showNotification(res?.message || 'Gagal mengubah', 'error')
        return
      }
      const data = res.data || {}
      setItems((prev) =>
        prev.map((it) =>
          it.pengurus_id === row.pengurus_id
            ? {
                ...it,
                has_role: Boolean(data.has_role),
                pengurus_role_id: data.pengurus_role_id ?? null,
              }
            : it
        )
      )
      if (typeof data.pengurus_count === 'number' && onCountChange) {
        onCountChange(role.id, data.pengurus_count)
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((it) =>
          it.pengurus_id === row.pengurus_id
            ? { ...it, has_role: !next, pengurus_role_id: row.pengurus_role_id }
            : it
        )
      )
      showNotification(err.response?.data?.message || err.message || 'Gagal mengubah', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  if (!isOpen && !showPortal) return null

  const content = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && role && (
        <Fragment key="role-pengurus-checklist">
          <motion.div
            key="role-pengurus-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[210]"
          />
          <motion.div
            key="role-pengurus-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[211] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 -ml-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
                    aria-label="Kembali"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight leading-snug">
                      Pengurus — {role.label}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mt-0.5">{role.key}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                      {withCount} dari {items.length} punya role ini · tercentang di atas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-3">
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari nama / username…"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              {loading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-10">Memuat…</p>
              ) : filteredSorted.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-10">
                  {q.trim() ? 'Tidak ada yang cocok' : 'Belum ada data pengurus'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {filteredSorted.map((row) => {
                    const on = Boolean(row.has_role)
                    const busy = togglingId === row.pengurus_id
                    return (
                      <li key={row.pengurus_id}>
                        <label
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                            on
                              ? 'bg-teal-50/80 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800/50'
                              : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
                          } ${busy ? 'opacity-60' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy}
                            onChange={() => toggle(row)}
                            className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 w-4 h-4 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {row.nama || `Pengurus #${row.pengurus_id}`}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                              {row.username ? `@${row.username}` : `id ${row.pengurus_id}`}
                            </p>
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
