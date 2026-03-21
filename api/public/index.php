<?php

// Preflight OPTIONS: tangani paling awal (sebelum require apa pun) agar CORS selalu ada
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim($_SERVER['HTTP_ORIGIN']) : '';
    $allow = '*';
    if ($origin !== '') {
        $h = parse_url($origin, PHP_URL_HOST);
        $h = $h ? strtolower($h) : '';
        $ok = ($h === 'alutsmani.id' || (strlen($h) >= 13 && substr($h, -13) === '.alutsmani.id')
            || $h === 'alutsmani.my.id' || (strlen($h) >= 16 && substr($h, -16) === '.alutsmani.my.id')
            || $h === 'localhost' || $h === '127.0.0.1'
            || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false);
        if ($ok) {
            $allow = $origin;
        }
    } else {
        // Origin kosong (proxy/strip): izinkan dev origin agar localhost:5173 bisa login
        $allow = 'http://localhost:5173';
    }
    header('Access-Control-Allow-Origin: ' . $allow);
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma');
    header('Access-Control-Max-Age: 3600');
    if ($allow !== '*') {
        header('Access-Control-Allow-Credentials: true');
    }
    http_response_code(200);
    exit(0);
}

use Slim\Factory\AppFactory;
use App\Middleware\CorsForceOriginMiddleware;
use App\Middleware\CorsMiddleware;
use App\Middleware\SecurityHeadersMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Middleware\CsrfMiddleware;
use App\Middleware\RequestSizeMiddleware;
use App\Middleware\HttpsMiddleware;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Controllers\AuthController;
use App\Controllers\AuthControllerV2;
use App\Controllers\UserController;
use App\Controllers\ProfilController;
use App\Controllers\ProfilFotoController;
use App\Controllers\DashboardController;
use App\Controllers\SantriController;
use App\Controllers\UwabaController;
use App\Controllers\PaymentController;
use App\Controllers\PrintController;
use App\Controllers\LaporanController;
use App\Controllers\ChatController;
use App\Controllers\UserChatController;
use App\Controllers\ManageUsersController;
use App\Controllers\PengeluaranController;
use App\Controllers\PemasukanController;
use App\Controllers\AktivitasController;
use App\Controllers\LembagaController;
use App\Controllers\JabatanController;
use App\Controllers\PendaftaranController;
use App\Controllers\PengaturanController;
use App\Controllers\SantriBerkasController;
use App\Controllers\SantriBerkasControllerV2;
use App\Controllers\IjinController;
use App\Controllers\BoyongController;
use App\Controllers\SubscriptionController;
use App\Controllers\UmrohJamaahController;
use App\Controllers\UmrohTabunganController;
use App\Controllers\UmrohPengeluaranController;
use App\Controllers\PaymentGatewayController;
use App\Controllers\PaymentTransactionController;
use App\Controllers\SantriJuaraController;
use App\Controllers\SettingsController;
use App\Controllers\UploadsManagerController;
use App\Controllers\PengeluaranRencanaFileControllerV2;
use App\Controllers\WhatsAppController;
use App\Controllers\KalenderController;
use App\Controllers\HariPentingController;
use App\Controllers\GoogleCalendarController;
use App\Controllers\MadrasahController;
use App\Controllers\MadrasahFotoController;
use App\Controllers\PengurusController;
use App\Controllers\AlamatController;
use App\Controllers\VersionChangelogController;
use App\Controllers\UserAktivitasController;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

require __DIR__ . '/../vendor/autoload.php';

// Helper: redact data sensitif dari pesan error sebelum log
if (!function_exists('sanitizeErrorMessage')) {
    function sanitizeErrorMessage(string $message): string
    {
        $patterns = [
            '/password["\']?\s*[:=]\s*["\']?[^"\']+/i',
            '/token["\']?\s*[:=]\s*["\']?[^"\']+/i',
            '/secret["\']?\s*[:=]\s*["\']?[^"\']+/i',
            '/api[_-]?key["\']?\s*[:=]\s*["\']?[^"\']+/i',
        ];
        foreach ($patterns as $pattern) {
            $message = preg_replace($pattern, '[REDACTED]', $message);
        }
        return $message;
    }
}

