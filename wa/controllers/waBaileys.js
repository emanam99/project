/**
 * Chat WhatsApp via Baileys — multi-session (sessionId).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readdirSync } from 'fs';
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
const WA_FORWARD_TIMEOUT_MS = Number(process.env.WA_FORWARD_TIMEOUT_MS || 8000);
const WA_VERBOSE_LOG = process.env.WA_VERBOSE_LOG === 'true';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pesan teknis LID → teks yang bisa ditampilkan ke pengguna (OTP, notifikasi). */
export function humanizeLidSendError(raw) {
  const s = String(raw || '');
  if (!/no\s+lid|lid\s+for\s+user|missing\s+lid|lid\s+missing/i.test(s)) {
    return s;
  }
  return 'WhatsApp membutuhkan sinkron kontak (LID) untuk nomor ini. Di halaman Koneksi WA pastikan Langkah 2 (Baileys) terhubung untuk slot yang sama dengan WA_SESSION_ID di api/.env. Jika sudah, buka sekali obrolan ke nomor tersebut di aplikasi WhatsApp di HP lalu coba lagi.';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = WA_FORWARD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

/**
 * Selesaikan JID tujuan lewat onWhatsApp (mapping PN ↔ LID). Mengurangi kegagalan kirim vs jid ditebak saja.
 *
 * @returns {{ jid: string } | { jid: null, reason: 'invalid' | 'not_registered' }}
 */
/** Urutan coba kirim: @lid dulu (MD sering wajib untuk PN baru), baru @s.whatsapp.net / @c.us. */
function scoreJidForSendOrder(jid) {
  const j = String(jid);
  if (/@lid$/i.test(j)) return 0;
  if (/@s\.whatsapp\.net$/i.test(j)) return 1;
  if (/@c\.us$/i.test(j)) return 2;
  return 3;
}

function buildOrderedUniqueJidsFromOnWa(arr, fallback) {
  const list = Array.isArray(arr) ? arr.filter((x) => x && x.jid) : [];
  const uniq = [...new Set(list.map((x) => String(x.jid)))];
  uniq.sort((a, b) => scoreJidForSendOrder(a) - scoreJidForSendOrder(b));
  if (fallback && !uniq.includes(fallback)) uniq.push(fallback);
  return uniq;
}

/**
 * Daftar JID untuk dicoba berurutan (kurangi gagal OTP / nomor baru).
 * @returns {{ jids: string[], reason?: 'invalid' | 'not_registered' }}
 */
async function resolveSendJidsOrdered(sock, phoneNumber) {
  const fallback = phoneToJid(phoneNumber);
  if (!fallback) return { jids: [], reason: 'invalid' };
  if (typeof sock.onWhatsApp !== 'function') {
    return { jids: [fallback] };
  }
  try {
    const n = formatPhoneNumber(phoneNumber);
    if (!n) return { jids: [fallback] };
    let raw = null;
    try {
      raw = await sock.onWhatsApp([n, fallback]);
    } catch (_) {
      raw = await sock.onWhatsApp(n);
    }
    let arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    if (arr.length === 0) {
      try {
        raw = await sock.onWhatsApp(fallback);
        arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
      } catch (_) {
        /* noop */
      }
    }
    const withJid = arr.filter((x) => x && x.jid);
    if (withJid.length === 0) {
      if (arr.some((x) => x && x.exists === false)) {
        return { jids: [], reason: 'not_registered' };
      }
      return { jids: [fallback] };
    }
    return { jids: buildOrderedUniqueJidsFromOnWa(arr, fallback) };
  } catch (e) {
    if (WA_VERBOSE_LOG) console.warn('[WA Baileys] onWhatsApp:', e?.message);
  }
  return { jids: [fallback] };
}

async function resolveSendJid(sock, phoneNumber) {
  const r = await resolveSendJidsOrdered(sock, phoneNumber);
  return { jid: r.jids[0] || null, reason: r.reason };
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
    if (WA_VERBOSE_LOG) console.log('[WA Baileys] messages.upsert type="' + type + '" count=' + list.length + '"');
    if (type !== 'notify') {
      if (WA_VERBOSE_LOG) console.log('[WA Baileys] skip: type bukan "notify"');
      return;
    }
    const apiBase = (process.env.UWABA_API_BASE_URL || '').trim().replace(/\/$/, '');
    if (!apiBase) {
      console.warn('[WA Baileys] Pesan masuk tidak diforward: UWABA_API_BASE_URL belum di-set di .env');
      return;
    }
    for (const msg of list) {
      if (msg.key && msg.key.fromMe) {
        if (WA_VERBOSE_LOG) console.log('[WA Baileys] skip: fromMe');
        continue;
      }
      try {
        const remoteJid = (msg.key && msg.key.remoteJid) || '';
        if (/@g\.us$/i.test(remoteJid)) {
          if (WA_VERBOSE_LOG) console.log('[WA Baileys] skip: pesan grup');
          continue;
        }
        if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@c.us')) {
          if (WA_VERBOSE_LOG) console.log('[WA Baileys] skip: remoteJid tidak valid');
          continue;
        }
        const fromRaw = remoteJid.replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
        const digits = fromRaw.replace(/\D/g, '');
        if (digits.length < 10) {
          if (WA_VERBOSE_LOG) console.log('[WA Baileys] skip: nomor terlalu pendek');
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
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            lastOk = res.ok;
            if (res.ok) break;
            lastErr = `HTTP ${res.status}`;
            const text = await res.text();
            if (text && text.length < 200) lastErr = text;
          } catch (e) {
            lastErr = e?.message || String(e);
          }
          if (attempt < 3) await new Promise((r) => setTimeout(r, 700 * attempt));
        }
        if (lastOk) {
          if (WA_VERBOSE_LOG) console.log('[WA Baileys] Pesan masuk diforward ke API');
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
        await fetchWithTimeout(apiBase + (apiBase.endsWith('/api') ? '/wa/message-status' : '/api/wa/message-status'), {
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

/** True jika folder auth Baileys punya file (pernah scan Langkah 2). */
function hasBaileysAuthFiles(sessionId = DEFAULT_SESSION) {
  const id = sessionId || DEFAULT_SESSION;
  const authPath = getBaileysAuthPath(id);
  if (!existsSync(authPath)) return false;
  try {
    return readdirSync(authPath).length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * Setelah restart Node, socket Baileys kosong walau auth ada di disk — panggil init + tunggu open.
 * Dipakai sebelum kirim agar OTP tidak jatuh ke Puppeteer (No LID).
 */
export async function ensureBaileysReadyForSend(sessionId = DEFAULT_SESSION, maxWaitMs = 14000) {
  const id = sessionId || DEFAULT_SESSION;
  if (isBaileysConnected(id)) return true;
  if (!hasBaileysAuthFiles(id)) return false;
  try {
    await initBaileys(id);
  } catch (e) {
    if (WA_VERBOSE_LOG) console.warn('[WA Baileys] ensureBaileysReadyForSend init:', e?.message);
  }
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (isBaileysConnected(id)) return true;
    await new Promise((r) => setTimeout(r, 350));
  }
  return isBaileysConnected(id);
}

export async function sendMessageBaileys(sessionId, phoneNumber, text, imageBase64, imageMimetype) {
  const id = sessionId || DEFAULT_SESSION;
  const sock = sockRefBySession[id];
  const st = getBaileysStatusObj(id);
  if (!sock || st.status !== 'connected') return { ok: false, error: 'Baileys belum terhubung' };
  const { jids, reason } = await resolveSendJidsOrdered(sock, phoneNumber);
  if (jids.length === 0) {
    return {
      ok: false,
      error: reason === 'not_registered' ? 'Nomor tidak terdaftar di WhatsApp' : 'Nomor tidak valid',
    };
  }
  const content = (typeof text === 'string' ? text : '').trim() || '(pesan kosong)';
  const hasImage = typeof imageBase64 === 'string' && imageBase64.trim().length > 0;
  let lastErr = null;
  for (let i = 0; i < jids.length; i++) {
    const jid = jids[i];
    try {
      if (!hasImage && typeof sock.presenceSubscribe === 'function') {
        await sock.presenceSubscribe(jid).catch(() => {});
        await delay(i === 0 ? 400 : 250);
      }
      let result;
      if (hasImage) {
        const mimetype = (imageMimetype || 'image/png').split(';')[0].trim();
        const buffer = Buffer.from(imageBase64.replace(/^data:image\/[^;]+;base64,/, '').trim(), 'base64');
        result = await sock.sendMessage(jid, { image: buffer, caption: content }, {});
      } else {
        result = await sock.sendMessage(jid, { text: content }, {});
      }
      return { ok: true, messageId: result?.key?.id || null, senderPhoneNumber: st.phoneNumber };
    } catch (err) {
      lastErr = err;
      if (WA_VERBOSE_LOG) console.warn('[WA Baileys] sendMessage gagal jid=' + jid + ': ' + (err?.message || err));
      await delay(350);
    }
  }
  return { ok: false, error: humanizeLidSendError(lastErr?.message || lastErr) };
}

/** Kirim pesan dengan simulasi "sedang mengetik" (composing) sebelum kirim.
 * Catatan: Di Baileys indikator mengetik kadang tidak muncul (known issue). Tetap kirim presence agar bila WA mendukung akan terlihat. */
export async function sendMessageWithTypingBaileys(sessionId, phoneNumber, text, typingSeconds = 2) {
  const id = sessionId || DEFAULT_SESSION;
  const sock = sockRefBySession[id];
  const st = getBaileysStatusObj(id);
  if (!sock || st.status !== 'connected') return { ok: false, error: 'Baileys belum terhubung' };
  const { jids, reason } = await resolveSendJidsOrdered(sock, phoneNumber);
  if (jids.length === 0) {
    return {
      ok: false,
      error: reason === 'not_registered' ? 'Nomor tidak terdaftar di WhatsApp' : 'Nomor tidak valid',
    };
  }
  const content = (typeof text === 'string' ? text : '').trim() || '(pesan kosong)';
  const sec = Math.max(1, Math.min(10, Math.round(typingSeconds) || 2));
  let lastErr = null;
  for (let i = 0; i < jids.length; i++) {
    const jid = jids[i];
    try {
      if (i === 0) {
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
      } else {
        if (typeof sock.presenceSubscribe === 'function') await sock.presenceSubscribe(jid).catch(() => {});
        await delay(300);
      }
      const result = await sock.sendMessage(jid, { text: content }, {});
      return { ok: true, messageId: result?.key?.id || null, senderPhoneNumber: st.phoneNumber };
    } catch (err) {
      lastErr = err;
      await delay(350);
    }
  }
  return { ok: false, error: humanizeLidSendError(lastErr?.message || lastErr) };
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
