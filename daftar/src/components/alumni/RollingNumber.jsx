import { useEffect, useState } from 'react'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/**
 * Satu digit yang roll ke atas saat berubah.
 */
function RollingDigit({ digit, sizeClass }) {
  const d = Number(digit) || 0
  return (
    <span
      className={`relative inline-block overflow-hidden ${sizeClass}`}
      style={{ height: '1em', width: '0.62em', lineHeight: 1 }}
    >
      <span
        className="absolute left-0 top-0 flex flex-col will-change-transform"
        style={{
          transform: `translateY(-${d * 10}%)`,
          transition: 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block h-[1em] text-center" style={{ lineHeight: 1 }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * Angka dengan animasi roll per digit (naik ke atas).
 */
export default function RollingNumber({ value, className = '', size = 'md' }) {
  const n = Math.max(0, Math.floor(Number(value) || 0))
  const [digits, setDigits] = useState(() => String(n).split(''))

  useEffect(() => {
    setDigits(String(n).split(''))
  }, [n])

  const sizeClass =
    size === 'lg'
      ? 'text-4xl sm:text-5xl font-bold'
      : size === 'sm'
        ? 'text-lg font-semibold'
        : 'text-2xl font-bold'

  return (
    <span
      className={`inline-flex items-center tabular-nums tracking-tight text-teal-700 dark:text-teal-300 ${sizeClass} ${className}`}
      aria-label={n.toLocaleString('id-ID')}
    >
      {digits.map((d, i) => (
        <RollingDigit key={`${digits.length}-${i}`} digit={d} sizeClass="" />
      ))}
    </span>
  )
}
