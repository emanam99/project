import { useState, useEffect, useMemo } from 'react'
import { settingsAPI } from '../../services/api'
import { navMenuItems } from '../../config/navMenuConfig'

/**
 * Untuk tiap menu item, hitung daftar role (label) yang bisa akses.
 * - requiresRole -> pakai role labels dari config
 * - requiresSuperAdmin -> tambah "Super Admin"
 * - requiresPermission -> ambil role yang punya permission itu dari roles config
 * - tidak ada -> "Semua role"
 */
function computeMenuAccess(menuItem, rolesConfig) {
  const roleLabelsMap = {}
  if (rolesConfig?.roles) {
    rolesConfig.roles.forEach((r) => {
      roleLabelsMap[r.key] = r.label
    })
  }

  const labels = new Set()

  if (menuItem.requiresSuperAdmin) {
    labels.add('Super Admin')
  }

  if (menuItem.requiresRole?.length) {
    menuItem.requiresRole.forEach((key) => {
      if (roleLabelsMap[key]) labels.add(roleLabelsMap[key])
      else labels.add(key)
    })
  }

  if (menuItem.requiresPermission && rolesConfig?.roles) {
    const perm = menuItem.requiresPermission
    rolesConfig.roles.forEach((r) => {
      if (r.permissions?.includes(perm)) labels.add(r.label)
    })
  }

  if (labels.size === 0) return ['Semua role']
  return Array.from(labels).sort((a, b) => a.localeCompare(b, 'id'))
}

export default function Fitur() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rolesConfig, setRolesConfig] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    settingsAPI
      .getRolesConfig()
      .then((res) => {
        if (cancelled || !res?.success) return
        setRolesConfig(res.data ?? null)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Gagal memuat data')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const menuWithAccess = useMemo(() => {
    return navMenuItems.map((item) => ({
      path: item.path,
      label: item.label,
      group: item.group || 'Lainnya',
      roleLabels: computeMenuAccess(item, rolesConfig)
    }))
  }, [rolesConfig])

  const byGroup = useMemo(() => {
    const map = new Map()
    menuWithAccess.forEach((row) => {
      const g = row.group
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(row)
    })
    // Urutan grup sama seperti halaman Semua Menu & nav expand
    const order = [
      'My Workspace',
      'Pendaftaran',
      'UWABA',
      'UGT',
      'Cashless',
      'Keuangan',
      'Umroh',
      'Ijin',
      'Kalender',
      'Kalender Pesantren',
      'Lembaga',
      'Setting',
      'Lainnya',
      'Tentang'
    ]
    const ordered = order.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g) }))
    // Grup lain yang tidak ada di order (jika ada) tampilkan di akhir
    map.forEach((items, g) => {
      if (!order.includes(g)) ordered.push({ group: g, items })
    })
    return ordered
  }, [menuWithAccess])

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
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          {byGroup.map(({ group, items }) => (
            <section key={group} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow overflow-hidden">
              <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                {group}
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700/30">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">
                        Menu
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40 hidden sm:table-cell">
                        Path
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Role yang bisa akses
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {items.map((row) => (
                      <tr key={row.path} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-2">
                          <span className="font-medium text-gray-900 dark:text-white">{row.label}</span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 font-mono hidden sm:table-cell">
                          {row.path}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
                          {row.roleLabels?.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5">
                              {row.roleLabels.map((label) => (
                                <li key={label}>{label}</li>
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
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
