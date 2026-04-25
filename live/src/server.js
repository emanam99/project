import './loadEnv.js';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PORT, CORS_ORIGINS, ADMIN_SECRET, LIVE_SERVER_API_KEY } from './config.js';
import { attachSocket } from './socket.js';
import { getAll, getCount, getSocketIdsByUserId } from './store.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : true,
    methods: ['GET', 'POST'],
  },
});

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (CORS_ORIGINS.length === 0) return true;
  try {
    const u = new URL(origin);
    const host = u.origin;
    return CORS_ORIGINS.some((o) => o === host || host.endsWith(new URL(o).hostname));
  } catch {
    return false;
  }
}

app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin) || !origin) }));
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
