/**
 * Warna bagian @username:
 * - default: sekunder mengikuti tema (gelap/terang), untuk kartu & daftar
 * - onBrand: di atas background brand (mis. header chat teal), kontras dengan putih/teal muda
 */
const USERNAME_VARIANT_CLASS = {
  default:
    'text-gray-600 dark:text-gray-300 font-normal',
  onBrand:
    'text-teal-100/90 dark:text-teal-50/85 font-normal',
}

/**
 * Menampilkan string "nama @username" dengan bagian @username warna sekunder sesuai tema / konteks.
 * @param {string} text - Teks penuh, mis. "Miftah @miftah_user"
 * @param {string} [className] - Kelas untuk wrapper (truncate, font-medium, dll.)
 * @param {'default'|'onBrand'} [variant] - default = netral; onBrand = header teal / primary gelap
 * @param {string} [usernameClassName] - override kelas khusus untuk segmen @username
 */
export function NamaUsernameDisplay({ text, className = '', variant = 'default', usernameClassName }) {
  if (text == null || String(text).trim() === '') return null
  const s = String(text).trim()
  const i = s.indexOf(' @')
  const usernameTone =
    usernameClassName != null && usernameClassName !== ''
      ? usernameClassName
      : USERNAME_VARIANT_CLASS[variant] ?? USERNAME_VARIANT_CLASS.default
  if (i === -1) {
    return <span className={className}>{s}</span>
  }
  return (
    <span className={className}>
      {s.slice(0, i)}
      <span className={usernameTone}>{' '}{s.slice(i + 1)}</span>
    </span>
  )
}
