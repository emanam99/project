/**
 * Koneksi & operasi WhatsApp via Baileys — satu koneksi (auth internal: folder baileys-default).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync, readdirSync } from 'fs';
import { setWaStatus, getWaStatus, deleteWaSession } from '../store/waStatus.js';
import {
  initBaileys,
  disconnectBaileys,
  isBaileysConnected,
  waitForBaileysQrOrConnected,
  ensureBaileysReadyForSend,
  hasBaileysAuthFiles,
  pingBaileysKeepAlive,
  humanizeLidSendError,
  sendMessageBaileys,
  getChatMessagesBaileys,
  editMessageBaileys,
  checkNumberBaileys,
  resolveJidsForPhone,
  getBaileysAuthPathForDelete,
  getBaileysAuthPath,
} from './waBaileys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_BASE = path.resolve(__dirname, '../whatsapp-sessions');
const DEFAULT_SESSION = 'default';

let waEngineEnabled = true;
const WA_VERBOSE_LOG = process.env.WA_VERBOSE_LOG === 'true';

function sanitizeRawSessionId(raw) {
  const sessionId = (raw || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
}

/** Satu-satunya slot yang dipakai server. */
function resolveSlotStrict(rawSessionId) {
  const id = sanitizeRawSessionId(rawSessionId);
  if (id !== DEFAULT_SESSION) {
    return { ok: false, id: null };
  }
  return { ok: true, id: DEFAULT_SESSION };
}

/**
 * Untuk kirim/cek API (PHP): sessionId lama (wa2, …) disamakan ke default agar tidak putus integrasi.
 */
function resolveSlotLenient(rawSessionId) {
  return DEFAULT_SESSION;
}

/** Folder auth lama whatsapp-web.js â€” dibersihkan saat logout/hapus slot. */
function getLegacyWwebjsPath(sessionId) {
  const id = sessionId || DEFAULT_SESSION;
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (safe === 'default') return path.resolve(SESSIONS_BASE, 'wwebjs');
  return path.resolve(SESSIONS_BASE, `wwebjs-${safe}`);
}

function hasBaileysAuthFolder(sessionId) {
  const p = getBaileysAuthPath(sessionId);
  if (!existsSync(p)) return false;
  try {
    return readdirSync(p).length > 0;
  } catch (_) {
    return false;
  }
}

/** Hanya slot utama; folder baileys-wa2/wa3 di disk diabaikan (bisa dihapus manual). */
export function getSessionIdsFromDisk() {
  return [DEFAULT_SESSION];
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
  await disconnectBaileys(DEFAULT_SESSION);
  setWaStatus(DEFAULT_SESSION, {
    status: 'disconnected',
    qrCode: null,
    phoneNumber: null,
    baileysStatus: 'disconnected',
    baileysQrCode: null,
    baileysPhoneNumber: null,
  });
}

function respondWaEngineStopped(res) {
  return res.status(503).json({
    success: false,
    message: 'Server WA sedang dihentikan sementara. Jalankan lagi untuk memakai fitur WA.',
  });
}

/** Setelah restart container/PM2: sambung lagi otomatis jika auth default ada di disk (seperti ra yang initialize sekali). */
export function initWaOnStart() {
  if (!waEngineEnabled) return;
  const id = DEFAULT_SESSION;
  const authPath = getBaileysAuthPath(id);
  if (!existsSync(authPath)) return;
  try {
    if (readdirSync(authPath).length === 0) return;
  } catch (_) {
    return;
  }
  if (isBaileysConnected(id)) return;
  setWaStatus(id, { status: 'connecting', baileysStatus: 'connecting' });
  console.log('[WA] Restore sesi Baileys (default) dari disk — menyambung otomatis');
  initBaileys(id).catch((err) => {
    console.error('[WA] initBaileys on start error:', err?.message || err);
    setWaStatus(id, {
      status: 'disconnected',
      qrCode: null,
      baileysStatus: 'disconnected',
      baileysQrCode: null,
    });
  });
}

/** Samakan store dengan socket (WebSocket tertutup / zombie) — dipanggil tiap polling status. */
export function reconcileWaSessionsWithSockets() {
  if (!waEngineEnabled) return;
  for (const id of getSessionIdsFromDisk()) {
    if (!hasBaileysAuthFolder(id)) continue;
    isBaileysConnected(id);
  }
}

