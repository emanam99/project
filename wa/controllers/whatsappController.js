/**
 * Login WA via Puppeteer (whatsapp-web.js); chat via Baileys. Multi-session (max 10).
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync, mkdirSync, readdirSync } from 'fs';
import qrcode from 'qrcode';
import { setWaStatus, getWaStatus, deleteWaSession } from '../store/waStatus.js';
import {
  initBaileys,
  disconnectBaileys,
  isBaileysConnected,
  sendMessageBaileys,
  getChatMessagesBaileys,
  editMessageBaileys,
  checkNumberBaileys,
  getBaileysAuthPathForDelete,
  getBaileysAuthPath,
} from './waBaileys.js';
const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require('whatsapp-web.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_BASE = path.resolve(__dirname, '../whatsapp-sessions');
const DEFAULT_SESSION = 'default';
const MAX_SESSIONS = 10;

const clientsBySession = {};
let waEngineEnabled = true;
const WA_FORWARD_TIMEOUT_MS = Number(process.env.WA_FORWARD_TIMEOUT_MS || 8000);
const WA_VERBOSE_LOG = process.env.WA_VERBOSE_LOG === 'true';

async function fetchWithTimeout(url, options = {}, timeoutMs = WA_FORWARD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getSafeSessionId(rawSessionId) {
  const sessionId = (rawSessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
}

export function isWaEngineEnabled() {
  return waEngineEnabled;
}

export async function setWaEngineEnabled(enabled) {
  const next = enabled === true;
  waEngineEnabled = next;
  if (next) {
    return;
  }

  const activeSessionIds = Object.keys(clientsBySession);
  for (const id of activeSessionIds) {
    const current = clientsBySession[id];
    if (current) {
      try {
        await current.destroy();
      } catch (_) {}
      delete clientsBySession[id];
    }
    await disconnectBaileys(id);
    setWaStatus(id, {
      status: 'disconnected',
      qrCode: null,
      phoneNumber: null,
      baileysStatus: 'disconnected',
      baileysQrCode: null,
      baileysPhoneNumber: null,
    });
  }
}

function respondWaEngineStopped(res) {
  return res.status(503).json({
    success: false,
    message: 'Server WA sedang dihentikan sementara. Jalankan lagi untuk memakai fitur WA.',
  });
}

export function isPuppeteerReady(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  const c = clientsBySession[id];
  return c && typeof c.info !== 'undefined' && c.info != null;
}

function formatPhoneForWwebjs(phone) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n || null;
}

export async function sendMessagePuppeteer(sessionId, phoneNumber, text, chatIdOverride = null) {
  const id = sessionId || DEFAULT_SESSION;
  const c = clientsBySession[id];
  if (!c || !c.info) return { ok: false, error: 'Puppeteer belum siap' };
  let chatId = chatIdOverride && typeof chatIdOverride === 'string' && chatIdOverride.includes('@') ? chatIdOverride : null;
  if (!chatId) {
    const num = formatPhoneForWwebjs(phoneNumber);
    if (!num || num.length < 10) return { ok: false, error: 'Nomor tidak valid' };
    chatId = num.includes('@') ? num : num + '@c.us';
  }
  const isLid = /@lid$/i.test(chatId);
  try {
    let msg;
    if (isLid && typeof c.getChatById === 'function') {
      const chat = await c.getChatById(chatId);
      if (chat && typeof chat.sendMessage === 'function') {
        msg = await chat.sendMessage(text || '(pesan kosong)');
      } else {
        msg = await c.sendMessage(chatId, text || '(pesan kosong)');
      }
    } else {
      msg = await c.sendMessage(chatId, text || '(pesan kosong)');
    }
    const senderNumber = c.info?.wid?.user || c.info?.wid?.id?.split(':')[0] || null;
    return { ok: true, messageId: msg?.id?._serialized || msg?.id || null, senderPhoneNumber: senderNumber };
  } catch (err) {
    console.error('[WA Puppeteer] sendMessage error chatId=' + chatId + ': ' + (err?.message || err));
    return { ok: false, error: err?.message || String(err) };
  }
}

async function checkNumberPuppeteer(sessionId, phoneNumber) {
  const id = sessionId || DEFAULT_SESSION;
  const c = clientsBySession[id];
  if (!c || !c.info) return { ok: false, error: 'Puppeteer belum siap', isRegistered: false };
  const num = formatPhoneForWwebjs(phoneNumber);
  if (!num || num.length < 10) return { ok: false, error: 'Nomor tidak valid', isRegistered: false };
  try {
    const numberId = await c.getNumberId(num.replace('@c.us', ''));
    const isRegistered = numberId != null;
    const formatted = numberId?._serialized?.replace('@c.us', '') || (isRegistered ? num : null);
    return { ok: true, phoneNumber: formatted || num, isRegistered };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), isRegistered: false };
  }
}

function getSessionPath(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (safe === 'default') return path.resolve(SESSIONS_BASE, 'wwebjs');
  return path.resolve(SESSIONS_BASE, `wwebjs-${safe}`);
}

/** User-Agent berbeda per slot agar tiap session terlihat sebagai device berbeda (tidak terdeteksi 1 device). */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];
function getUserAgentForSession(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  const index = id === 'default' ? 0 : (parseInt(id.replace(/\D/g, ''), 10) || 1);
  return USER_AGENTS[index % USER_AGENTS.length];
}

