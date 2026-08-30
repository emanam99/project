import { useCallback, useEffect, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import { resolveWiridTitle } from '../utils/wiridTitle'

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

function WiridTitleRow({
  row,
  index,
  total,
  disabled,
  titleLang,
  onDragEnd,
  onMoveTo,
  onOpen,
}) {
  const dragControls = useDragControls()
  const [orderInput, setOrderInput] = useState(String(index + 1))
  const title = resolveWiridTitle(row, titleLang)
  const isArab = titleLang === 'ar'

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
      value={row}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="nm-wirid-title-list__item"
    >
      <div className="nm-wirid-title-list__controls">
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(event) => !disabled && dragControls.start(event)}
          className="nm-wirid-title-list__drag"
          title="Tarik untuk pindah urutan"
          aria-label={`Geser urutan ${title || row.id}`}
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
          className="nm-wirid-title-list__order-input"
          title="Ketik nomor urut (1 = atas)"
          aria-label={`Urutan ${title || row.id}`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpen(row)}
        className={`nm-wirid-title-list__link${isArab ? ' nm-wirid-title-list__link--ar' : ''}`}
      >
        <span className="nm-wirid-title-list__index" aria-hidden>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          className={`nm-wirid-title-list__label${isArab ? ' nm-wirid-title-list__label--ar' : ''}`}
          dir={isArab ? 'rtl' : undefined}
          lang={isArab ? 'ar' : 'id'}
        >
          {title || '—'}
        </span>
        <span className="nm-wirid-title-list__chevron" aria-hidden>
          ›
        </span>
      </button>
    </Reorder.Item>
  )
}

export default function NailulMurodWiridReorderList({
  babName,
  rows = [],
  disabled = false,
  titleLang = 'id',
  onPersistOrder,
  onOpen,
}) {
  const [draft, setDraft] = useState(rows)
  const baselineKeyRef = useRef('')
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    const key = (rows || []).map((r) => `${r.id}:${r.urutan}`).join(',')
    if (key !== baselineKeyRef.current) {
      baselineKeyRef.current = key
      setDraft((prev) => {
        const prevKey = prev.map((r) => `${r.id}:${r.urutan}`).join(',')
        if (prevKey === key) return prev
        return rows
      })
    }
  }, [rows])

  const tryPersist = useCallback(
    (ordered) => {
      const prevKey = (rows || []).map((r) => r.id).join(',')
      const nextKey = ordered.map((r) => r.id).join(',')
      if (prevKey !== nextKey) onPersistOrder?.(babName, ordered)
    },
    [babName, rows, onPersistOrder]
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
    return null
  }

  return (
    <div className="nm-wirid-title-list-wrap">
      {!disabled && draft.length > 1 && (
        <p className="nm-wirid-title-list-hint">
          Tarik <span className="font-mono">≡</span> atau ketik nomor urut. Ketuk judul untuk pratinjau.
        </p>
      )}
      <Reorder.Group
        axis="y"
        values={draft}
        onReorder={(newOrder) => {
          draftRef.current = newOrder
          setDraft(newOrder)
        }}
        className="nm-wirid-title-list"
      >
        {draft.map((row, index) => (
          <WiridTitleRow
            key={row.id}
            row={row}
            index={index}
            total={draft.length}
            disabled={disabled}
            titleLang={titleLang}
            onDragEnd={handleDragEnd}
            onMoveTo={handleMoveTo}
            onOpen={onOpen}
          />
        ))}
      </Reorder.Group>
    </div>
  )
}
