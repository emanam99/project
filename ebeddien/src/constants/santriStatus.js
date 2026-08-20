/** Enum status santri tetap — selaras SantriStatusHelper::ALLOWED */
export const SANTRI_STATUS_OPTIONS = [
  'Mukim',
  'Boyong',
  'Khoriji',
  'Guru Tugas',
  'Pengurus',
  'Alumni',
]

export function normalizeSantriStatus(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const found = SANTRI_STATUS_OPTIONS.find((s) => s.toLowerCase() === raw.toLowerCase())
  return found || null
}
