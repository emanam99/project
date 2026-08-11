import { useCallback, useEffect, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'

/** @param {Array<{ id: number|string }>} list */
function moveRowToPosition(list, rowId, targetOneBased) {
  const n = list.length
  if (n === 0) return list
  const idx = list.findIndex((r) => r.id === rowId)
  if (idx < 0) return list
  let pos = parseInt(String(targetOneBased), 10)
  if (!Number.isFinite(pos)) return list
  pos = Math.max(1, Math.min(n, pos)) - 1
  if (idx === pos) return list
  const next = [...list]
  const [item] = next.splice(idx, 1)
  next.splice(pos, 0, item)
  return next
}

function PengurusUrutanRow({ row, index, total, disabled, onDragEnd, onMoveTo }) {
  const dragControls = useDragControls()
  const [orderInput, setOrderInput] = useState(String(index + 1))

  useEffect(() => {
    setOrderInput(String(index + 1))
  }, [index])

  const commitOrder = useCallback(() => {
    const parsed = parseInt(orderInput, 10)
    if (!Number.isFinite(parsed)) {
      setOrderInput(String(index + 1))
      return
    }
    const clamped = Math.max(1, Math.min(total, parsed))
    setOrderInput(String(clamped))
    if (clamped !== index + 1) {
      onMoveTo(row.id, clamped)
    }
  }, [orderInput, index, total, row.id, onMoveTo])

  return (
    <Reorder.Item
      as="tr"
      value={row}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <td className="py-2 pr-2 align-middle">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onPointerDown={(event) => !disabled && dragControls.start(event)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 cursor-grab active:cursor-grabbing"
            title="Tarik untuk pindah urutan"
            aria-label={`Geser urutan ${row.nama || row.id}`}
            style={{ touchAction: 'none' }}
          >
            ≡
          </button>
          <input
            type="number"
            min={1}
            max={total}
            value={orderInput}
            disabled={disabled}
            onChange={(e) => setOrderInput(e.target.value)}
            onBlur={commitOrder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitOrder()
                e.currentTarget.blur()
              }
            }}
            className="w-11 h-7 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-center tabular-nums text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
            title="Ketik nomor urut (1 = atas), Enter atau klik luar untuk menerapkan"
            aria-label={`Urutan ${row.nama || row.id}`}
          />
        </div>
      </td>
      <td className="py-2 pr-2 text-sm">{row.nama || '—'}</td>
      <td className="py-2 pr-2 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate" title={row.jabatan_label}>
        {row.jabatan_label || '—'}
      </td>
      <td className="py-2 pr-2 font-mono text-xs text-gray-600 dark:text-gray-300">{row.nip || '—'}</td>
    </Reorder.Item>
  )
}

export default function BisyarohPengurusUrutanList({
  rows = [],
  disabled = false,
  onPersistOrder,
}) {
  const [draft, setDraft] = useState(rows)
  const baselineKeyRef = useRef('')
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    const key = (rows || []).map((r) => r.id).join(',')
    if (key !== baselineKeyRef.current) {
      baselineKeyRef.current = key
      setDraft((prev) => {
        const prevKey = prev.map((r) => r.id).join(',')
        if (prevKey === key) return prev
        return rows
      })
    }
  }, [rows])

  const tryPersist = useCallback(
    (ordered) => {
      const prevKey = (rows || []).map((r) => r.id).join(',')
      const nextKey = ordered.map((r) => r.id).join(',')
      if (prevKey !== nextKey) onPersistOrder?.(ordered)
    },
    [rows, onPersistOrder]
  )

  const applyOrder = useCallback(
    (next) => {
      setDraft(next)
      tryPersist(next)
    },
    [tryPersist]
  )

  const handleDragEnd = useCallback(() => {
    tryPersist(draftRef.current)
  }, [tryPersist])

  const handleMoveTo = useCallback(
    (rowId, targetOneBased) => {
      const next = moveRowToPosition(draftRef.current, rowId, targetOneBased)
      applyOrder(next)
    },
    [applyOrder]
  )

  if (draft.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada pengurus aktif di lembaga ini.</p>
    )
  }

  return (
    <div>
      {!disabled && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Tarik <span className="font-mono">≡</span> atau ketik <strong>nomor urut</strong> (mis. 1 = paling atas), lalu Enter
          / klik di luar kolom. Urutan tersimpan per lembaga.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600 text-left">
              <th className="py-2 pr-2 w-24">Urut</th>
              <th className="py-2 pr-2">Nama</th>
              <th className="py-2 pr-2">Jabatan</th>
              <th className="py-2 pr-2">NIP</th>
            </tr>
          </thead>
          <Reorder.Group
            as="tbody"
            axis="y"
            values={draft}
            onReorder={(newOrder) => {
              draftRef.current = newOrder
              setDraft(newOrder)
            }}
          >
            {draft.map((row, index) => (
              <PengurusUrutanRow
                key={row.id}
                row={row}
                index={index}
                total={draft.length}
                disabled={disabled}
                onDragEnd={handleDragEnd}
                onMoveTo={handleMoveTo}
              />
            ))}
          </Reorder.Group>
        </table>
      </div>
    </div>
  )
}
