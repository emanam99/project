import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './RumusAutocompleteTextarea.css'
import {
  parseAnyRumusMention,
  filterRumusSuggestions,
  filterPengurusFieldsForRumus,
  filterFunctionSuggestions,
  parseFunctionTyping,
  parseFormulaArgContext,
  buildFormulaHighlightSegments,
  escapeHtmlRumus,
  rumusRefPrefix
} from './bisyarohRumusSuggest'

function measureCaretInTextarea(textarea, pos) {
  try {
    const cs = window.getComputedStyle(textarea)
    const props = [
      'boxSizing',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'textIndent',
      'whiteSpace',
      'wordSpacing',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'lineHeight',
      'textAlign',
      'direction'
    ]

    const shell = document.createElement('div')
    shell.setAttribute('aria-hidden', 'true')
    shell.style.position = 'fixed'
    shell.style.left = '0'
    shell.style.top = '0'
    shell.style.pointerEvents = 'none'
    shell.style.visibility = 'hidden'
    shell.style.overflow = 'hidden'
    shell.style.zIndex = '-1'
    shell.style.margin = '0'
    shell.style.boxSizing = 'border-box'

    const taRect = textarea.getBoundingClientRect()
    shell.style.width = `${taRect.width}px`
    shell.style.height = `${taRect.height}px`
    shell.style.transform = `translate(${taRect.left}px, ${taRect.top}px)`

    const inner = document.createElement('div')
    inner.style.position = 'absolute'
    const bL = parseFloat(cs.borderLeftWidth) || 0
    const bT = parseFloat(cs.borderTopWidth) || 0
    inner.style.left = `${bL}px`
    inner.style.top = `${bT}px`
    inner.style.whiteSpace = 'pre-wrap'
    inner.style.overflowWrap = 'break-word'
    inner.style.wordWrap = 'break-word'
    inner.style.overflow = 'visible'
    inner.style.width = `${textarea.clientWidth}px`
    inner.style.marginTop = `-${textarea.scrollTop}px`
    inner.style.marginLeft = `-${textarea.scrollLeft}px`
    for (const p of props) {
      inner.style[p] = cs[p]
    }

    const before = document.createTextNode(textarea.value.slice(0, pos))
    const marker = document.createElement('span')
    marker.textContent = textarea.value.slice(pos, pos + 1) || '\u200b'
    inner.appendChild(before)
    inner.appendChild(marker)
    shell.appendChild(inner)
    document.body.appendChild(shell)

    const mr = marker.getBoundingClientRect()
    document.body.removeChild(shell)

    const lh = parseFloat(cs.lineHeight)
    const lineH = Number.isFinite(lh) && lh > 0 ? lh : mr.height || 16
    return { top: mr.top + lineH + 2, left: mr.left }
  } catch {
    const r = textarea.getBoundingClientRect()
    return { top: r.bottom + 4, left: r.left }
  }
}

function buildMentionMenu(text, pos, suggestions, pengurusFields, jabatanFields, pjFields) {
  const open = parseAnyRumusMention(text, pos)
  if (!open) return null
  let list = []
  if (open.kind === 'pengurus') {
    list = filterPengurusFieldsForRumus(pengurusFields, open.filter)
  } else if (open.kind === 'jabatan') {
    list = filterPengurusFieldsForRumus(jabatanFields, open.filter)
  } else if (open.kind === 'pj' || open.kind === 'pengurus_jabatan') {
    list = filterPengurusFieldsForRumus(pjFields, open.filter)
  } else {
    list = filterRumusSuggestions(suggestions, open.filter)
  }
  if (list.length === 0) return null
  return { type: 'mention', ...open, list }
}

function buildFunctionMenu(text, pos) {
  const open = parseFunctionTyping(text, pos)
  if (!open) return null
  const list = filterFunctionSuggestions(open.filter)
  if (list.length === 0) return null
  return { type: 'function', ...open, list }
}

function displayRef(kind, colKey) {
  if (kind === 'kolom') return `@[${colKey}]`
  return `${rumusRefPrefix(kind)}${colKey}]`
}

function menuAriaLabel(kind) {
  if (kind === 'pengurus') return 'Field pengurus'
  if (kind === 'jabatan') return 'Field jabatan'
  if (kind === 'pj' || kind === 'pengurus_jabatan') return 'Field penugasan jabatan'
  return 'Kolom rekap'
}

