import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

function PolicySourceBadge({ source, label }) {
  const isDb = source === 'database'
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
        isDb
          ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200'
          : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300'
      }`}
      title={isDb ? 'Nilai dari kolom JSON di tabel role' : 'Fallback RoleConfig.php'}
    >
      {label}: {isDb ? 'DB' : 'PHP'}
    </span>
  )
}

export default function RoleAkses() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ apps: {}, roles: [] })
  const [syncLoading, setSyncLoading] = useState(false)
  const [policyRole, setPolicyRole] = useState(null)
  const [policyAppsJson, setPolicyAppsJson] = useState('')
  const [policyPermJson, setPolicyPermJson] = useState('')
  const [policyModalErr, setPolicyModalErr] = useState(null)
  const [policySaving, setPolicySaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    return settingsAPI
      .getRolesConfig()
      .then((rolesRes) => {
        if (rolesRes?.success) {
          setData({
            apps: rolesRes.data?.apps ?? {},
            roles: rolesRes.data?.roles ?? []
          })
        } else {
          setError(rolesRes?.message || 'Gagal memuat data role')
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Gagal memuat data role dan akses')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    load().then(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const handleSyncFromPhp = async () => {
    if (
      !window.confirm(
        'Menyalin semua permission & allowed_apps dari RoleConfig.php ke kolom JSON di tabel role. Lanjutkan?'
      )
    ) {
      return
    }
    setSyncLoading(true)
    setError(null)
    try {
      const res = await settingsAPI.postRolePolicySyncFromPhp()
      if (!res?.success) {
        setError(res?.message || 'Sinkron gagal')
        return
      }
      await load()
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Sinkron gagal')
    } finally {
      setSyncLoading(false)
    }
  }

  const openPolicyModal = (role) => {
    setPolicyModalErr(null)
    setPolicyRole(role)
    setPolicyAppsJson(JSON.stringify(role.allowed_apps ?? [], null, 2))
    setPolicyPermJson(JSON.stringify(role.permissions ?? [], null, 2))
  }

  const closePolicyModal = () => {
    setPolicyRole(null)
    setPolicyAppsJson('')
    setPolicyPermJson('')
    setPolicyModalErr(null)
  }

  const savePolicyModal = async () => {
    if (!policyRole?.key) return
    let allowed_apps
    let permissions
    try {
      allowed_apps = JSON.parse(policyAppsJson)
      permissions = JSON.parse(policyPermJson)
    } catch {
      setPolicyModalErr('JSON tidak valid untuk aplikasi atau permission.')
      return
    }
    if (!Array.isArray(allowed_apps) || !Array.isArray(permissions)) {
      setPolicyModalErr('Kedua field harus berupa array JSON.')
      return
    }
    setPolicySaving(true)
    setPolicyModalErr(null)
    try {
      const res = await settingsAPI.patchRolePolicy(policyRole.key, { allowed_apps, permissions })
      if (!res?.success) {
        setPolicyModalErr(res?.message || 'Gagal menyimpan')
        return
      }
      closePolicyModal()
      await load()
    } catch (err) {
      setPolicyModalErr(err.response?.data?.message || err.message || 'Gagal menyimpan')
    } finally {
      setPolicySaving(false)
    }
  }

  const revertPolicyToPhp = async () => {
    if (!policyRole?.key) return
    if (!window.confirm('Hapus override di DB untuk role ini? Permission & aplikasi kembali mengikuti RoleConfig.php.')) {
      return
    }
    setPolicySaving(true)
    setPolicyModalErr(null)
    try {
      const res = await settingsAPI.patchRolePolicy(policyRole.key, {
        permissions: null,
        allowed_apps: null
      })
      if (!res?.success) {
        setPolicyModalErr(res?.message || 'Gagal')
        return
      }
      closePolicyModal()
      await load()
    } catch (err) {
      setPolicyModalErr(err.response?.data?.message || err.message || 'Gagal')
    } finally {
      setPolicySaving(false)
    }
  }

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

  if (error && data.roles.length === 0) {
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

  const renderRoleCard = (role) => {
    const appsSrc = role.allowed_apps_policy_source || 'php'
    const permSrc = role.permissions_policy_source || 'php'
    return (
      <div
        key={role.id ?? role.key}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 shadow-sm overflow-hidden transition-shadow hover:shadow-md"
      >
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-white">{role.label}</span>
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {role.key}
                </span>
                {role.id != null && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">#{role.id}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <PolicySourceBadge source={appsSrc} label="App" />
                <PolicySourceBadge source={permSrc} label="Perm" />
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
            <button
              type="button"
              onClick={() => openPolicyModal(role)}
              className="shrink-0 text-xs font-medium text-teal-700 dark:text-teal-300 px-2 py-1 rounded-lg border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-900/20"
            >
              Edit kebijakan
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
          <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Role & Akses</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Daftar role UWABA: permission &amp; aplikasi efektif (DB menggantikan RoleConfig jika di-set).
              </p>
            </div>
            <button
              type="button"
              disabled={syncLoading}
              onClick={handleSyncFromPhp}
              className="shrink-0 inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
            >
              {syncLoading ? 'Menyinkronkan…' : 'Salin RoleConfig → DB'}
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-100">
              {error}
            </div>
          )}

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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-40">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-36">
                      Sumber
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px]">
                      Aplikasi
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px]">
                      Permission
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.roles.map((role) => {
                    const appsSrc = role.allowed_apps_policy_source || 'php'
                    const permSrc = role.permissions_policy_source || 'php'
                    return (
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
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <PolicySourceBadge source={appsSrc} label="App" />
                            <PolicySourceBadge source={permSrc} label="Perm" />
                          </div>
                        </td>
                        <td className="px-4 py-3">{renderTags(role.allowed_apps_labels ?? [], '—')}</td>
                        <td className="px-4 py-3">{renderTags(role.permissions ?? [], '—')}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openPolicyModal(role)}
                            className="text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {policyRole != null &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
            <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg sm:rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 max-h-[92vh] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Kebijakan: {policyRole.label}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{policyRole.key}</p>
              </div>
              <div className="p-4 flex-1 min-h-0 overflow-y-auto space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                    allowed_apps (array string)
                  </label>
                  <textarea
                    value={policyAppsJson}
                    onChange={(e) => setPolicyAppsJson(e.target.value)}
                    className="w-full min-h-[100px] font-mono text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                    permissions (array string)
                  </label>
                  <textarea
                    value={policyPermJson}
                    onChange={(e) => setPolicyPermJson(e.target.value)}
                    className="w-full min-h-[140px] font-mono text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    spellCheck={false}
                  />
                </div>
                {policyModalErr && (
                  <p className="text-sm text-red-600 dark:text-red-400">{policyModalErr}</p>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 flex flex-col sm:flex-row flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={revertPolicyToPhp}
                  disabled={policySaving}
                  className="px-3 py-1.5 text-sm rounded-lg border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 order-3 sm:order-1 sm:mr-auto"
                >
                  Kembalikan ke PHP
                </button>
                <button
                  type="button"
                  onClick={closePolicyModal}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={policySaving}
                  onClick={savePolicyModal}
                  className="px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {policySaving ? 'Menyimpan…' : 'Simpan ke DB'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
