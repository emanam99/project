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

export function resolveActorLabel(item, { required = false } = {}) {
  if (item?.toko_nama) return item.toko_nama
  if (item?.actor_username) return item.actor_username
  const desc = String(item?.description || '')
  const belanja = desc.match(/^Belanja di\s+(.+?)\s+[—–-]/i)
  if (belanja?.[1]) return belanja[1].trim()
  if (item?.actor_user_id) return `user #${item.actor_user_id}`
  if (item?.channel === 'gateway') return 'iPayMu'
  return required ? '—' : null
}

export function getHistoryBadge(item) {
  if (item.journal_type === 'REVERSAL') {
    return { bg: '#dc2626', label: item.label || 'Pembatalan' }
  }
  if (item.direction === 'out') {
    return { bg: '#ea580c', label: item.label || 'Keluar' }
  }
  if (item.channel === 'gateway') {
    return { bg: '#7c3aed', label: item.label || 'iPayMu' }
  }
  if (item.channel === 'wallet') {
    return { bg: '#0d9488', label: item.label || 'Transfer' }
  }
  return { bg: '#059669', label: item.label || 'Masuk' }
}

export function DateActorColumn({ createdAt, actorLabel, actorRequired = false }) {
  const actor = actorLabel ?? null
  if (!createdAt && !actor) return null

  return (
    <div className="max-w-[140px] shrink-0 text-right leading-snug">
      {createdAt ? (
        <p className="text-[10px] text-gray-500 dark:text-gray-400">{formatWaktu(createdAt)}</p>
      ) : null}
      {(actorRequired || actor) && actor ? (
        <p
          className="mt-0.5 truncate text-[10px] font-medium text-gray-700 dark:text-gray-300"
          title={actor}
        >
          {actor}
        </p>
      ) : null}
    </div>
  )
}
