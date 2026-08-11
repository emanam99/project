/** Fallback jika API lembaga belum termuat (nilai disesuaikan kolom `lembaga` di rencana/pengeluaran) */
export const DEFAULT_LEMBAGA_FILTER_OPTIONS = [
  { value: 'Pesantren', label: 'Pesantren' },
  { value: "Isti'dadiyah", label: "Isti'dadiyah" },
  { value: 'Ula', label: 'Ula' },
  { value: 'Wustha', label: 'Wustha' },
  { value: 'Ulya', label: 'Ulya' },
  { value: 'Guru Tugas', label: 'Guru Tugas' },
  { value: 'PAUD', label: 'PAUD' },
  { value: 'SMP', label: 'SMP' },
  { value: 'MTs', label: 'MTs' },
  { value: 'SMAI', label: 'SMAI' },
  { value: 'STAI', label: 'STAI' }
]

/**
 * @param {Array<{id?: string|number, nama?: string}>} lembagaRows
 * @param {string[]|null|undefined} allowedIds - null/undefined = semua
 * @returns {{ value: string, label: string }[]}
 */
export function buildPengeluaranLembagaFilterOptions(lembagaRows, allowedIds) {
  const head = { value: '', label: 'Lembaga' }
  if (!Array.isArray(lembagaRows) || lembagaRows.length === 0) {
    const rest = DEFAULT_LEMBAGA_FILTER_OPTIONS
    if (allowedIds?.length) {
      return [head, ...rest.filter((o) => allowedIds.includes(String(o.value)))]
    }
    return [head, ...rest]
  }
  const mapped = lembagaRows.map((l) => ({
    value: String(l.id),
    label: l.nama != null && String(l.nama).trim() !== '' ? String(l.nama) : String(l.id)
  }))
  const filtered =
    allowedIds?.length > 0 ? mapped.filter((o) => allowedIds.includes(o.value)) : mapped
  return [head, ...filtered]
}
