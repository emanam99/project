<?php

use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use Dotenv\Dotenv;
use App\Controllers\AuthController;
use App\Controllers\CronController;
use App\Controllers\DashboardController;
use App\Controllers\PelangganController;
use App\Controllers\RekapController;
use App\Controllers\TagihanController;
use App\Controllers\UserController;
use App\Helpers\AuthHelper;
use App\Middleware\AuthMiddleware;

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../error.log');

$app = AppFactory::create();
$app->addErrorMiddleware(true, true, true);
$app->addBodyParsingMiddleware();

$app->add(function ($request, $handler) {
    $origin = $request->getHeaderLine('Origin');
    $response = $handler->handle($request);

    if ($origin && AuthHelper::isAllowedFrontendOrigin($origin)) {
        $response = $response
            ->withHeader('Access-Control-Allow-Origin', $origin)
            ->withHeader('Access-Control-Allow-Credentials', 'true')
            ->withHeader('Vary', 'Origin');
    }

    return $response
        ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
});

$app->options('/{routes:.+}', function ($request, $response) {
    return $response;
});

$basePath = str_replace('/index.php', '', $_SERVER['SCRIPT_NAME'] ?? '');
$app->setBasePath($basePath);

$auth = new AuthController();
$users = new UserController();
$pelanggan = new PelangganController();
$tagihan = new TagihanController();
$rekap = new RekapController();
$dashboard = new DashboardController();
$cron = new CronController();

$app->get('/auth/google', [$auth, 'googleStart']);
$app->get('/auth/google/callback', [$auth, 'googleCallback']);
$app->post('/auth/login', [$auth, 'login']);
$app->map(['GET', 'POST'], '/cron/tagihan-bulanan', [$cron, 'tagihanBulanan']);

$app->group('', function (RouteCollectorProxy $group) use ($auth, $users, $pelanggan, $tagihan, $rekap, $dashboard) {
    $group->get('/auth/me', [$auth, 'me']);
    $group->post('/auth/logout', [$auth, 'logout']);

    $group->get('/dashboard', [$dashboard, 'index']);

    $group->get('/users', [$users, 'index']);
    $group->post('/users', [$users, 'create']);
    $group->put('/users/{id}/role', [$users, 'updateRole']);
    $group->put('/users/{id}/pelanggan', [$users, 'linkPelanggan']);
    $group->delete('/users/{id}', [$users, 'delete']);

    $group->get('/pelanggan', [$pelanggan, 'index']);
    $group->post('/pelanggan/import', [$pelanggan, 'import']);
    $group->get('/pelanggan/{id}', [$pelanggan, 'show']);
    $group->post('/pelanggan', [$pelanggan, 'create']);
    $group->put('/pelanggan/{id}', [$pelanggan, 'update']);
    $group->delete('/pelanggan/{id}', [$pelanggan, 'delete']);

    $group->get('/tagihan', [$tagihan, 'index']);
    $group->get('/tagihan/berulang', [$tagihan, 'listBerulang']);
    $group->post('/tagihan', [$tagihan, 'create']);
    $group->post('/tagihan/bayar', [$tagihan, 'createBayar']);
    $group->delete('/tagihan/bayar/{id}', [$tagihan, 'deleteBayar']);
    $group->delete('/tagihan/berulang/{id}', [$tagihan, 'deleteBerulang']);
    $group->get('/tagihan/{id}', [$tagihan, 'show']);
    $group->put('/tagihan/{id}', [$tagihan, 'update']);
    $group->delete('/tagihan/{id}', [$tagihan, 'delete']);

    $group->get('/rekap', [$rekap, 'index']);
})->add(new AuthMiddleware());

$app->run();
