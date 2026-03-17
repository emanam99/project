/**
 * Repository pesan chat. Menyimpan ke database via API (Slim).
 * Env: CHAT_API_URL (base URL API, mis. https://api.alutsmani.id), LIVE_SERVER_API_KEY (sama dengan api/.env).
 * Jika CHAT_API_URL tidak di-set, fallback in-memory (dev tanpa API).
 */

const CHAT_API_URL = process.env.CHAT_API_URL ? process.env.CHAT_API_URL.replace(/\/$/, '') : '';
const LIVE_SERVER_API_KEY = process.env.LIVE_SERVER_API_KEY || '';

if (!CHAT_API_URL || !LIVE_SERVER_API_KEY) {
  console.warn('[chatRepository] CHAT_API_URL atau LIVE_SERVER_API_KEY tidak di-set. Pesan chat hanya disimpan in-memory (tidak masuk database).');
} else {
  console.info('[chatRepository] Simpan chat ke DB: ' + CHAT_API_URL + '/api/live/chat/message');
}

let lastId = 0;
const memoryMessages = [];

/**
 * Simpan pesan chat via API. Jika API tidak dikonfigurasi, simpan in-memory.
 * @param {{ from_user_id: number|string, to_user_id: number|string, message: string }} payload
 * @returns {Promise<{ id: number, created_at: string }>}
 */
export async function saveMessage(payload) {
  const from_user_id = payload?.from_user_id != null ? Number(payload.from_user_id) : 0;
  const to_user_id = payload?.to_user_id != null ? Number(payload.to_user_id) : 0;
  const message = String(payload?.message ?? '').trim();

  if (CHAT_API_URL && LIVE_SERVER_API_KEY) {
    const url = `${CHAT_API_URL}/api/live/chat/message`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': LIVE_SERVER_API_KEY,
      },
      body: JSON.stringify({ from_user_id, to_user_id, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[chatRepository] API error:', res.status, data?.message || res.statusText, 'URL:', url);
      const err = new Error(data?.message || `API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (data.success && data.id != null) {
      return { id: data.id, created_at: data.created_at || new Date().toISOString() };
    }
    console.error('[chatRepository] API tidak mengembalikan id:', data);
    throw new Error(data?.message || 'API tidak mengembalikan id');
  }

  lastId += 1;
  const created_at = new Date().toISOString();
  memoryMessages.push({ id: lastId, from_user_id, to_user_id, message, created_at });
  return { id: lastId, created_at };
}

/**
 * Riwayat pesan: saat ini hanya in-memory (jika pakai fallback). Untuk riwayat dari DB, gunakan endpoint API terpisah.
 */
export async function getMessages(conversationId, options = {}) {
  const { limit = 50, beforeId } = options;
  const [a, b] = (conversationId || '').split('_').map(Number).filter((n) => !Number.isNaN(n));
  if (a === undefined || b === undefined) return [];
  const filtered = memoryMessages.filter(
    (m) =>
      (m.from_user_id === a && m.to_user_id === b) || (m.from_user_id === b && m.to_user_id === a)
  );
  let list = filtered;
  if (beforeId != null) list = list.filter((m) => m.id < beforeId);
  list = [...list].sort((x, y) => y.id - x.id);
  return list.slice(0, limit);
}
