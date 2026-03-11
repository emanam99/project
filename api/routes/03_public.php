<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\ResponseInterface as Response;
use App\Controllers\PendaftaranController;
use App\Controllers\SantriController;
use App\Controllers\IjinController;
use App\Controllers\SantriJuaraController;
use App\Controllers\SantriBerkasController;
use App\Controllers\PaymentController;
use App\Controllers\PengaturanController;
use App\Controllers\VersionChangelogController;
use App\Controllers\KalenderController;
use App\Controllers\HariPentingController;
use App\Controllers\WhatsAppController;

return function (\Slim\App $app): void {
    // Public endpoint untuk cek NIK (tanpa auth)
    $app->get('/api/pendaftaran/check-nik', [PendaftaranController::class, 'checkNik']);
    $app->get('/api/pendaftaran/kondisi-values', [PendaftaranController::class, 'getKondisiValues']);
    $app->get('/api/pendaftaran/kondisi-fields', [PendaftaranController::class, 'getKondisiFields']);
    $app->post('/api/pendaftaran/items-by-kondisi', [PendaftaranController::class, 'getItemsByKondisi']);
    $app->get('/api/pendaftaran/items-by-kondisi', [PendaftaranController::class, 'getItemsByKondisi']);
    // get-transaksi-public dihapus: celah keamanan (siapa saja bisa akses transaksi orang lain dengan id_santri/id_registrasi).
    // Gunakan GET /api/pendaftaran/get-transaksi?id_registrasi=... dengan auth; role santri hanya akses transaksi sendiri.
    $app->get('/api/pendaftaran/get-tahun-ajaran-list', [PendaftaranController::class, 'getTahunAjaranList']);

    // Public endpoint untuk biodata santri dan ijin
    $app->get('/api/public/santri', [SantriController::class, 'getPublicSantri']);
    $app->get('/api/public/ijin', [IjinController::class, 'getPublicIjin']);
    $app->get('/api/public/shohifah', [SantriController::class, 'getPublicShohifah']);
    $app->post('/api/public/shohifah', [SantriController::class, 'savePublicShohifah']);
    $app->get('/api/public/juara', [SantriJuaraController::class, 'getPublicJuara']);
    $app->get('/api/public/juara-foto', [SantriBerkasController::class, 'getPublicFotoJuara']);
    $app->get('/api/public/juara-foto-image', [SantriBerkasController::class, 'serveFotoJuaraImage']);
    $app->get('/api/public/juara-foto/list', [SantriBerkasController::class, 'getPublicFotoJuaraList']);
    $app->get('/api/public/pembayaran/uwaba/tahun-list', [PaymentController::class, 'getPublicUwabaTahunList']);
    $app->get('/api/public/pembayaran/{mode}', [PaymentController::class, 'getPublicRincian']);
    $app->get('/api/public/pembayaran/{mode}/history', [PaymentController::class, 'getPublicPaymentHistory']);

    // Public routes untuk pengaturan (tanpa auth)
    $app->get('/api/pengaturan/image/{key}', [PengaturanController::class, 'serveImage']);
    $app->get('/api/pengaturan', [PengaturanController::class, 'getAll']);
    $app->get('/api/pengaturan/{key}', [PengaturanController::class, 'getByKey']);

    // Versi backend (API) saat ini - Public GET (__DIR__ = api/routes → config di api/config.php)
    $app->get('/api/version', function (Request $request, Response $response) {
        $config = require dirname(__DIR__) . '/config.php';
        $version = $config['api_version'] ?? '0.0.0';
        $response->getBody()->write(json_encode([
            'success' => true,
            'app' => 'api',
            'version' => $version,
        ], JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
    });
    $app->get('/api/version/changelog', [VersionChangelogController::class, 'getChangelog']);

    // Kalender & Hari Penting - Public GET
    $app->get('/api/kalender', [KalenderController::class, 'get']);
    $app->get('/api/hari-penting', [HariPentingController::class, 'getList']);

    // Webhook pesan masuk WA (tanpa auth). WA kirim ke sini, retry sampai 200. Simpan ke tabel whatsapp (arah=masuk).
    $app->post('/api/wa/incoming', [WhatsAppController::class, 'incoming']);
    // Update status pesan (sent/delivered/read) dari server WA. Header X-API-Key wajib (sama dengan WA_API_KEY).
    $app->post('/api/wa/message-status', [WhatsAppController::class, 'messageStatus']);
};
