import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { settingsAPI, lembagaAPI } from '../../services/api'

const PERMISSION_LABELS = {
  manage_users: 'Kelola pengguna',
  manage_santri: 'Kelola data santri',
  manage_uwaba: 'Kelola pembayaran UWABA',
  manage_lembaga: 'Kelola data lembaga',
  manage_umroh: 'Kelola data Umroh',
  manage_psb: 'Kelola pendaftaran PSB',
  manage_ijin: 'Kelola data Ijin',
  view_reports: 'Melihat laporan',
  manage_finance: 'Kelola keuangan',
  manage_settings: 'Kelola pengaturan'
}

export default function RoleAkses() {
  const { user, setViewAsRole, setViewAsLembagaId, clearViewAsRole, isRealSuperAdmin } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ apps: {}, roles: [] })
  const [lembagaList, setLembagaList] = useState([])
  const [selectedLembagaByRole, setSelectedLembagaByRole] = useState({})
  const [actionLoading, setActionLoading] = useState(false)

  const canTryRole = isRealSuperAdmin?.() ?? false
  const viewAsActive = user?.view_as_active === true
  const effectiveRoleKey = (user?.role_key || user?.level || '').toLowerCase()
  const effectiveLembagaId = user?.lembaga_id ?? null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      settingsAPI.getRolesConfig(),
      canTryRole ? lembagaAPI.getAll() : Promise.resolve(null)
    ])
      .then(([rolesRes, lembagaRes]) => {
        if (cancelled) return
        if (rolesRes?.success) {
          setData({
            apps: rolesRes.data?.apps ?? {},
            roles: rolesRes.data?.roles ?? []
          })
        }
        if (lembagaRes) {
          const list = lembagaRes.success && lembagaRes.data ? lembagaRes.data : Array.isArray(lembagaRes) ? lembagaRes : []
          setLembagaList(list)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Gagal memuat data role dan akses')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [canTryRole])

  if (loading) {
    return (
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className="p-4 sm:p-6">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const currentViewAsLabel = viewAsActive && (user?.role_label || data.roles.find((r) => (r.key || '').toLowerCase() === effectiveRoleKey)?.label || effectiveRoleKey)
  const currentViewAsLembaga = viewAsActive && effectiveLembagaId && lembagaList.find((l) => String(l.id) === String(effectiveLembagaId))

  const renderTags = (items, fallback = '—') =>
    items?.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-600/60 text-gray-700 dark:text-gray-300"
          >
            {typeof item === 'string' && PERMISSION_LABELS[item] ? PERMISSION_LABELS[item] : item}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-gray-400 dark:text-gray-500 text-sm">{fallback}</span>
    )

  const renderRoleCard = (role) => {
    const roleKey = (role.key || role.label || '').toLowerCase()
    const isActiveView = viewAsActive && effectiveRoleKey === roleKey
    return (
      <div
        key={role.id ?? role.key}
        className={`rounded-xl border bg-white dark:bg-gray-800/80 dark:border-gray-700/80 shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
          isActiveView ? 'ring-2 ring-teal-500/50 border-teal-200 dark:border-teal-800' : 'border-gray-200 dark:border-gray-700'
        }`}
      >
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-white">{role.label}</span>
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {role.key}
                </span>
                {role.id != null && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">#{role.id}</span>
                )}
              </div>
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Aplikasi</p>
                {renderTags(role.allowed_apps_labels ?? [], '—')}
              </div>
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Permission</p>
                {renderTags(role.permissions ?? [], '—')}
              </div>
            </div>
            {canTryRole && (
              <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[200px]">
                <select
                  value={selectedLembagaByRole[roleKey] ?? (isActiveView ? (effectiveLembagaId ?? '') : '')}
                  onChange={async (e) => {
                    const v = e.target.value || null
                    setSelectedLembagaByRole((prev) => ({ ...prev, [roleKey]: v }))
                    if (isActiveView) {
                      setActionLoading(true)
                      try {
                        await setViewAsLembagaId(v)
                      } finally {
                        setActionLoading(false)
                      }
                    }
                  }}
                  className="text-sm w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  title="Pilih lembaga untuk pengecekan akses"
                >
                  <option value="">Pilih lembaga</option>
                  {lembagaList.map((l) => (
                    <option key={l.id} value={l.id}>{l.nama || l.name || l.id}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={async () => {
                    setActionLoading(true)
                    try {
                      await setViewAsRole(isActiveView ? null : roleKey, isActiveView ? null : (selectedLembagaByRole[roleKey] || null))
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                  className={`w-full sm:w-auto text-sm font-medium px-4 py-2 rounded-lg transition-all disabled:opacity-50 ${
                    isActiveView
                      ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200 ring-1 ring-teal-300 dark:ring-teal-700'
                      : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                  }`}
                  title={isActiveView ? 'Klik untuk kembali ke Super Admin' : `Lihat sebagai ${role.label}`}
                >
                  {isActiveView ? 'Aktif' : 'Coba sebagai'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      {canTryRole && viewAsActive && (
        <div className="flex-shrink-0 px-4 py-3 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-sm text-amber-800 dark:text-amber-200">
            Melihat sebagai: <strong>{currentViewAsLabel || effectiveRoleKey}</strong>
            {currentViewAsLembaga && (
              <> · Lembaga: <strong>{currentViewAsLembaga.nama || currentViewAsLembaga.name || effectiveLembagaId}</strong></>
            )}
          </span>
          <button
            type="button"
            disabled={actionLoading}
            onClick={async () => {
              setActionLoading(true)
              try {
                await clearViewAsRole()
              } finally {
                setActionLoading(false)
              }
            }}
            className="self-start sm:self-center px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
          >
            {actionLoading ? '...' : 'Kembali ke Super Admin'}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Role & Akses</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Daftar role dan permission per aplikasi</p>
          </div>

          {/* Mobile & Tablet: card list */}
          <div className="lg:hidden space-y-4">
            {data.roles.map((role) => renderRoleCard(role))}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-gray-700/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-14">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-36">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">Aplikasi</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px]">Permission</th>
                    {canTryRole && (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-44">Lembaga</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Aksi</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.roles.map((role) => {
                    const rKey = (role.key || role.label || '').toLowerCase()
                    const isActiveView = viewAsActive && effectiveRoleKey === rKey
                    return (
                      <tr
                        key={role.id ?? role.key}
                        className={`transition-colors ${isActiveView ? 'bg-teal-50/50 dark:bg-teal-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                      >
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{role.id ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900 dark:text-white block">{role.label}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{role.key}</span>
                        </td>
                        <td className="px-4 py-3">{renderTags(role.allowed_apps_labels ?? [], '—')}</td>
                        <td className="px-4 py-3">{renderTags(role.permissions ?? [], '—')}</td>
                        {canTryRole && (
                          <>
                            <td className="px-4 py-3">
                              <select
                                value={selectedLembagaByRole[rKey] ?? (isActiveView ? (effectiveLembagaId ?? '') : '')}
                                onChange={async (e) => {
                                  const v = e.target.value || null
                                  setSelectedLembagaByRole((prev) => ({ ...prev, [rKey]: v }))
                                  if (isActiveView) {
                                    setActionLoading(true)
                                    try {
                                      await setViewAsLembagaId(v)
                                    } finally {
                                      setActionLoading(false)
                                    }
                                  }
                                }}
                                className="text-sm w-full max-w-[180px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 focus:ring-2 focus:ring-teal-500"
                                title="Pilih lembaga"
                              >
                                <option value="">Pilih lembaga</option>
                                {lembagaList.map((l) => (
                                  <option key={l.id} value={l.id}>{l.nama || l.name || l.id}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={async () => {
                                  setActionLoading(true)
                                  try {
                                    await setViewAsRole(isActiveView ? null : rKey, isActiveView ? null : (selectedLembagaByRole[rKey] || null))
                                  } finally {
                                    setActionLoading(false)
                                  }
                                }}
                                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                                  isActiveView
                                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200'
                                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                                }`}
                                title={isActiveView ? 'Kembali ke Super Admin' : `Coba sebagai ${role.label}`}
                              >
                                {isActiveView ? 'Aktif' : 'Coba sebagai'}
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
