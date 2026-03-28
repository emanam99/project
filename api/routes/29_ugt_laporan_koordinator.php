<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\UgtLaporanKoordinatorController;

return function (\Slim\App $app): void {
    $app->group('/api/ugt/laporan-koordinator', function ($group) {
        $group->get('/santri-options', [UgtLaporanKoordinatorController::class, 'getSantriOptions']);
        $group->post('/upload-foto', [UgtLaporanKoordinatorController::class, 'uploadFoto']);
        $group->get('', [UgtLaporanKoordinatorController::class, 'getAll']);
        $group->get('/{id}', [UgtLaporanKoordinatorController::class, 'getById']);
        $group->post('', [UgtLaporanKoordinatorController::class, 'create']);
        $group->put('/{id}', [UgtLaporanKoordinatorController::class, 'update']);
        $group->delete('/{id}', [UgtLaporanKoordinatorController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ugtMenus(), ['admin_ugt', 'koordinator_ugt', 'super_admin']))->add(new AuthMiddleware());
};
