<?php

// Set timezone default ke Jakarta (WIB) untuk seluruh aplikasi
date_default_timezone_set('Asia/Jakarta');

// Load .env file jika ada (untuk development/production)
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        // Skip komentar
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        // Parse KEY=VALUE
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            // Hanya set jika belum ada di environment
            if (!getenv($key)) {
                putenv("$key=$value");
            }
        }
    }
}

// Helper function untuk membaca environment variable dengan fallback
if (!function_exists('env')) {
    function env($key, $default = null) {
        $value = getenv($key);
        if ($value === false) {
            return $default;
        }
        return $value;
    }
}

// CORS: izinkan semua domain alutsmani.id dan subdomain (uwaba, uwaba2, daftar, api2, dll.)
// Host harus persis 'alutsmani.id' atau berakhiran '.alutsmani.id' (bukan evil-alutsmani.id.com).
if (!function_exists('cors_origin_is_alutsmani_id')) {
    function cors_origin_is_alutsmani_id($origin) {
        if (!is_string($origin) || $origin === '') {
            return false;
        }
        $host = parse_url($origin, PHP_URL_HOST);
        if ($host === false || $host === null || $host === '') {
            return false;
        }
        $host = strtolower($host);
        return ($host === 'alutsmani.id' || (strlen($host) > 13 && substr($host, -13) === '.alutsmani.id'));
    }
}

// JWT_SECRET wajib dari env (keamanan). Di development tanpa .env gunakan fallback agar app tidak crash.
// firebase/php-jwt 7.x: HS256 memerlukan secret minimal 32 karakter (256 bit); lebih pendek akan ditolak.
$jwtSecret = env('JWT_SECRET');
if ($jwtSecret === null || $jwtSecret === '') {
    $isProduction = (env('APP_ENV') === 'production');
    if ($isProduction) {
        throw new \RuntimeException(
            'JWT_SECRET must be set in .env or environment. For local development: copy env.local to .env and set JWT_SECRET.'
        );
    }
    $jwtSecret = 'dev-secret-change-in-production-' . (__DIR__ ? md5(__DIR__) : 'default');
    // Log peringatan maksimal sekali per hari untuk hindari spam error.log (config.php diload tiap request)
    $warnFile = __DIR__ . '/.jwt_secret_warned';
    $shouldWarn = !file_exists($warnFile) || (filemtime($warnFile) < strtotime('-1 day'));
    if ($shouldWarn && function_exists('error_log')) {
        error_log('Backend config: JWT_SECRET tidak di-set di .env. Menggunakan fallback development. Untuk production wajib set JWT_SECRET di .env (min. 32 karakter untuk php-jwt 7).');
        @touch($warnFile);
    }
}
if (strlen($jwtSecret) < 32 && (env('APP_ENV') === 'production')) {
    throw new \RuntimeException(
        'JWT_SECRET must be at least 32 characters for HS256 (firebase/php-jwt 7). Set a longer secret in .env.'
    );
}

