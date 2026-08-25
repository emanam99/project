import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'
import { useNotification } from '../../../contexts/NotificationContext'
import { cashlessAPI } from '../../../services/api'

function formatRp(n) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}

/**
 * Daftar santri yang memakai batas belanja harian khusus (bukan masal).
 */
export default function BatasHarianOpsionalOffcanvas({ isOpen, onClose, onChanged }) {
  const handleClose = useOffcanvasBackClose(isOpen, onClose)
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [q, setQ] = useState('')

  const load = useCallback(async (search) => {
    setLoading(true)
    try {
      const res = await cashlessAPI.listBatasHarianOpsional(search ? { q: search } : {})
      const list = res?.success && Array.isArray(res.data) ? res.data : []
      setRows(list)
      const next = {}
      list.forEach((r) => {
        next[r.santri_id] = String(Math.round(Number(r.batas_per_hari) || 0))
      })
      setDraft(next)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const t = window.setTimeout(() => {
      void load(q.trim())
    }, q.trim() ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [q, isOpen, load])

  const saveRow = async (row, { aktif = true } = {}) => {
    const santriId = row.santri_id
    const nominal = Math.max(0, Number(draft[santriId]) || 0)
    if (aktif && nominal <= 0) {
      showNotification('Isi batas per hari (Rp) lebih dari 0.', 'error')
      return
    }
    setSavingId(santriId)
    try {
      const res = await cashlessAPI.setSantriBatasHarian(santriId, {
        aktif,
        batas_per_hari: aktif ? nominal : Number(row.batas_per_hari) || 0,
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
        return
      }
      if (aktif) {
        setRows((prev) =>
          prev.map((r) =>
            r.santri_id === santriId
              ? { ...r, batas_per_hari: nominal, aktif: true }
              : r
          )
        )
        showNotification('Batas khusus disimpan.', 'success')
      } else {
        setRows((prev) => prev.filter((r) => r.santri_id !== santriId))
        showNotification('Santri kembali memakai batas masal.', 'success')
      }
      onChanged?.()
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan batas harian', 'error')
    } finally {
      setSavingId(null)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="batas-opsional-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9996] bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />
      <motion.div
        key="batas-opsional-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed inset-y-0 right-0 z-[9997] flex w-full max-w-md flex-col bg-white shadow-xl dark:bg-gray-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batas-opsional-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div>
            <h3 id="batas-opsional-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Batas khusus
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {rows.length} santri memakai batas opsional
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="Tutup"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="shrink-0 border-b border-gray-100 px-4 py-2 dark:border-gray-700">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama atau NIS…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Memuat…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tidak ada santri dengan batas opsional.
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => {
                const busy = savingId === row.santri_id
                const draftVal = draft[row.santri_id] ?? ''
                const dirty = Number(draftVal) !== Math.round(Number(row.batas_per_hari) || 0)
                return (
                  <li
                    key={row.santri_id}
                    className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-900/40"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {row.nama || 'Tanpa nama'}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      NIS {row.nis || '—'}
                      {row.terpakai_hari_ini > 0 ? (
                        <> · hari ini Rp {formatRp(row.terpakai_hari_ini)}</>
                      ) : null}
                    </p>
                    <label className="mt-2 block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      Batas per hari (Rp)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={draftVal}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [row.santri_id]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !dirty}
                        onClick={() => saveRow(row, { aktif: true })}
                        className="flex-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {busy ? 'Menyimpan…' : 'Simpan'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveRow(row, { aktif: false })}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        Pakai masal
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}
