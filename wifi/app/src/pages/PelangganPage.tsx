import { useEffect, useMemo, useState } from 'react'
import { listPelanggan, type Pelanggan } from '../api/apiClient'
import OffcanvasPelangganForm from '../components/OffcanvasPelangganForm'
import { usePageTitle } from '../contexts/PageTitleContext'

function initials(nama: string): string {
  const parts = nama.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avatarTone(id: number): string {
  const tones = [
    'from-[#2a96e0] to-[#1a6fb0]',
    'from-[#0d9488] to-[#0f766e]',
    'from-[#7c3aed] to-[#5b21b6]',
    'from-[#db2777] to-[#9d174d]',
    'from-[#ea580c] to-[#c2410c]',
    'from-[#2563eb] to-[#1e40af]',
  ]
  return tones[Math.abs(id) % tones.length]
}

export default function PelangganPage() {
  usePageTitle('Pelanggan')
  const [rows, setRows] = useState<Pelanggan[]>([])
  const [q, setQ] = useState('')
  const [filterAktif, setFilterAktif] = useState<'all' | '1' | '0'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Pelanggan | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await listPelanggan({
      q: q.trim() || undefined,
      aktif: filterAktif === 'all' ? undefined : filterAktif,
    })
    if (res.success && res.data) {
      setRows(res.data)
      setError('')
    } else {
      setError(res.message || 'Gagal memuat pelanggan')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAktif])

  const stats = useMemo(() => {
    const aktif = rows.filter((r) => r.aktif).length
    const linked = rows.filter((r) => Boolean(r.user_email)).length
    return { total: rows.length, aktif, nonaktif: rows.length - aktif, linked }
  }, [rows])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (row: Pelanggan) => {
    setEditing(row)
    setFormOpen(true)
  }

  const filters: { key: 'all' | '1' | '0'; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: '1', label: 'Aktif' },
    { key: '0', label: 'Nonaktif' },
  ]

  return (
    <div className="space-y-3.5">
      <div className="ui-card p-3 sm:p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink leading-tight">Daftar pelanggan</h2>
            <p className="text-[11px] text-muted mt-0.5">
              Ketuk kartu untuk edit · hubungkan email agar bisa login
            </p>
          </div>
          <button
            type="button"
            className="ui-btn-primary shrink-0 text-[12px] px-2.5 py-1.5"
            onClick={openCreate}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            Tambah
          </button>
        </div>

        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
          </svg>
          <input
            className="ui-input !pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load()
            }}
            placeholder="Cari nama, HP, email, alamat…"
            aria-label="Cari pelanggan"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-surface-soft/60 p-0.5">
            {filters.map((f) => {
              const active = filterAktif === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterAktif(f.key)}
                  className={[
                    'px-2.5 py-1 text-[12px] font-semibold rounded-md transition',
                    active
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          <button type="button" className="ui-btn-ghost text-[12px] ml-auto" onClick={() => void load()}>
            Cari
          </button>
        </div>

        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-surface-soft/80 px-2.5 py-2 text-center">
              <div className="text-[15px] font-semibold tabular-nums text-ink">{stats.total}</div>
              <div className="text-[10px] text-muted">Ditampilkan</div>
            </div>
            <div className="rounded-lg bg-surface-soft/80 px-2.5 py-2 text-center">
              <div className="text-[15px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {stats.aktif}
              </div>
              <div className="text-[10px] text-muted">Aktif</div>
            </div>
            <div className="rounded-lg bg-surface-soft/80 px-2.5 py-2 text-center">
              <div className="text-[15px] font-semibold tabular-nums text-[var(--accent)]">{stats.linked}</div>
              <div className="text-[10px] text-muted">Punya akun</div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="ui-alert-error">{error}</div>}
      {ok && <div className="ui-alert-ok">{ok}</div>}

      {loading ? (
        <ul className="space-y-2" aria-busy="true" aria-label="Memuat pelanggan">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="ui-card p-3 animate-pulse">
              <div className="flex gap-3">
                <div className="h-11 w-11 rounded-xl bg-surface-soft" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3.5 w-2/5 rounded bg-surface-soft" />
                  <div className="h-3 w-3/5 rounded bg-surface-soft" />
                  <div className="h-3 w-1/3 rounded bg-surface-soft" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="ui-card px-4 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-[var(--accent)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
              />
            </svg>
          </div>
          <div className="text-[14px] font-semibold text-ink">Belum ada pelanggan</div>
          <p className="mt-1 text-[12px] text-muted max-w-[16rem] mx-auto">
            {q.trim()
              ? 'Tidak ada hasil untuk pencarian ini. Coba kata kunci lain.'
              : 'Tambahkan pelanggan pertama untuk mulai mencatat tagihan.'}
          </p>
          {!q.trim() && (
            <button type="button" className="ui-btn-primary mt-4 text-[13px]" onClick={openCreate}>
              + Pelanggan baru
            </button>
          )}
        </div>
      ) : (
        <ul className="ui-card overflow-hidden divide-y divide-line">
          {rows.map((row) => {
            const meta = [row.no_hp, row.paket].filter(Boolean).join(' · ')
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="group w-full text-left px-3 py-3 sm:px-3.5 transition hover:bg-surface-soft/80 focus-visible:outline-none focus-visible:bg-surface-soft"
                  onClick={() => openEdit(row)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={[
                        'h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br text-white shadow-sm',
                        'flex items-center justify-center text-[13px] font-bold tracking-wide',
                        avatarTone(row.id),
                        !row.aktif ? 'opacity-55 grayscale' : '',
                      ].join(' ')}
                      aria-hidden
                    >
                      {initials(row.nama)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13.5px] font-semibold text-ink truncate">{row.nama}</span>
                        {row.aktif ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                            Nonaktif
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 text-[11.5px] text-muted truncate">{meta || 'Belum ada HP / paket'}</div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {row.user_email ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] truncate max-w-full">
                            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" />
                            </svg>
                            <span className="truncate">{row.user_email}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-faint">Belum terhubung akun</span>
                        )}
                        {row.alamat && (
                          <span className="text-[11px] text-faint truncate max-w-[14rem]">· {row.alamat}</span>
                        )}
                      </div>
                    </div>

                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-faint transition group-hover:text-[var(--accent)] group-hover:translate-x-0.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                    </svg>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <OffcanvasPelangganForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        pelanggan={editing}
        onSaved={(msg) => {
          setOk(msg)
          setError('')
          void load()
        }}
      />
    </div>
  )
}
