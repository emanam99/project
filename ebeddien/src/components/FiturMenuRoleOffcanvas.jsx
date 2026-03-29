import { useState, useEffect, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { settingsAPI } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { useAuthStore } from '../store/authStore'
import { GROUP_ORDER } from '../config/menuConfig'
import { getIcon } from '../config/menuIcons'

/**
 * Offcanvas kanan: atur tampilan (label, icon, grup, urutan) + role yang boleh akses.
 */
export default function FiturMenuRoleOffcanvas({
  isOpen,
  onClose,
  onAfterSave,
  fiturItem,
  roles = [],
  /** Label menu induk (aksi): untuk penjelasan pembatasan daftar role */
  parentMenuLabel = null
}) {
  const { showNotification } = useNotification()
  const [localIds, setLocalIds] = useState([])
  const [editLabel, setEditLabel] = useState('')
  const [editIconKey, setEditIconKey] = useState('')
  const [editGroupLabel, setEditGroupLabel] = useState('')
  const [editSortOrder, setEditSortOrder] = useState('0')
  const [saving, setSaving] = useState(false)
  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !fiturItem) return
    const raw = [...(fiturItem.role_ids || [])]
    const allowed = new Set(roles.map((r) => r.id))
    if (fiturItem.type === 'action') {
      setLocalIds(raw.filter((id) => allowed.has(id)).sort((a, b) => a - b))
    } else {
      setLocalIds(raw.sort((a, b) => a - b))
    }
    setEditLabel(String(fiturItem.label ?? '').trim() ? fiturItem.label : '')
    setEditIconKey(fiturItem.icon_key != null && String(fiturItem.icon_key).trim() !== '' ? String(fiturItem.icon_key) : '')
    setEditGroupLabel(String(fiturItem.group_label ?? ''))
    setEditSortOrder(String(fiturItem.sort_order ?? 0))
  }, [isOpen, fiturItem, roles])

  const toggle = (roleId) => {
    setLocalIds((prev) => {
      const i = prev.indexOf(roleId)
      if (i >= 0) return prev.filter((id) => id !== roleId).sort((a, b) => a - b)
      return [...prev, roleId].sort((a, b) => a - b)
    })
  }

  const selectAll = () => {
    setLocalIds(roles.map((r) => r.id).sort((a, b) => a - b))
  }

  const clearAll = () => setLocalIds([])

  const handleSave = async () => {
    if (!fiturItem?.id) return
    const labelTrim = editLabel.trim()
    if (!labelTrim) {
      showNotification('Label wajib diisi', 'error')
      return
    }
    const sortNum = parseInt(String(editSortOrder).trim(), 10)
    const sortOrder = Number.isFinite(sortNum) ? sortNum : 0

    setSaving(true)
    try {
      const res = await settingsAPI.patchEbeddienMenuFiturItem(fiturItem.id, {
        role_ids: localIds,
        label: labelTrim,
        icon_key: editIconKey.trim(),
        group_label: editGroupLabel.trim(),
        sort_order: sortOrder
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
        return
      }
      showNotification(res.message || 'Disimpan', 'success')
      if (res.data && onAfterSave) {
        onAfterSave(fiturItem.id, res.data)
      }
      useAuthStore.getState().fetchFiturMenu().catch(() => {})
      onClose()
    } catch (err) {
      showNotification(err.response?.data?.message || err.message || 'Gagal menyimpan', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen && !showPortal) return null

  const datalistId = 'fitur-offcanvas-group-suggestions'

  const content = (
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && fiturItem && (
        <Fragment key="fitur-menu-offcanvas">
          <datalist id={datalistId}>
            {GROUP_ORDER.map((g) => (
              <option key={g} value={g} />
            ))}
            <option value="Lainnya" />
          </datalist>
          <motion.div
            key="fitur-menu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
          />
          <motion.div
            key="fitur-menu-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[201] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 -ml-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
                    aria-label="Kembali"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight leading-snug">
                      {fiturItem.type === 'action' ? 'Aksi / widget' : 'Menu'}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mt-0.5" title={fiturItem.path || '—'}>
                      {fiturItem.path && String(fiturItem.path).trim() !== '' ? fiturItem.path : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">{fiturItem.code}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Tampilan (database)</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Label, ikon, grup sidebar, dan urutan disimpan di tabel app___fitur.
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label htmlFor="fitur-edit-label" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Label
                    </label>
                    <input
                      id="fitur-edit-label"
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label htmlFor="fitur-edit-icon" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Icon key
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="fitur-edit-icon"
                        type="text"
                        value={editIconKey}
                        onChange={(e) => setEditIconKey(e.target.value)}
                        placeholder="home, dashboard, calendar…"
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white font-mono"
                        maxLength={64}
                      />
                      <span className="shrink-0 w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                        {getIcon(editIconKey || 'home', 'w-5 h-5')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="fitur-edit-group" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Grup sidebar
                    </label>
                    <input
                      id="fitur-edit-group"
                      type="text"
                      value={editGroupLabel}
                      onChange={(e) => setEditGroupLabel(e.target.value)}
                      list={datalistId}
                      placeholder="My Workspace, UWABA, …"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
                      maxLength={128}
                    />
                  </div>
                  <div>
                    <label htmlFor="fitur-edit-sort" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Urutan (sort_order)
                    </label>
                    <input
                      id="fitur-edit-sort"
                      type="number"
                      value={editSortOrder}
                      onChange={(e) => setEditSortOrder(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {fiturItem.type === 'action' && parentMenuLabel ? (
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed px-0.5">
                  Daftar role dibatasi ke yang sudah diaktifkan pada menu induk:{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">{parentMenuLabel}</span>.
                </p>
              ) : null}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </span>
                    Role yang boleh akses
                  </h4>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    >
                      Kosong
                    </button>
                  </div>
                </div>
                <ul className="p-3 space-y-1 max-h-[min(52vh,28rem)] overflow-y-auto">
                  {roles.length === 0 ? (
                    <li className="text-sm text-gray-500 dark:text-gray-400 text-center py-6 px-2">
                      {fiturItem.type === 'action' && parentMenuLabel
                        ? `Belum ada role pada menu induk "${parentMenuLabel}". Atur centang role di menu tersebut dulu.`
                        : 'Tidak ada data role'}
                    </li>
                  ) : (
                    roles.map((r) => {
                      const on = localIds.includes(r.id)
                      return (
                        <li key={r.id}>
                          <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-600/50 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(r.id)}
                              className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 w-4 h-4 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{r.label}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{r.key}</p>
                            </div>
                          </label>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
