import { useCallback, useEffect, useState } from 'react'
import { manageUsersAPI } from '../../services/api'

function fmtDt(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function severityClass(sev) {
  if (sev === 'high') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  if (sev === 'medium') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
}

function methodClass(m) {
  const u = String(m || '').toUpperCase()
  if (u === 'GET') return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
  if (u === 'POST') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (u === 'PUT' || u === 'PATCH') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
  if (u === 'DELETE') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
}

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'akses', label: 'Akses API' },
  { id: 'mutasi', label: 'Mutasi data' },
]

export default function UserAktivitasPage() {
  const [tab, setTab] = useState('ringkasan')
  const [days, setDays] = useState(7)
  const [overview, setOverview] = useState(null)
  const [accessRows, setAccessRows] = useState([])
  const [accessTotal, setAccessTotal] = useState(0)
  const [mutationRows, setMutationRows] = useState([])
  const [mutationTotal, setMutationTotal] = useState(0)
  const [accessFilters, setAccessFilters] = useState({ method: '', search: '' })
  const [mutationFilters, setMutationFilters] = useState({ action: '', entity_type: '' })
  const [loading, setLoading] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState('')

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await manageUsersAPI.getUserAktivitasOverview({ days })
      if (!res?.success) throw new Error(res?.message || 'Gagal memuat ringkasan')
      setOverview(res.data || null)
    } catch (e) {
      setError(e?.message || 'Gagal memuat ringkasan')
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }, [days])

  const loadAccess = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await manageUsersAPI.getUserAktivitasAccessLog({
        method: accessFilters.method || undefined,
        search: accessFilters.search || undefined,
        limit: 100,
        offset: 0,
      })
      if (!res?.success) throw new Error(res?.message || 'Gagal memuat access log')
      setAccessRows(Array.isArray(res.data) ? res.data : [])
      setAccessTotal(res.total ?? 0)
    } catch (e) {
      setError(e?.message || 'Gagal memuat access log')
    } finally {
      setLoadingList(false)
    }
  }, [accessFilters])

  const loadMutations = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await manageUsersAPI.getAktivitasForUser({
        action: mutationFilters.action || undefined,
        entity_type: mutationFilters.entity_type || undefined,
        limit: 100,
        offset: 0,
      })
      if (!res?.success) throw new Error(res?.message || 'Gagal memuat mutasi')
      setMutationRows(Array.isArray(res.data) ? res.data : [])
      setMutationTotal(res.total ?? 0)
    } catch (e) {
      setError(e?.message || 'Gagal memuat mutasi')
    } finally {
      setLoadingList(false)
    }
  }, [mutationFilters])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  useEffect(() => {
    if (tab === 'akses') loadAccess()
    if (tab === 'mutasi') loadMutations()
  }, [tab, loadAccess, loadMutations])

  const sc = overview?.status_counts || {}
  const suspicious = Array.isArray(overview?.suspicious) ? overview.suspicious : []

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Aktivitas User</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Audit akses API (GET/POST/PUT/DELETE), mutasi data, dan sinyal mencurigakan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 7)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            >
              <option value={1}>1 hari</option>
              <option value={7}>7 hari</option>
              <option value={30}>30 hari</option>
              <option value={90}>90 hari</option>
            </select>
            <button
              type="button"
              onClick={() => {
                loadOverview()
                if (tab === 'akses') loadAccess()
                if (tab === 'mutasi') loadMutations()
              }}
              className="px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm"
            >
              Muat ulang
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-primary-600 text-primary-700 dark:text-primary-300'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {tab === 'ringkasan' && (
          <div className="space-y-4">
            {loading ? (
              <div className="py-16 text-center text-gray-500">Memuat ringkasan…</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Hit API" value={overview?.access_total ?? 0} />
                  <StatCard label="2xx" value={sc.ok_2xx ?? 0} />
                  <StatCard label="4xx" value={sc.err_4xx ?? 0} />
                  <StatCard label="5xx" value={sc.err_5xx ?? 0} />
                </div>

                {!overview?.access_log_enabled && (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Tabel access log belum aktif — jalankan migrasi API. Mutasi data tetap dari user___aktivitas.
                  </p>
                )}

                <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Aktivitas mencurigakan</h2>
                  </div>
                  {suspicious.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">Tidak ada sinyal mencurigakan pada rentang ini.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {suspicious.map((s, i) => (
                        <li key={`${s.type}-${i}`} className="px-4 py-3 flex flex-wrap items-start gap-2 justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${severityClass(s.severity)}`}>
                                {s.severity}
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.title}</span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.detail}</p>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{s.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div className="grid md:grid-cols-2 gap-4">
                  <RankTable
                    title="GET terbanyak (route)"
                    rows={(overview?.top_get || []).map((r) => ({
                      key: r.route_key,
                      label: r.route_key,
                      value: r.cnt,
                    }))}
                  />
                  <RankTable
                    title="User paling aktif (akses API)"
                    rows={(overview?.top_users || []).map((r) => ({
                      key: `${r.user_id}-${r.pengurus_id}`,
                      label: r.pengurus_nama || r.username || `user #${r.user_id || r.pengurus_id}`,
                      value: r.cnt,
                      sub: `GET ${r.get_cnt || 0} · tulis ${r.write_cnt || 0}`,
                    }))}
                  />
                  <RankTable
                    title="Method"
                    rows={(overview?.method_counts || []).map((r) => ({
                      key: r.method,
                      label: r.method,
                      value: r.cnt,
                    }))}
                  />
                  <RankTable
                    title="Mutasi data (create/update/delete)"
                    rows={(overview?.mutation_counts || []).map((r) => ({
                      key: r.action,
                      label: r.action,
                      value: r.cnt,
                    }))}
                  />
                </div>

                <RankTable
                  title="Entitas dimutasi terbanyak"
                  rows={(overview?.top_entities || []).map((r) => ({
                    key: `${r.entity_type}-${r.action}`,
                    label: `${r.entity_type} · ${r.action}`,
                    value: r.cnt,
                  }))}
                />
              </>
            )}
          </div>
        )}

        {tab === 'akses' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                value={accessFilters.method}
                onChange={(e) => setAccessFilters((p) => ({ ...p, method: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              >
                <option value="">Semua method</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="search"
                value={accessFilters.search}
                onChange={(e) => setAccessFilters((p) => ({ ...p, search: e.target.value }))}
                placeholder="Cari path / nama / username…"
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm min-w-[220px]"
              />
              <button
                type="button"
                onClick={loadAccess}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
              >
                Filter
              </button>
              <span className="text-xs text-gray-500 self-center">Total: {accessTotal}</span>
            </div>
            <DataTable
              loading={loadingList}
              empty="Belum ada access log."
              headers={['Waktu', 'User', 'Method', 'Status', 'ms', 'Path']}
              rows={accessRows.map((r) => [
                fmtDt(r.created_at),
                r.pengurus_nama || r.username || (r.user_id ? `#${r.user_id}` : '—'),
                <span key="m" className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${methodClass(r.method)}`}>{r.method}</span>,
                r.status_code,
                r.duration_ms ?? '—',
                <span key="p" className="font-mono text-xs break-all">{r.path}</span>,
              ])}
            />
          </div>
        )}

        {tab === 'mutasi' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                value={mutationFilters.action}
                onChange={(e) => setMutationFilters((p) => ({ ...p, action: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              >
                <option value="">Semua aksi</option>
                <option value="create">create</option>
                <option value="update">update</option>
                <option value="delete">delete</option>
                <option value="export">export</option>
                <option value="rollback">rollback</option>
              </select>
              <input
                type="text"
                value={mutationFilters.entity_type}
                onChange={(e) => setMutationFilters((p) => ({ ...p, entity_type: e.target.value }))}
                placeholder="entity_type (opsional)"
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
              <button
                type="button"
                onClick={loadMutations}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
              >
                Filter
              </button>
              <span className="text-xs text-gray-500 self-center">Total: {mutationTotal}</span>
            </div>
            <DataTable
              loading={loadingList}
              empty="Belum ada mutasi tercatat."
              headers={['Waktu', 'User', 'Aksi', 'Entitas', 'ID']}
              rows={mutationRows.map((r) => [
                fmtDt(r.created_at),
                r.pengurus_nama || (r.user_id ? `#${r.user_id}` : '—'),
                r.action,
                r.entity_type,
                r.entity_id,
              ])}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{Number(value).toLocaleString('id-ID')}</p>
    </div>
  )
}

function RankTable({ title, rows }) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-gray-500">Kosong</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.key} className="px-4 py-2 flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate text-gray-900 dark:text-gray-100 font-mono text-xs">{r.label}</p>
                {r.sub ? <p className="text-[11px] text-gray-500">{r.sub}</p> : null}
              </div>
              <span className="shrink-0 font-semibold text-gray-700 dark:text-gray-200">
                {Number(r.value).toLocaleString('id-ID')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DataTable({ headers, rows, loading, empty }) {
  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-500">Memuat…</div>
  }
  if (!rows.length) {
    return <div className="py-12 text-center text-sm text-gray-500">{empty}</div>
  }
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto bg-white dark:bg-gray-800">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs text-gray-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map((cols, i) => (
            <tr key={i} className="text-gray-800 dark:text-gray-200">
              {cols.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top whitespace-nowrap">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