const WA_WATCHDOG_INTERVAL_MS = Number(process.env.WA_WATCHDOG_INTERVAL_MS || 90000);
const WA_STUCK_CONNECTING_MS = Number(process.env.WA_STUCK_CONNECTING_MS || 180000);
const WA_AUTO_RECONNECT_COOLDOWN_MS = Number(process.env.WA_AUTO_RECONNECT_COOLDOWN_MS || 45000);
const lastAutoReconnectAt = Object.create(null);
const connectingSinceBySession = Object.create(null);

function scheduleAutoReconnectSession(sessionId, reason) {
  const id = sessionId || DEFAULT_SESSION;
  const now = Date.now();
  if (lastAutoReconnectAt[id] && now - lastAutoReconnectAt[id] < WA_AUTO_RECONNECT_COOLDOWN_MS) {
    return;
  }
  lastAutoReconnectAt[id] = now;
  connectingSinceBySession[id] = undefined;
  console.warn('[WA] Watchdog: sambung ulang otomatis untuk', id, '-', reason);
  disconnectBaileys(id).catch(() => {});
  setWaStatus(id, {
    status: 'connecting',
    qrCode: null,
    baileysStatus: 'connecting',
    baileysQrCode: null,
  });
  initBaileys(id).catch((err) => {
    console.error('[WA] Watchdog initBaileys error:', id, err?.message || err);
    setWaStatus(id, {
      status: 'disconnected',
      qrCode: null,
      baileysStatus: 'disconnected',
      baileysQrCode: null,
    });
  });
}

/**
 * Interval: keep-alive presence + deteksi macet / ping gagal → putus & init ulang (tanpa hapus auth).
 * Nonaktif: WA_WATCHDOG_INTERVAL_MS=0
 */
export function startWaWatchdog() {
  if (!Number.isFinite(WA_WATCHDOG_INTERVAL_MS) || WA_WATCHDOG_INTERVAL_MS < 0) return;
  if (WA_WATCHDOG_INTERVAL_MS === 0) {
    console.log('[WA] Watchdog dinonaktifkan (WA_WATCHDOG_INTERVAL_MS=0).');
    return;
  }
  const intervalMs = Math.max(15000, WA_WATCHDOG_INTERVAL_MS);
  console.log('[WA] Watchdog aktif: interval', intervalMs, 'ms, stuck connecting', WA_STUCK_CONNECTING_MS, 'ms');

  const tick = async () => {
    if (!waEngineEnabled) return;
    const ids = getSessionIdsFromDisk();
    for (const id of ids) {
      if (!hasBaileysAuthFolder(id)) {
        connectingSinceBySession[id] = undefined;
        continue;
      }
      const st = getWaStatus();
      const connecting = st.status === 'connecting' || st.baileysStatus === 'connecting';
      if (connecting) {
        if (connectingSinceBySession[id] == null) connectingSinceBySession[id] = Date.now();
        else if (Date.now() - connectingSinceBySession[id] >= WA_STUCK_CONNECTING_MS) {
          scheduleAutoReconnectSession(id, 'connecting terlalu lama');
        }
        continue;
      }
      connectingSinceBySession[id] = undefined;

      const storeSaysConnected = st.baileysStatus === 'connected' || st.status === 'connected';
      if (storeSaysConnected && !isBaileysConnected(id)) {
        scheduleAutoReconnectSession(id, 'store connected tapi socket tidak hidup');
        continue;
      }

      if (!isBaileysConnected(id)) continue;

      const ping = await pingBaileysKeepAlive(id);
      if (!ping.ok) {
        console.warn('[WA] Watchdog keepalive gagal:', id, '-', ping.reason || 'unknown');
        scheduleAutoReconnectSession(id, 'keepalive: ' + (ping.reason || 'unknown'));
      }
    }
  };

  setInterval(() => {
    tick().catch((e) => console.error('[WA] Watchdog tick error:', e?.message || e));
  }, intervalMs);
}

