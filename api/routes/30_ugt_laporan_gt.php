<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
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
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ugtMenus(), ['admin_ugt', 'koordinator_ugt', 'super_admin']))->add(new AuthMiddleware());
};
