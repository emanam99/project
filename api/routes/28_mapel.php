<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\LembagaKitabController;

return function (\Slim\App $app): void {
    $app->group('/api/mapel', function ($group) {
        $group->get('', [LembagaKitabController::class, 'getAll']);
        $group->get('/{id}', [LembagaKitabController::class, 'getById']);
        $group->post('', [LembagaKitabController::class, 'create']);
        $group->put('/{id}', [LembagaKitabController::class, 'update']);
        $group->delete('/{id}', [LembagaKitabController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
};
