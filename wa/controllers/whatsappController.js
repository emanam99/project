/**
 * WhatsApp Web via Puppeteer (whatsapp-web.js).
 * Menggantikan Baileys agar QR login stabil dan session tersimpan.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync, mkdirSync } from 'fs';
import qrcode from 'qrcode';
import { setWaStatus } from '../store/waStatus.js';

const require = createRequire(import.meta.url);
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_BASE = path.resolve(__dirname, '../whatsapp-sessions');
const SESSION_PATH = path.resolve(SESSIONS_BASE, 'wwebjs');
const CLIENT_ID = 'wa-uwaba';

export const client = { current: null };
export const status = {
  status: 'disconnected',
  qrCode: null,
  phoneNumber: null,
};

function syncToStore() {
  try {
    setWaStatus({
      status: status.status,
      qrCode: status.qrCode,
      phoneNumber: status.phoneNumber,
    });
  } catch (_) {}
}

/** Format nomor ke 62xxxxxxxxxx (tanpa @c.us) */
function formatPhoneNumber(phone) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (!n.startsWith('62')) n = '62' + n;
  return n || null;
}

/** Format nomor ke 62xxxxxxxxxx lalu chatId @c.us */
function formatPhoneToChatId(phone) {
  const n = formatPhoneNumber(phone);
  return n ? n + '@c.us' : null;
}

function createClient() {
  if (!existsSync(SESSION_PATH)) {
    mkdirSync(SESSION_PATH, { recursive: true });
  }

  const clientConfig = {
    authStrategy: new LocalAuth({
      clientId: CLIENT_ID,
      dataPath: SESSION_PATH, // path absolut agar session konsisten
    }),
    puppeteer: {
      headless: true,
      // Viewport kecil = kurang pixel yang di-render (hemat RAM/CPU). Satu tab saja.
      defaultViewport: { width: 1024, height: 768 },
      args: [
        // Keamanan & dasar (wajib headless)
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--headless=new',
        // Nonaktifkan fitur browser yang tidak dipakai (hemat resource)
        '--disable-extensions',
        '--disable-plugins',
        '--disable-plugins-discovery',
        '--disable-accelerated-2d-canvas',
        '--disable-accelerated-jpeg-decoding',
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
        // Batasi ukuran jendela (satu tab, resolusi cukup untuk WA Web)
        '--window-size=1024,768',
      ],
    },
    // User-Agent mirip browser nyata agar WhatsApp (termasuk Business) tidak mendeteksi automation
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  const c = new Client(clientConfig);

  c.on('qr', async (qr) => {
    console.log('[WA] QR code diterima, tunggu scan di HP');
    try {
      const qrData = await qrcode.toDataURL(qr);
      status.qrCode = qrData;
      status.status = 'connecting';
      syncToStore();
    } catch (e) {
      console.error('[WA] QR toDataURL error:', e.message);
    }
  });

  c.on('ready', () => {
    status.status = 'connected';
    status.qrCode = null;
    try {
      const info = c.info;
      const wid = info?.wid;
      if (wid) {
        if (typeof wid.user === 'string') status.phoneNumber = wid.user;
        else if (typeof wid.id === 'string') status.phoneNumber = wid.id.split(':')[0].split('@')[0] || null;
        else if (typeof wid._id === 'string') status.phoneNumber = wid._id.split('@')[0] || null;
      }
    } catch (_) {
      status.phoneNumber = null;
    }
    syncToStore();
    console.log('[WA] Terhubung. Nomor:', status.phoneNumber || '(unknown)');
  });

  c.on('authenticated', () => {
    console.log('[WA] Authenticated, sesi akan disimpan. Jangan matikan server 1–2 menit agar simpan ke disk selesai.');
  });

  c.on('auth_failure', (msg) => {
    console.error('[WA] Auth failure (sesi ditolak WhatsApp):', msg);
    status.status = 'disconnected';
    status.qrCode = null;
    status.phoneNumber = null;
    syncToStore();
  });

  c.on('disconnected', (reason) => {
    console.log('[WA] Disconnected:', reason);
    status.status = 'disconnected';
    status.qrCode = null;
    status.phoneNumber = null;
    client.current = null;
    syncToStore();
  });

  return c;
}

/**
 * Restore sesi WA saat server start. Jika ada session di disk, client akan ready tanpa QR.
 * Tidak await — berjalan di background.
 */
export function initWaOnStart() {
  if (client.current) return;
  status.status = 'connecting';
  syncToStore();
  const c = createClient();
  client.current = c;
  c.initialize().catch((err) => {
    console.error('[WA] Init on start error:', err?.message || err);
    status.status = 'disconnected';
    status.qrCode = null;
    client.current = null;
    syncToStore();
  });
  console.log('[WA] Restore sesi dari disk...');
}

export const connectWhatsApp = async (req, res) => {
  try {
    if (client.current && status.status === 'connected') {
      return res.json({
        success: true,
        message: 'WhatsApp sudah terhubung',
        data: {
          status: status.status,
          phoneNumber: status.phoneNumber,
        },
      });
    }

    // Jangan destroy client yang sedang connecting (restore dari session / menunggu scan QR)
    if (client.current && status.status === 'connecting') {
      return res.json({
        success: true,
        message: status.qrCode ? 'Scan QR code di bawah.' : 'Menghubungkan dari sesi tersimpan...',
        data: {
          status: status.status,
          qrCode: status.qrCode || null,
          phoneNumber: status.phoneNumber || null,
        },
      });
    }

    if (client.current) {
      try {
        await client.current.destroy();
      } catch (_) {}
      client.current = null;
    }

    status.status = 'connecting';
    status.qrCode = null;
    syncToStore();

    const c = createClient();
    client.current = c;

    c.initialize().catch((err) => {
      console.error('[WA] Initialize error:', err?.message || err);
      status.status = 'disconnected';
      status.qrCode = null;
      client.current = null;
      syncToStore();
    });

    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      if (status.qrCode) break;
      if (status.status === 'connected') break;
    }

    return res.json({
      success: true,
      message: status.qrCode ? 'Scan QR code di bawah.' : status.status === 'connected' ? 'Sudah terhubung.' : 'Memulai koneksi WhatsApp...',
      data: {
        status: status.status,
        qrCode: status.qrCode || null,
        phoneNumber: status.phoneNumber || null,
      },
    });
  } catch (err) {
    status.status = 'disconnected';
    syncToStore();
    return res.status(500).json({
      success: false,
      message: 'Gagal menghubungkan: ' + (err?.message || String(err)),
    });
  }
};

