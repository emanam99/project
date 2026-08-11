import { useEffect, useRef } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'hapus', '0', 'ok']

function isTypingInField(target) {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/**
 * Keypad PIN on-screen.
 * Di PC/laptop: angka, Backspace, dan Enter dari keyboard fisik juga diterima.
 */
export default function PinKeypad({ value = '', maxLength = 6, onChange, onSubmit, disabled = false }) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, maxLength)
  const digitsRef = useRef(digits)
  const disabledRef = useRef(disabled)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)

  digitsRef.current = digits
  disabledRef.current = disabled
  onChangeRef.current = onChange
  onSubmitRef.current = onSubmit

  const press = (key) => {
    if (disabled) return
    if (key === 'hapus') {
      onChange?.(digits.slice(0, -1))
      return
    }
    if (key === 'ok') {
      if (digits.length === maxLength) onSubmit?.(digits)
      return
    }
    if (digits.length >= maxLength) return
    onChange?.(digits + key)
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (disabledRef.current) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingInField(e.target)) return

      const current = digitsRef.current

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onChangeRef.current?.(current.slice(0, -1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (current.length === maxLength) onSubmitRef.current?.(current)
        return
      }

      const digit = e.key.length === 1 && /\d/.test(e.key) ? e.key : null
      if (!digit) return
      e.preventDefault()
      if (current.length >= maxLength) return
      onChangeRef.current?.(current + digit)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [maxLength])

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={`flex h-3 w-3 rounded-full border-2 ${
              i < digits.length
                ? 'border-primary-600 bg-primary-600'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
        ))}
      </div>
      <p className="hidden text-center text-[11px] text-gray-500 dark:text-gray-400 md:block">
        Ketik angka di keyboard · Enter = OK · Backspace = hapus
      </p>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {KEYS.map((key) => {
          const isAction = key === 'hapus' || key === 'ok'
          const label = key === 'hapus' ? '⌫' : key === 'ok' ? 'OK' : key
          return (
            <button
              key={key}
              type="button"
              disabled={disabled || (key === 'ok' && digits.length !== maxLength)}
              onClick={() => press(key)}
              className={`select-none rounded-xl py-3.5 text-lg font-semibold transition active:scale-95 disabled:opacity-40 ${
                isAction
                  ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                  : 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-white dark:ring-gray-600'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
