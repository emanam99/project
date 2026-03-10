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
import { initWaOnStart } from './controllers/whatsappController.js';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5175';

const allowedOrigins = [
  'http://localhost:5175',
  'http://localhost:5173',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5173',
  FRONTEND_URL,
  process.env.UWABA_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

// GET status WA — tanpa auth (polling dari frontend). Jangan pindah ke bawah app.use('/api/whatsapp').
app.get('/api/whatsapp/status', (_req, res) => {
  res.setHeader('X-WA-Endpoint', 'status-public');
  try {
    const data = getWaStatus();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      data: { status: 'disconnected', qrCode: null, phoneNumber: null },
    }));
  }
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.listen(PORT, () => {
  const uwabaBase = process.env.UWABA_API_BASE_URL?.trim() || (process.env.NODE_ENV === 'production' ? '(belum di-set)' : 'http://localhost/api/public/api (default dev)');
  console.log(`[WA] http://localhost:${PORT}`);
  console.log(`[WA] UWABA_API_BASE_URL: ${uwabaBase}`);
  console.log(`[WA] CORS: ${allowedOrigins.join(', ')}`);
  initWaOnStart();
});