export const wakeWhatsApp = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const strict = resolveSlotStrict(req.body?.sessionId || req.query?.sessionId || DEFAULT_SESSION);
    if (!strict.ok) {
      return res.status(400).json({
        success: false,
        message: 'Backend WA hanya punya satu koneksi. Kosongkan sessionId di permintaan (jangan kirim wa2/dll.).',
      });
    }
    const safeId = strict.id;
    const force =
      req.body?.force === true ||
      String(req.query?.force || '') === '1' ||
      String(req.query?.force || '').toLowerCase() === 'true';

    /** Paksa putus + init ulang — mengatasi slot macet “connecting”, zombie socket, atau state tidak sinkron. */
    if (force) {
      await disconnectBaileys(safeId);
      setWaStatus(safeId, {
        status: 'connecting',
        qrCode: null,
        baileysStatus: 'connecting',
        baileysQrCode: null,
      });
      initBaileys(safeId).catch((err) => {
        console.error('[WA] wake (force) initBaileys error:', err?.message || err);
        setWaStatus(safeId, {
          status: 'disconnected',
          qrCode: null,
          baileysStatus: 'disconnected',
          baileysQrCode: null,
        });
      });
      console.log('[WA] Wake force: koneksi ulang untuk session', safeId);
      return res.json({
        success: true,
        message: 'Memaksa sambung ulang ke WhatsApp...',
        data: { status: 'connecting', forced: true },
      });
    }

    if (isBaileysConnected(safeId)) {
      return res.json({ success: true, message: 'WA sudah aktif.', data: { status: 'connected' } });
    }
    const st = getWaStatus();
    if (st.status === 'connecting' || st.baileysStatus === 'connecting') {
      return res.json({
        success: true,
        message: 'WA sedang menghubungkan... Jika lama tidak selesai, panggil wake dengan force=1 atau putuskan lalu hubungkan lagi.',
        data: { status: 'connecting' },
      });
    }
    setWaStatus(safeId, {
      status: 'connecting',
      qrCode: null,
      baileysStatus: 'disconnected',
      baileysQrCode: null,
    });
    initBaileys(safeId).catch((err) => {
      console.error('[WA] wake initBaileys error:', err?.message || err);
      setWaStatus(safeId, {
        status: 'disconnected',
        qrCode: null,
        baileysStatus: 'disconnected',
        baileysQrCode: null,
      });
    });
    console.log('[WA] Wake: memulai Baileys untuk session', safeId);
    return res.json({ success: true, message: 'Memulai koneksi WA...', data: { status: 'connecting' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Gagal memicu koneksi: ' + (err?.message || String(err)) });
  }
};

export const connectWhatsApp = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const strict = resolveSlotStrict(req.body?.sessionId || DEFAULT_SESSION);
    if (!strict.ok) {
      return res.status(400).json({
        success: false,
        message: 'Backend WA hanya satu koneksi. Hapus sessionId dari body atau kirim hanya untuk kompatibilitas lama.',
      });
    }
    const safeId = strict.id;
    const refreshQr = req.body?.refreshQr === true;

    const dataStatus = getWaStatus();
    if (isBaileysConnected(safeId)) {
      return res.json({
        success: true,
        message: 'WhatsApp sudah terhubung. Kirim pesan dan cek nomor siap dipakai.',
        data: {
          status: 'connected',
          qrCode: null,
          phoneNumber: dataStatus.phoneNumber || dataStatus.baileysPhoneNumber,
          baileysStatus: 'connected',
          baileysQrCode: null,
          baileysPhoneNumber: dataStatus.baileysPhoneNumber || dataStatus.phoneNumber,
        },
      });
    }

    if (refreshQr) {
      await disconnectBaileys(safeId);
      setWaStatus(safeId, {
        status: 'connecting',
        qrCode: null,
        baileysStatus: 'connecting',
        baileysQrCode: null,
      });
    } else if (
      !refreshQr &&
      (dataStatus.status === 'connecting' || dataStatus.baileysStatus === 'connecting') &&
      (dataStatus.qrCode || dataStatus.baileysQrCode)
    ) {
      const st = getWaStatus();
      const qr = st.qrCode || st.baileysQrCode || null;
      return res.json({
        success: true,
        message: 'Scan QR code di bawah.',
        data: {
          status: st.status || 'connecting',
          qrCode: qr,
          phoneNumber: st.phoneNumber || null,
          baileysStatus: st.baileysStatus,
          baileysQrCode: st.baileysQrCode || null,
          baileysPhoneNumber: st.baileysPhoneNumber || null,
        },
      });
    } else {
      await disconnectBaileys(safeId);
      setWaStatus(safeId, {
        status: 'connecting',
        qrCode: null,
        baileysStatus: 'connecting',
        baileysQrCode: null,
      });
    }

    try {
      await initBaileys(safeId);
      await waitForBaileysQrOrConnected(safeId, 20000);
    } catch (err) {
      console.error('[WA] initBaileys connect:', err?.message || err);
      setWaStatus(safeId, {
        status: 'disconnected',
        qrCode: null,
        baileysStatus: 'disconnected',
        baileysQrCode: null,
      });
      return res.status(500).json({
        success: false,
        message: 'Gagal memulai Baileys: ' + (err?.message || String(err)),
      });
    }

    const st = getWaStatus();
    const qr = st.qrCode || st.baileysQrCode || null;
    return res.json({
      success: true,
      message: qr
        ? 'Scan QR di bawah dengan WhatsApp di HP Anda (Perangkat tertaut).'
        : 'Memulai koneksi. Gunakan tombol "Muat QR" untuk mengambil QR terbaru.',
      data: {
        status: st.status || 'connecting',
        qrCode: qr,
        phoneNumber: st.phoneNumber || null,
        baileysStatus: st.baileysStatus || 'connecting',
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
    const strict = resolveSlotStrict(req.body?.sessionId || DEFAULT_SESSION);
    if (!strict.ok) {
      return res.status(400).json({ success: false, message: 'Hanya satu koneksi WA; sessionId tidak dikenali.' });
    }
    const safeId = strict.id;
    await disconnectBaileys(safeId);
    setWaStatus(safeId, {
      status: 'disconnected',
      qrCode: null,
      phoneNumber: null,
      baileysStatus: 'disconnected',
      baileysQrCode: null,
      baileysPhoneNumber: null,
    });
    return res.json({
      success: true,
      message: 'WhatsApp berhasil diputus.',
      data: {},
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
    const strict = resolveSlotStrict(req.body?.sessionId || DEFAULT_SESSION);
    if (!strict.ok) {
      return res.status(400).json({ success: false, message: 'Hanya satu koneksi WA; sessionId tidak dikenali.' });
    }
    const safeId = strict.id;
    await disconnectBaileys(safeId);
    const legacy = getLegacyWwebjsPath(safeId);
    if (existsSync(legacy)) rmSync(legacy, { recursive: true, force: true });
    const baileysPath = getBaileysAuthPathForDelete(safeId);
    if (existsSync(baileysPath)) rmSync(baileysPath, { recursive: true, force: true });
    setWaStatus(safeId, {
      status: 'disconnected',
      qrCode: null,
      phoneNumber: null,
      baileysStatus: 'disconnected',
      baileysQrCode: null,
      baileysPhoneNumber: null,
    });
    return res.json({
      success: true,
      message: 'WhatsApp berhasil logout. Nyalakan lagi untuk scan QR Code.',
      data: {},
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
    const strict = resolveSlotStrict(req.body?.sessionId || DEFAULT_SESSION);
    if (!strict.ok) {
      return res.status(400).json({ success: false, message: 'Hanya satu koneksi WA.' });
    }
    const safeId = strict.id;
    await disconnectBaileys(safeId);
    const legacy = getLegacyWwebjsPath(safeId);
    if (existsSync(legacy)) rmSync(legacy, { recursive: true, force: true });
    const baileysPath = getBaileysAuthPathForDelete(safeId);
    if (existsSync(baileysPath)) rmSync(baileysPath, { recursive: true, force: true });
    deleteWaSession(safeId);
    return res.json({
      success: true,
      message: 'Sesi WA di server dihapus.',
      data: {},
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
    const safeId = resolveSlotLenient(req.body?.sessionId || DEFAULT_SESSION);
    const { phoneNumber, message, imageBase64, imageMimetype, chatId: bodyChatId, linkPreview: bodyLinkPreview } = req.body || {};
    const text = typeof message === 'string' ? message : '';
    /** Default true: Baileys mengambil preview URL dari teks (lihat generateWAMessageContent / link preview). */
    const linkPreviewEnabled = bodyLinkPreview !== false;
    const chatIdOverride = typeof bodyChatId === 'string' && bodyChatId.trim() ? bodyChatId.trim() : null;
    if (WA_VERBOSE_LOG) {
      console.log('[WA] POST /send to ' + (phoneNumber || '') + (chatIdOverride ? ' chatId=' + chatIdOverride : '') + ' len=' + text.length);
    }
    if (!isBaileysConnected(safeId)) {
      await ensureBaileysReadyForSend(safeId, 20000).catch(() => {});
    }
    if (!isBaileysConnected(safeId)) {
      if (WA_VERBOSE_LOG) console.log('[WA] send: belum login (Baileys tidak siap)');
      const paired = hasBaileysAuthFiles(safeId);
      return res.status(200).json({
        success: false,
        code: paired ? 'wa_disconnected' : 'wa_not_paired',
        message: paired
          ? 'WhatsApp terputus atau masih menyambung. Coba lagi sebentar atau buka tab Koneksi WA.'
          : 'WhatsApp belum terhubung. Hubungkan nomor lembaga di tab Koneksi WA lalu scan QR.',
      });
    }

    const result = await sendMessageBaileys(
      safeId,
      phoneNumber,
      text,
      imageBase64,
      imageMimetype,
      chatIdOverride,
      linkPreviewEnabled
    );
    if (WA_VERBOSE_LOG) {
      console.log('[WA] send via Baileys: ' + (result.ok ? 'OK' : 'fail ' + (result.error || '')));
    }
    if (!result.ok) {
      if (result.error === 'Nomor tidak valid') return res.status(400).json({ success: false, message: result.error });
      const msg = humanizeLidSendError(String(result.error || '')) || 'Gagal mengirim pesan';
      return res.status(200).json({ success: false, message: msg });
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
    const safeId = resolveSlotLenient(req.body?.sessionId || req.query?.sessionId || DEFAULT_SESSION);
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
    const safeId = resolveSlotLenient(req.body?.sessionId || DEFAULT_SESSION);
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
    const safeId = resolveSlotLenient(req.body?.sessionId || DEFAULT_SESSION);
    const { phoneNumber } = req.body || {};
    if (!isBaileysConnected(safeId)) {
      await ensureBaileysReadyForSend(safeId, 20000).catch(() => {});
    }
    if (!isBaileysConnected(safeId)) {
      return res.status(200).json({
        success: false,
        message: 'Belum login. Scan QR di tab Koneksi WA.',
      });
    }
    const result = await checkNumberBaileys(safeId, phoneNumber);
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

export const resolveJids = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = resolveSlotLenient(req.body?.sessionId || DEFAULT_SESSION);
    const phoneNumber = req.body?.phoneNumber || req.body?.phone_number || '';
    if (!phoneNumber || String(phoneNumber).trim() === '') {
      return res.status(400).json({ success: false, message: 'phoneNumber wajib' });
    }
    if (!isBaileysConnected(safeId)) {
      await ensureBaileysReadyForSend(safeId).catch(() => {});
    }
    if (!isBaileysConnected(safeId)) {
      return res.status(200).json({
        success: false,
        message: 'Belum login. Scan QR di halaman Koneksi WA (Baileys).',
        data: { jids: [] },
      });
    }
    const result = await resolveJidsForPhone(safeId, phoneNumber);
    if (!result.ok) {
      const msg = result.error || 'Gagal mengambil JID';
      if (result.error === 'Nomor tidak valid') return res.status(400).json({ success: false, message: msg, data: { jids: [] } });
      return res.status(200).json({
        success: false,
        message: msg,
        data: { jids: result.jids || [], reason: result.reason, source: 'baileys' },
      });
    }
    return res.json({
      success: true,
      message: 'OK',
      data: { jids: result.jids || [], reason: result.reason, source: 'baileys' },
    });
  } catch (err) {
    console.error('[WA] resolveJids error:', err?.message || err);
    return res.status(500).json({ success: false, message: err?.message || 'Gagal resolve JID' });
  }
};