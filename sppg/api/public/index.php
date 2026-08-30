<?php

use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use Dotenv\Dotenv;
use App\Controllers\AuthController;
use App\Controllers\BelanjaController;
use App\Controllers\BelanjaFileController;
use App\Controllers\BniNotifyController;
use App\Controllers\DashboardController;
use App\Controllers\ExportArsipController;
use App\Controllers\KategoriController;
use App\Controllers\PorsiController;
use App\Controllers\PlatformAdminController;
use App\Controllers\PublicSppgController;
use App\Controllers\RekeningController;
use App\Controllers\SppgController;
use App\Controllers\SubscriptionCronController;
use App\Controllers\UserController;
use App\Controllers\XenditWebhookController;
use App\Helpers\AuthHelper;
use App\Middleware\AuthMiddleware;
use App\Middleware\PlatformAdminMiddleware;

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
        ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization, X-Cron-Key, x-callback-token')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
});

$app->options('/{routes:.+}', function ($request, $response) {
    return $response;
});

$basePath = str_replace('/index.php', '', $_SERVER['SCRIPT_NAME'] ?? '');
$app->setBasePath($basePath);

$auth = new AuthController();
$publicSppg = new PublicSppgController();
$sppg = new SppgController();
$belanja = new BelanjaController();
$belanjaFile = new BelanjaFileController();
$dashboard = new DashboardController();
$users = new UserController();
$rekening = new RekeningController();
$kategori = new KategoriController();
$exportArsip = new ExportArsipController();
$porsi = new PorsiController();
$platform = new PlatformAdminController();
$xenditWebhook = new XenditWebhookController();
$subscriptionCron = new SubscriptionCronController();

$app->get('/auth/google', [$auth, 'googleStart']);
$app->get('/auth/google/callback', [$auth, 'googleCallback']);
$app->get('/auth/pick-options', [$auth, 'pickOptions']);
$app->post('/auth/complete-pick', [$auth, 'completePick']);

$app->get('/public/sppg/check-slug', [$publicSppg, 'checkSlug']);
$app->get('/public/sppg/check-subdomain', [$publicSppg, 'checkSubdomain']);
$app->post('/public/sppg/register', [$publicSppg, 'register']);
$app->get('/public/sppg/pwa-logo', [$sppg, 'pwaLogo']);

$app->post('/webhooks/xendit', [$xenditWebhook, 'invoice']);

$bniNotify = new BniNotifyController();
$app->map(['GET', 'POST'], '/cron/bni-email-poll', [$bniNotify, 'poll']);
$app->post('/cron/bni-email-hook', [$bniNotify, 'hook']);
$app->map(['GET', 'POST'], '/cron/subscription-renewal', [$subscriptionCron, 'renewal']);

$app->group('', function (RouteCollectorProxy $group) use ($auth, $sppg, $belanja, $belanjaFile, $dashboard, $users, $rekening, $kategori, $exportArsip, $porsi) {
    $group->get('/auth/me', [$auth, 'me']);
    $group->post('/auth/logout', [$auth, 'logout']);

    $group->get('/sppg/profile', [$sppg, 'profile']);
    $group->put('/sppg/profile', [$sppg, 'updateProfile']);
    $group->get('/sppg/manifest.webmanifest', [$sppg, 'manifest']);
    $group->post('/sppg/profile/pwa-logo', [$sppg, 'uploadPwaLogo']);
    $group->get('/sppg/subscription', [$sppg, 'subscription']);
    $group->post('/sppg/subscription/pay', [$sppg, 'paySubscription']);

    $group->get('/dashboard/summary', [$dashboard, 'summary']);

    $group->get('/rekening', [$rekening, 'index']);
    $group->post('/rekening', [$rekening, 'create']);
    $group->put('/rekening/{id}', [$rekening, 'update']);
    $group->delete('/rekening/{id}', [$rekening, 'delete']);
    $group->get('/kategori', [$kategori, 'index']);

    $group->get('/belanja', [$belanja, 'index']);
    $group->get('/belanja/item-options', [$belanja, 'itemOptions']);
    $group->get('/belanja/export/bni-online', [$belanja, 'exportBniOnline']);
    $group->get('/belanja/export/maker-xlsx', [$belanja, 'exportMakerXlsx']);
    $group->patch('/belanja/bni-status', [$belanja, 'bulkUpdateBniStatus']);
    $group->patch('/belanja/cair-status', [$belanja, 'bulkUpdateCairStatus']);
    $group->get('/export-arsip', [$exportArsip, 'index']);
    $group->get('/export-arsip/{id}', [$exportArsip, 'show']);
    $group->get('/belanja/files/{fileId}/download', [$belanjaFile, 'download']);
    $group->delete('/belanja/files/{fileId}', [$belanjaFile, 'delete']);
    $group->get('/belanja/{id}/files', [$belanjaFile, 'index']);
    $group->post('/belanja/{id}/files', [$belanjaFile, 'upload']);
    $group->get('/belanja/{id}', [$belanja, 'show']);
    $group->post('/belanja', [$belanja, 'create']);
    $group->put('/belanja/{id}', [$belanja, 'update']);
    $group->delete('/belanja/{id}', [$belanja, 'delete']);
    $group->post('/belanja/{id}/items', [$belanja, 'addItem']);
    $group->put('/belanja/{id}/items/{itemId}', [$belanja, 'updateItem']);
    $group->delete('/belanja/{id}/items/{itemId}', [$belanja, 'deleteItem']);

    $group->get('/porsi', [$porsi, 'index']);
    $group->get('/porsi/item-options', [$porsi, 'itemOptions']);
    $group->get('/porsi/{id}/foto', [$porsi, 'downloadFoto']);
    $group->post('/porsi/{id}/foto', [$porsi, 'uploadFoto']);
    $group->delete('/porsi/{id}/foto', [$porsi, 'deleteFoto']);
    $group->get('/porsi/{id}', [$porsi, 'show']);
    $group->post('/porsi', [$porsi, 'create']);
    $group->put('/porsi/{id}', [$porsi, 'update']);
    $group->delete('/porsi/{id}', [$porsi, 'delete']);

    $group->get('/users', [$users, 'index']);
    $group->post('/users', [$users, 'create']);
    $group->put('/users/{id}/role', [$users, 'updateRole']);
    $group->delete('/users/{id}', [$users, 'delete']);
})->add(new AuthMiddleware());

$app->group('/platform', function (RouteCollectorProxy $group) use ($platform) {
    $group->get('/dashboard', [$platform, 'dashboard']);
    $group->get('/tenants', [$platform, 'tenants']);
    $group->get('/tenants/{id}', [$platform, 'tenantDetail']);
    $group->patch('/tenants/{id}', [$platform, 'updateTenant']);
    $group->post('/tenants/{id}/retry-dns', [$platform, 'retryDns']);
    $group->get('/subscriptions', [$platform, 'subscriptions']);
    $group->get('/payments', [$platform, 'payments']);
})->add(new PlatformAdminMiddleware())->add(new AuthMiddleware());

$app->run();
