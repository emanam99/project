/**
 * Chat WhatsApp via Baileys — multi-session (sessionId).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import qrcode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { setWaStatus } from '../store/waStatus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_BASE = path.resolve(__dirname, '../whatsapp-sessions');

const DEFAULT_SESSION = 'default';
const sockRefBySession = {};
const baileysStatusBySession = {};

function getBaileysStatusObj(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  if (!baileysStatusBySession[id]) {
    baileysStatusBySession[id] = { status: 'disconnected', qrCode: null, phoneNumber: null };
  }
  return baileysStatusBySession[id];
}

export function getBaileysAuthPath(sessionId) {
  const id = (sessionId || DEFAULT_SESSION).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.resolve(SESSIONS_BASE, `baileys-${id}`);
}

function syncBaileysToStore(sessionId) {
  try {
    const st = getBaileysStatusObj(sessionId);
    setWaStatus(sessionId, {
      baileysStatus: st.status,
      baileysQrCode: st.qrCode,
      baileysPhoneNumber: st.phoneNumber,
    });
  } catch (_) {}
}

function formatPhoneNumber(phone) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n || null;
}

export function phoneToJid(phone) {
  const n = formatPhoneNumber(phone);
  return n ? n + '@s.whatsapp.net' : null;
}

export async function initBaileys(sessionId = DEFAULT_SESSION) {
  const id = sessionId || DEFAULT_SESSION;
  if (sockRefBySession[id]) return sockRefBySession[id];
  const authPath = getBaileysAuthPath(id);
  if (!existsSync(authPath)) mkdirSync(authPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const baileysStatus = getBaileysStatusObj(id);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    getMessage: async () => undefined,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        const qrData = await qrcode.toDataURL(qr);
        baileysStatus.qrCode = qrData;
        baileysStatus.status = 'connecting';
        syncBaileysToStore(id);
        console.log('[WA Baileys]', id, 'QR code diterima');
      } catch (e) {
        console.error('[WA Baileys] QR toDataURL error:', e?.message);
      }
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.output?.payload?.reason;
      const errMsg = lastDisconnect?.error?.message || '';
      if (statusCode === DisconnectReason.loggedOut) {
        baileysStatus.status = 'disconnected';
        baileysStatus.qrCode = null;
        baileysStatus.phoneNumber = null;
        delete sockRefBySession[id];
        syncBaileysToStore(id);
        return;
      }
      delete sockRefBySession[id];
      baileysStatus.status = 'disconnected';
      baileysStatus.qrCode = null;
      baileysStatus.phoneNumber = null;
      syncBaileysToStore(id);
      if (errMsg.includes('Connection Failure') || errMsg.includes('connection errored')) {
        console.warn('[WA Baileys]', id, 'Koneksi gagal (Connection Failure). Coba klik Hubungkan lagi. Jika sering gagal: ganti jaringan/WiFi atau gunakan VPN.');
      } else {
        console.log('[WA Baileys]', id, 'Disconnected:', statusCode, reason || errMsg);
      }
    }
    if (connection === 'open') {
      baileysStatus.status = 'connected';
      baileysStatus.qrCode = null;
      try {
        const jid = sock.user?.id;
        if (jid) {
          const num = String(jid).replace(/@.*/, '').replace(/\D/g, '');
          if (num.length >= 10) baileysStatus.phoneNumber = num.startsWith('62') ? num : '62' + num;
        }
      } catch (_) {
        baileysStatus.phoneNumber = null;
      }
      syncBaileysToStore(id);
      console.log('[WA Baileys]', id, 'Terhubung. Nomor:', baileysStatus.phoneNumber || '(unknown)');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const list = Array.isArray(messages) ? messages : [];
    console.log('[WA Baileys] messages.upsert type="' + type + '" count=' + list.length + ' (setiap pesan masuk/update akan log ini)');
    if (type !== 'notify') {
      console.log('[WA Baileys] skip: type bukan "notify" (nilai: ' + type + '), tidak diforward');
      return;
    }
    const apiBase = (process.env.UWABA_API_BASE_URL || '').trim().replace(/\/$/, '');
    if (!apiBase) {
      console.warn('[WA Baileys] Pesan masuk tidak diforward: UWABA_API_BASE_URL belum di-set di .env');
      return;
    }
    for (const msg of list) {
      if (msg.key && msg.key.fromMe) {
        console.log('[WA Baileys] skip: pesan fromMe (dari nomor ini), tidak diforward');
        continue;
      }
      try {
        const remoteJid = (msg.key && msg.key.remoteJid) || '';
        if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@c.us')) {
          console.log('[WA Baileys] skip: remoteJid tidak valid: ' + (remoteJid || '(kosong)'));
          continue;
        }
        const fromRaw = remoteJid.replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
        const digits = fromRaw.replace(/\D/g, '');
        if (digits.length < 10) {
          console.log('[WA Baileys] skip: nomor terlalu pendek: ' + fromRaw);
          continue;
        }
        const from62 = digits.startsWith('0') ? '62' + digits.slice(1) : (digits.startsWith('62') ? digits : '62' + digits);
        const messageId = msg.key.id || null;
        let body = '';
        if (msg.message?.conversation) body = msg.message.conversation;
        else if (msg.message?.extendedTextMessage?.text) body = msg.message.extendedTextMessage.text;
        else if (msg.message?.imageMessage?.caption) body = msg.message.imageMessage.caption;
        else body = '[media]';
        const waPath = apiBase.endsWith('/api') ? '/wa/incoming' : '/api/wa/incoming';
        const url = apiBase + waPath;
        const payload = { from: from62, message: body, messageId: messageId || undefined, sessionId: id };
        let lastOk = false;
        let lastErr = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            lastOk = res.ok;
            if (res.ok) break;
            lastErr = `HTTP ${res.status}`;
            const text = await res.text();
            if (text && text.length < 200) lastErr = text;
          } catch (e) {
            lastErr = e?.message || String(e);
          }
          if (attempt < 5) await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
        if (lastOk) {
          console.log('[WA Baileys] Pesan masuk diforward ke API: from=' + from62 + ' len=' + body.length);
        } else {
          console.error('[WA Baileys] Gagal forward pesan masuk ke API: from=' + from62 + ' error=' + (lastErr || 'timeout'));
        }
      } catch (err) {
        console.error('[WA Baileys] message handler error:', err?.message);
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    const apiBase = (process.env.UWABA_API_BASE_URL || '').trim().replace(/\/$/, '');
    const apiKey = (process.env.WA_API_KEY || '').trim();
    if (!apiBase || !apiKey) return;
    const list = Array.isArray(updates) ? updates : (updates ? [updates] : []);
    for (const u of list) {
      if (!u.key?.id || !u.update?.status) continue;
      const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read' };
      const s = statusMap[u.update.status];
      if (!s) continue;
      try {
        await fetch(apiBase + (apiBase.endsWith('/api') ? '/wa/message-status' : '/api/wa/message-status'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify({ messageId: u.key.id, status: s }),
        });
      } catch (_) {}
    }
  });

  sockRefBySession[id] = sock;
  baileysStatus.status = 'connecting';
  syncBaileysToStore(id);
  return sock;
}

