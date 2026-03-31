/**
 * Koneksi & operasi WhatsApp via Baileys saja (multi-session, maks. 3 slot: default + wa2 + wa3).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync, readdirSync } from 'fs';
import { setWaStatus, getWaStatus, deleteWaSession, getSessionIds } from '../store/waStatus.js';
import {
  initBaileys,
  disconnectBaileys,
  isBaileysConnected,
  waitForBaileysQrOrConnected,
  ensureBaileysReadyForSend,
  hasBaileysAuthFiles,
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
/** Total slot: default + wa2 … wa{MAX_SESSIONS} → untuk 3 slot: default, wa2, wa3 */
const MAX_SESSIONS = 3;

let waEngineEnabled = true;
const WA_VERBOSE_LOG = process.env.WA_VERBOSE_LOG === 'true';

function getSafeSessionId(rawSessionId) {
  const sessionId = (rawSessionId || DEFAULT_SESSION).toString().trim() || DEFAULT_SESSION;
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') || DEFAULT_SESSION;
}

/** Slot tambahan hanya wa2 … wa{MAX_SESSIONS} (slot 1 = default utama). */
function isAllowedSessionId(id) {
  const x = (id || DEFAULT_SESSION).toString();
  if (x === DEFAULT_SESSION) return true;
  const m = /^wa(\d+)$/.exec(x);
  if (!m) return false;
  const num = parseInt(m[1], 10);
  return num >= 2 && num <= MAX_SESSIONS;
}

