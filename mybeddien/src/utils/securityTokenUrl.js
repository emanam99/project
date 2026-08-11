/**
 * Token one-time (setup/ubah password): baca dari fragment (#token=) agar tidak masuk Referer/log query.
 * Fallback query ?token= untuk tautan lama dari WhatsApp.
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

export function buildSetupAkunUrl(basePath, token, extraQuery = '') {
  const q = extraQuery ? (extraQuery.startsWith('&') ? extraQuery : `&${extraQuery}`) : ''
  return `${basePath}#token=${encodeURIComponent(token)}${q}`
}
