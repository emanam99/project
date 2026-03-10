/**
 * Middleware auth: validasi JWT via API UWABA (GET /auth/verify).
 * Request harus mengirim header: Authorization: Bearer <token>
 * Memakai fetch bawaan Node 18+
 */

// Default untuk development: XAMPP lokal (API UWABA di http://localhost/api/public/api)
const DEFAULT_UWABA_BASE = 'http://localhost/api/public/api';
const UWABA_API_BASE = process.env.UWABA_API_BASE_URL?.trim() || (process.env.NODE_ENV === 'production' ? '' : DEFAULT_UWABA_BASE);

export const authUwaba = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak ditemukan. Silakan login di UWABA terlebih dahulu.',
    });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token tidak valid.',
    });
  }

  if (!UWABA_API_BASE) {
    console.error('[authUwaba] UWABA_API_BASE_URL tidak di-set. Di production wajib set di .env. Untuk development lokal, buat file .env di folder wa/ dengan isi: UWABA_API_BASE_URL=http://localhost/api/public/api');
    return res.status(500).json({
      success: false,
      message: 'Konfigurasi server belum lengkap. Set UWABA_API_BASE_URL di file .env (copy dari .env.example). Contoh: http://localhost/api/public/api',
    });
  }

  try {
    const url = `${UWABA_API_BASE.replace(/\/$/, '')}/auth/verify`;
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (fetchErr) {
      console.error('[authUwaba] Request ke API UWABA gagal:', fetchErr.message, '| URL:', url);
      return res.status(503).json({
        success: false,
        message: 'API UWABA tidak terjangkau. Cek UWABA_API_BASE_URL di .env (contoh: http://localhost/api/public/api).',
      });
    }

    let data = {};
    try {
      const text = await response.text();
      if (text && text.trim().length > 0) {
        data = JSON.parse(text);
      }
    } catch (_) {
      console.error('[authUwaba] Invalid JSON from API');
    }

    if (!response.ok) {
      console.error('[authUwaba] API UWABA response:', response.status, data?.message || data);
      return res.status(401).json({
        success: false,
        message: data?.message || 'Sesi tidak valid. Silakan login ulang di UWABA.',
      });
    }

    if (!data.success || !data.data) {
      return res.status(401).json({
        success: false,
        message: 'Verifikasi gagal.',
      });
    }

    // Cek akses: super_admin selalu boleh; role lain harus punya 'wa' di allowed_apps
    const roleKey = (data.data.role_key || data.data.user_role || data.data.level || '').toString().toLowerCase();
    const isSuperAdmin = roleKey === 'super_admin';
    const allowedApps = data.data.allowed_apps || [];
    const hasWaAccess = Array.isArray(allowedApps) && allowedApps.includes('wa');
    if (!isSuperAdmin && Array.isArray(allowedApps) && allowedApps.length > 0 && !hasWaAccess) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Role Anda tidak memiliki izin untuk aplikasi WhatsApp.',
      });
    }

    req.user = data.data;
    req.token = token;
    next();
  } catch (err) {
    console.error('[authUwaba] Error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Gagal memverifikasi token.',
    });
  }
};