/** Putus/logout/hapus slot lama (wa4…) jika masih ada folder auth di disk. */
function isAllowedSessionIdOrLegacyOnDisk(id) {
  const safe = (id || DEFAULT_SESSION).toString();
  return isAllowedSessionId(safe) || hasBaileysAuthFolder(safe);
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

/**
 * Daftar session ID yang punya folder baileys-* di disk (untuk UI multi-slot).
 */
export function getSessionIdsFromDisk() {
  const ids = new Set();
  try {
    if (existsSync(SESSIONS_BASE)) {
      const dirs = readdirSync(SESSIONS_BASE);
      if (dirs.includes('baileys-default')) ids.add(DEFAULT_SESSION);
      for (const d of dirs) {
        if (d.startsWith('baileys-') && d !== 'baileys-default') {
          ids.add(d.replace(/^baileys-/, ''));
        }
      }
    }
  } catch (_) {}
  const arr = [...ids].filter(isAllowedSessionId);
  return arr.length ? arr : [DEFAULT_SESSION];
}

function countSessions() {
  const ids = new Set();
  for (const id of getSessionIds()) {
    if (isAllowedSessionId(id)) ids.add(id);
  }
  try {
    if (existsSync(SESSIONS_BASE)) {
      const dirs = readdirSync(SESSIONS_BASE);
      if (dirs.includes('baileys-default')) ids.add(DEFAULT_SESSION);
      for (const d of dirs) {
        if (d.startsWith('baileys-') && d !== 'baileys-default') {
          const sid = d.replace(/^baileys-/, '');
          if (isAllowedSessionId(sid)) ids.add(sid);
        }
      }
    }
  } catch (_) {}
  return ids.size;
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
  const idSet = new Set([...getSessionIds(), ...getSessionIdsFromDisk()]);
  for (const id of idSet) {
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

/** Restore semua sesi yang punya auth di disk (default, wa2, …) — setelah restart PM2 semua slot bisa hidup lagi. */
export function initWaOnStart() {
  if (!waEngineEnabled) return;
  const ids = getSessionIdsFromDisk();
  let started = 0;
  for (const id of ids) {
    const authPath = getBaileysAuthPath(id);
    if (!existsSync(authPath)) continue;
    try {
      if (readdirSync(authPath).length === 0) continue;
    } catch (_) {
      continue;
    }
    if (isBaileysConnected(id)) continue;
    setWaStatus(id, { status: 'connecting', baileysStatus: 'connecting' });
    started += 1;
    initBaileys(id).catch((err) => {
      console.error('[WA] initBaileys on start error:', id, err?.message || err);
      setWaStatus(id, {
        status: 'disconnected',
        qrCode: null,
        baileysStatus: 'disconnected',
        baileysQrCode: null,
      });
    });
  }
  if (started > 0) {
    console.log('[WA] Restore sesi Baileys dari disk (', started, 'slot):', ids.join(', '));
  }
}

export const wakeWhatsApp = async (req, res) => {
  try {
    if (!waEngineEnabled) return respondWaEngineStopped(res);
    const safeId = getSafeSessionId(req.body?.sessionId || req.query?.sessionId || DEFAULT_SESSION);
    if (!isAllowedSessionId(safeId)) {
      return res.status(400).json({
        success: false,
        message: `Session tidak diizinkan. Gunakan default atau wa2–wa${MAX_SESSIONS} (maks. ${MAX_SESSIONS} slot).`,
      });
    }
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
    const st = getWaStatus(safeId);
    if (st.status === 'connecting' || st.baileysStatus === 'connecting') {
      return res.json({
        success: true,
        message: 'WA sedang menghubungkan... Jika lama tidak selesai, panggil wake dengan force=1 atau putuskan lalu hubungkan lagi.',
        data: { status: 'connecting' },
      });
    }
    if (countSessions() >= MAX_SESSIONS && !hasBaileysAuthFolder(safeId)) {
      return res.status(200).json({ success: true, message: 'Slot WA penuh. Coba lagi nanti.', data: { status: 'busy' } });
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
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    const refreshQr = req.body?.refreshQr === true;

    if (!isAllowedSessionId(safeId)) {
      return res.status(400).json({
        success: false,
        message: `Session tidak diizinkan. Hanya slot utama (default) dan wa2–wa${MAX_SESSIONS} (maks. ${MAX_SESSIONS} slot).`,
      });
    }

    if (countSessions() >= MAX_SESSIONS && !hasBaileysAuthFolder(safeId)) {
      return res.status(400).json({
        success: false,
        message: `Maksimal ${MAX_SESSIONS} koneksi WA. Putus atau logout salah satu terlebih dahulu.`,
      });
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
      const st = getWaStatus(safeId);
      const qr = st.qrCode || st.baileysQrCode || null;
      return res.json({
        success: true,
        message: 'Scan QR code di bawah.',
        data: {
          sessionId: safeId,
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

    const st = getWaStatus(safeId);
    const qr = st.qrCode || st.baileysQrCode || null;
    return res.json({
      success: true,
      message: qr
        ? 'Scan QR di bawah dengan WhatsApp di HP Anda (Perangkat tertaut).'
        : 'Memulai koneksi. Gunakan tombol "Muat QR" untuk mengambil QR terbaru.',
      data: {
        sessionId: safeId,
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
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    if (!isAllowedSessionIdOrLegacyOnDisk(safeId)) {
      return res.status(400).json({ success: false, message: 'Session tidak diizinkan.' });
    }
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
    if (!isAllowedSessionIdOrLegacyOnDisk(safeId)) {
      return res.status(400).json({ success: false, message: 'Session tidak diizinkan.' });
    }
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
    if (!isAllowedSessionIdOrLegacyOnDisk(safeId)) {
      return res.status(400).json({ success: false, message: 'Session tidak diizinkan.' });
    }
    await disconnectBaileys(safeId);
    const legacy = getLegacyWwebjsPath(safeId);
    if (existsSync(legacy)) rmSync(legacy, { recursive: true, force: true });
    const baileysPath = getBaileysAuthPathForDelete(safeId);
    if (existsSync(baileysPath)) rmSync(baileysPath, { recursive: true, force: true });
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
    if (!isAllowedSessionId(safeId)) {
      return res.status(400).json({
        success: false,
        message: `Session tidak diizinkan. Gunakan default atau wa2–wa${MAX_SESSIONS}.`,
      });
    }
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
    const safeId = getSafeSessionId(req.body?.sessionId || req.query?.sessionId || DEFAULT_SESSION);
    if (!isAllowedSessionId(safeId)) {
      return res.status(400).json({ success: false, message: 'Session tidak diizinkan.', data: [] });
    }
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
    if (!isAllowedSessionId(safeId)) {
      return res.status(400).json({ success: false, message: 'Session tidak diizinkan.' });
    }
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
    if (!isAllowedSessionId(safeId)) {
      return res.status(400).json({ success: false, message: 'Session tidak diizinkan.' });
    }
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
    const safeId = getSafeSessionId(req.body?.sessionId || DEFAULT_SESSION);
    if (!isAllowedSessionId(safeId)) {
      return res.status(400).json({ success: false, message: 'Session tidak diizinkan.', data: { jids: [] } });
    }
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