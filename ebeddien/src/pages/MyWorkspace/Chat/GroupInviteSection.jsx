import { useState, useEffect, useCallback } from 'react'
import { chatUserAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

/** Kelola tautan undangan grup (admin). */
export default function GroupInviteSection({ conversationId, enabled }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [invites, setInvites] = useState([])
  const [expiresHours, setExpiresHours] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!conversationId || !enabled) return
    setLoading(true)
    try {
      const r = await chatUserAPI.listInvites(conversationId)
      const rows = Array.isArray(r?.data) ? r.data : []
      if (r?.success) {
        setInvites(rows.filter((x) => x && !x.revoked_at))
      } else setInvites([])
    } catch {
      setInvites([])
    } finally {
      setLoading(false)
    }
  }, [conversationId, enabled])

  useEffect(() => {
    load()
  }, [load])

  if (!enabled || !conversationId) return null

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}` : ''
  const invitePath = (code) => `${baseUrl}/chat?invite=${encodeURIComponent(code)}`

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showNotification('Disalin ke papan klip', 'success', 2000)
    } catch {
      showNotification('Gagal menyalin', 'error', 2500)
    }
  }

  const submitCreate = async () => {
    setCreating(true)
    try {
      const body = {}
      const h = expiresHours.trim()
      if (h !== '' && !Number.isNaN(Number(h))) {
        const hrs = Number(h)
        if (hrs > 0) {
          const exp = new Date(Date.now() + hrs * 3600000)
          body.expires_at = exp.toISOString().slice(0, 19).replace('T', ' ')
        }
      }
      const mu = maxUses.trim()
      if (mu !== '' && !Number.isNaN(Number(mu))) {
        const n = Number(mu)
        if (n > 0) body.max_uses = n
      }
      const r = await chatUserAPI.createInvite(conversationId, body)
      if (!r?.success) {
        showNotification(r?.message || 'Gagal membuat tautan', 'error', 3500)
        return
      }
      showNotification('Tautan dibuat', 'success', 2000)
      await load()
    } catch {
      showNotification('Gagal membuat tautan', 'error', 3500)
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (code) => {
    try {
      const r = await chatUserAPI.revokeInvite(conversationId, code)
      if (!r?.success) {
        showNotification(r?.message || 'Gagal mencabut', 'error', 3500)
        return
      }
      showNotification('Tautan dicabut', 'success', 2000)
      await load()
    } catch {
      showNotification('Gagal mencabut', 'error', 3500)
    }
  }

  return (
    <div className="mt-6 w-full max-w-xs rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Undangan grup</p>
      <div className="mb-3 space-y-2 rounded-lg border border-dashed border-gray-300 bg-white/80 p-2 dark:border-gray-600 dark:bg-gray-800/60">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Opsional: kedaluwarsa (jam), max pakai</p>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            placeholder="Jam"
            value={expiresHours}
            onChange={(e) => setExpiresHours(e.target.value)}
            className="w-1/2 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700"
          />
          <input
            type="number"
            min={1}
            placeholder="Max pakai"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="w-1/2 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700"
          />
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={submitCreate}
          className="w-full rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
        >
          {creating ? 'Membuat…' : 'Buat tautan undangan'}
        </button>
      </div>
      {loading ? <p className="text-xs text-gray-500">Memuat tautan…</p> : null}
      {!loading && invites.length === 0 ? <p className="text-xs text-gray-500">Belum ada tautan aktif.</p> : null}
      <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
        {invites.map((inv) => (
          <li key={inv.code} className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-600 dark:bg-gray-800/80">
            <code className="block break-all font-mono text-[11px] text-gray-800 dark:text-gray-200">{invitePath(inv.code)}</code>
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" className="text-teal-600 hover:underline dark:text-teal-400" onClick={() => copy(invitePath(inv.code))}>
                Salin
              </button>
              <button type="button" className="text-red-600 hover:underline dark:text-red-400" onClick={() => revoke(inv.code)}>
                Cabut
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
