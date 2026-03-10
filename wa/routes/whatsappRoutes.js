import express from 'express';
import { getWaStatus } from '../store/waStatus.js';
import { authUwaba } from '../middleware/authUwaba.js';
import { authSendOrUwaba } from '../middleware/authSend.js';
import {
  connectWhatsApp,
  disconnectWhatsApp,
  logoutWhatsApp,
  sendMessage,
  checkNumber,
} from '../controllers/whatsappController.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch((err) => {
  console.error('[whatsapp route]', err?.message || err);
  res.status(500).json({ success: false, message: err?.message || 'Terjadi kesalahan server.' });
});

const router = express.Router();

// GET /status — tanpa auth (untuk polling dari frontend). Harus sebelum router.use(authUwaba).
router.get('/status', (_req, res) => {
  try {
    const data = getWaStatus();
    res.json({ success: true, data });
  } catch (e) {
    res.json({
      success: true,
      data: { status: 'disconnected', qrCode: null, phoneNumber: null },
    });
  }
});

// Kirim pesan & cek nomor: auth via X-API-Key (PHP) atau Bearer (UWABA). Harus di atas router.use(authUwaba).
router.post('/send', authSendOrUwaba, wrap(sendMessage));
router.post('/check', authSendOrUwaba, wrap(checkNumber));

// GET tidak perlu auth (hanya /status). POST connect/disconnect/logout wajib auth.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return authUwaba(req, res, next);
});
router.post('/connect', wrap(connectWhatsApp));
router.post('/disconnect', wrap(disconnectWhatsApp));
router.post('/logout', wrap(logoutWhatsApp));

export default router;
