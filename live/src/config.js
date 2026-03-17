// .env dimuat di server.js dengan path eksplisit (live/.env). Di sini cukup baca process.env.
const PORT = parseInt(process.env.PORT || '3004', 10);
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

export { PORT, CORS_ORIGINS, ADMIN_SECRET };
