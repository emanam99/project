/**
 * Username terakhir untuk halaman login — disimpan per perangkat (localStorage)
 * agar field username terisi dan tombol passkey bisa dicek tanpa mengetik ulang.
 */
const STORAGE_KEY = 'uwaba_last_login_username'

export function getStoredLoginUsername() {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

/** Simpan setelah login sukses (password/passkey) atau setelah daftar passkey di profil. */
export function setStoredLoginUsername(username) {
  if (typeof window === 'undefined') return
  try {
    const u = String(username || '').trim()
    if (u.length >= 2) localStorage.setItem(STORAGE_KEY, u)
  } catch {
    /* localStorage tidak tersedia */
  }
}
