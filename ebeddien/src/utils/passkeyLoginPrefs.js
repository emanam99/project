/**
 * Preferensi login passkey per perangkat (localStorage).
 * ID baris DB (`credential_db_id`) hanya ditambah setelah daftar/login passkey sukses di browser ini.
 */

const STORAGE_KEY_USERNAME = 'uwaba_last_login_username'
const STORAGE_KEY_ROW_IDS = 'uwaba_passkey_row_ids'

function normUsername(username) {
  return String(username || '').trim().toLowerCase()
}

function readRowIdMap() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ROW_IDS)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeRowIdMap(map) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_ROW_IDS, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function getStoredLoginUsername() {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(STORAGE_KEY_USERNAME) || ''
  } catch {
    return ''
  }
}

/** Simpan setelah login sukses (password/passkey) atau setelah daftar passkey di profil. */
export function setStoredLoginUsername(username) {
  if (typeof window === 'undefined') return
  try {
    const u = String(username || '').trim()
    if (u.length >= 2) localStorage.setItem(STORAGE_KEY_USERNAME, u)
  } catch {
    /* ignore */
  }
}

/** ID baris user___webauthn yang pernah dipakai di perangkat ini untuk username tersebut. */
export function getLocalPasskeyRowIds(username) {
  const key = normUsername(username)
  if (!key) return []
  const map = readRowIdMap()
  const arr = map[key]
  if (!Array.isArray(arr)) return []
  return arr.map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
}

/** Untuk tombol login passkey: akun punya passkey di server DAN perangkat ini punya setidaknya satu ID yang tercatat. */
export function shouldShowPasskeyLoginButton(webauthnRegisteredGlobal, username) {
  if (!webauthnRegisteredGlobal) return false
  return getLocalPasskeyRowIds(username).length > 0
}

export function addLocalPasskeyRowId(username, credentialDbId) {
  const id = parseInt(String(credentialDbId), 10)
  if (Number.isNaN(id) || id <= 0) return
  const key = normUsername(username)
  if (!key) return
  const map = readRowIdMap()
  const prev = Array.isArray(map[key]) ? map[key].map((n) => parseInt(String(n), 10)).filter((n) => n > 0) : []
  if (prev.includes(id)) return
  map[key] = [...prev, id]
  writeRowIdMap(map)
}

export function removeLocalPasskeyRowId(username, credentialDbId) {
  const id = parseInt(String(credentialDbId), 10)
  if (Number.isNaN(id) || id <= 0) return
  const key = normUsername(username)
  if (!key) return
  const map = readRowIdMap()
  const prev = Array.isArray(map[key]) ? map[key].map((n) => parseInt(String(n), 10)).filter((n) => n > 0) : []
  map[key] = prev.filter((x) => x !== id)
  if (map[key].length === 0) delete map[key]
  writeRowIdMap(map)
}

/** Hapus ID lokal yang tidak ada lagi di server (response GET credentials). */
export function syncLocalPasskeyRowIdsWithServer(username, serverCredentialIds) {
  const key = normUsername(username)
  if (!key) return
  const serverSet = new Set(
    (Array.isArray(serverCredentialIds) ? serverCredentialIds : [])
      .map((n) => parseInt(String(n), 10))
      .filter((n) => n > 0)
  )
  const map = readRowIdMap()
  const prev = Array.isArray(map[key]) ? map[key].map((n) => parseInt(String(n), 10)).filter((n) => n > 0) : []
  const next = prev.filter((id) => serverSet.has(id))
  if (next.length === 0) delete map[key]
  else map[key] = next
  writeRowIdMap(map)
}

/** Jika akun tidak punya passkey sama sekali di server, bersihkan cache lokal untuk username itu. */
export function clearLocalPasskeyRowIdsForUsername(username) {
  const key = normUsername(username)
  if (!key) return
  const map = readRowIdMap()
  if (map[key] !== undefined) {
    delete map[key]
    writeRowIdMap(map)
  }
}
