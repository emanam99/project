import { isNikValid } from '../../../utils/nikUtils'

const asText = (v) => (v == null ? '' : String(v))

const ALLOWED_STATUS = ['active', 'inactive', 'pending', 'aktif', 'tidak aktif']

const DATE_KEYS = new Set([
  'tanggal_lahir',
  'tmt',
  'sejak',
  'masehi',
  'tanggal_dibuat',
  'tanggal_update'
])

const DIGIT_ONLY_KEYS = new Set([
  'nik',
  'no_kk',
  'no_telpon',
  'whatsapp',
  'nidn',
  'nuptk',
  'npk',
  'rekening_jatim',
  'rt',
  'rw',
  'kode_pos'
])

/**
 * Validasi nilai kolom editor Excel Pengurus (nilai sesudah / `to`).
 * @returns {string|null} pesan error atau null jika lolos
 */
export function validatePengurusExcelField(key, rawValue) {
  const v = asText(rawValue).trim()
  if (v === '' || v === '-') return null

  if (key === 'nik') {
    if (/[a-zA-Z]/.test(v)) return 'NIK tidak boleh berisi huruf'
    const digits = v.replace(/\D/g, '')
    if (digits.length !== 16) {
      return digits.length > 16 ? 'NIK maksimal 16 digit' : 'NIK harus 16 digit'
    }
    if (!isNikValid(digits)) return 'NIK tidak valid (format tanggal lahir di NIK salah)'
    return null
  }

  if (key === 'no_kk') {
    if (/[a-zA-Z]/.test(v)) return 'No KK tidak boleh berisi huruf'
    const digits = v.replace(/\D/g, '')
    if (digits.length !== 16) {
      return digits.length > 16 ? 'No KK maksimal 16 digit' : 'No KK harus 16 digit'
    }
    return null
  }

  if (DIGIT_ONLY_KEYS.has(key)) {
    if (/[a-zA-Z]/.test(v)) return 'Hanya angka yang diizinkan (tidak boleh huruf)'
    if (!/^\d+$/.test(v.replace(/\s/g, ''))) return 'Hanya angka yang diizinkan'
    return null
  }

  if (key === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Format email tidak valid'
    return null
  }

  if (key === 'status') {
    if (!ALLOWED_STATUS.includes(v.toLowerCase())) {
      return `Status: ${ALLOWED_STATUS.join(', ')}`
    }
    return null
  }

  if (key === 'grup') {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return 'Grup harus angka bulat positif'
    return null
  }

  if (key === 'jarak') {
    const n = Number(v.replace(',', '.'))
    if (!Number.isFinite(n)) return 'Jarak harus angka'
    if (n < 0) return 'Jarak tidak boleh negatif'
    return null
  }

  if (key === 'gender') {
    const g = v.toUpperCase()
    if (!['L', 'P', 'LAKI-LAKI', 'LAKI LAKI', 'PEREMPUAN'].includes(g)) {
      return 'Gender: L atau P'
    }
    return null
  }

  if (DATE_KEYS.has(key)) {
    const d = v.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Tanggal: format YYYY-MM-DD'
    const [y, m, day] = d.split('-').map(Number)
    if (m < 1 || m > 12 || day < 1 || day > 31) return 'Tanggal tidak valid'
    return null
  }

  if (key === 'nama' && v.length < 2) return 'Nama terlalu pendek'

  return null
}
