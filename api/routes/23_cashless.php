<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\CashlessController;

return function (\Slim\App $app): void {
    $app->group('/api/v2/cashless', function ($group) {
        $group->get('/toko', [CashlessController::class, 'getTokoList']);
        $group->post('/toko', [CashlessController::class, 'createToko']);
        $group->get('/serve-foto', [CashlessController::class, 'serveFoto']);
        $group->post('/upload-foto', [CashlessController::class, 'uploadFoto']);
        $group->put('/toko/{id}', [CashlessController::class, 'updateToko']);
        $group->get('/accounts', [CashlessController::class, 'getAccountsList']);
        $group->post('/accounts', [CashlessController::class, 'createAccount']);
        $group->get('/accounts/{id}/card', [CashlessController::class, 'getAccountCard']);
        $group->patch('/accounts/{id}', [CashlessController::class, 'updateAccount']);
        $group->get('/config', [CashlessController::class, 'getConfig']);
        $group->put('/config', [CashlessController::class, 'setConfig']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::cashlessAdminSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::CASHLESS_ADMIN_SELECTORS)))->add(new AuthMiddleware());
};
