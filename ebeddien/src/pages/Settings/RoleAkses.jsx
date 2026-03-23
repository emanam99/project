import { useState, useEffect } from 'react'
import { settingsAPI } from '../../services/api'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ apps: {}, roles: [] })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    settingsAPI
      .getRolesConfig()
      .then((rolesRes) => {
        if (cancelled) return
        if (rolesRes?.success) {
          setData({
            apps: rolesRes.data?.apps ?? {},
            roles: rolesRes.data?.roles ?? []
          })
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
    return () => {
      cancelled = true
    }
  }, [])

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

  const renderRoleCard = (role) => (
    <div
      key={role.id ?? role.key}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 shadow-sm overflow-hidden transition-shadow hover:shadow-md"
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
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Role & Akses</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Daftar role dan permission per aplikasi</p>
          </div>

          <div className="lg:hidden space-y-4">
            {data.roles.map((role) => renderRoleCard(role))}
          </div>

          <div className="hidden lg:block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-gray-700/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-14">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-36">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                      Aplikasi
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px]">
                      Permission
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.roles.map((role) => (
                    <tr
                      key={role.id ?? role.key}
                      className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {role.id ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-white block">{role.label}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{role.key}</span>
                      </td>
                      <td className="px-4 py-3">{renderTags(role.allowed_apps_labels ?? [], '—')}</td>
                      <td className="px-4 py-3">{renderTags(role.permissions ?? [], '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
