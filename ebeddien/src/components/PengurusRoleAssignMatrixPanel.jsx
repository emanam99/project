import { useState, useEffect, useCallback } from 'react'
import { settingsAPI } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'

/**
 * Editor matriks role___boleh_assign_role untuk halaman Pengaturan → Fitur (accordion Pengurus).
 */
export default function PengurusRoleAssignMatrixPanel() {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [roles, setRoles] = useState([])
  /** Baris edit: { role_id, assignable_role_id } tanpa id DB sampai disimpan */
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState({ role_id: '', assignable_role_id: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await settingsAPI.getRoleBolehAssign()
      if (res?.success && res.data) {
        setRoles(Array.isArray(res.data.roles) ? res.data.roles : [])
        const pairs = Array.isArray(res.data.pairs) ? res.data.pairs : []
        setRows(
          pairs.map((p) => ({
            role_id: String(p.role_id),
            assignable_role_id: String(p.assignable_role_id),
          }))
        )
      } else {
        showNotification(res?.message || 'Gagal memuat matriks', 'error')
        setRoles([])
        setRows([])
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal memuat', 'error')
      setRoles([])
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showNotification])

  useEffect(() => {
    load()
  }, [load])

  const addRow = useCallback(() => {
    const r = String(draft.role_id || '').trim()
    const a = String(draft.assignable_role_id || '').trim()
    if (!r || !a) {
      showNotification('Pilih role penugas dan role yang boleh ditugaskan', 'warning')
      return
    }
    if (r === a) {
      showNotification('Role penugas dan role tujuan harus berbeda', 'warning')
      return
    }
    const dup = rows.some((x) => x.role_id === r && x.assignable_role_id === a)
    if (dup) {
      showNotification('Pasangan ini sudah ada', 'warning')
      return
    }
    setRows((prev) => [...prev, { role_id: r, assignable_role_id: a }])
    setDraft({ role_id: '', assignable_role_id: '' })
  }, [draft, rows, showNotification])

  const removeAt = useCallback((index) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const pairs = rows.map((x) => ({
        role_id: parseInt(x.role_id, 10),
        assignable_role_id: parseInt(x.assignable_role_id, 10),
      }))
      const res = await settingsAPI.putRoleBolehAssign({ pairs })
      if (res?.success) {
        showNotification(res.message || 'Disimpan', 'success')
        await load()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || e.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }, [rows, load, showNotification])

  const roleLabel = (id) => {
    const r = roles.find((x) => String(x.id) === String(id))
    return r ? `${r.label} (${r.key})` : `#${id}`
  }

  if (loading) {
    return (
      <div className="px-4 py-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    )
  }

  return (
    <div className="px-4 py-3 space-y-4 border-t border-gray-100/80 dark:border-gray-700/40 bg-gray-50/50 dark:bg-gray-900/25">
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        Jika untuk suatu <strong className="font-medium text-gray-800 dark:text-gray-200">role penugas</strong> tidak ada
        satupun baris di bawah, pengurus dengan role itu <strong className="font-medium">tidak dibatasi</strong> saat
        menambah/mencabut role (perilaku lama). Jika ada minimal satu baris untuk role penugas tersebut, ia hanya boleh
        menambah atau mencabut role yang tercantum di kolom kanan (gabungan jika punya beberapa role).
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40">
              <th className="text-left py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-200">Role penugas</th>
              <th className="text-left py-2.5 px-3 font-semibold text-gray-700 dark:text-gray-200">Boleh menugaskan role</th>
              <th className="w-24 py-2.5 px-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 px-3 text-center text-gray-500 dark:text-gray-400 text-xs">
                  Belum ada aturan — semua pengurus mengikuti perilaku default (tanpa pembatasan lewat tabel ini).
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.role_id}-${row.assignable_role_id}-${idx}`} className="hover:bg-gray-50/80 dark:hover:bg-gray-900/30">
                  <td className="py-2 px-3 text-gray-800 dark:text-gray-100">{roleLabel(row.role_id)}</td>
                  <td className="py-2 px-3 text-gray-800 dark:text-gray-100">{roleLabel(row.assignable_role_id)}</td>
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Role penugas</label>
          <select
            value={draft.role_id}
            onChange={(e) => setDraft((d) => ({ ...d, role_id: e.target.value }))}
            className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">— Pilih —</option>
            {roles.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.label} ({r.key})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Boleh menugaskan</label>
          <select
            value={draft.assignable_role_id}
            onChange={(e) => setDraft((d) => ({ ...d, assignable_role_id: e.target.value }))}
            className="w-full px-2.5 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">— Pilih —</option>
            {roles.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.label} ({r.key})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50"
        >
          Tambah baris
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2.5 text-sm font-medium rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Menyimpan…' : 'Simpan matriks'}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={saving || loading}
          className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Muat ulang
        </button>
      </div>
    </div>
  )
}
