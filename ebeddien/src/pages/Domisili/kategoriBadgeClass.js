/**
 * Kelas Tailwind badge kategori (Banin / Banat) — dipakai list kartu & offcanvas.
 */
export function kategoriBadgeClass(kategori) {
  const k = String(kategori ?? '').trim().toLowerCase()
  if (k === 'banin') {
    return 'shrink-0 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
  }
  if (k === 'banat') {
    return 'shrink-0 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-900 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
  }
  return 'shrink-0 rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
}
