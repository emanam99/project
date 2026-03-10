/**
 * Auth untuk endpoint kirim pesan: terima X-API-Key (dari PHP/server) atau Bearer token (dari frontend UWABA).
 * Prioritas: jika header X-API-Key ada, cek key saja (jangan fallback ke Bearer agar request dari API PHP tidak dapat 401).
 */
import { authUwaba } from './authUwaba.js';

const WA_API_KEY = (process.env.WA_API_KEY || '').trim();

export const authSendOrUwaba = async (req, res, next) => {
  const apiKey = (req.headers['x-api-key'] || '').trim();
  if (apiKey) {
    if (!WA_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Backend WA: set WA_API_KEY di wa/.env (harus sama dengan WA_API_KEY di api/.env).',
      });
    }
    if (apiKey === WA_API_KEY) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'X-API-Key tidak valid. Pastikan WA_API_KEY di api/.env sama persis dengan wa/.env.',
    });
  }
  return authUwaba(req, res, next);
};
