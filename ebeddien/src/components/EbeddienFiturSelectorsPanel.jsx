import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { settingsAPI } from '../services/api'

export default function EbeddienFiturSelectorsPanel() {
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [panelError, setPanelError] = useState(null)
  const [editKey, setEditKey] = useState(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setPanelError(null)
    try {
      const res = await settingsAPI.getEbeddienFiturSelectors()
      if (res?.success) {
        setItems(res.data?.items ?? [])
      } else {
        setPanelError(res?.message || 'Gagal memuat selector')
      }
    } catch (e) {
      setPanelError(e.response?.data?.message || e.message || 'Gagal memuat selector')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (expanded) {
      load()
    }
  }, [expanded, load])

  const openEdit = (row) => {
    setModalError(null)
    setEditKey(row.selector_key)
    setEditText(JSON.stringify(row.codes ?? [], null, 2))
  }

  const closeEdit = () => {
    setEditKey(null)
    setEditText('')
    setModalError(null)
  }

  const saveEdit = async () => {
    if (!editKey) return
    let codes
    try {
      codes = JSON.parse(editText)
    } catch {
      setModalError('JSON tidak valid. Harus berupa array string.')
      return
    }
    if (!Array.isArray(codes)) {
      setModalError('Isi harus array JSON, mis. ["menu.x","PREFIX:action."]')
      return
    }
    setSaving(true)
    setModalError(null)
    try {
      const res = await settingsAPI.putEbeddienFiturSelector(editKey, { codes })
      if (!res?.success) {
        setModalError(res?.message || 'Gagal menyimpan')
        return
      }
      closeEdit()
      await load()
    } catch (e) {
      setModalError(e.response?.data?.message || e.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/15 mb-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-amber-100/60 dark:hover:bg-amber-900/25 transition-colors"
        >
          <div>
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">Selector middleware (ebeddien_fitur_selector)</p>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5">
              Daftar kode fitur per route API; menggantikan fallback PHP setelah disimpan. Hati-hati: salah kode bisa memblokir akses.
            </p>
          </div>
          <span className="text-amber-800 dark:text-amber-200 text-sm shrink-0">{expanded ? '▼' : '▶'}</span>
        </button>
        {expanded && (
          <div className="px-4 pb-4 border-t border-amber-200/80 dark:border-amber-800/60">
            {panelError && (
              <p className="text-sm text-red-700 dark:text-red-300 mt-3">{panelError}</p>
            )}
            {loading && !panelError && (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
              </div>
            )}
            {!loading && !panelError && items.length === 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">Belum ada baris di tabel. Jalankan seed EbeddienFiturSelectorSeed.</p>
            )}
            {!loading && !panelError && items.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200/90 dark:border-amber-800/50">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-amber-100/50 dark:bg-amber-900/30 text-left">
                      <th className="px-3 py-2 font-semibold text-amber-950 dark:text-amber-100">Key</th>
                      <th className="px-3 py-2 font-semibold text-amber-950 dark:text-amber-100">Jumlah kode</th>
                      <th className="px-3 py-2 font-semibold text-amber-950 dark:text-amber-100 w-28" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200/60 dark:divide-amber-800/40">
                    {items.map((row) => (
                      <tr key={row.selector_key} className="bg-white/70 dark:bg-gray-900/40">
                        <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">{row.selector_key}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 tabular-nums">{(row.codes || []).length}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline"
                          >
                            Edit JSON
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {editKey != null &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40" role="dialog">
            <div className="bg-white dark:bg-gray-800 w-full sm:max-w-2xl sm:rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 max-h-[90vh] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-mono truncate">{editKey}</h3>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 p-1"
                  aria-label="Tutup"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 flex-1 min-h-0 flex flex-col gap-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Array string JSON (kode persis atau PREFIX:…).</p>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 min-h-[200px] w-full font-mono text-xs p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  spellCheck={false}
                />
                {modalError && <p className="text-sm text-red-600 dark:text-red-400">{modalError}</p>}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveEdit}
                  className="px-3 py-1.5 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