return [
    // Versi backend (API) saat ini — dipakai endpoint GET /api/version dan tampilan frontend (uwaba BACKEND_VERSION)
    'api_version' => '2.6.8',
    'database' => [
        // Baca dari environment variables, fallback ke default untuk development
        'host' => env('DB_HOST', 'localhost'),
        'dbname' => env('DB_NAME', 'db'),
        'username' => env('DB_USER', 'root'),
        'password' => env('DB_PASS', ''),
        'charset' => env('DB_CHARSET', 'utf8mb4')
    ],
    'jwt' => [
        'secret' => $jwtSecret,
        'algorithm' => env('JWT_ALGORITHM', 'HS256'),
        'expiration' => (int)env('JWT_EXPIRATION', 86400) // 24 jam dalam detik
    ],
    'cors' => [
        // Daftar eksplisit (localhost, port dev). Semua domain alutsmani.id + subdomain otomatis diizinkan (lihat cors_origin_is_alutsmani_id).
        'allowed_origins' => env('CORS_ALLOWED_ORIGINS', 'http://localhost,http://127.0.0.1,http://localhost:5173,http://localhost:5174,http://localhost:5175,https://mybeddian2.alutsmani.id,https://ebeddien2.alutsmani.id,https://ebeddien.alutsmani.id'),
        // true = izin semua origin (hanya untuk development).
        'allow_all' => filter_var(env('CORS_ALLOW_ALL', 'false'), FILTER_VALIDATE_BOOLEAN)
    ],
    'security' => [
        'max_login_attempts' => (int)env('MAX_LOGIN_ATTEMPTS', 5),
        'lockout_duration' => (int)env('LOCKOUT_DURATION', 900), // 15 menit
        // Rate limit daftar akun: per NIP (tiap pengurus 5 percobaan), bukan per IP (supaya satu WiFi banyak orang bisa daftar)
        'max_daftar_attempts_per_nip' => (int)env('MAX_DAFTAR_ATTEMPTS_PER_NIP', 5),
        'lockout_daftar_seconds' => (int)env('LOCKOUT_DAFTAR_SECONDS', 900), // 15 menit
        // Fallback per IP jika NIP tidak ada di request (batas lebih longgar)
        'max_daftar_attempts' => (int)env('MAX_DAFTAR_ATTEMPTS', 25),
        // Nomor WA untuk notifikasi login mencurigakan (3x gagal). Kosongkan untuk nonaktifkan.
        'login_alert_wa' => env('LOGIN_ALERT_WA', '082232999921'),
        'password_min_length' => (int)env('PASSWORD_MIN_LENGTH', 8),
        'password_require_uppercase' => filter_var(env('PASSWORD_REQUIRE_UPPERCASE', 'true'), FILTER_VALIDATE_BOOLEAN),
        'password_require_lowercase' => filter_var(env('PASSWORD_REQUIRE_LOWERCASE', 'true'), FILTER_VALIDATE_BOOLEAN),
        'password_require_number' => filter_var(env('PASSWORD_REQUIRE_NUMBER', 'true'), FILTER_VALIDATE_BOOLEAN),
        'password_require_special' => filter_var(env('PASSWORD_REQUIRE_SPECIAL', 'false'), FILTER_VALIDATE_BOOLEAN),
        // Default false: rate limit tetap jalan di localhost. Set true hanya kalau sengaja untuk dev.
        'disable_rate_limit_localhost' => filter_var(env('DISABLE_RATE_LIMIT_LOCALHOST', 'false'), FILTER_VALIDATE_BOOLEAN)
    ],
    // Backend WA baru (wa/). Jika APP_URL local (localhost/127.0.0.1) → default WA lokal (port 3001). Else wa.alutsmani.id. Set WA_API_URL untuk override.
    'whatsapp' => [
        'api_url' => env('WA_API_URL', (function () {
            $appUrl = env('APP_URL', 'http://localhost:5173');
            $isLocal = (strpos($appUrl, 'localhost') !== false || strpos($appUrl, '127.0.0.1') !== false);
            return $isLocal ? 'http://127.0.0.1:3001/api/whatsapp/send' : 'https://wa.alutsmani.id/api/whatsapp/send';
        })()),
        'api_key' => env('WA_API_KEY', ''),
        'instance' => env('WA_INSTANCE', 'uwaba1'), // Tidak dikirim ke backend baru (satu sesi); tetap dipakai untuk log/sumber jika perlu.
        /** ID slot WA Node (sama seperti di halaman Koneksi WA). Wajib jika OTP/notifikasi gagal (LID) tapi "Kirim tes" berhasil — samakan dengan slot yang terhubung. */
        'session_id' => env('WA_SESSION_ID', ''),
    ],
    // WatZap (api.watzap.id) — untuk notifikasi WA via WatZap. Dipakai bila notification_provider = watzap.
    // Dokumentasi: https://api-docs.watzap.id/ | number_key "ALL" = pakai semua nomor terhubung.
    'watzap' => [
        'api_url' => rtrim(env('WATZAP_API_URL', 'https://api.watzap.id/v1'), '/'),
        'api_key' => env('WATZAP_API_KEY', ''),
        'number_key' => env('WATZAP_NUMBER_KEY', 'ALL'),
    ],
    // Evolution API v2 — koneksi WA (QR) lewat instance; dipakai halaman Setting → Evolution WA. Set EVOLUTION_API_BASE_URL + EVOLUTION_API_KEY di .env.
    // Dokumentasi: https://doc.evolution-api.com/v2/en/get-started/introduction
    'evolution_api' => [
        'base_url' => rtrim((string) env('EVOLUTION_API_BASE_URL', ''), '/'),
        'api_key' => env('EVOLUTION_API_KEY', ''),
    ],
    // Live server (Socket.IO): API key untuk simpan pesan chat ke tabel chat. Set LIVE_SERVER_API_KEY di .env (sama dengan live/.env).
    // LIVE_SERVER_URL: asal HTTP server live (contoh http://127.0.0.1:3004) untuk broadcast hint indeks santri dari PHP.
    'live_server' => [
        'api_key' => env('LIVE_SERVER_API_KEY', ''),
        'url' => rtrim((string) env('LIVE_SERVER_URL', 'http://127.0.0.1:3004'), '/'),
    ],
    // Base URL API ini (untuk webhook WatZap). Staging: https://api2.alutsmani.id, production: https://api.alutsmani.id.
    // Di .env set API_PUBLIC_URL; atau WATZAP_WEBHOOK_URL (full URL) untuk override.
    'api_public_url' => rtrim((string) env('API_PUBLIC_URL', ''), '/'),
    // Base URL aplikasi FRONTEND eBeddien (dulu UWABA), bukan backend. Link WA (setup akun / ubah password).
    // Dev: http://localhost:5173. Production: https://ebeddien.alutsmani.id (sesuaikan domain Anda).
    // Optional: EBEDDIEN_APP_URL mengoverride APP_URL hanya untuk link di pesan WA (jika APP_URL masih domain lama).
    'app' => [
        'url' => env('APP_URL', 'http://localhost:5173'),
        'ebeddien_url' => env('EBEDDIEN_APP_URL', ''),
        // Nomor WA (digit 62…) untuk wa.me saat daftar eBeddien — chat ke nomor QR yang terhubung di server WA.
        'ebeddien_daftar_wa_qr_number' => preg_replace('/\D/', '', (string) env('EBEDDIEN_DAFTAR_WA_QR_NUMBER', '6282232999921')),
        // Nomor admin (wa.me) jika layanan WA/cek nomor bermasalah — pesan otomatis "Masalah daftar Aplikasi…"
        'ebeddien_daftar_wa_admin' => preg_replace('/\D/', '', (string) env('EBEDDIEN_DAFTAR_WA_ADMIN', '6282232999921')),
        // Base URL aplikasi Mybeddian — untuk link WA saat daftar santri (setup akun). Dev: http://localhost:5174. Production: https://mybeddian.example.com
        'mybeddian_url' => env('MYBEDDIAN_APP_URL', 'http://localhost:5174'),
    ],
    // Base URL aplikasi pendaftaran (daftar) - untuk link di WA notifikasi PSB
    'daftar_app_url' => env('DAFTAR_APP_URL', 'https://daftar.alutsmani.id'),
    // Path upload: di .env set UPLOADS_BASE_PATH (folder BASE) dan UPLOADS_FOLDER (nama folder: uploads atau uploads2).
    // Path fisik = UPLOADS_BASE_PATH + UPLOADS_FOLDER + /santri, /pengeluaran, /pengurus, dll.
    'uploads_base_path' => (function () {
        $apiRoot = __DIR__;
        $p = env('UPLOADS_BASE_PATH');
        if ($p === null || $p === '') {
            return $apiRoot;
        }
        $p = trim($p);
        if ($p === '') {
            return $apiRoot;
        }
        if ($p[0] === '/' || (strlen($p) >= 2 && $p[1] === ':')) {
            return rtrim($p, '/\\');
        }
        return rtrim($apiRoot . '/' . $p, '/\\');
    })(),
    // Nama folder upload: production = uploads, staging = uploads2 (langsung dari .env).
    'uploads_folder' => trim(env('UPLOADS_FOLDER', 'uploads'), '/\\'),
    // Google Calendar (opsional): API key untuk read. Service account untuk create/update/delete (super_admin).
    'google' => [
        'calendar_api_key' => env('GOOGLE_CALENDAR_API_KEY', null),
        'service_account_json_path' => env('GOOGLE_SERVICE_ACCOUNT_JSON_PATH', null),
    ],
    // iPayMu callback: verifikasi signature & IP whitelist (opsional).
    // Ref: https://documenter.getpostman.com/view/40296808/2sB3WtseBT | https://ipaymu.com/en/api-documentation/
    'ipaymu_callback' => [
        // Verifikasi signature header (HMAC-SHA256). Set true di production agar callback palsu ditolak.
        'verify_signature' => filter_var(env('IPAYMU_CALLBACK_VERIFY_SIGNATURE', 'true'), FILTER_VALIDATE_BOOLEAN),
        // IP whitelist (comma-separated). Kosong = terima dari IP mana pun. Dapatkan daftar IP dari support@ipaymu.com.
        'ip_whitelist' => array_filter(array_map('trim', explode(',', env('IPAYMU_CALLBACK_IP_WHITELIST', '')))),
    ],
    // Mesin absensi sidik jari (iClock HTTP). Tanpa JWT. PIN = NIP pengurus.
    // ABSEN_FINGERPRINT_ALLOWED_SN: serial mesin (SN), dipisah koma; kosong = semua SN diizinkan.
    // ABSEN_FINGERPRINT_SECRET: jika di-set, wajib ?key=... di URL atau header X-Absen-Fingerprint-Key.
    'absen_fingerprint' => [
        'allowed_serial_numbers' => array_values(array_filter(array_map('trim', explode(',', (string) env('ABSEN_FINGERPRINT_ALLOWED_SN', ''))))),
        'shared_secret' => (string) env('ABSEN_FINGERPRINT_SECRET', ''),
    ],
];

