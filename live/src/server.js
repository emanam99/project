import './loadEnv.js';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PORT, CORS_ORIGINS, ADMIN_SECRET, LIVE_SERVER_API_KEY } from './config.js';
import { attachSocket } from './socket.js';
import { getAll, getCount, getSocketIdsByUserId } from './store.js';
import { authenticateSocket } from './auth.js';

const app = express();
const httpServer = createServer(app);

/** Izinkan origin dev (localhost, LAN) + *.alutsmani.id — selaras wa/server.js */
function isAllowedDevOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host === 'alutsmani.id' || host.endsWith('.alutsmani.id')) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (isAllowedDevOrigin(origin)) return true;
  if (CORS_ORIGINS.length === 0) return true;
  try {
    const requestUrl = new URL(origin);
    const requestOrigin = requestUrl.origin;
    const requestHost = requestUrl.hostname.toLowerCase();
    return CORS_ORIGINS.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        const allowedOrigin = allowedUrl.origin;
        const allowedHost = allowedUrl.hostname.toLowerCase();
        return (
          requestOrigin === allowedOrigin ||
          requestHost === allowedHost ||
          requestHost.endsWith(`.${allowedHost}`)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function corsOriginCallback(origin, callback) {
  if (!origin) return callback(null, true);
  if (isAllowedOrigin(origin)) return callback(null, origin);
  return callback(null, false);
}

const io = new Server(httpServer, {
  cors: {
    origin: corsOriginCallback,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({ origin: corsOriginCallback, credentials: true }));
app.use(express.json());

app.get('/health', (_, res) => {
  res.json({ ok: true, online: getCount() });
});

// Admin: daftar user online (opsional pakai secret)
app.get('/admin/online', (req, res) => {
  if (ADMIN_SECRET && req.query.secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ success: true, users: getAll(), count: getCount() });
});

/**
 * Dipanggil dari PHP (SantriController / Pendaftaran / Boyong) setelah data santri berubah.
 * Header: X-API-Key = LIVE_SERVER_API_KEY (wajib jika key di-set di .env).
 * Body JSON opsional:
 *  - removed_ids: id santri yang dihapus
 *  - removed_registrasi_ids: id psb___registrasi yang dihapus (cache Data Pendaftar)
 */
app.post('/internal/broadcast-santri-search-hint', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const keyOk =
    LIVE_SERVER_API_KEY === '' ||
    (typeof apiKey === 'string' && apiKey === LIVE_SERVER_API_KEY);
  if (!keyOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const removed = Array.isArray(req.body?.removed_ids)
    ? req.body.removed_ids.map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
    : [];
  const removedReg = Array.isArray(req.body?.removed_registrasi_ids)
    ? req.body.removed_registrasi_ids.map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
    : [];
  io.emit('santri_search_index_hint', {
    ts: new Date().toISOString(),
    removed_ids: removed,
    removed_registrasi_ids: removedReg,
  });
  return res.json({ success: true });
});

/**
 * Dipanggil dari PHP setelah daerah/kamar/pengurus domisili berubah — klien memuat ulang snapshot IndexedDB.
 */
/**
 * Dipanggil dari PHP (IjinController) setelah create/update/delete/mark kembali ijin.
 * Body JSON opsional: { id_santri?: number, tahun_ajaran?: string, action?: string }
 */
app.post('/internal/broadcast-ijin-hint', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const keyOk =
    LIVE_SERVER_API_KEY === '' ||
    (typeof apiKey === 'string' && apiKey === LIVE_SERVER_API_KEY);
  if (!keyOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const idSantri = req.body?.id_santri != null ? parseInt(String(req.body.id_santri), 10) : null;
  const tahunAjaran =
    req.body?.tahun_ajaran != null && String(req.body.tahun_ajaran).trim() !== ''
      ? String(req.body.tahun_ajaran).trim()
      : null;
  const action = typeof req.body?.action === 'string' && req.body.action.trim() !== '' ? req.body.action.trim() : null;
  const payload = {
    ts: new Date().toISOString(),
    id_santri: Number.isFinite(idSantri) && idSantri > 0 ? idSantri : null,
    tahun_ajaran: tahunAjaran,
    action,
  };
  io.emit('ijin_data_hint', payload);
  return res.json({ success: true });
});

app.post('/internal/broadcast-domisili-cache-hint', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const keyOk =
    LIVE_SERVER_API_KEY === '' ||
    (typeof apiKey === 'string' && apiKey === LIVE_SERVER_API_KEY);
  if (!keyOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  io.emit('domisili_cache_hint', {
    ts: new Date().toISOString(),
  });
  return res.json({ success: true });
});

/**
 * Dipanggil dari PHP setelah POST /api/chat/send — kirim receive_message ke semua socket users.id terkait.
 * Body: { target_user_ids: number[], payload: object }
 */
app.post('/internal/broadcast-chat-message', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const keyOk =
    LIVE_SERVER_API_KEY === '' ||
    (typeof apiKey === 'string' && apiKey === LIVE_SERVER_API_KEY);
  if (!keyOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const ids = Array.isArray(req.body?.target_user_ids)
    ? [...new Set(req.body.target_user_ids.map((n) => parseInt(String(n), 10)).filter((n) => n > 0))]
    : [];
  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object' || ids.length === 0) {
    return res.json({ success: true, delivered: 0 });
  }
  let delivered = 0;
  for (const uid of ids) {
    const sockets = getSocketIdsByUserId(uid);
    for (const sid of sockets) {
      io.to(sid).emit('receive_message', payload);
      delivered += 1;
    }
  }
  return res.json({ success: true, delivered });
});

/**
 * Broadcast event Socket.IO arbitrer (PHP → semua socket users.id target).
 * Body: { event: string, target_user_ids: number[], payload: object }
 */
app.post('/internal/broadcast-chat-event', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const keyOk =
    LIVE_SERVER_API_KEY === '' ||
    (typeof apiKey === 'string' && apiKey === LIVE_SERVER_API_KEY);
  if (!keyOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const eventName =
    typeof req.body?.event === 'string' ? req.body.event.trim() : '';
  const ids = Array.isArray(req.body?.target_user_ids)
    ? [...new Set(req.body.target_user_ids.map((n) => parseInt(String(n), 10)).filter((n) => n > 0))]
    : [];
  const payload = req.body?.payload;
  if (!eventName || !payload || typeof payload !== 'object' || ids.length === 0) {
    return res.json({ success: true, delivered: 0 });
  }
  let delivered = 0;
  for (const uid of ids) {
    const sockets = getSocketIdsByUserId(uid);
    for (const sid of sockets) {
      io.to(sid).emit(eventName, payload);
      delivered += 1;
    }
  }
  return res.json({ success: true, delivered });
});

/**
 * Dipanggil dari API tracking app install activity.
 * Broadcast hint agar dashboard online menarik data realtime terbaru.
 */
app.post('/internal/broadcast-app-install-activity', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const keyOk =
    LIVE_SERVER_API_KEY === '' ||
    (typeof apiKey === 'string' && apiKey === LIVE_SERVER_API_KEY);
  if (!keyOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  io.emit('app_install_activity_hint', {
    ts: new Date().toISOString(),
    app_key: typeof req.body?.app_key === 'string' ? req.body.app_key : null,
    access_mode: typeof req.body?.access_mode === 'string' ? req.body.access_mode : null,
  });
  return res.json({ success: true });
});

/**
 * Broadcast kemajuan WA massal Manage Data (PHP → semua klien).
 * Body: { payload: object }
 */
app.post('/internal/broadcast-manage-wa-bulk', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const keyOk =
    LIVE_SERVER_API_KEY === '' ||
    (typeof apiKey === 'string' && apiKey === LIVE_SERVER_API_KEY);
  if (!keyOk) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object') {
    return res.json({ success: true, emitted: false });
  }
  io.emit('manage_wa_bulk_progress', payload);
  return res.json({ success: true, emitted: true });
});

io.use(authenticateSocket);
attachSocket(io);

httpServer.listen(PORT, () => {
  console.log(`Live server http://0.0.0.0:${PORT} (Socket.IO ready)`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} sudah dipakai. Tutup proses lain yang memakai port ${PORT}, atau set PORT lain di .env`);
    process.exit(1);
  }
  throw err;
});
