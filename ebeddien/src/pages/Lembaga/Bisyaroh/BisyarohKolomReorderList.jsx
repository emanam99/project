import { useCallback, useEffect, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { labelBisyarohKolomTipe } from './bisyarohKolomTipe'

export function sortKolomRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const oa = Number(a.sort_order) || 0
    const ob = Number(b.sort_order) || 0
    if (oa !== ob) return oa - ob
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })
}

function KolomTableRow({
  row,
  index,
  disabled,
  canEdit,
  onDragEnd,
  onEdit,
  onDelete,
}) {
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      as="tr"
      value={row}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <td className="py-2 pr-2 w-16 align-middle">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onPointerDown={(event) => !disabled && dragControls.start(event)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 disabled:opacity-40 cursor-grab active:cursor-grabbing"
            title="Tarik untuk pindah urutan"
            aria-label={`Geser urutan kolom ${row.label}`}
            style={{ touchAction: 'none' }}
          >
            ≡
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-5 text-center">{index + 1}</span>
        </div>
      </td>
      <td className="py-2 pr-2 font-mono text-xs">@{row.col_key}</td>
      <td className="py-2 pr-2">{row.label}</td>
      <td className="py-2 pr-2">
        {row.kind === 'formula' ? (
          <span className="text-purple-600 dark:text-purple-400">
            Rumus · {labelBisyarohKolomTipe(row.input_tipe)}
          </span>
        ) : (
          <span className="text-blue-600 dark:text-blue-400">Input · {labelBisyarohKolomTipe(row.input_tipe)}</span>
        )}
      </td>
      <td className="py-2 pr-2">{row.masuk_total ? 'Σ Ya' : '○ Tidak'}</td>
      <td className="py-2 pr-2 max-w-xs text-xs text-gray-600 dark:text-gray-300 truncate" title={row.keterangan}>
        {row.keterangan || '—'}
      </td>
      <td
        className="py-2 pr-2 max-w-md font-mono text-xs truncate"
        title={row.kind === 'formula' ? row.rumus : row.default_nilai}
      >
        {row.kind === 'formula' ? row.rumus || '—' : row.default_nilai || '—'}
      </td>
      <td className="py-2 whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onEdit?.(row)}
            disabled={!canEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50"
            title="Ubah"
            aria-label={`Ubah kolom ${row.label}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(row.id)}
            disabled={!canEdit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            title="Hapus"
            aria-label={`Hapus kolom ${row.label}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </td>
    </Reorder.Item>
  )
}

export default function BisyarohKolomAturanTable({
  rows = [],
  disabled = false,
  canEdit = true,
  onPersistOrder,
  onEdit,
  onDelete,
}) {
  const sorted = sortKolomRows(rows)
  const [draft, setDraft] = useState(sorted)
  const baselineKeyRef = useRef('')

  useEffect(() => {
    const next = sortKolomRows(rows)
    const key = next.map((r) => r.id).join(',')
    if (key !== baselineKeyRef.current) {
      baselineKeyRef.current = key
      setDraft((prev) => {
        const prevKey = prev.map((r) => r.id).join(',')
        if (prevKey === key) return prev
        return next
      })
    }
  }, [rows])

  const tryPersist = useCallback(
    (ordered) => {
      const prevKey = sortKolomRows(rows).map((r) => r.id).join(',')
      const nextKey = ordered.map((r) => r.id).join(',')
      if (prevKey !== nextKey) onPersistOrder?.(ordered)
    },
    [rows, onPersistOrder]
  )

  const handleDragEnd = useCallback(() => {
    tryPersist(draft)
  }, [draft, tryPersist])

  if (draft.length === 0) {
    return (
      <p className="text-sm text-gray-500 mt-2">
        Belum ada kolom. Tambah kolom <strong>input</strong> (hari, jam, fee, …) lalu kolom <strong>rumus</strong> yang merujuk
        @[kunci].
      </p>
    )
  }

  return (
    <div>
      {!disabled && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Tarik <span className="font-mono">≡</span> di kiri baris untuk mengubah urutan kolom di tab Rekap.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-600 text-left">
              <th className="py-2 pr-2 w-16" aria-label="Urutan" />
              <th className="py-2 pr-2">Kunci</th>
              <th className="py-2 pr-2">Judul</th>
              <th className="py-2 pr-2">Jenis</th>
              <th className="py-2 pr-2">Σ Total</th>
              <th className="py-2 pr-2">Keterangan</th>
              <th className="py-2 pr-2">Rumus / default</th>
              <th className="py-2"> </th>
            </tr>
          </thead>
          <Reorder.Group
            as="tbody"
            axis="y"
            values={draft}
            onReorder={setDraft}
          >
            {draft.map((row, index) => (
              <KolomTableRow
                key={row.id}
                row={row}
                index={index}
                disabled={disabled}
                canEdit={canEdit}
                onDragEnd={handleDragEnd}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </Reorder.Group>
        </table>
      </div>
    </div>
  )
}
