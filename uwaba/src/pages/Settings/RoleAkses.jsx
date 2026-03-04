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
      .then((res) => {
        if (cancelled || !res?.success) return
        setData({
          apps: res.data?.apps ?? {},
          roles: res.data?.roles ?? []
        })
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

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">
                ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Aplikasi
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Permission
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.roles.map((role) => (
              <tr key={role.id ?? role.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
                  {role.id ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900 dark:text-white">{role.label}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{role.key}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  {role.allowed_apps_labels?.length > 0 ? (
                    <ul className="list-disc list-inside space-y-0.5">
                      {role.allowed_apps_labels.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  {role.permissions?.length > 0 ? (
                    <ul className="list-disc list-inside space-y-0.5">
                      {role.permissions.map((p) => (
                        <li key={p}>
                          {PERMISSION_LABELS[p] ?? p}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </div>
      </div>
    </div>
  )
}
