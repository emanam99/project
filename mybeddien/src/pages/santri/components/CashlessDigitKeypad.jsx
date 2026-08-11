import { useEffect, useRef } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'hapus', '0', 'ok']

function isTypingInField(target) {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

function formatRpFromDigits(digits) {
  const n = Number(String(digits || '').replace(/\D/g, '') || 0)
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n)
}

/**
 * Keypad angka on-screen untuk nominal / no wallet.
 * @param {'amount'|'code'} variant
 */
export default function CashlessDigitKeypad({
  value = '',
  maxLength = 9,
  onChange,
  onSubmit,
  disabled = false,
  variant = 'amount',
  submitLabel = 'OK',
  minLength = 1,
}) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, maxLength)
  const digitsRef = useRef(digits)
  const disabledRef = useRef(disabled)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const minLengthRef = useRef(minLength)
  const maxLengthRef = useRef(maxLength)
  const variantRef = useRef(variant)

  digitsRef.current = digits
  disabledRef.current = disabled
  onChangeRef.current = onChange
  onSubmitRef.current = onSubmit
  minLengthRef.current = minLength
  maxLengthRef.current = maxLength
  variantRef.current = variant

  const canSubmit =
    variant === 'code'
      ? digits.length === maxLength
      : digits.length >= minLength && Number(digits) > 0

  const press = (key) => {
    if (disabled) return
    if (key === 'hapus') {
      onChange?.(digits.slice(0, -1))
      return
    }
    if (key === 'ok') {
      if (canSubmit) onSubmit?.(digits)
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
      const max = maxLengthRef.current
      const min = minLengthRef.current
      const mode = variantRef.current

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onChangeRef.current?.(current.slice(0, -1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const ok = mode === 'code' ? current.length === max : current.length >= min && Number(current) > 0
        if (ok) onSubmitRef.current?.(current)
        return
      }

      const digit = e.key.length === 1 && /\d/.test(e.key) ? e.key : null
      if (!digit) return
      e.preventDefault()
      if (current.length >= max) return
      onChangeRef.current?.(current + digit)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/80">
        {variant === 'code' ? (
          <p className="font-mono text-2xl font-semibold tracking-[0.2em] text-gray-900 dark:text-white">
            {digits.padEnd(maxLength, '·').slice(0, maxLength)}
          </p>
        ) : (
          <p className="font-mono text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {formatRpFromDigits(digits)}
          </p>
        )}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {KEYS.map((key) => {
          const isAction = key === 'hapus' || key === 'ok'
          const label = key === 'hapus' ? '⌫' : key === 'ok' ? submitLabel : key
          const okDisabled = key === 'ok' && !canSubmit
          return (
            <button
              key={key}
              type="button"
              disabled={disabled || okDisabled}
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
