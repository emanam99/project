import './loadEnv.js';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PORT, CORS_ORIGINS, ADMIN_SECRET } from './config.js';
import { attachSocket } from './socket.js';
import { getAll, getCount } from './store.js';

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
