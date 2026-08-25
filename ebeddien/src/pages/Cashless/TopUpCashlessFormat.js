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

const METODE_LABEL_KEYS = new Set(['cash', 'tf', 'qris', 'lainnya', 'tunai', 'transfer', 'ipaymu', 'gateway'])

function isMetodeLikeLabel(value) {
  const s = String(value || '').trim().toLowerCase()
  return s !== '' && METODE_LABEL_KEYS.has(s)
}

function resolveMetodeLabel(item) {
  const fromMeta = String(item?.metode_label || '').trim()
  if (fromMeta) return fromMeta
  const metode = String(item?.metode || '').trim().toLowerCase()
  if (metode) {
    const mapped = METODE_OPTIONS.find((o) => o.value === metode)
    if (mapped) return mapped.label
  }
  const raw = String(item?.label || '').trim()
  if (isMetodeLikeLabel(raw)) return raw
  return ''
}

/** Badge jenis transaksi — bukan metode (Cash/TF). */
export function getStatementBadge(item) {
  const journalType = String(item?.journal_type || '').toUpperCase()
  const direction = String(item?.direction || '').toLowerCase()
  const channel = String(item?.channel || '').toLowerCase()

  if (journalType === 'PURCHASE') {
    return { label: 'Belanja', color: '#ea580c' }
  }
  if (journalType === 'WITHDRAWAL') {
    return { label: 'Tarik', color: '#dc2626' }
  }
  if (journalType === 'REVERSAL') {
    return { label: 'Batal', color: '#64748b' }
  }
  if (journalType === 'TOPUP' || channel === 'gateway') {
    return { label: 'Top-up', color: '#059669' }
  }
  if (journalType === 'TRANSFER' || channel === 'wallet') {
    return {
      label: direction === 'in' ? 'Transfer masuk' : 'Transfer keluar',
      color: '#0d9488',
    }
  }
  if (direction === 'in') {
    return { label: 'Masuk', color: '#059669' }
  }
  if (direction === 'out') {
    return { label: 'Keluar', color: '#dc2626' }
  }
  return { label: 'Transaksi', color: '#64748b' }
}

/** Keterangan kedua: via Cash/TF, lawan transfer, atau toko — tidak mengulang badge. */
export function getStatementKeterangan(item) {
  const jenis = getStatementBadge(item).label
  const journalType = String(item?.journal_type || '').toUpperCase()
  const channel = String(item?.channel || '').toLowerCase()
  const direction = String(item?.direction || '').toLowerCase()
  const metodeLabel = resolveMetodeLabel(item)
  const description = String(item?.description || '').trim()
  const rawLabel = String(item?.label || '').trim()

  if (journalType === 'TOPUP' || channel === 'gateway') {
    if (metodeLabel) return `via ${metodeLabel}`
    if (channel === 'gateway') return 'via iPayMu'
    return null
  }

  if (journalType === 'TRANSFER' || channel === 'wallet') {
    if (description && description !== jenis) return description
    return direction === 'in' ? 'Dari wallet lain' : 'Ke wallet lain'
  }

  if (journalType === 'PURCHASE') {
    if (item?.toko_nama) return item.toko_nama
    if (description && description !== jenis && description !== 'Belanja') return description
    return null
  }

  if (journalType === 'WITHDRAWAL') {
    if (metodeLabel) return `via ${metodeLabel}`
    return 'Tunai'
  }

  if (rawLabel && rawLabel !== jenis && !isMetodeLikeLabel(rawLabel)) return rawLabel
  if (description && description !== jenis) return description
  return null
}

export function resolveActorLabel(item) {
  if (item?.actor_username) return item.actor_username
  if (item?.actor_user_id) return `user #${item.actor_user_id}`
  if (item?.channel === 'gateway') return 'iPayMu'
  return null
}
