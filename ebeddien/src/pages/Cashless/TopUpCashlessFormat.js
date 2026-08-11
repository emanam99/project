export const METODE_OPTIONS = [
  { value: 'tunai', label: 'Cash' },
  { value: 'transfer', label: 'TF' },
  { value: 'qris', label: 'QRIS' },
  { value: 'lainnya', label: 'Lainnya' },
]

export function formatSaldo(n) {
  if (n == null || n === undefined) return '0'
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))
}

export function formatWaktu(raw) {
  if (!raw) return '—'
  try {
    const d = new Date(String(raw).replace(' ', 'T'))
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return raw
  }
}

export function getMetodeColor(metode) {
  const m = String(metode || '').toLowerCase()
  if (m === 'transfer' || m === 'tf') return '#2563eb'
  if (m === 'qris') return '#7c3aed'
  if (m === 'lainnya') return '#64748b'
  return '#059669'
}

/** Badge riwayat: counter, transfer wallet, gateway, tarik tunai. */
export function getHistoryBadge(item) {
  const journalType = String(item?.journal_type || '').toUpperCase()
  const channel = String(item?.channel || '').toLowerCase()

  if (journalType === 'WITHDRAWAL') {
    return { label: 'Tarik', color: '#dc2626' }
  }
  if (journalType === 'TRANSFER' || channel === 'wallet') {
    return { label: item?.metode_label || 'Transfer', color: '#0d9488' }
  }
  if (channel === 'gateway') {
    return { label: item?.metode_label || 'Gateway', color: '#7c3aed' }
  }

  const metode = String(item?.metode || 'tunai')
  return {
    label: item?.metode_label || metode,
    color: getMetodeColor(metode),
  }
}

export function resolveActorLabel(item) {
  if (item?.actor_username) return item.actor_username
  if (item?.actor_user_id) return `user #${item.actor_user_id}`
  if (item?.channel === 'gateway') return 'iPayMu'
  return null
}
