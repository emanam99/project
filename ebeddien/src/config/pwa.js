/**
 * PWA Configuration
 * VAPID keys untuk Push Notifications
 * 
 * Untuk generate VAPID keys, gunakan:
 * npm install -g web-push
 * web-push generate-vapid-keys
 * 
 * Atau online: https://web-push-codelab.glitch.me/
 */

// VAPID Public Key (untuk client-side subscription)
// Key ini akan diambil dari environment variable atau config
export const getVapidPublicKey = () => {
  // Cek dari environment variable (build time)
  const envKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  
  if (envKey) {
    return envKey
  }
  
  // Fallback: return empty string (akan error jika digunakan tanpa key)
  console.warn('VAPID Public Key tidak dikonfigurasi. Push notifications tidak akan berfungsi.')
  return ''
}

// VAPID Private Key hanya digunakan di backend (tidak pernah dikirim ke client)
// Private key disimpan di backend/.env sebagai VAPID_PRIVATE_KEY

