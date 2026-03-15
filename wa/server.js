import 'dotenv/config';

// Redam warning Node/Baileys yang sering muncul (Buffer, ExperimentalWarning, dll.)
const origEmit = process.emitWarning;
process.emitWarning = function (msg, type, code, ...rest) {
  const s = typeof msg === 'string' ? msg : (msg?.message || String(msg));
  if (/ExperimentalWarning|Buffer\.alloc|Deprecation|Custom ESM|fetch|punycode|Invalid charset/i.test(s)) return;
  return origEmit.call(process, msg, type, code, ...rest);
};
const origWarn = console.warn;
console.warn = function (...args) {
  const s = args.map(a => typeof a === 'string' ? a : (a?.message || String(a))).join(' ');
  if (/ExperimentalWarning|Buffer|Deprecation|punycode|Invalid charset|Use the `encoding` option/i.test(s)) return;
  return origWarn.apply(console, args);
};

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { getWaStatus } from './store/waStatus.js';
import authRoutes from './routes/authRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import warmerRoutes from './routes/warmerRoutes.js';
import { initWaOnStart, getSessionIdsFromDisk } from './controllers/whatsappController.js';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5175';

/** Izinkan origin: localhost, 127.0.0.1, atau host berakhiran .alutsmani.id / persis alutsmani.id */
function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host === 'alutsmani.id' || host.endsWith('.alutsmani.id')) return true;
    return false;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin / curl
      if (isAllowedOrigin(origin)) return callback(null, origin); // echo origin agar header ter-set
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

// GET status WA — tanpa auth (polling dari frontend). Mengembalikan data.sessions (multi-WA) + backward compat.
// Semua slot yang punya folder di disk ikut dikembalikan agar saat load pertama frontend tampil semua.
app.get('/api/whatsapp/status', (req, res) => {
  res.setHeader('X-WA-Endpoint', 'status-public');
  try {
    const sessionId = req.query?.sessionId;
    const data = getWaStatus(sessionId || undefined);
    const diskIds = getSessionIdsFromDisk();
    if (data.sessions && typeof data.sessions === 'object') {
      const empty = { status: 'disconnected', qrCode: null, phoneNumber: null, baileysStatus: 'disconnected', baileysQrCode: null, baileysPhoneNumber: null };
      for (const id of diskIds) {
        if (!Object.prototype.hasOwnProperty.call(data.sessions, id)) {
          data.sessions[id] = { ...empty };
        }
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      data: { sessions: {}, status: 'disconnected', qrCode: null, phoneNumber: null },
    }));
  }
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/warmer', warmerRoutes);

app.listen(PORT, () => {
  const uwabaBase = (process.env.UWABA_API_BASE_URL || '').trim().replace(/\/$/, '');
  const incomingUrl = uwabaBase ? (uwabaBase + (uwabaBase.endsWith('/api') ? '/wa/incoming' : '/api/wa/incoming')) : '(belum di-set)';
  console.log(`[WA] http://localhost:${PORT}`);
  console.log(`[WA] UWABA_API_BASE_URL: ${uwabaBase || '(tidak di-set — pesan masuk tidak akan diforward ke API)'}`);
  console.log(`[WA] Webhook pesan masuk: POST ${incomingUrl}`);
  console.log('[WA] CORS: *.alutsmani.id + localhost');
  initWaOnStart();
});
