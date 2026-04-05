import express from 'express';
import { getWaStatus } from '../store/waStatus.js';
import { authUwaba } from '../middleware/authUwaba.js';
import { authSendOrUwaba } from '../middleware/authSend.js';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  logoutWhatsApp,
  deleteSlotWhatsApp,
  sendMessage,
  editMessage,
  checkNumber,
  resolveJids,
  getChatMessages,
  wakeWhatsApp,
  isWaEngineEnabled,
  setWaEngineEnabled,
} from '../controllers/whatsappController.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch((err) => {
  console.error('[whatsapp route]', err?.message || err);
  res.status(500).json({ success: false, message: err?.message || 'Terjadi kesalahan server.' });
});

const router = express.Router();

// GET /status — tanpa auth. Satu koneksi (respons datar).
router.get('/status', (req, res) => {
  try {
    const data = getWaStatus();
    res.json({ success: true, data });
  } catch (e) {
    res.json({
      success: true,
      data: {
        status: 'disconnected',
        qrCode: null,
        phoneNumber: null,
        baileysStatus: 'disconnected',
        baileysQrCode: null,
        baileysPhoneNumber: null,
      },
    });
  }
});

// Kirim pesan, cek nomor, ambil pesan chat, wake: auth via X-API-Key (PHP) atau Bearer (UWABA). Harus di atas router.use(authUwaba).
router.post('/send', authSendOrUwaba, wrap(sendMessage));
router.post('/edit-message', authSendOrUwaba, wrap(editMessage));
router.post('/check', authSendOrUwaba, wrap(checkNumber));
router.post('/resolve-jids', authSendOrUwaba, wrap(resolveJids));
router.get('/chat-messages', authSendOrUwaba, wrap(getChatMessages));
router.post('/chat-messages', authSendOrUwaba, wrap(getChatMessages));
router.post('/wake', authSendOrUwaba, wrap(wakeWhatsApp));
router.get('/wake', authSendOrUwaba, wrap(wakeWhatsApp));

// GET tidak perlu auth (hanya /status). POST connect/disconnect/logout wajib auth.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return authUwaba(req, res, next);
});
router.post('/connect', wrap(connectWhatsApp));
router.post('/disconnect', wrap(disconnectWhatsApp));
router.post('/logout', wrap(logoutWhatsApp));
router.post('/delete-slot', wrap(deleteSlotWhatsApp));
router.post('/server/stop', wrap(async (_req, res) => {
  await setWaEngineEnabled(false);
  return res.json({ success: true, message: 'Server WA dihentikan sementara.', data: { waEngineEnabled: false } });
}));
router.post('/server/start', wrap(async (_req, res) => {
  await setWaEngineEnabled(true);
  return res.json({ success: true, message: 'Server WA dijalankan kembali.', data: { waEngineEnabled: true } });
}));
router.get('/server/status', wrap(async (_req, res) => {
  return res.json({ success: true, data: { waEngineEnabled: isWaEngineEnabled() } });
}));

export default router;
