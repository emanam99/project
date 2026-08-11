import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Editor teks sederhana (mirip deskripsi jabatan):
 * tebal / miring / underline, bullet / nomor, judul (h2), subjudul (h3).
 */
export default function SimpleRichTextEditor({
  value = '',
  onChange,
  placeholder = 'Tulis di sini…',
  disabled = false,
  className = '',
  editorClassName = '',
  minHeightClass = 'min-h-[100px]',
  maxHeightClass = 'max-h-[220px]',
}) {
  const editorRef = useRef(null)
  const savedSelectionRef = useRef(null)
  const syncingRef = useRef(false)
  const [format, setFormat] = useState({
    bold: false,
    italic: false,
    underline: false,
    bulletList: false,
    numberedList: false,
    heading: '',
  })

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const next = value || ''
    if (el.innerHTML === next) return
    // Jangan timpa saat user sedang mengetik (cegah kursor loncat)
    if (document.activeElement === el) return
    syncingRef.current = true
    el.innerHTML = next
    syncingRef.current = false
  }, [value])

  const emitChange = useCallback(() => {
    const el = editorRef.current
    if (!el || syncingRef.current) return
    onChange?.(el.innerHTML)
  }, [onChange])

  const updateFormatState = useCallback(() => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) {
      setFormat({
        bold: false,
        italic: false,
        underline: false,
        bulletList: false,
        numberedList: false,
        heading: '',
      })
      return
    }
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return

    const bold = document.queryCommandState('bold')
    const italic = document.queryCommandState('italic')
    const underline = document.queryCommandState('underline')
    let node = range.commonAncestorContainer
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
    let bulletList = false
    let numberedList = false
    let heading = ''
    while (node && node !== el) {
      const tag = node.tagName ? node.tagName.toUpperCase() : ''
      if (tag === 'UL') bulletList = true
      if (tag === 'OL') numberedList = true
      if ((tag === 'H2' || tag === 'H3') && !heading) heading = tag.toLowerCase()
      node = node.parentElement
    }
    setFormat({ bold, italic, underline, bulletList, numberedList, heading })
  }, [])

  const saveSelection = useCallback(() => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (el.contains(range.commonAncestorContainer)) {
      savedSelectionRef.current = range.cloneRange()
    }
  }, [])

  const restoreSelection = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (savedSelectionRef.current && sel) {
      try {
        sel.removeAllRanges()
        sel.addRange(savedSelectionRef.current)
      } catch {
        // abaikan
      }
    }
  }, [])

  const runCommand = useCallback(
    (cmd, arg = null) => {
      if (disabled) return
      restoreSelection()
      document.execCommand(cmd, false, arg)
      emitChange()
      setTimeout(updateFormatState, 0)
    },
    [disabled, restoreSelection, emitChange, updateFormatState]
  )

  const applyList = useCallback(
    (isBullet) => {
      if (disabled) return
      const el = editorRef.current
      if (!el) return
      saveSelection()
      const listHtml = isBullet ? '<ul><li>\u200B</li></ul>' : '<ol><li>\u200B</li></ol>'
      setTimeout(() => {
        restoreSelection()
        document.execCommand('insertHTML', false, listHtml)
        emitChange()
        setTimeout(updateFormatState, 0)
      }, 0)
    },
    [disabled, saveSelection, restoreSelection, emitChange, updateFormatState]
  )

  const applyHeading = useCallback(
    (tag) => {
      if (disabled) return
      restoreSelection()
      // Toggle: jika sudah heading yang sama → jadi paragraf biasa
      const current = format.heading
      document.execCommand('formatBlock', false, current === tag ? 'p' : tag)
      emitChange()
      setTimeout(updateFormatState, 0)
    },
    [disabled, format.heading, restoreSelection, emitChange, updateFormatState]
  )

  useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current
      if (el && document.activeElement === el) updateFormatState()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [updateFormatState])

  const btn = (active) =>
    `p-2 rounded text-xs font-medium transition-colors ${
      active
        ? 'bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200'
        : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
    } ${disabled ? 'opacity-50 pointer-events-none' : ''}`

  return (
    <div
      className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent ${className}`}
    >
      <div className="flex flex-wrap gap-0.5 p-1 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
        <button
          type="button"
          title="Tebal"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            runCommand('bold')
          }}
          className={btn(format.bold)}
        >
          B
        </button>
        <button
          type="button"
          title="Miring"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            runCommand('italic')
          }}
          className={`${btn(format.italic)} italic`}
        >
          I
        </button>
        <button
          type="button"
          title="Garis bawah"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            runCommand('underline')
          }}
          className={`${btn(format.underline)} underline`}
        >
          U
        </button>
        <span className="w-px self-stretch bg-gray-300 dark:bg-gray-500 my-1" />
        <button
          type="button"
          title="Judul"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            applyHeading('h2')
          }}
          className={btn(format.heading === 'h2')}
        >
          Judul
        </button>
        <button
          type="button"
          title="Subjudul"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            applyHeading('h3')
          }}
          className={btn(format.heading === 'h3')}
        >
          Sub
        </button>
        <span className="w-px self-stretch bg-gray-300 dark:bg-gray-500 my-1" />
        <button
          type="button"
          title="Daftar bullet"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            applyList(true)
          }}
          className={btn(format.bulletList)}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <circle cx="5" cy="6" r="1.5" />
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="5" cy="18" r="1.5" />
            <path d="M10 6h10M10 12h10M10 18h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          title="Daftar nomor"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault()
            applyList(false)
          }}
          className={btn(format.numberedList)}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M8 6h13M8 12h13M8 18h13" />
            <text x="2" y="7.5" fontSize="5" fontWeight="700" fill="currentColor">
              1
            </text>
            <text x="2" y="13.5" fontSize="5" fontWeight="700" fill="currentColor">
              2
            </text>
            <text x="2" y="19.5" fontSize="5" fontWeight="700" fill="currentColor">
              3
            </text>
          </svg>
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onKeyUp={() => {
          saveSelection()
          updateFormatState()
          emitChange()
        }}
        onMouseUp={() => {
          saveSelection()
          updateFormatState()
        }}
        onInput={emitChange}
        onBlur={saveSelection}
        onFocus={updateFormatState}
        data-placeholder={placeholder}
        className={`deskripsi-rich-text ${minHeightClass} ${maxHeightClass} overflow-y-auto px-4 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-500 ${
          disabled ? 'opacity-70 cursor-not-allowed' : ''
        } ${editorClassName}`}
      />
    </div>
  )
}
