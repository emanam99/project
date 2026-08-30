import { useCallback, useEffect, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { resolveBabName } from '../utils/wiridTitle'

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

function BabUrutanRow({
  row,
  index,
  total,
  disabled,
  titleLang,
  onDragEnd,
  onMoveTo,
  onRename,
  onDelete,
  deletingId,
}) {
  const dragControls = useDragControls()
  const [orderInput, setOrderInput] = useState(String(index + 1))
  const [editing, setEditing] = useState(false)
  const [namaIdInput, setNamaIdInput] = useState(row.nama_id ?? row.nama ?? '')
  const [namaArInput, setNamaArInput] = useState(row.nama_ar ?? row.nama ?? '')
  const displayName = resolveBabName(row, titleLang)
  const isArab = titleLang === 'ar'
  const canDelete = (row.jumlah_entri ?? 0) === 0

  useEffect(() => {
    setOrderInput(String(index + 1))
  }, [index])

  useEffect(() => {
    if (!editing) {
      setNamaIdInput(row.nama_id ?? row.nama ?? '')
      setNamaArInput(row.nama_ar ?? row.nama ?? '')
    }
  }, [row.nama, row.nama_id, row.nama_ar, editing])

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

  const commitRename = useCallback(() => {
    const id = String(namaIdInput).trim()
    const ar = String(namaArInput).trim()
    setEditing(false)
    const prevId = String(row.nama_id ?? row.nama ?? '').trim()
    const prevAr = String(row.nama_ar ?? row.nama ?? '').trim()
    if ((id || ar) && (id !== prevId || ar !== prevAr)) {
      onRename(row.id, { nama_id: id, nama_ar: ar })
    } else {
      setNamaIdInput(row.nama_id ?? row.nama ?? '')
      setNamaArInput(row.nama_ar ?? row.nama ?? '')
    }
  }, [namaArInput, namaIdInput, onRename, row])

  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="flex items-start gap-2 py-2 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(event) => !disabled && dragControls.start(event)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 cursor-grab active:cursor-grabbing"
          title="Tarik untuk pindah urutan"
          aria-label={`Geser urutan ${displayName || row.id}`}
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
          title="Ketik nomor urut (1 = atas)"
          aria-label={`Urutan ${displayName || row.id}`}
        />
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-1.5">
            <input
              type="text"
              value={namaIdInput}
              disabled={disabled}
              onChange={(e) => setNamaIdInput(e.target.value)}
              placeholder="Nama Indonesia"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <input
              type="text"
              value={namaArInput}
              disabled={disabled}
              onChange={(e) => setNamaArInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                }
                if (e.key === 'Escape') {
                  setEditing(false)
                  setNamaIdInput(row.nama_id ?? row.nama ?? '')
                  setNamaArInput(row.nama_ar ?? row.nama ?? '')
                }
              }}
              placeholder="Nama Arab"
              dir="rtl"
              lang="ar"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            className={`w-full text-left text-sm text-gray-900 dark:text-gray-100 truncate hover:text-teal-600 dark:hover:text-teal-400 disabled:opacity-50${
              isArab ? ' text-right' : ''
            }`}
            dir={isArab ? 'rtl' : undefined}
            lang={isArab ? 'ar' : 'id'}
            title="Klik untuk ubah nama bab (ID & Arab)"
          >
            {displayName || '—'}
          </button>
        )}
      </div>

      <span
        className="shrink-0 text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 mt-0.5"
        title="Jumlah entri wirid"
      >
        {row.jumlah_entri ?? 0}
      </span>

      <button
        type="button"
        disabled={disabled || !canDelete || deletingId === row.id}
        onClick={() => onDelete(row)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-50 dark:hover:bg-red-950/30 mt-0.5"
        title={
          canDelete
            ? 'Hapus bab'
            : `Bab masih berisi ${row.jumlah_entri} entri. Hapus atau pindahkan entri dulu.`
        }
        aria-label={`Hapus bab ${displayName}`}
      >
        {deletingId === row.id ? (
          <span className="text-xs">…</span>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>
    </Reorder.Item>
  )
}

export default function NailulMurodBabReorderList({
  rows = [],
  disabled = false,
  titleLang = 'id',
  onPersistOrder,
  onRename,
  onDelete,
  deletingId = null,
}) {
  const [draft, setDraft] = useState(rows)
  const baselineKeyRef = useRef('')
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    const key = (rows || [])
      .map((r) => `${r.id}:${r.nama}:${r.nama_id}:${r.nama_ar}:${r.jumlah_entri}`)
      .join(',')
    if (key !== baselineKeyRef.current) {
      baselineKeyRef.current = key
      setDraft((prev) => {
        const prevKey = prev
          .map((r) => `${r.id}:${r.nama}:${r.nama_id}:${r.nama_ar}:${r.jumlah_entri}`)
          .join(',')
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
      <p className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
        Belum ada bab. Tambahkan bab baru di atas.
      </p>
    )
  }

  return (
    <div>
      {!disabled && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Tarik <span className="font-mono">≡</span> atau ketik nomor urut. Klik nama untuk ubah (ID & Arab).
        </p>
      )}
      <Reorder.Group
        axis="y"
        values={draft}
        onReorder={(newOrder) => {
          draftRef.current = newOrder
          setDraft(newOrder)
        }}
        className="divide-y divide-gray-100 dark:divide-gray-700"
      >
        {draft.map((row, index) => (
          <BabUrutanRow
            key={row.id}
            row={row}
            index={index}
            total={draft.length}
            disabled={disabled}
            titleLang={titleLang}
            onDragEnd={handleDragEnd}
            onMoveTo={handleMoveTo}
            onRename={onRename}
            onDelete={onDelete}
            deletingId={deletingId}
          />
        ))}
      </Reorder.Group>
    </div>
  )
}
