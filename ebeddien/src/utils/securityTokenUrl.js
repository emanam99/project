/**
 * Token one-time (setup/ubah password): baca dari fragment (#token=) agar tidak masuk Referer/log query.
 * Fallback query ?token= hanya untuk tautan lama; segera dipindah ke hash via migrateLegacyTokenQueryToHash().
 */
export function readSecurityTokenFromUrl(searchParams) {
  if (typeof window !== 'undefined') {
    try {
      const hash = window.location.hash || ''
      if (hash.startsWith('#')) {
        const hp = new URLSearchParams(hash.slice(1))
        const fromHash = (hp.get('token') || '').trim()
        if (fromHash) return fromHash.replace(/\s+/g, '')
      }
    } catch {
      /* abaikan */
    }
  }
  const fromQuery = searchParams?.get?.('token') ?? ''
  return String(fromQuery).replace(/\s+/g, '').trim()
}

/** Pindahkan ?token= ke #token= dan hapus dari query string (legacy WA links). */
export function migrateLegacyTokenQueryToHash() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const fromQuery = (url.searchParams.get('token') || '').trim()
    if (!fromQuery) return

    url.searchParams.delete('token')
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '')
    if (!hashParams.get('token')) {
      hashParams.set('token', fromQuery.replace(/\s+/g, ''))
    }
    const hashStr = hashParams.toString()
    url.hash = hashStr ? `#${hashStr}` : ''
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch {
    /* abaikan */
  }
}

export function buildSetupAkunUrl(basePath, token, extraQuery = '') {
  const q = extraQuery ? (extraQuery.startsWith('&') ? extraQuery : `&${extraQuery}`) : ''
  return `${basePath}#token=${encodeURIComponent(token)}${q}`
}
