/**
 * URL server live (Socket.IO). Dipakai di LiveSocketSync dan Dashboard Super Admin.
 * - ebeddien.alutsmani.id (production) → https://live.alutsmani.id
 * - ebeddien2.alutsmani.id (staging)   → https://live2.alutsmani.id
 * - Development: VITE_LIVE_SERVER_URL atau localhost:3004
 */
export function getLiveServerUrl() {
  if (typeof window === 'undefined') return import.meta.env.VITE_LIVE_SERVER_URL || 'http://localhost:3004'
  const host = window.location?.hostname || ''
  if (host === 'ebeddien.alutsmani.id') return 'https://live.alutsmani.id'
  if (host === 'ebeddien2.alutsmani.id') return 'https://live2.alutsmani.id'
  return import.meta.env.VITE_LIVE_SERVER_URL || 'http://localhost:3004'
}
