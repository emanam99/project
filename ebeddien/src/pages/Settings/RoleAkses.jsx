import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { settingsAPI, manageUsersAPI } from '../../services/api'
import RoleAccessOffcanvas from '../../components/RoleAccessOffcanvas'
import RolePengurusChecklistOffcanvas from '../../components/RolePengurusChecklistOffcanvas'

function KeyIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  )
}

function UsersIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  )
}

function TrashIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

export default function RoleAkses() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({ apps: {}, roles: [] })
  const [showCreateRole, setShowCreateRole] = useState(false)
  const [newRoleKey, setNewRoleKey] = useState('')
  const [newRoleLabel, setNewRoleLabel] = useState('')
  const [createRoleLoading, setCreateRoleLoading] = useState(false)
  const [createRoleErr, setCreateRoleErr] = useState(null)
  const [accessRoleKey, setAccessRoleKey] = useState(null)
  const [pengurusRole, setPengurusRole] = useState(null)
  const [deleteRoleTarget, setDeleteRoleTarget] = useState(null)
  const [deleteRoleLoading, setDeleteRoleLoading] = useState(false)
  const [deleteRoleErr, setDeleteRoleErr] = useState(null)

  const accessRole = useMemo(
    () => (accessRoleKey ? data.roles.find((r) => r.key === accessRoleKey) : null),
    [data.roles, accessRoleKey]
  )

  const load = useCallback((options = {}) => {
    const silent = options.silent === true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    return settingsAPI
      .getRolesConfig()
      .then((rolesRes) => {
        if (rolesRes?.success) {
          setData({
            apps: rolesRes.data?.apps ?? {},
            roles: rolesRes.data?.roles ?? []
          })
        } else if (!silent) {
          setError(rolesRes?.message || 'Gagal memuat data role')
        }
      })
      .catch((err) => {
        if (!silent) {
          setError(err.response?.data?.message || 'Gagal memuat data role dan akses')
        }
      })
      .finally(() => {
        if (!silent) setLoading(false)
      })
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

  const openCreateRole = () => {
    setCreateRoleErr(null)
    setNewRoleKey('')
    setNewRoleLabel('')
    setShowCreateRole(true)
  }

  const submitCreateRole = async () => {
    const key = String(newRoleKey || '').trim().toLowerCase()
    const label = String(newRoleLabel || '').trim()
    if (!key || !label) {
      setCreateRoleErr('Key dan label wajib diisi.')
      return
    }
    setCreateRoleLoading(true)
    setCreateRoleErr(null)
    try {
      const res = await manageUsersAPI.createRole(key, label)
      if (!res?.success) {
        setCreateRoleErr(res?.message || 'Gagal membuat role')
        return
      }
      setShowCreateRole(false)
      await load()
    } catch (err) {
      setCreateRoleErr(err.response?.data?.message || err.message || 'Gagal membuat role')
    } finally {
      setCreateRoleLoading(false)
    }
  }

  const openDeleteRole = (role) => {
    setDeleteRoleErr(null)
    setDeleteRoleTarget(role)
  }

  const submitDeleteRole = async () => {
    if (!deleteRoleTarget?.id) return
    setDeleteRoleLoading(true)
    setDeleteRoleErr(null)
    try {
      const res = await manageUsersAPI.deleteRole(deleteRoleTarget.id)
      if (!res?.success) {
        setDeleteRoleErr(res?.message || 'Gagal menghapus role')
        return
      }
      if (accessRoleKey === deleteRoleTarget.key) setAccessRoleKey(null)
      if (pengurusRole && Number(pengurusRole.id) === Number(deleteRoleTarget.id)) {
        setPengurusRole(null)
      }
      setDeleteRoleTarget(null)
      await load()
    } catch (err) {
      setDeleteRoleErr(err.response?.data?.message || err.message || 'Gagal menghapus role')
    } finally {
      setDeleteRoleLoading(false)
    }
  }

  const handlePengurusCountChange = useCallback((roleId, count) => {
    setData((prev) => ({
      ...prev,
      roles: prev.roles.map((r) =>
        Number(r.id) === Number(roleId) ? { ...r, pengurus_count: count } : r
      )
    }))
    setPengurusRole((prev) =>
      prev && Number(prev.id) === Number(roleId) ? { ...prev, pengurus_count: count } : prev
    )
  }, [])

  const renderRoleRow = (role) => {
    const fiturCount = Number(role.fitur_count) || 0
    const pengurusCount = Number(role.pengurus_count) || 0
    const canDelete = role.key !== 'super_admin'
    return (
      <div
        key={role.id ?? role.key}
        className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{role.label}</p>
          <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{role.key}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setAccessRoleKey(role.key)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
            title="Kelola akses fitur"
            aria-label={`Kelola akses ${role.label}`}
          >
            <KeyIcon className="w-3.5 h-3.5 opacity-80" />
            <span className="tabular-nums">{fiturCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setPengurusRole(role)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            title="Kelola pengurus yang punya role ini"
            aria-label={`Pengurus role ${role.label}`}
          >
            <UsersIcon className="w-3.5 h-3.5 opacity-80" />
            <span className="tabular-nums">{pengurusCount}</span>
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => openDeleteRole(role)}
              className="inline-flex items-center justify-center p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              title="Hapus role"
              aria-label={`Hapus role ${role.label}`}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    )
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

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4 sm:p-5 lg:p-6 max-w-3xl mx-auto">
          <div className="mb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Role & Akses</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Nama role, kelola fitur (ikon kunci), dan daftar pengurus (ikon user).
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateRole}
              className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-lg border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 shrink-0"
            >
              Tambah role
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-100">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
            {data.roles.length === 0 ? (
              <p className="px-4 py-8 text-sm text-center text-gray-500 dark:text-gray-400">Belum ada role.</p>
            ) : (
              data.roles.map((role) => renderRoleRow(role))
            )}
          </div>
        </div>
      </div>

      <RoleAccessOffcanvas
        isOpen={accessRoleKey != null}
        roleKey={accessRoleKey}
        role={accessRole}
        onClose={() => setAccessRoleKey(null)}
        onReload={() => load({ silent: true })}
      />

      <RolePengurusChecklistOffcanvas
        isOpen={pengurusRole != null}
        onClose={() => setPengurusRole(null)}
        role={pengurusRole}
        onCountChange={handlePengurusCountChange}
      />

      {showCreateRole &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
            <div className="bg-white dark:bg-gray-800 w-full sm:max-w-md sm:rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 max-h-[92vh] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tambah role</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Key unik (huruf kecil, angka, underscore). Setelah dibuat, atur akses lewat ikon kunci pada baris role.
                </p>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Key</label>
                  <input
                    type="text"
                    value={newRoleKey}
                    onChange={(e) => setNewRoleKey(e.target.value)}
                    placeholder="mis. auditor_keuangan"
                    className="w-full text-sm px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Label</label>
                  <input
                    type="text"
                    value={newRoleLabel}
                    onChange={(e) => setNewRoleLabel(e.target.value)}
                    placeholder="Nama tampilan"
                    className="w-full text-sm px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    autoComplete="off"
                  />
                </div>
                {createRoleErr && <p className="text-sm text-red-600 dark:text-red-400">{createRoleErr}</p>}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateRole(false)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={createRoleLoading}
                  onClick={submitCreateRole}
                  className="px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {createRoleLoading ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {createPortal(
        <AnimatePresence>
          {deleteRoleTarget && (
            <motion.div
              key="delete-role-confirmation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
            >
              <motion.div
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="bg-white dark:bg-gray-800 w-full sm:max-w-md sm:rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 max-h-[92vh] flex flex-col"
              >
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Hapus role?</h3>
              </div>
              <div className="p-4 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p>
                  Role <span className="font-semibold">{deleteRoleTarget.label}</span>{' '}
                  (<span className="font-mono text-xs">{deleteRoleTarget.key}</span>) akan dihapus permanen.
                </p>
                <p className="text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Pengurus yang punya akses role ini akan kehilangan akses tersebut
                  {Number(deleteRoleTarget.pengurus_count) > 0
                    ? ` (${Number(deleteRoleTarget.pengurus_count)} pengurus).`
                    : '.'}
                </p>
                {deleteRoleErr && <p className="text-red-600 dark:text-red-400">{deleteRoleErr}</p>}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  disabled={deleteRoleLoading}
                  onClick={() => setDeleteRoleTarget(null)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deleteRoleLoading}
                  onClick={submitDeleteRole}
                  className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteRoleLoading ? 'Menghapus…' : 'Hapus role'}
                </button>
              </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
