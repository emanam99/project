// .env dimuat di server.js dengan path eksplisit (live/.env). Di sini cukup baca process.env.
const PORT = parseInt(process.env.PORT || '3004', 10);
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
/** Sama dengan LIVE_SERVER_API_KEY di api/.env — untuk POST internal broadcast dari PHP. */
const LIVE_SERVER_API_KEY = process.env.LIVE_SERVER_API_KEY || '';

export { PORT, CORS_ORIGINS, ADMIN_SECRET, LIVE_SERVER_API_KEY };
