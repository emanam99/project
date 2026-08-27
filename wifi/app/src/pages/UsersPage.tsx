import { useEffect, useMemo, useState } from 'react'
import {
  createUser,
  deleteUser,
  linkUserPelanggan,
  listUsers,
  updateUserRole,
  type Pelanggan,
  type UserRow,
} from '../api/apiClient'
import OffcanvasCariPelanggan from '../components/OffcanvasCariPelanggan'
import { usePageTitle } from '../contexts/PageTitleContext'
import { getStoredUser } from '../utils/auth'

function displayName(row: UserRow): string {
  const name = (row.name || '').trim()
  if (name && name.toLowerCase() !== row.email.toLowerCase()) return name
  return row.email
}

function initials(row: UserRow): string {
  const source = displayName(row)
  const parts = source.replace(/@.*$/, '').split(/[.\s_-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0] + parts[1]![0]).toUpperCase()
  return (source[0] || '?').toUpperCase()
}

function statusMeta(row: UserRow): { label: string; className: string } {
  if (row.role === 'pending') {
    return {
      label: row.google_id ? 'Menunggu akses' : 'Belum login',
      className: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25',
    }
  }
  if (row.google_id) {
    return {
      label: 'Aktif',
      className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
    }
  }
  return {
    label: 'Pre-register',
    className: 'bg-surface-soft text-muted ring-line',
  }
}

function roleLabel(role: string): string {
  if (role === 'super_admin') return 'Super admin'
  if (role === 'admin') return 'Admin'
  if (role === 'user') return 'User'
  return 'Pending'
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

function LinkIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" strokeLinecap="round" />
    </svg>
  )
}

const ROLE_OPTS = [
  { value: 'pending', label: 'Pending' },
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super admin' },
]

