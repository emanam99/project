export function formatWaktu(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(String(iso).replace(' ', 'T'))
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

export function isDesktopBukuTamuLayout() {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(min-width: 1024px)').matches
}
