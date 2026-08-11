import express from 'express';
import { authUwaba } from '../middleware/authUwaba.js';

const router = express.Router();

const UWABA_API_BASE = process.env.UWABA_API_BASE_URL || '';

/**
 * GET /api/auth/diagnostic
 * Tanpa auth. Cek apakah backend WA bisa menjangkau API UWABA (untuk debug).
 */
router.get('/diagnostic', async (req, res) => {
  if (!UWABA_API_BASE) {
    return res.json({
      ok: false,
      message: 'UWABA_API_BASE_URL tidak di-set di .env',
      url: null,
    });
  }
  const url = `${UWABA_API_BASE.replace(/\/$/, '')}/auth/verify`;
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return res.json({
      ok: r.ok,
      status: r.status,
      url,
      message: r.ok ? 'API UWABA terjangkau (tanpa token akan 401, itu normal).' : `API mengembalikan ${r.status}. Cek URL dan pastikan API PHP berjalan.`,
    });
  } catch (err) {
    return res.json({
      ok: false,
      error: err.message,
      url,
      message: 'Tidak bisa menjangkau API UWABA. Pastikan XAMPP Apache + PHP jalan dan UWABA_API_BASE_URL benar (mis. http://localhost/api/public/api).',
    });
  }
});

/**
 * GET /api/auth/check
 * Client kirim header: Authorization: Bearer <token>
 * Validasi token via UWABA API; kembalikan user jika valid.
 */
router.get('/check', authUwaba, (req, res) => {
  return res.json({
    success: true,
    message: 'Token valid',
    data: { user: req.user },
  });
});

export default router;