// Set timezone ke Jakarta (WIB)
date_default_timezone_set('Asia/Jakarta');

// Error reporting berdasarkan environment
$isProduction = getenv('APP_ENV') === 'production' || 
                (file_exists(__DIR__ . '/../.env') && strpos(file_get_contents(__DIR__ . '/../.env'), 'APP_ENV=production') !== false);

if ($isProduction) {
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
    ini_set('display_errors', 0);
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', 0); // Jangan tampilkan di output, tapi log
}
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../error.log');

// Register shutdown function untuk menangkap fatal error dan memastikan CORS header selalu ada
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== NULL && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        // Log detail ke server; jangan kirim ke client di production (cegah kebocoran path/stack)
        $isProduction = (getenv('APP_ENV') ?: '') === 'production';
        if ($isProduction && function_exists('error_log')) {
            error_log('Fatal error (shutdown): ' . ($error['message'] ?? '') . ' in ' . ($error['file'] ?? '') . ' line ' . ($error['line'] ?? ''));
        }
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
        $corsConfig = require __DIR__ . '/../config.php';
        $allowAll = $corsConfig['cors']['allow_all'];
        
        header('Content-Type: application/json; charset=utf-8');
        if ($allowAll || cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false) {
            if ($origin && $origin !== '*') {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Access-Control-Allow-Credentials: true');
            } else {
                header('Access-Control-Allow-Origin: *');
            }
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        }
        http_response_code(500);
        $clientMessage = $isProduction ? 'Internal Server Error.' : ('Internal Server Error: ' . ($error['message'] ?? ''));
        echo json_encode([
            'success' => false,
            'message' => $clientMessage
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }
});

$app = AppFactory::create();

// Base path detection - jika diakses dari subfolder
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '/index.php';
$basePath = str_replace('\\', '/', dirname($scriptName));

// Normalize base path
if ($basePath === '.' || $basePath === '\\') {
    $basePath = '/';
}

// Log untuk debugging
error_log("SCRIPT_NAME: " . $scriptName);
error_log("Calculated basePath: " . $basePath);
error_log("REQUEST_URI: " . ($_SERVER['REQUEST_URI'] ?? 'not set'));
error_log("PATH_INFO: " . ($_SERVER['PATH_INFO'] ?? 'not set'));

// Set base path jika tidak di root
if ($basePath !== '/') {
    $app->setBasePath($basePath);
    error_log("Base path set to: " . $basePath);
} else {
    error_log("Using root base path (/)");
}

// Middleware (urutan penting! First added = outermost = terakhir sentuh response)
// Paksa CORS origin = origin request (jalan terakhir agar overwrite nilai salah dari cache/env)
$app->add(new CorsForceOriginMiddleware());
// HTTPS redirect di production (sebelum CORS)
$app->add(new HttpsMiddleware());
// CORS handle preflight + tambah header
$app->add(new CorsMiddleware());

// Security Headers - tambahkan setelah CORS untuk semua response
$app->add(new SecurityHeadersMiddleware());

// Parse JSON body - harus setelah CORS
$app->addBodyParsingMiddleware();

// Limit ukuran request (body max 10MB, max 100 parameter) - mitigasi DoS
$app->add(new RequestSizeMiddleware(10485760, 100));

// Rate limiting
$app->add(new RateLimitMiddleware());

// CSRF protection global untuk POST/PUT/DELETE (endpoint auth/public di-exclude di CsrfMiddleware)
$app->add(new CsrfMiddleware());

// Error handling middleware - sembunyikan detail di production
$isProduction = getenv('APP_ENV') === 'production' || 
                (file_exists(__DIR__ . '/../.env') && strpos(file_get_contents(__DIR__ . '/../.env'), 'APP_ENV=production') !== false);

$errorMiddleware = $app->addErrorMiddleware(!$isProduction, true, true);
$errorHandler = $errorMiddleware->getDefaultErrorHandler();
$errorHandler->forceContentType('application/json');

