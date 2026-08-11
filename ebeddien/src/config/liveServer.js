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
  // Dev: proxy Vite /live-socket → live:3004 (hindari CORS localhost:5173 → :3004)
  if (import.meta.env.DEV) return window.location.origin
  return import.meta.env.VITE_LIVE_SERVER_URL || 'http://localhost:3004'
}

/**
 * Opsi koneksi Socket.IO:
 * - Production/staging live domain: pakai polling saja untuk hindari warning
 *   "WebSocket is closed before the connection is established" saat upgrade WS gagal di edge proxy.
 * - Environment lain: tetap izinkan upgrade ke websocket.
 */
export function getLiveSocketOptions() {
  if (typeof window === 'undefined') {
    return { transports: ['polling', 'websocket'] }
  }
  const host = window.location?.hostname || ''
  if (import.meta.env.DEV) {
    return {
      path: '/live-socket/socket.io/',
      transports: ['polling', 'websocket'],
    }
  }
  if (host === 'ebeddien.alutsmani.id' || host === 'ebeddien2.alutsmani.id') {
    return { transports: ['polling'], upgrade: false }
  }
  return { transports: ['polling', 'websocket'] }
}
