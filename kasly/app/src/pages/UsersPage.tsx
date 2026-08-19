import { useEffect, useState } from 'react'
import { createUser, deleteUser, listUsers, updateUserRole, type UserRow } from '../api/apiClient'
import { usePageTitle } from '../contexts/PageTitleContext'
import { getStoredUser } from '../utils/auth'

function statusLabel(row: UserRow): string {
  if (row.role === 'pending') {
    return row.google_id ? 'Menunggu grant akses' : 'Pending · belum login'
  }
  return row.google_id ? 'Sudah login Google' : 'Belum login (pre-register)'
}

function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 7h16" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function UsersPage() {
  usePageTitle('Pengguna')
  const me = getStoredUser()
  const [rows, setRows] = useState<UserRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const res = await listUsers()
    if (res.success && res.data) {
      setRows(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat pengguna')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setOk('')
    setError('')
    const res = await createUser({ email: email.trim(), role })
    if (res.success) {
      setEmail('')
      setRole('user')
      setOk('Akses diberikan. Pengguna bisa login Google dengan email ini.')
      await load()
    } else {
      setError(res.message || 'Gagal menambah')
    }
  }

  const changeRole = async (id: number, nextRole: string) => {
    setError('')
    setOk('')
    const res = await updateUserRole(id, nextRole)
    if (res.success) await load()
    else setError(res.message || 'Gagal mengubah role')
  }

  const removeUser = async (row: UserRow) => {
    if (row.id === me?.id) return
    const label = row.name || row.email
    if (!window.confirm(`Hapus pengguna "${label}"?\nEmail: ${row.email}`)) return
    setError('')
    setOk('')
    const res = await deleteUser(row.id)
    if (res.success) {
      setOk('Pengguna dihapus')
      await load()
    } else {
      setError(res.message || 'Gagal menghapus pengguna')
    }
  }

  const roleOptions = (current: string) => {
    const opts = [
      { value: 'pending', label: 'pending' },
      { value: 'user', label: 'user' },
      { value: 'admin', label: 'admin' },
    ]
    if (me?.role === 'super_admin' || current === 'super_admin') {
      opts.push({ value: 'super_admin', label: 'super_admin' })
    }
    return opts
  }

  return (
    <div className="space-y-3.5">
      <form onSubmit={(e) => void handleCreate(e)} className="ui-card p-3 grid sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <label className="ui-label">Email Google</label>
          <input
            type="email"
            required
            className="ui-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@gmail.com"
          />
        </div>
        <div>
          <label className="ui-label">Role</label>
          <select className="ui-input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
            {me?.role === 'super_admin' && <option value="super_admin">super_admin</option>}
          </select>
        </div>
        <div className="sm:col-span-3">
          <button type="submit" className="ui-btn-primary">
            Tambah / grant akses
          </button>
        </div>
      </form>

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      {loading ? (
        <div className="text-muted text-[13px]">Memuat…</div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id} className="ui-card p-2.5 space-y-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink truncate">{row.name || row.email}</div>
                <div className="text-[11px] text-muted break-all">{row.email}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="ui-input py-1 max-w-[9rem]"
                  value={row.role}
                  onChange={(e) => void changeRole(row.id, e.target.value)}
                  disabled={row.id === me?.id}
                >
                  {roleOptions(row.role).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border',
                    row.role === 'pending'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      : 'bg-surface-soft text-muted border-line',
                  ].join(' ')}
                >
                  {statusLabel(row)}
                </span>
                <button
                  type="button"
                  className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] disabled:opacity-40 disabled:hover:bg-transparent"
                  disabled={row.id === me?.id}
                  title={row.id === me?.id ? 'Tidak dapat menghapus akun sendiri' : 'Hapus pengguna'}
                  aria-label={row.id === me?.id ? 'Tidak dapat menghapus akun sendiri' : 'Hapus pengguna'}
                  onClick={() => void removeUser(row)}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="ui-card p-3 space-y-2">
        <h2 className="text-[13px] font-semibold text-ink">Keterangan level</h2>
        <ul className="space-y-1.5 text-[12px] text-muted leading-snug">
          <li>
            <span className="font-semibold text-ink">pending</span>
            {' — '}
            sudah login Google tetapi belum punya akses; hanya halaman menunggu grant.
          </li>
          <li>
            <span className="font-semibold text-ink">user</span>
            {' — '}
            bisa melihat dashboard, uang masuk, dan belanja (tanpa menambah/mengubah/menghapus).
          </li>
          <li>
            <span className="font-semibold text-ink">admin</span>
            {' — '}
            kelola catatan masuk &amp; keluar (item, kategori, lampiran).
          </li>
          <li>
            <span className="font-semibold text-ink">super_admin</span>
            {' — '}
            seperti admin, plus kelola pengguna. Email em.anam999@gmail.com otomatis jadi super_admin
            saat login Google pertama.
          </li>
        </ul>
      </section>
    </div>
  )
}