function FormulaTooltip({ ctx, coords }) {
  if (!ctx) return null
  const { fnName, fnDesc, argIndex, argTotal, argLabel, signatureParts } = ctx
  const posLabel =
    argTotal != null
      ? `Argumen ${argIndex + 1} dari ${argTotal}`
      : `Argumen ${argIndex + 1}`

  return (
    <div
      className="rumus-formula-tooltip fixed z-[249] max-w-[min(100vw-16px,420px)] rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-gray-800 shadow-lg px-3 py-2 text-[11px]"
      style={{
        top: Math.max(8, Math.min(coords.top, window.innerHeight - 120)),
        left: Math.max(8, Math.min(coords.left, window.innerWidth - 428))
      }}
      role="status"
      aria-live="polite"
    >
      <p className="font-semibold text-teal-800 dark:text-teal-200 mb-1 leading-relaxed">
        <span>{fnName}(</span>
        {signatureParts.map((p, i) => (
          <span key={`${p.label}-${i}`}>
            {i > 0 ? '; ' : ''}
            <span className={p.argIndex === argIndex ? 'font-bold text-gray-900 dark:text-white' : ''}>
              {p.label}
            </span>
          </span>
        ))}
        <span>)</span>
      </p>
      <p className="text-gray-600 dark:text-gray-300">
        <span className="font-medium text-gray-800 dark:text-gray-100">{posLabel}:</span> {argLabel}
      </p>
      {fnDesc ? <p className="text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{fnDesc}</p> : null}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Pemisah argumen: titik koma (;)</p>
    </div>
  )
}

/**
 * Editor rumus: highlight argumen aktif, tooltip fungsi, autocomplete @ dan nama fungsi.
 */
export default function RumusAutocompleteTextarea({
  value,
  onChange,
  suggestions = [],
  pengurusFields = [],
  jabatanFields = [],
  pjFields = [],
  rows = 3,
  placeholder,
  className = '',
  id
}) {
  const taRef = useRef(null)
  const [menu, setMenu] = useState(null)
  const [tooltipCoords, setTooltipCoords] = useState(null)
  const [cursorPos, setCursorPos] = useState(0)
  const menuRef = useRef(null)

  const argCtx = useMemo(() => parseFormulaArgContext(value, cursorPos), [value, cursorPos])
  const highlightSegments = useMemo(
    () => buildFormulaHighlightSegments(value, cursorPos),
    [value, cursorPos]
  )

  const closeMenu = useCallback(() => {
    menuRef.current = null
    setMenu(null)
  }, [])

  const syncCursor = useCallback(() => {
    const ta = taRef.current
    const pos = ta?.selectionStart ?? value.length
    setCursorPos(pos)
    if (ta) {
      setTooltipCoords(measureCaretInTextarea(ta, pos))
    }
  }, [value])

  const openMenusAt = useCallback(
    (text, pos, prevMenu) => {
      const ta = taRef.current
      if (!ta) return

      const mention = buildMentionMenu(text, pos, suggestions, pengurusFields, jabatanFields, pjFields)
      if (mention) {
        const coords = measureCaretInTextarea(ta, pos)
        const active =
          prevMenu?.type === 'mention' &&
          prevMenu.start === mention.start &&
          prevMenu.filter === mention.filter &&
          prevMenu.kind === mention.kind
            ? Math.min(prevMenu.active, mention.list.length - 1)
            : 0
        const next = { ...mention, active, coords }
        menuRef.current = next
        setMenu(next)
        return
      }

      const fnMenu = buildFunctionMenu(text, pos)
      if (fnMenu) {
        const coords = measureCaretInTextarea(ta, pos)
        const active =
          prevMenu?.type === 'function' &&
          prevMenu.start === fnMenu.start &&
          prevMenu.filter === fnMenu.filter
            ? Math.min(prevMenu.active, fnMenu.list.length - 1)
            : 0
        const next = { ...fnMenu, active, coords }
        menuRef.current = next
        setMenu(next)
        return
      }

      closeMenu()
    },
    [suggestions, pengurusFields, jabatanFields, pjFields, closeMenu]
  )

  const syncFromDom = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const pos = ta.selectionStart ?? value.length
    setCursorPos(pos)
    setTooltipCoords(measureCaretInTextarea(ta, pos))
    openMenusAt(value, pos, menuRef.current)
  }, [value, openMenusAt])

  const applyMentionPick = useCallback(
    (colKey) => {
      const ta = taRef.current
      const m = menuRef.current
      if (!ta || !m || m.type !== 'mention') return
      const { start, filter, kind } = m
      const prefix = rumusRefPrefix(kind)
      const end = start + prefix.length + filter.length
      const insert = `${prefix}${colKey}]`
      const nextVal = value.slice(0, start) + insert + value.slice(end)
      onChange(nextVal)
      closeMenu()
      requestAnimationFrame(() => {
        const el = taRef.current
        if (!el) return
        const c = start + insert.length
        el.focus()
        el.setSelectionRange(c, c)
        setCursorPos(c)
      })
    },
    [value, onChange, closeMenu]
  )

  const applyFunctionPick = useCallback(
    (insertName) => {
      const ta = taRef.current
      const m = menuRef.current
      if (!ta || !m || m.type !== 'function') return
      const { start, filter } = m
      const end = start + filter.length
      const insert = `${insertName}(`
      const nextVal = value.slice(0, start) + insert + value.slice(end)
      onChange(nextVal)
      closeMenu()
      requestAnimationFrame(() => {
        const el = taRef.current
        if (!el) return
        const c = start + insert.length
        el.focus()
        el.setSelectionRange(c, c)
        setCursorPos(c)
      })
    },
    [value, onChange, closeMenu]
  )

  useEffect(() => {
    if (!menu) return
    const onDoc = (e) => {
      if (taRef.current?.contains(e.target)) return
      if (e.target.closest?.('[data-rumus-formula-menu]')) return
      closeMenu()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu, closeMenu])

  useEffect(() => {
    if (!menu) return
    const reposition = () => {
      const ta = taRef.current
      const m = menuRef.current
      if (!ta || !m) return
      const pos = ta.selectionStart ?? value.length
      const coords = measureCaretInTextarea(ta, pos)
      menuRef.current = { ...m, coords }
      setMenu((prev) => (prev ? { ...prev, coords } : prev))
      setTooltipCoords(coords)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [menu, value])

  const onKeyDown = useCallback(
    (e) => {
      const m = menuRef.current
      if (!m || !m.list.length) return

      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const active = Math.min(m.active + 1, m.list.length - 1)
        menuRef.current = { ...m, active }
        setMenu({ ...m, active })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const active = Math.max(m.active - 1, 0)
        menuRef.current = { ...m, active }
        setMenu({ ...m, active })
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        if (m.type === 'mention') {
          const pick = m.list[m.active]
          if (pick) applyMentionPick(pick.col_key)
        } else if (m.type === 'function') {
          const pick = m.list[m.active]
          if (pick) applyFunctionPick(pick.insertName)
        }
      }
    },
    [closeMenu, applyMentionPick, applyFunctionPick]
  )

  const backdropClass = className.replace(/\bresize-\w+\b/g, '').trim()

  return (
    <div className="rumus-formula-editor">
      <div
        className={`rumus-formula-backdrop font-mono text-xs ${backdropClass}`}
        aria-hidden
        dangerouslySetInnerHTML={{
          __html: value
            ? highlightSegments
                .map((seg) => {
                  const cls = seg.bold ? 'rumus-seg-active' : 'rumus-seg'
                  return `<span class="${cls}">${escapeHtmlRumus(seg.text)}</span>`
                })
                .join('')
            : ''
        }}
      />
      <textarea
        ref={taRef}
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className={`rumus-formula-input font-mono text-xs ${className}`}
        onChange={(e) => {
          let next = e.target.value
          next = next.replace(/\uFF1B/g, ';').replace(/\u037E/g, ';').replace(/\u061B/g, ';')
          const pos = e.target.selectionStart ?? next.length
          onChange(next)
          setCursorPos(pos)
          requestAnimationFrame(() => {
            const ta = taRef.current
            if (!ta) return
            setTooltipCoords(measureCaretInTextarea(ta, pos))
            openMenusAt(next, pos, menuRef.current)
          })
        }}
        onKeyDown={onKeyDown}
        onClick={syncFromDom}
        onKeyUp={syncFromDom}
        onSelect={syncFromDom}
        onScroll={syncFromDom}
        onFocus={syncFromDom}
        autoComplete="off"
        spellCheck={false}
      />
      {argCtx &&
        tooltipCoords &&
        typeof document !== 'undefined' &&
        createPortal(<FormulaTooltip ctx={argCtx} coords={tooltipCoords} />, document.body)}
      {menu &&
        menu.list.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            data-rumus-formula-menu
            role="listbox"
            aria-label={menu.type === 'function' ? 'Fungsi rumus' : menuAriaLabel(menu.kind)}
            className="fixed z-[250] max-h-52 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl py-1 min-w-[220px] max-w-[min(100vw-16px,320px)]"
            style={{
              top: Math.max(8, Math.min(menu.coords.top, window.innerHeight - 220)),
              left: Math.max(8, Math.min(menu.coords.left, window.innerWidth - 328))
            }}
          >
            {menu.type === 'function'
              ? menu.list.map((item, i) => (
                  <li key={item.insertName} role="option" aria-selected={i === menu.active}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 text-xs ${
                        i === menu.active
                          ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100'
                          : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/80'
                      }`}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => applyFunctionPick(item.insertName)}
                      onMouseEnter={() => {
                        menuRef.current = { ...menuRef.current, active: i }
                        setMenu((prev) => (prev ? { ...prev, active: i } : prev))
                      }}
                    >
                      <span className="font-mono font-semibold">{item.insertName}</span>
                      <span className="block text-[10px] font-sans text-gray-500 dark:text-gray-400 truncate">
                        {item.fn.args.join('; ')}
                      </span>
                    </button>
                  </li>
                ))
              : menu.list.map((s, i) => (
                  <li key={`${menu.kind}-${s.col_key}`} role="option" aria-selected={i === menu.active}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 text-xs font-mono flex flex-col gap-0.5 ${
                        i === menu.active
                          ? 'bg-teal-50 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100'
                          : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/80'
                      }`}
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => applyMentionPick(s.col_key)}
                      onMouseEnter={() => {
                        if (!menuRef.current) return
                        menuRef.current = { ...menuRef.current, active: i }
                        setMenu((prev) => (prev ? { ...prev, active: i } : prev))
                      }}
                    >
                      <span>{displayRef(menu.kind, s.col_key)}</span>
                      <span className="text-[10px] font-sans text-gray-500 dark:text-gray-400 truncate">
                        {s.label}
                      </span>
                    </button>
                  </li>
                ))}
          </ul>,
          document.body
        )}
    </div>
  )
}