export function getBaileysStatus(sessionId = DEFAULT_SESSION) {
  return { ...getBaileysStatusObj(sessionId) };
}

export function isBaileysConnected(sessionId = DEFAULT_SESSION) {
  const id = sessionId || DEFAULT_SESSION;
  return sockRefBySession[id] != null && getBaileysStatusObj(id).status === 'connected';
}

export async function sendMessageBaileys(sessionId, phoneNumber, text, imageBase64, imageMimetype) {
  const id = sessionId || DEFAULT_SESSION;
  const sock = sockRefBySession[id];
  const st = getBaileysStatusObj(id);
  if (!sock || st.status !== 'connected') return { ok: false, error: 'Baileys belum terhubung' };
  const jid = phoneToJid(phoneNumber);
  if (!jid) return { ok: false, error: 'Nomor tidak valid' };
  try {
    const content = (typeof text === 'string' ? text : '').trim() || '(pesan kosong)';
    let result;
    if (typeof imageBase64 === 'string' && imageBase64.trim().length > 0) {
      const mimetype = (imageMimetype || 'image/png').split(';')[0].trim();
      const buffer = Buffer.from(imageBase64.replace(/^data:image\/[^;]+;base64,/, '').trim(), 'base64');
      result = await sock.sendMessage(jid, { image: buffer, caption: content }, {});
    } else {
      result = await sock.sendMessage(jid, { text: content }, {});
    }
    return { ok: true, messageId: result?.key?.id || null, senderPhoneNumber: st.phoneNumber };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kirim pesan dengan simulasi "sedang mengetik" (composing) sebelum kirim.
 * Catatan: Di Baileys indikator mengetik kadang tidak muncul (known issue). Tetap kirim presence agar bila WA mendukung akan terlihat. */
export async function sendMessageWithTypingBaileys(sessionId, phoneNumber, text, typingSeconds = 2) {
  const id = sessionId || DEFAULT_SESSION;
  const sock = sockRefBySession[id];
  const st = getBaileysStatusObj(id);
  if (!sock || st.status !== 'connected') return { ok: false, error: 'Baileys belum terhubung' };
  const jid = phoneToJid(phoneNumber);
  if (!jid) return { ok: false, error: 'Nomor tidak valid' };
  try {
    const content = (typeof text === 'string' ? text : '').trim() || '(pesan kosong)';
    const sec = Math.max(1, Math.min(10, Math.round(typingSeconds) || 2));
    try {
      if (typeof sock.presenceSubscribe === 'function') await sock.presenceSubscribe(jid);
      await delay(400);
      if (typeof sock.sendPresenceUpdate === 'function') await sock.sendPresenceUpdate('available', jid);
      await delay(350);
      if (typeof sock.sendPresenceUpdate === 'function') await sock.sendPresenceUpdate('composing', jid);
      await delay(sec * 1000);
      if (sec > 2) {
        if (typeof sock.sendPresenceUpdate === 'function') await sock.sendPresenceUpdate('composing', jid);
        await delay(800);
      }
      if (typeof sock.sendPresenceUpdate === 'function') await sock.sendPresenceUpdate('paused', jid);
      await delay(250);
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[WA Baileys] presence/typing:', e?.message);
    }
    const result = await sock.sendMessage(jid, { text: content }, {});
    return { ok: true, messageId: result?.key?.id || null, senderPhoneNumber: st.phoneNumber };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function getChatMessagesBaileys(sessionId, phoneNumber, limit = 50) {
  const id = sessionId || DEFAULT_SESSION;
  const sock = sockRefBySession[id];
  const st = getBaileysStatusObj(id);
  if (!sock || st.status !== 'connected') return { ok: false, data: [], error: 'Baileys belum terhubung' };
  const jid = phoneToJid(phoneNumber);
  if (!jid) return { ok: false, data: [], error: 'Nomor tidak valid' };
  const nomor62 = formatPhoneNumber(phoneNumber) || jid.replace(/@.*/, '');
  try {
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    if (typeof sock.fetchMessageHistory !== 'function') return { ok: true, data: [], message: 'OK' };
    const key = { remoteJid: jid, fromMe: false, id: '0' };
    const messages = await sock.fetchMessageHistory(limitNum, key, Date.now());
    const list = Array.isArray(messages?.messages) ? messages.messages : (Array.isArray(messages) ? messages : []);
    const out = list.map((msg) => {
      const keyMsg = msg?.key;
      let body = '';
      if (msg?.message?.conversation) body = msg.message.conversation;
      else if (msg?.message?.extendedTextMessage?.text) body = msg.message.extendedTextMessage.text;
      else body = '[media]';
      const statusMap = { 0: 'pending', 1: 'sent', 2: 'delivered', 3: 'read' };
      return {
        id: keyMsg?.id || null,
        body: body || '',
        fromMe: !!keyMsg?.fromMe,
        timestamp: msg?.messageTimestamp ? Number(msg.messageTimestamp) : 0,
        ack: msg?.status || 0,
        status: statusMap[msg?.status] || 'sent',
        nomor_tujuan: nomor62,
      };
    });
    return { ok: true, data: out, message: 'OK' };
  } catch (err) {
    return { ok: true, data: [], message: 'Riwayat tidak tersedia' };
  }
}

export async function editMessageBaileys(sessionId, phoneNumber, messageId, newMessage) {
  const id = sessionId || DEFAULT_SESSION;
  const sock = sockRefBySession[id];
  const st = getBaileysStatusObj(id);
  if (!sock || st.status !== 'connected') return { ok: false, error: 'Baileys belum terhubung' };
  const jid = phoneToJid(phoneNumber);
  if (!jid) return { ok: false, error: 'Nomor tidak valid' };
  const newBody = typeof newMessage === 'string' ? newMessage.trim() : '';
  if (!messageId || !newBody) return { ok: false, error: 'messageId dan isi pesan wajib' };
  try {
    await sock.sendMessage(jid, { text: newBody, edit: { remoteJid: jid, fromMe: true, id: messageId } }, {});
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function checkNumberBaileys(sessionId, phoneNumber) {
  const id = sessionId || DEFAULT_SESSION;
  const sock = sockRefBySession[id];
  const st = getBaileysStatusObj(id);
  if (!sock || st.status !== 'connected') return { ok: false, error: 'Baileys belum terhubung' };
  const num = formatPhoneNumber(phoneNumber);
  if (!num) return { ok: false, error: 'Nomor tidak valid' };
  try {
    if (typeof sock.onWhatsApp === 'function') {
      const arr = await sock.onWhatsApp(num);
      const result = Array.isArray(arr) ? arr[0] : arr;
      return { ok: true, phoneNumber: num, isRegistered: !!(result?.jid) };
    }
    return { ok: true, phoneNumber: num, isRegistered: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function disconnectBaileys(sessionId = DEFAULT_SESSION) {
  const id = sessionId || DEFAULT_SESSION;
  if (sockRefBySession[id]) {
    try {
      sockRefBySession[id].end(undefined);
    } catch (_) {}
    delete sockRefBySession[id];
  }
  const st = getBaileysStatusObj(id);
  st.status = 'disconnected';
  st.qrCode = null;
  st.phoneNumber = null;
  syncBaileysToStore(id);
}

/** Path auth Baileys untuk hapus session (logout) */
export function getBaileysAuthPathForDelete(sessionId) {
  return getBaileysAuthPath(sessionId);
}
