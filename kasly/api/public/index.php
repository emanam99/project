<?php

use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;
use Dotenv\Dotenv;
use App\Controllers\AuthController;
use App\Controllers\BelanjaController;
use App\Controllers\BelanjaFileController;
use App\Controllers\DashboardController;
use App\Controllers\KategoriController;
use App\Controllers\RekeningController;
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
$belanja = new BelanjaController();
$belanjaFile = new BelanjaFileController();
$dashboard = new DashboardController();
$users = new UserController();
$kategori = new KategoriController();
$rekening = new RekeningController();

$app->get('/health', function ($request, $response) {
    $response->getBody()->write(json_encode([
        'success' => true,
        'app' => 'kasly',
        'ok' => true,
    ], JSON_UNESCAPED_UNICODE));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->get('/auth/google', [$auth, 'googleStart']);
$app->get('/auth/google/callback', [$auth, 'googleCallback']);

$app->group('', function (RouteCollectorProxy $group) use ($auth, $belanja, $belanjaFile, $dashboard, $users, $kategori, $rekening) {
    $group->get('/auth/me', [$auth, 'me']);
    $group->post('/auth/logout', [$auth, 'logout']);

    $group->get('/dashboard/summary', [$dashboard, 'summary']);
    $group->get('/kategori', [$kategori, 'index']);

    $group->get('/rekening', [$rekening, 'index']);
    $group->post('/rekening', [$rekening, 'create']);
    $group->get('/rekening/transfer', [$rekening, 'listTransfer']);
    $group->post('/rekening/transfer', [$rekening, 'createTransfer']);
    $group->put('/rekening/{id}', [$rekening, 'update']);
    $group->delete('/rekening/{id}', [$rekening, 'delete']);

    $group->get('/belanja', [$belanja, 'index']);
    $group->get('/belanja/item-options', [$belanja, 'itemOptions']);
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

    $group->get('/users', [$users, 'index']);
    $group->post('/users', [$users, 'create']);
    $group->put('/users/{id}/role', [$users, 'updateRole']);
    $group->delete('/users/{id}', [$users, 'delete']);
})->add(new AuthMiddleware());

$app->run();