// Custom error handler untuk semua error
$errorMiddleware->setErrorHandler(
    \Throwable::class,
    function (Request $request, \Throwable $exception, bool $displayErrorDetails, bool $logErrors, bool $logErrorDetails) use ($isProduction) {
        // Handle OPTIONS request khusus - kembalikan 200 dengan CORS header meskipun ada error
        if ($request->getMethod() === 'OPTIONS') {
            $origin = $request->getHeaderLine('Origin');
            $corsConfig = require __DIR__ . '/../config.php';
            $allowAll = $corsConfig['cors']['allow_all'];
            $allowedOrigins = array_map('trim', explode(',', $corsConfig['cors']['allowed_origins']));
            
            $response = new \Nyholm\Psr7\Response();
            $response = $response->withStatus(200);
            
            if ($allowAll) {
                if ($origin && $origin !== '*') {
                    $response = $response
                        ->withHeader('Access-Control-Allow-Origin', $origin)
                        ->withHeader('Access-Control-Allow-Credentials', 'true');
                } else {
                    $response = $response->withHeader('Access-Control-Allow-Origin', '*');
                }
            } elseif ($origin && in_array($origin, $allowedOrigins, true)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($origin && (cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false)) {
            $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response->withHeader('Access-Control-Allow-Origin', '*');
            }
            
            $response = $response
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Max-Age', '3600');
            
            return $response;
        }
        
        $response = new \Nyholm\Psr7\Response();
        
        $statusCode = 500;
        $message = 'Internal Server Error';
        
        if ($exception instanceof \Slim\Exception\HttpException) {
            $statusCode = $exception->getCode();
            $message = $exception->getMessage();
        }
        
        // Log error (sanitize pesan; di production tidak log path/stack trace)
        if ($logErrors) {
            $sanitized = sanitizeErrorMessage($exception->getMessage());
            error_log("Error: " . $sanitized);
            if (!$isProduction && $logErrorDetails) {
                error_log("File: " . $exception->getFile() . " Line: " . $exception->getLine());
                error_log("Stack trace: " . $exception->getTraceAsString());
            }
        }
        
        // Response untuk user
        $data = [
            'success' => false,
            'message' => $message
        ];
        
        // Hanya tampilkan detail error jika bukan production
        if (!$isProduction && $displayErrorDetails) {
            $data['error'] = [
                'type' => get_class($exception),
                'message' => $exception->getMessage(),
                'file' => $exception->getFile(),
                'line' => $exception->getLine()
            ];
            
            if ($logErrorDetails) {
                $data['error']['trace'] = explode("\n", $exception->getTraceAsString());
            }
        }
        
        // Tambahkan CORS header ke error response
        $origin = $request->getHeaderLine('Origin');
        $corsConfig = require __DIR__ . '/../config.php';
        $allowAll = $corsConfig['cors']['allow_all'];
        $allowedOrigins = array_map('trim', explode(',', $corsConfig['cors']['allowed_origins']));
        
        $response->getBody()->write(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $response = $response
            ->withStatus($statusCode)
            ->withHeader('Content-Type', 'application/json; charset=utf-8');
        
        // Set CORS headers - SELALU tambahkan untuk memastikan browser bisa membaca error
        if ($allowAll) {
            // Jika allowAll aktif, selalu set CORS header
            if ($origin) {
                // Jika ada origin, gunakan origin tersebut dengan credentials
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Env, X-App-Source')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                // Jika tidak ada origin, gunakan '*'
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', '*')
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Env, X-App-Source')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            }
        } elseif ($origin && (in_array($origin, $allowedOrigins, true) || cors_origin_is_alutsmani_id($origin))) {
            // Jika origin diizinkan (list atau *.alutsmani.id), gunakan origin tersebut dengan credentials
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Env, X-App-Source')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        } else {
            // Fallback: untuk development (localhost) dan production (*.alutsmani.id)
            if (cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin ?: '*')
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Env, X-App-Source')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                // Jika tidak ada origin yang cocok, tetap tambahkan '*' untuk development
                // Catatan: '*' tidak bisa digunakan dengan credentials
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', '*')
                    ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Env, X-App-Source')
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            }
        }
        
        return $response;
    }
);

// Custom error handler untuk method not allowed
$errorMiddleware->setErrorHandler(
    \Slim\Exception\HttpMethodNotAllowedException::class,
    function (Request $request, \Throwable $exception, bool $displayErrorDetails) {
        // Jika ini adalah OPTIONS request (preflight), kembalikan 200 dengan CORS header
        if ($request->getMethod() === 'OPTIONS') {
            $origin = $request->getHeaderLine('Origin');
            $corsConfig = require __DIR__ . '/../config.php';
            $allowAll = $corsConfig['cors']['allow_all'];
            $allowedOrigins = array_map('trim', explode(',', $corsConfig['cors']['allowed_origins']));
            
            $response = new \Nyholm\Psr7\Response();
            $response = $response
                ->withStatus(200)
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Max-Age', '3600');
            
            // Set origin dan credentials
            if ($allowAll) {
                if ($origin && $origin !== '*') {
                    $response = $response
                        ->withHeader('Access-Control-Allow-Origin', $origin)
                        ->withHeader('Access-Control-Allow-Credentials', 'true');
                } else {
                    $response = $response->withHeader('Access-Control-Allow-Origin', '*');
                }
            } elseif ($origin && in_array($origin, $allowedOrigins, true)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($origin && (cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response->withHeader('Access-Control-Allow-Origin', '*');
            }
            
            return $response;
        }
        
        // Untuk method lain yang tidak diizinkan, kembalikan 405 dengan CORS header
        $origin = $request->getHeaderLine('Origin');
        $corsConfig = require __DIR__ . '/../config.php';
        $allowAll = $corsConfig['cors']['allow_all'];
        $allowedOrigins = array_map('trim', explode(',', $corsConfig['cors']['allowed_origins']));
        
        $response = new \Nyholm\Psr7\Response();
        $response->getBody()->write(json_encode([
            'success' => false,
            'message' => 'Method tidak diizinkan untuk endpoint ini',
            'method' => $request->getMethod(),
            'path' => $request->getUri()->getPath()
        ]));
        
        $response = $response
            ->withStatus(405)
            ->withHeader('Content-Type', 'application/json');
        
        // Tambahkan CORS header
        if ($allowAll) {
            if ($origin && $origin !== '*') {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response->withHeader('Access-Control-Allow-Origin', '*');
            }
        } elseif ($origin && in_array($origin, $allowedOrigins, true)) {
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        } elseif ($origin && (cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false)) {
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        }
        
        return $response;
    }
);

// Custom error handler untuk not found
$errorMiddleware->setErrorHandler(
    \Slim\Exception\HttpNotFoundException::class,
    function (Request $request, \Throwable $exception, bool $displayErrorDetails) {
        $response = new \Nyholm\Psr7\Response();
        
        // Handle OPTIONS request khusus - kembalikan 200 dengan CORS header
        if ($request->getMethod() === 'OPTIONS') {
            $origin = $request->getHeaderLine('Origin');
            $corsConfig = require __DIR__ . '/../config.php';
            $allowAll = $corsConfig['cors']['allow_all'];
            $allowedOrigins = array_map('trim', explode(',', $corsConfig['cors']['allowed_origins']));
            
            $response = $response->withStatus(200);
            
            if ($allowAll) {
                if ($origin && $origin !== '*') {
                    $response = $response
                        ->withHeader('Access-Control-Allow-Origin', $origin)
                        ->withHeader('Access-Control-Allow-Credentials', 'true');
                } else {
                    $response = $response->withHeader('Access-Control-Allow-Origin', '*');
                }
            } elseif ($origin && in_array($origin, $allowedOrigins, true)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } elseif ($origin && (cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false)) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response->withHeader('Access-Control-Allow-Origin', '*');
            }
            
            $response = $response
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Max-Age', '3600');
            
            return $response;
        }
        
        // Untuk method lain, kembalikan error 404 dengan CORS header
        $basePath = $request->getUri()->getBasePath();
        $path = $request->getUri()->getPath();
        $origin = $request->getHeaderLine('Origin');
        $corsConfig = require __DIR__ . '/../config.php';
        $allowAll = $corsConfig['cors']['allow_all'];
        $allowedOrigins = array_map('trim', explode(',', $corsConfig['cors']['allowed_origins']));
        
        $response->getBody()->write(json_encode([
            'success' => false,
            'message' => 'Endpoint tidak ditemukan',
            'path' => $path,
            'base_path' => $basePath,
            'method' => $request->getMethod(),
            'hint' => 'Pastikan URL benar. Contoh: ' . ($basePath ?: '/') . '/api/test untuk test endpoint'
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        
        $response = $response
            ->withStatus(404)
            ->withHeader('Content-Type', 'application/json');
        
        // Tambahkan CORS header
        if ($allowAll) {
            if ($origin && $origin !== '*') {
                $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
            } else {
                $response = $response->withHeader('Access-Control-Allow-Origin', '*');
            }
        } elseif ($origin && in_array($origin, $allowedOrigins, true)) {
            $response = $response
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Credentials', 'true');
        } elseif ($origin && (cors_origin_is_alutsmani_id($origin) || strpos($origin, 'localhost') !== false || strpos($origin, '127.0.0.1') !== false || strpos($origin, ':5173') !== false || strpos($origin, ':5174') !== false || strpos($origin, ':5175') !== false)) {
            $response = $response
                    ->withHeader('Access-Control-Allow-Origin', $origin)
                    ->withHeader('Access-Control-Allow-Credentials', 'true');
        } else {
            // Agar browser tetap bisa baca response 404 (hindari CORS error), kirim Allow-Origin
            $response = $response->withHeader('Access-Control-Allow-Origin', $origin ?: '*');
        }
        
        $response = $response
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Frontend-Base-URL, X-Frontend-Env, X-App-Source, Cache-Control, Pragma')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        
        return $response;
    }
);

// Routes
(require __DIR__ . '/../routes/01_test_auth.php')($app);
(require __DIR__ . '/../routes/02_auth_v2_profil.php')($app);
(require __DIR__ . '/../routes/03_public.php')($app);
(require __DIR__ . '/../routes/04_protected_api.php')($app);
(require __DIR__ . '/../routes/05_dashboard_laporan.php')($app);
(require __DIR__ . '/../routes/06_pendaftaran.php')($app);
(require __DIR__ . '/../routes/07_santri_berkas.php')($app);
(require __DIR__ . '/../routes/08_pengaturan.php')($app);
(require __DIR__ . '/../routes/09_payment_gateway_transaction.php')($app);
(require __DIR__ . '/../routes/10_uwaba_payment.php')($app);
(require __DIR__ . '/../routes/11_umroh.php')($app);
(require __DIR__ . '/../routes/12_pengeluaran.php')($app);
(require __DIR__ . '/../routes/13_aktivitas_pemasukan.php')($app);
(require __DIR__ . '/../routes/14_manage_users.php')($app);
(require __DIR__ . '/../routes/15_settings_user_aktivitas.php')($app);
(require __DIR__ . '/../routes/16_lembaga_alamat_pengurus.php')($app);
(require __DIR__ . '/../routes/17_madrasah_jabatan.php')($app);
(require __DIR__ . '/../routes/18_uploads_santri_juara.php')($app);
(require __DIR__ . '/../routes/19_kalender_hari_penting.php')($app);
(require __DIR__ . '/../routes/20_google_calendar.php')($app);
(require __DIR__ . '/../routes/21_ijin_boyong.php')($app);
(require __DIR__ . '/../routes/22_mybeddian.php')($app);
(require __DIR__ . '/../routes/23_cashless.php')($app);
(require __DIR__ . '/../routes/24_daerah_kamar.php')($app);
(require __DIR__ . '/../routes/25_deepseek.php')($app);
(require __DIR__ . '/../routes/26_ai_training_admin.php')($app);
(require __DIR__ . '/../routes/27_kitab.php')($app);
(require __DIR__ . '/../routes/28_mapel.php')($app);

// Catch-all untuk 404
$app->map(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], '/{routes:.+}', function (Request $request, Response $response) {
    $response->getBody()->write(json_encode([
        'success' => false,
        'message' => 'Endpoint tidak ditemukan',
        'path' => $request->getUri()->getPath()
    ]));
    return $response
        ->withStatus(404)
        ->withHeader('Content-Type', 'application/json');
});

$app->run();

