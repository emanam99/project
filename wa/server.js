import 'dotenv/config';

/**
 * Baileys kadang melempar "Timed Out" / 408 dari waitForMessage (sendPassiveIq) saat socket sibuk atau jaringan lemah.
 * Tanpa handler ini, unhandledRejection bisa menghentikan proses (nodemon "crashed").
 */
function isBaileysTimeoutLike(reason) {
  if (reason == null) return false;
  const out = typeof reason === 'object' && reason.output ? reason.output : null;
  if (out && out.statusCode === 408) return true;
  const p = out && out.payload ? out.payload : null;
  const s = String(
    (p && (p.message || p.error)) || (reason && reason.message) || reason
  );
  return /timed out|time-out|408|request time-out/i.test(s);
}

process.on('unhandledRejection', (reason) => {
  if (isBaileysTimeoutLike(reason)) {
    console.warn('[WA] Baileys timeout (non-fatal, proses tetap jalan):', reason?.message || reason);
    return;
  }
  console.error('[WA] unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  if (err && isBaileysTimeoutLike(err)) {
    console.warn('[WA] Baileys uncaught timeout (non-fatal):', err.message || err);
    return;
  }
  console.error('[WA] uncaughtException:', err);
  process.exit(1);
});

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
import {
  initWaOnStart,
  isWaEngineEnabled,
  reconcileWaSessionsWithSockets,
  startWaWatchdog,
} from './controllers/whatsappController.js';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5175';
/** Izinkan origin: localhost, LAN privat (Vite dari IP 192.168.x), atau *.alutsmani.id */
function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host === 'alutsmani.id' || host.endsWith('.alutsmani.id')) return true;
    // Tanpa ini: buka ebeddien lewat http://192.168.x.x:5173 → fetch ke WA diblokir CORS ("Failed to fetch")
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
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

// GET status WA — tanpa auth. Satu koneksi; body datar (tanpa sessions).
app.get('/api/whatsapp/status', (req, res) => {
  res.setHeader('X-WA-Endpoint', 'status-public');
  try {
    reconcileWaSessionsWithSockets();
    const includeQr = String(req.query?.includeQr || '').trim() === '1';
    const data = getWaStatus();
    data.waEngineEnabled = isWaEngineEnabled();
    if (!includeQr) {
      data.qrCode = null;
      data.baileysQrCode = null;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      data: {
        status: 'disconnected',
        qrCode: null,
        phoneNumber: null,
        baileysStatus: 'disconnected',
        baileysQrCode: null,
        baileysPhoneNumber: null,
        waEngineEnabled: isWaEngineEnabled(),
      },
    }));
  }
});

// Endpoint QR terpisah agar polling status tetap ringan.
app.get('/api/whatsapp/qr', (req, res) => {
  res.setHeader('X-WA-Endpoint', 'qr-public');
  try {
    reconcileWaSessionsWithSockets();
    const data = getWaStatus();
    return res.json({
      success: true,
      data: {
        status: data?.status || 'disconnected',
        baileysStatus: data?.baileysStatus || 'disconnected',
        qrCode: data?.qrCode || null,
        baileysQrCode: data?.baileysQrCode || null,
      },
    });
  } catch (e) {
    return res.json({
      success: true,
      data: {
        status: 'disconnected',
        baileysStatus: 'disconnected',
        qrCode: null,
        baileysQrCode: null,
      },
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);

function buildIncomingWebhookUrl(apiBase) {
  const base = String(apiBase || '').trim().replace(/\/$/, '');
  if (!base) return '';
  return base + (base.endsWith('/api') ? '/wa/incoming' : '/api/wa/incoming');
}

/** Peringatan jika .env production memakai domain frontend (mybeddian) — webhook harus ke API PHP. */
function warnMisconfiguredWebhookBase(apiBase) {
  const b = String(apiBase || '').toLowerCase();
  if (!b) return;
  if (
    (b.includes('mybeddian.alutsmani') || b.includes('ebeddien.alutsmani') || b.includes('uwaba.alutsmani')) &&
    !b.includes('api.alutsmani') &&
    !b.includes('api2.alutsmani') &&
    !b.includes('localhost')
  ) {
    console.warn(
      '[WA] PERINGATAN: UWABA_API_BASE_URL mengarah ke domain frontend, bukan API PHP. '
      + 'Production: https://api.alutsmani.id/api — Staging: https://api2.alutsmani.id/api'
    );
  }
}

async function probeIncomingWebhookReachable(incomingUrl) {
  if (!incomingUrl || process.env.WA_SKIP_WEBHOOK_PROBE === 'true') return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(incomingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '', message: '__wa_startup_probe__' }),
      signal: controller.signal,
    });
    const ok = res.status >= 200 && res.status < 500;
    console.log(
      `[WA] Probe webhook: ${ok ? 'terjangkau' : 'gagal'} HTTP ${res.status} → ${incomingUrl}`
    );
    if (!ok) {
      console.warn('[WA] Cek UWABA_API_BASE_URL di .env (harus URL API PHP, bukan SPA mybeddien/ebeddien).');
    }
  } catch (e) {
    console.error('[WA] Probe webhook GAGAL — pesan masuk tidak akan sampai ke API:', e?.message || e);
    console.error('[WA] Perbaiki UWABA_API_BASE_URL (prod: https://api.alutsmani.id/api). Set WA_SKIP_WEBHOOK_PROBE=true untuk matikan probe.');
  } finally {
    clearTimeout(timer);
  }
}

const server = app.listen(PORT, () => {
  const uwabaBase = (process.env.UWABA_API_BASE_URL || '').trim().replace(/\/$/, '');
  const incomingUrl = buildIncomingWebhookUrl(uwabaBase) || '(belum di-set)';
  console.log(`[WA] http://localhost:${PORT}`);
  console.log(`[WA] UWABA_API_BASE_URL: ${uwabaBase || '(tidak di-set — pesan masuk tidak akan diforward ke API)'}`);
  console.log(`[WA] Webhook pesan masuk: POST ${incomingUrl}`);
  warnMisconfiguredWebhookBase(uwabaBase);
  console.log('[WA] CORS: *.alutsmani.id + localhost');
  initWaOnStart();
  startWaWatchdog();
  if (incomingUrl && incomingUrl !== '(belum di-set)') {
    probeIncomingWebhookReachable(incomingUrl).catch(() => {});
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`[WA] Port ${PORT} sudah dipakai (EADDRINUSE).`);
    console.error('    Hentikan proses Node lain di port ini, atau ubah PORT di .env (mis. PORT=3002).');
    console.error('    Windows — cari PID:  netstat -ano | findstr :' + PORT);
    console.error('    Lalu tutup:        taskkill /PID <nomor_pid> /F');
    console.error('');
    process.exit(1);
  }
  console.error('[WA] server.listen error:', err?.message || err);
  process.exit(1);
});