function UserAvatar({ row }: { row: UserRow }) {
  const [failed, setFailed] = useState(false)
  const picture = row.picture?.trim() || null
  const show = Boolean(picture) && !failed

  return (
    <span className="h-11 w-11 shrink-0 rounded-full overflow-hidden bg-[color-mix(in_srgb,var(--accent)_18%,var(--surface-soft))] text-[var(--accent)] grid place-items-center font-semibold text-[13px] ring-1 ring-line">
      {show ? (
        <img
          src={picture!}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(row)
      )}
    </span>
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
  const [linkFor, setLinkFor] = useState<UserRow | null>(null)
  const [filterAkses, setFilterAkses] = useState<'all' | 'pending' | 'user' | 'admin' | 'super_admin'>(
    'all',
  )

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
    const label = displayName(row)
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

  const onSelectPelanggan = async (p: Pelanggan) => {
    if (!linkFor) return
    setError('')
    setOk('')
    const res = await linkUserPelanggan(linkFor.id, p.id)
    if (res.success) {
      setOk(`Terhubung ke pelanggan ${p.nama}`)
      setLinkFor(null)
      await load()
    } else {
      setError(res.message || 'Gagal menghubungkan')
    }
  }

  const unlinkPelanggan = async (row: UserRow) => {
    if (!row.pelanggan_id) return
    if (!window.confirm(`Lepas hubungan dengan pelanggan "${row.pelanggan_nama}"?`)) return
    setError('')
    setOk('')
    const res = await linkUserPelanggan(row.id, null)
    if (res.success) {
      setOk('Hubungan pelanggan dilepas')
      await load()
    } else {
      setError(res.message || 'Gagal melepas hubungan')
    }
  }

  const filteredRows = useMemo(() => {
    if (filterAkses === 'all') return rows
    return rows.filter((r) => r.role === filterAkses)
  }, [rows, filterAkses])

  const countLabel = useMemo(() => {
    if (loading) return 'Memuat…'
    if (filterAkses === 'all') return `${rows.length} pengguna`
    return `${filteredRows.length} / ${rows.length} pengguna`
  }, [loading, rows.length, filteredRows.length, filterAkses])

  return (
    <div className="space-y-3.5 max-w-3xl">
      <form onSubmit={(e) => void handleCreate(e)} className="ui-card p-3.5 grid sm:grid-cols-[1fr_9rem_auto] gap-2 items-end">
        <div>
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
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>
        <button type="submit" className="ui-btn-primary h-[2.6rem] px-4">
          Grant akses
        </button>
      </form>

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Daftar</h2>
          <span className="text-[11px] text-muted tabular-nums">{countLabel}</span>
        </div>
        <div>
          <label className="ui-label">Filter akses</label>
          <select
            className="ui-input text-[12px] min-w-[9rem]"
            value={filterAkses}
            onChange={(e) =>
              setFilterAkses(e.target.value as 'all' | 'pending' | 'user' | 'admin' | 'super_admin')
            }
          >
            <option value="all">Semua</option>
            <option value="pending">Pending</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="ui-card p-6 text-center text-muted text-[13px]">Memuat…</div>
      ) : filteredRows.length === 0 ? (
        <div className="ui-card p-6 text-center text-muted text-[13px]">
          {rows.length === 0 ? 'Belum ada pengguna.' : 'Tidak ada pengguna untuk filter ini.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredRows.map((row) => {
            const name = displayName(row)
            const showEmailSub = name.toLowerCase() !== row.email.toLowerCase()
            const status = statusMeta(row)
            const isSelf = row.id === me?.id
            const canLink = row.role === 'user' || Boolean(row.pelanggan_id)

            return (
              <li
                key={row.id}
                className="ui-card p-3 sm:p-3.5 transition hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]"
              >
                <div className="flex gap-3">
                  <UserAvatar row={row} />

                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[14px] font-semibold text-ink truncate">{name}</span>
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                              status.className,
                            ].join(' ')}
                          >
                            {status.label}
                          </span>
                        </div>
                        {showEmailSub && (
                          <div className="text-[12px] text-muted truncate mt-0.5">{row.email}</div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] disabled:opacity-35"
                        disabled={isSelf}
                        title={isSelf ? 'Tidak dapat menghapus akun sendiri' : 'Hapus'}
                        aria-label="Hapus pengguna"
                        onClick={() => void removeUser(row)}
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`role-${row.id}`}>
                        Role
                      </label>
                      <select
                        id={`role-${row.id}`}
                        className="ui-input py-1.5 text-[12px] font-semibold max-w-[8.5rem]"
                        value={row.role}
                        onChange={(e) => void changeRole(row.id, e.target.value)}
                        disabled={isSelf}
                        title={roleLabel(row.role)}
                      >
                        {ROLE_OPTS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      {row.pelanggan_nama ? (
                        <span className="inline-flex items-center gap-1.5 max-w-full rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold">
                          <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{row.pelanggan_nama}</span>
                          <button
                            type="button"
                            className="ml-0.5 text-[10px] font-bold opacity-70 hover:opacity-100"
                            onClick={() => void unlinkPelanggan(row)}
                            title="Lepas hubungan"
                          >
                            ✕
                          </button>
                        </span>
                      ) : canLink ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-[11px] font-semibold text-muted hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                          onClick={() => setLinkFor(row)}
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          Hubungkan pelanggan
                        </button>
                      ) : null}

                      {row.pelanggan_id && (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-muted hover:text-ink"
                          onClick={() => setLinkFor(row)}
                        >
                          Ganti
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <section className="ui-card p-3.5 space-y-2">
        <h2 className="text-[13px] font-semibold text-ink">Keterangan level</h2>
        <ul className="space-y-1.5 text-[12px] text-muted leading-snug">
          <li>
            <span className="font-semibold text-ink">Pending</span>
            {' — '}
            sudah login Google tetapi belum punya akses.
          </li>
          <li>
            <span className="font-semibold text-ink">User</span>
            {' — '}
            hanya melihat tagihan atas nama pelanggan yang dihubungkan.
          </li>
          <li>
            <span className="font-semibold text-ink">Admin</span>
            {' — '}
            kelola pelanggan, tagihan, pembayaran, dan rekap.
          </li>
          <li>
            <span className="font-semibold text-ink">Super admin</span>
            {' — '}
            seperti admin + kelola pengguna. Akun env utama tidak tampil di daftar.
          </li>
        </ul>
      </section>

      <OffcanvasCariPelanggan
        open={Boolean(linkFor)}
        onClose={() => setLinkFor(null)}
        onSelect={(p) => void onSelectPelanggan(p)}
        title={linkFor ? `Hubungkan · ${displayName(linkFor)}` : 'Cari pelanggan'}
      />
    </div>
  )
}
