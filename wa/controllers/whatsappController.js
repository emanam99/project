/**
 * Login WA via Puppeteer (whatsapp-web.js); chat via Baileys. Multi-session (max 10).
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync, mkdirSync, readdirSync } from 'fs';
import qrcode from 'qrcode';
import { setWaStatus, getWaStatus } from '../store/waStatus.js';
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

export async function sendMessagePuppeteer(sessionId, phoneNumber, text) {
  const id = sessionId || DEFAULT_SESSION;
  const c = clientsBySession[id];
  if (!c || !c.info) return { ok: false, error: 'Puppeteer belum siap' };
  const num = formatPhoneForWwebjs(phoneNumber);
  if (!num || num.length < 10) return { ok: false, error: 'Nomor tidak valid' };
  const chatId = num.includes('@') ? num : num + '@c.us';
  try {
    const msg = await c.sendMessage(chatId, text || '(pesan kosong)');
    const senderNumber = c.info?.wid?.user || c.info?.wid?.id?.split(':')[0] || null;
    return { ok: true, messageId: msg?.id?._serialized || msg?.id || null, senderPhoneNumber: senderNumber };
  } catch (err) {
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
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
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

export const connectWhatsApp = async (req, res) => {
  try {
    const sessionId = (req.body?.sessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
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
    if (dataStatus.status === 'connecting' && (dataStatus.qrCode || dataStatus.baileysQrCode)) {
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

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const st = getWaStatus(safeId);
      if (st.qrCode || st.status === 'connected') break;
    }

    const st = getWaStatus(safeId);
    const qr = st.qrCode || null;
    const status = st.status || 'disconnected';
    return res.json({
      success: true,
      message: qr ? 'Scan QR di bawah (Langkah 1: login WA).' : status === 'connected' ? 'Sudah terhubung.' : 'Memulai koneksi...',
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
    const sessionId = (req.body?.sessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
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
    const sessionId = (req.body?.sessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
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

export const sendMessage = async (req, res) => {
  try {
    const sessionId = (req.body?.sessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
    const { phoneNumber, message, imageBase64, imageMimetype } = req.body || {};
    const text = typeof message === 'string' ? message : '';
    let result;
    if (isBaileysConnected(safeId)) {
      result = await sendMessageBaileys(safeId, phoneNumber, text, imageBase64, imageMimetype);
    } else if (isPuppeteerReady(safeId)) {
      if (imageBase64) {
        return res.status(200).json({ success: false, message: 'Kirim gambar hanya didukung setelah scan Langkah 2 (Baileys). Kirim teks saja untuk tes.' });
      }
      result = await sendMessagePuppeteer(safeId, phoneNumber, text);
    } else {
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
    const sessionId = (req.body?.sessionId || req.query?.sessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
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
    const sessionId = (req.body?.sessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
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
    const sessionId = (req.body?.sessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
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
