<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\UgtLaporanGtController;

return function (\Slim\App $app): void {
    $app->group('/api/ugt/laporan-gt', function ($group) {
        $group->get('/santri-options', [UgtLaporanGtController::class, 'getSantriOptions']);
        $group->get('', [UgtLaporanGtController::class, 'getAll']);
        $group->get('/{id}', [UgtLaporanGtController::class, 'getById']);
        $group->post('', [UgtLaporanGtController::class, 'create']);
        $group->put('/{id}', [UgtLaporanGtController::class, 'update']);
        $group->delete('/{id}', [UgtLaporanGtController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ugtMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::UGT_MENUS)))->add(new AuthMiddleware());
};