function createClient(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  const SESSION_PATH = getSessionPath(id);
  if (!existsSync(SESSION_PATH)) {
    mkdirSync(SESSION_PATH, { recursive: true });
  }
  // Setiap slot punya profil Chromium sendiri agar tidak bentrok saat banyak instance (hingga 10 WA)
  const browserProfilePath = path.join(SESSION_PATH, 'browser-profile');

  const puppeteerArgs = [
    `--user-data-dir=${browserProfilePath}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--headless=new',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-plugins-discovery',
    '--disable-accelerated-2d-canvas',
    '--disable-infobars',
    '--disable-default-apps',
    '--disable-popup-blocking',
    '--disable-translate',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-sync',
    '--disable-client-side-phishing-detection',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--no-default-browser-check',
    '--mute-audio',
    '--window-size=1024,768',
  ];

  const clientConfig = {
    authStrategy: new LocalAuth({
      clientId: 'wa-uwaba-' + id,
      dataPath: SESSION_PATH,
    }),
    puppeteer: {
      headless: true,
      defaultViewport: { width: 1024, height: 768 },
      args: puppeteerArgs,
    },
    userAgent: getUserAgentForSession(id),
  };

  const c = new Client(clientConfig);

  c.on('qr', async (qr) => {
    try {
      const qrData = await qrcode.toDataURL(qr);
      setWaStatus(id, { status: 'connecting', qrCode: qrData });
      console.log('[WA]', id, 'QR code diterima');
    } catch (e) {
      console.error('[WA] QR toDataURL error:', e.message);
    }
  });

  c.on('ready', () => {
    let phoneNumber = null;
    try {
      const info = c.info;
      const wid = info?.wid;
      if (wid) {
        if (typeof wid.user === 'string') phoneNumber = wid.user;
        else if (typeof wid.id === 'string') phoneNumber = wid.id.split(':')[0].split('@')[0] || null;
        else if (typeof wid._id === 'string') phoneNumber = wid._id.split('@')[0] || null;
      }
    } catch (_) {}
    setWaStatus(id, { status: 'connected', qrCode: null, phoneNumber });
    console.log('[WA] Puppeteer', id, 'terhubung. Nomor:', phoneNumber || '(unknown)');
    initBaileys(id).catch((err) => console.warn('[WA] Init Baileys', id, err?.message));
  });

  c.on('authenticated', () => {
    console.log('[WA]', id, 'Authenticated');
  });

  c.on('auth_failure', (msg) => {
    console.error('[WA]', id, 'Auth failure:', msg);
    setWaStatus(id, { status: 'disconnected', qrCode: null, phoneNumber: null });
  });

  c.on('disconnected', (reason) => {
    console.log('[WA]', id, 'Disconnected:', reason);
    setWaStatus(id, { status: 'disconnected', qrCode: null, phoneNumber: null });
    delete clientsBySession[id];
  });

  // Pesan masuk: Puppeteer (whatsapp-web.js) yang terhubung via QR menerima pesan di sini.
  // Baileys messages.upsert hanya dapat pesan jika Baileys yang "aktif"; kebanyakan pesan masuk lewat event ini.
  c.on('message', async (msg) => {
    try {
      if (msg.fromMe) {
        if (WA_VERBOSE_LOG) console.log('[WA Puppeteer] skip: pesan fromMe');
        return;
      }
      const fromRaw = (msg.from || '').replace(/@c\.us$/i, '').replace(/@s\.whatsapp\.net$/i, '').trim();
      const digits = fromRaw.replace(/\D/g, '');
      if (digits.length < 10) {
        if (WA_VERBOSE_LOG) console.log('[WA Puppeteer] skip: nomor terlalu pendek', fromRaw);
        return;
      }
      const from62 = digits.startsWith('0') ? '62' + digits.slice(1) : (digits.startsWith('62') ? digits : '62' + digits);
      const body = typeof msg.body === 'string' ? msg.body : (msg.body || '');
      const messageId = (msg.id && (msg.id._serialized || msg.id)) || null;
      const apiBase = (process.env.UWABA_API_BASE_URL || '').trim().replace(/\/$/, '');
      if (!apiBase) {
        console.warn('[WA Puppeteer] UWABA_API_BASE_URL belum di-set, pesan masuk tidak diforward');
        return;
      }
      const waPath = apiBase.endsWith('/api') ? '/wa/incoming' : '/api/wa/incoming';
      const url = apiBase + waPath;
      const fromJid = (typeof msg.from === 'string' && msg.from.includes('@')) ? msg.from : null;
      const payload = { from: from62, message: body, messageId: messageId || undefined, sessionId: id, from_jid: fromJid || undefined };
      if (WA_VERBOSE_LOG) console.log('[WA Puppeteer] Pesan masuk dari ' + from62 + (fromJid ? ' jid=' + fromJid : '') + ' len=' + body.length + ', forward ke API ' + url);
      const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) {
        const waPort = process.env.PORT || '3001';
        if (WA_VERBOSE_LOG) console.log('[WA Puppeteer] Forward OK. Jika tidak dapat balasan: cek error_log PHP; pastikan api/.env punya WA_API_URL=http://127.0.0.1:' + waPort + '/api/whatsapp/send dan WA_API_KEY.');
      } else {
        console.error('[WA Puppeteer] Forward gagal: HTTP ' + res.status);
      }
    } catch (err) {
      console.error('[WA Puppeteer] message handler error:', err?.message);
    }
  });

  return c;
}

/** Daftar session ID yang punya folder di disk (wwebjs / wwebjs-wa2, ...). Agar frontend tampil semua slot saat load pertama. */
export function getSessionIdsFromDisk() {
  const ids = [];
  try {
    if (existsSync(SESSIONS_BASE)) {
      const dirs = readdirSync(SESSIONS_BASE);
      if (dirs.includes('wwebjs')) ids.push(DEFAULT_SESSION);
      for (const d of dirs) {
        if (d.startsWith('wwebjs-')) ids.push(d.replace(/^wwebjs-/, ''));
      }
    }
  } catch (_) {}
  return ids.length ? ids : [DEFAULT_SESSION];
}

/** Jumlah session (Puppeteer + Baileys folder) — maks 10 */
function countSessions() {
  const ids = new Set();
  for (const id of Object.keys(clientsBySession)) ids.add(id);
  try {
    if (existsSync(SESSIONS_BASE)) {
      const dirs = readdirSync(SESSIONS_BASE);
      for (const d of dirs) {
        if (d === 'wwebjs') ids.add(DEFAULT_SESSION);
        else if (d.startsWith('wwebjs-')) ids.add(d.replace(/^wwebjs-/, ''));
        else if (d === 'baileys-default') ids.add(DEFAULT_SESSION);
        else if (d.startsWith('baileys-')) ids.add(d.replace(/^baileys-/, ''));
      }
    }
  } catch (_) {}
  return ids.size;
}

/** Restore sesi default dari disk (Puppeteer). QR login selalu dari Puppeteer dulu. */
export function initWaOnStart() {
  if (!waEngineEnabled) return;
  const defaultPath = getSessionPath(DEFAULT_SESSION);
  if (!existsSync(defaultPath)) return;
  try {
    const files = readdirSync(defaultPath);
    if (files.length === 0) return;
  } catch (_) {
    return;
  }
  if (clientsBySession[DEFAULT_SESSION]) return;
  setWaStatus(DEFAULT_SESSION, { status: 'connecting' });
  const c = createClient(DEFAULT_SESSION);
  clientsBySession[DEFAULT_SESSION] = c;
  c.initialize().catch((err) => {
    console.error('[WA] Init on start error:', err?.message || err);
    setWaStatus(DEFAULT_SESSION, { status: 'disconnected', qrCode: null });
    delete clientsBySession[DEFAULT_SESSION];
  });
  console.log('[WA] Restore sesi default (Puppeteer)...');
}

/** Trigger koneksi WA jika sedang off. Dipanggil dari API PHP saat pendaftar menekan "Aktifkan notifikasi". */
export const wakeWhatsApp = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = getSafeSessionId(req.body?.sessionId || req.query?.sessionId || DEFAULT_SESSION);
    if (isBaileysConnected(safeId)) {
      return res.json({ success: true, message: 'WA sudah aktif.', data: { status: 'connected' } });
    }
    const st = getWaStatus(safeId);
    if (st.status === 'connecting' || st.baileysStatus === 'connecting') {
      return res.json({ success: true, message: 'WA sedang menghubungkan...', data: { status: 'connecting' } });
    }
    if (clientsBySession[safeId]) {
      return res.json({ success: true, message: 'Koneksi WA sedang dipersiapkan...', data: { status: 'connecting' } });
    }
    if (countSessions() >= MAX_SESSIONS) {
      return res.status(200).json({ success: true, message: 'Slot WA penuh. Coba lagi nanti.', data: { status: 'busy' } });
    }
    setWaStatus(safeId, { status: 'connecting', qrCode: null, baileysStatus: 'disconnected', baileysQrCode: null });
    const c = createClient(safeId);
    clientsBySession[safeId] = c;
    c.initialize().catch((err) => {
      console.error('[WA] Puppeteer initialize error:', err?.message || err);
      setWaStatus(safeId, { status: 'disconnected', qrCode: null });
      delete clientsBySession[safeId];
    });
    console.log('[WA] Wake: memulai koneksi untuk session', safeId);
    return res.json({ success: true, message: 'Memulai koneksi WA...', data: { status: 'connecting' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Gagal memicu koneksi: ' + (err?.message || String(err)) });
  }
};

export const connectWhatsApp = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    /** true = paksa QR baru (hindari response cache dari connect sebelumnya) */
    const refreshQr = req.body?.refreshQr === true;
    if (countSessions() >= MAX_SESSIONS && !clientsBySession[safeId]) {
      const st = getWaStatus(safeId);
      const hasBaileys = st.status === 'connected' || st.status === 'connecting';
      if (!hasBaileys) {
        return res.status(400).json({
          success: false,
          message: `Maksimal ${MAX_SESSIONS} koneksi WA. Putus atau logout salah satu terlebih dahulu.`,
        });
      }
    }

    const dataStatus = getWaStatus(safeId);
    if (isBaileysConnected(safeId)) {
      return res.json({
        success: true,
        message: 'WhatsApp sudah terhubung. Kirim pesan dan cek nomor siap dipakai.',
        data: {
          sessionId: safeId,
          status: 'connected',
          qrCode: null,
          phoneNumber: dataStatus.phoneNumber || dataStatus.baileysPhoneNumber,
          baileysStatus: 'connected',
          baileysQrCode: null,
          baileysPhoneNumber: dataStatus.baileysPhoneNumber || dataStatus.phoneNumber,
        },
      });
    }

    // Puppeteer sudah login: jangan destroy client. Tanpa refreshQr kembalikan status; dengan refreshQr hanya putus & init ulang Baileys (QR langkah 2).
    if (dataStatus.status === 'connected' && clientsBySession[safeId]) {
      if (refreshQr) {
        await disconnectBaileys(safeId);
        initBaileys(safeId).catch((err) => {
          console.error('[WA] initBaileys setelah refresh QR:', err?.message || err);
        });
        const st = getWaStatus(safeId);
        return res.json({
          success: true,
          message: st.baileysStatus === 'connected'
            ? 'Baileys terhubung.'
            : 'Memulai ulang Baileys. Gunakan tombol "Muat QR" untuk mengambil QR terbaru.',
          data: {
            sessionId: safeId,
            status: st.status,
            qrCode: null,
            phoneNumber: st.phoneNumber || null,
            baileysStatus: st.baileysStatus || 'disconnected',
            baileysQrCode: st.baileysQrCode || null,
            baileysPhoneNumber: st.baileysPhoneNumber || null,
          },
        });
      }
      return res.json({
        success: true,
        message: 'WhatsApp sudah login. Scan QR Baileys jika belum.',
        data: {
          sessionId: safeId,
          status: dataStatus.status,
          qrCode: null,
          phoneNumber: dataStatus.phoneNumber || null,
          baileysStatus: dataStatus.baileysStatus,
          baileysQrCode: dataStatus.baileysQrCode || null,
          baileysPhoneNumber: dataStatus.baileysPhoneNumber || null,
        },
      });
    }

    // Hanya kembalikan QR cache jika client masih hidup & peminta tidak minta QR baru (hindari respons yang sama terus saat klik "Muat ulang").
    if (
      !refreshQr &&
      dataStatus.status === 'connecting' &&
      (dataStatus.qrCode || dataStatus.baileysQrCode) &&
      clientsBySession[safeId]
    ) {
      return res.json({
        success: true,
        message: 'Scan QR code di bawah (Langkah 1: login WA).',
        data: {
          sessionId: safeId,
          status: dataStatus.status,
          qrCode: dataStatus.qrCode || dataStatus.baileysQrCode || null,
          phoneNumber: dataStatus.phoneNumber || null,
          baileysStatus: dataStatus.baileysStatus,
          baileysQrCode: dataStatus.baileysQrCode || null,
          baileysPhoneNumber: dataStatus.baileysPhoneNumber || null,
        },
      });
    }

    const current = clientsBySession[safeId];
    if (current) {
      try {
        await current.destroy();
      } catch (_) {}
      delete clientsBySession[safeId];
    }
    await disconnectBaileys(safeId);

    setWaStatus(safeId, { status: 'connecting', qrCode: null, baileysStatus: 'disconnected', baileysQrCode: null });
    const c = createClient(safeId);
    clientsBySession[safeId] = c;

    c.initialize().catch((err) => {
      console.error('[WA] Puppeteer initialize error:', err?.message || err);
      setWaStatus(safeId, { status: 'disconnected', qrCode: null });
      delete clientsBySession[safeId];
    });
    const st = getWaStatus(safeId);
    const qr = st.qrCode || null;
    const status = st.status || 'connecting';
    return res.json({
      success: true,
      message: qr
        ? 'Scan QR di bawah (Langkah 1: login WA).'
        : 'Memulai koneksi. Gunakan tombol "Muat QR" untuk mengambil QR terbaru.',
      data: {
        sessionId: safeId,
        status,
        qrCode: qr,
        phoneNumber: st.phoneNumber || null,
        baileysStatus: st.baileysStatus || 'disconnected',
        baileysQrCode: st.baileysQrCode || null,
        baileysPhoneNumber: st.baileysPhoneNumber || null,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menghubungkan: ' + (err?.message || String(err)),
    });
  }
};

export const disconnectWhatsApp = async (req, res) => {
  try {
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    const current = clientsBySession[safeId];
    if (current) {
      try {
        await current.destroy();
      } catch (_) {}
      delete clientsBySession[safeId];
    }
    await disconnectBaileys(safeId);
    setWaStatus(safeId, { status: 'disconnected', qrCode: null, phoneNumber: null, baileysStatus: 'disconnected', baileysQrCode: null, baileysPhoneNumber: null });
    return res.json({
      success: true,
      message: 'WhatsApp berhasil diputus.',
      data: { sessionId: safeId },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal memutus koneksi',
    });
  }
};

export const logoutWhatsApp = async (req, res) => {
  try {
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    const current = clientsBySession[safeId];
    if (current) {
      try {
        await current.destroy();
      } catch (_) {}
      delete clientsBySession[safeId];
    }
    await disconnectBaileys(safeId);
    const sessionPath = getSessionPath(safeId);
    if (existsSync(sessionPath)) rmSync(sessionPath, { recursive: true, force: true });
    const baileysPath = getBaileysAuthPathForDelete(safeId);
    if (existsSync(baileysPath)) rmSync(baileysPath, { recursive: true, force: true });
    setWaStatus(safeId, { status: 'disconnected', qrCode: null, phoneNumber: null, baileysStatus: 'disconnected', baileysQrCode: null, baileysPhoneNumber: null });
    return res.json({
      success: true,
      message: 'WhatsApp berhasil logout. Nyalakan lagi untuk scan QR Code.',
      data: { sessionId: safeId },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal logout',
    });
  }
};

export const deleteSlotWhatsApp = async (req, res) => {
  try {
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);

    const current = clientsBySession[safeId];
    if (current) {
      try {
        await current.destroy();
      } catch (_) {}
      delete clientsBySession[safeId];
    }

    await disconnectBaileys(safeId);

    const sessionPath = getSessionPath(safeId);
    if (existsSync(sessionPath)) rmSync(sessionPath, { recursive: true, force: true });
    const baileysPath = getBaileysAuthPathForDelete(safeId);
    if (existsSync(baileysPath)) rmSync(baileysPath, { recursive: true, force: true });

    // Hapus baris slot dari status store agar tidak tampil lagi di UI.
    deleteWaSession(safeId);

    return res.json({
      success: true,
      message: 'Slot WA berhasil dihapus.',
      data: { sessionId: safeId },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus slot WA',
    });
  }
};

export const sendMessage = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    const { phoneNumber, message, imageBase64, imageMimetype, chatId: bodyChatId } = req.body || {};
    const text = typeof message === 'string' ? message : '';
    const chatIdOverride = typeof bodyChatId === 'string' && bodyChatId.trim() ? bodyChatId.trim() : null;
    if (WA_VERBOSE_LOG) console.log('[WA] POST /send to ' + (phoneNumber || '') + (chatIdOverride ? ' chatId=' + chatIdOverride : '') + ' len=' + text.length);
    let result;
    if (isBaileysConnected(safeId)) {
      result = await sendMessageBaileys(safeId, phoneNumber, text, imageBase64, imageMimetype);
      if (WA_VERBOSE_LOG) console.log('[WA] send via Baileys: ' + (result.ok ? 'OK' : 'fail ' + (result.error || '')));
    } else if (isPuppeteerReady(safeId)) {
      if (imageBase64) {
        return res.status(200).json({ success: false, message: 'Kirim gambar hanya didukung setelah scan Langkah 2 (Baileys). Kirim teks saja untuk tes.' });
      }
      result = await sendMessagePuppeteer(safeId, phoneNumber, text, chatIdOverride);
      if (WA_VERBOSE_LOG) console.log('[WA] send via Puppeteer: ' + (result.ok ? 'OK' : 'fail ' + (result.error || '')));
    } else {
      if (WA_VERBOSE_LOG) console.log('[WA] send: belum login (Baileys/Puppeteer tidak siap)');
      return res.status(200).json({
        success: false,
        message: 'Belum login untuk session ini. Scan QR Langkah 1 di tab Koneksi WA.',
      });
    }
    if (!result.ok) {
      if (result.error === 'Nomor tidak valid') return res.status(400).json({ success: false, message: result.error });
      return res.status(500).json({ success: false, message: result.error || 'Gagal mengirim pesan' });
    }
    return res.json({
      success: true,
      message: 'Pesan terkirim',
      messageId: result.messageId || undefined,
      senderPhoneNumber: result.senderPhoneNumber || undefined,
    });
  } catch (err) {
    console.error('[WA] sendMessage error:', err?.message || err);
    return res.status(500).json({ success: false, message: err?.message || 'Gagal mengirim pesan' });
  }
};

export const getChatMessages = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = getSafeSessionId(req.body?.sessionId || req.query?.sessionId || DEFAULT_SESSION);
    if (!isBaileysConnected(safeId)) {
      return res.status(200).json({ success: false, message: 'Belum login. Scan QR di tab Koneksi WA.', data: [] });
    }
    const { phoneNumber, limit: limitParam } = req.body || req.query || {};
    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100);
    const result = await getChatMessagesBaileys(safeId, phoneNumber, limit);
    if (!result.ok) {
      if (result.error === 'Nomor tidak valid') return res.status(400).json({ success: false, message: result.error, data: [] });
      return res.status(200).json({ success: false, message: result.error || 'Baileys belum terhubung', data: [] });
    }
    return res.json({ success: true, data: result.data || [], message: result.message || 'OK' });
  } catch (err) {
    console.error('[WA] getChatMessages error:', err?.message || err);
    return res.status(500).json({ success: false, message: err?.message || 'Gagal mengambil pesan', data: [] });
  }
};

export const editMessage = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    if (!isBaileysConnected(safeId)) {
      return res.status(200).json({ success: false, message: 'Belum login. Scan QR di tab Koneksi WA.' });
    }
    const { phoneNumber, messageId, newMessage } = req.body || {};
    const msgId = typeof messageId === 'string' ? messageId.trim() : '';
    const newBody = typeof newMessage === 'string' ? newMessage.trim() : '';
    if (!msgId) return res.status(400).json({ success: false, message: 'messageId wajib' });
    if (newBody === '') return res.status(400).json({ success: false, message: 'Isi pesan baru tidak boleh kosong' });
    const result = await editMessageBaileys(safeId, phoneNumber, msgId, newBody);
    if (!result.ok) {
      if (result.error === 'Nomor tidak valid') return res.status(400).json({ success: false, message: result.error });
      return res.status(400).json({ success: false, message: result.error || 'Gagal mengedit pesan' });
    }
    return res.json({ success: true, message: 'Pesan berhasil diedit', messageId: result.messageId || msgId });
  } catch (err) {
    console.error('[WA] editMessage error:', err?.message || err);
    return res.status(500).json({ success: false, message: err?.message || 'Gagal mengedit pesan' });
  }
};

export const checkNumber = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    const { phoneNumber } = req.body || {};
    let result;
    if (isBaileysConnected(safeId)) {
      result = await checkNumberBaileys(safeId, phoneNumber);
    } else if (isPuppeteerReady(safeId)) {
      result = await checkNumberPuppeteer(safeId, phoneNumber);
    } else {
      return res.status(200).json({
        success: false,
        message: 'Belum login. Scan QR Langkah 1 di tab Koneksi WA.',
      });
    }
    if (!result.ok) {
      if (result.error === 'Nomor tidak valid') return res.status(400).json({ success: false, message: result.error });
      return res.status(200).json({ success: false, message: result.error || 'Gagal mengecek nomor' });
    }
    return res.json({
      success: true,
      data: { phoneNumber: result.phoneNumber, isRegistered: result.isRegistered },
      message: result.isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp',
    });
  } catch (err) {
    console.error('[WA] checkNumber error:', err?.message || err);
    return res.status(500).json({ success: false, message: err?.message || 'Gagal mengecek nomor' });
  }
};