export const disconnectWhatsApp = async (req, res) => {
  try {
    if (client.current) {
      try {
        await client.current.destroy();
      } catch (_) {}
      client.current = null;
    }
    status.status = 'disconnected';
    status.qrCode = null;
    status.phoneNumber = null;
    syncToStore();
    return res.json({
      success: true,
      message: 'WhatsApp berhasil diputus. Nyalakan lagi tanpa perlu scan QR.',
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
    if (client.current) {
      try {
        await client.current.destroy();
      } catch (_) {}
      client.current = null;
    }
    if (existsSync(SESSION_PATH)) {
      rmSync(SESSION_PATH, { recursive: true, force: true });
    }
    status.status = 'disconnected';
    status.qrCode = null;
    status.phoneNumber = null;
    syncToStore();
    return res.json({
      success: true,
      message: 'WhatsApp berhasil logout. Nyalakan lagi untuk scan QR Code.',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Gagal logout',
    });
  }
};

/**
 * Kirim pesan teks atau teks + gambar.
 * Jika WA mati: auto nyalakan (initWaOnStart), lalu return 503 + pesan agar user coba lagi.
 * Body: { phoneNumber, message, imageBase64?, imageMimetype? }
 */
export const sendMessage = async (req, res) => {
  try {
    if (!client.current || status.status !== 'connected') {
      if (status.status === 'disconnected' || !client.current) {
        initWaOnStart();
      }
      return res.status(503).json({
        success: false,
        message: status.status === 'connecting'
          ? 'WhatsApp sedang menghubungkan. Coba kirim lagi dalam 1–2 menit atau scan QR di Kelola Koneksi WA.'
          : 'WhatsApp belum terhubung. Koneksi sedang dinyalakan. Coba kirim lagi dalam 1–2 menit atau buka Kelola Koneksi WA untuk scan QR.',
      });
    }

    const { phoneNumber, message, imageBase64, imageMimetype } = req.body || {};
    const chatId = formatPhoneToChatId(phoneNumber);
    if (!chatId) {
      return res.status(400).json({ success: false, message: 'Nomor tidak valid' });
    }

    const text = typeof message === 'string' ? message : '';
    const hasImage = typeof imageBase64 === 'string' && imageBase64.trim().length > 0;

    if (hasImage) {
      const mimetype = (imageMimetype || 'image/png').split(';')[0].trim();
      const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, '').trim();
      const media = new MessageMedia(mimetype, base64Data);
      await client.current.sendMessage(chatId, media, { caption: text || undefined });
    } else {
      await client.current.sendMessage(chatId, text || '(pesan kosong)');
    }

    return res.json({ success: true, message: 'Pesan terkirim' });
  } catch (err) {
    console.error('[WA] sendMessage error:', err?.message || err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Gagal mengirim pesan',
    });
  }
};

/**
 * Cek apakah nomor terdaftar/aktif di WhatsApp.
 * Jika WA mati: auto nyalakan (initWaOnStart), lalu return 503 + pesan agar user coba lagi.
 * Body: { phoneNumber }
 */
export const checkNumber = async (req, res) => {
  try {
    if (!client.current || status.status !== 'connected') {
      if (status.status === 'disconnected' || !client.current) {
        initWaOnStart();
      }
      return res.status(503).json({
        success: false,
        message: status.status === 'connecting'
          ? 'WhatsApp sedang menghubungkan. Coba cek lagi dalam 1–2 menit atau scan QR di Kelola Koneksi WA.'
          : 'WhatsApp belum terhubung. Koneksi sedang dinyalakan. Coba cek lagi dalam 1–2 menit atau buka Kelola Koneksi WA untuk scan QR.',
      });
    }

    const { phoneNumber } = req.body || {};
    const formatted = formatPhoneNumber(phoneNumber);
    if (!formatted) {
      return res.status(400).json({ success: false, message: 'Nomor tidak valid' });
    }

    const numberId = await client.current.getNumberId(formatted);
    const isRegistered = !!numberId;

    return res.json({
      success: true,
      data: {
        phoneNumber: formatted,
        isRegistered,
      },
      message: isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp',
    });
  } catch (err) {
    console.error('[WA] checkNumber error:', err?.message || err);
    return res.status(500).json({
      success: false,
      message: err?.message || 'Gagal mengecek nomor',
    });
  }
};
