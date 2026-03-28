<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\UgtLaporanPjgtController;

return function (\Slim\App $app): void {
    $app->group('/api/ugt/laporan-pjgt', function ($group) {
        $group->get('/santri-options', [UgtLaporanPjgtController::class, 'getSantriOptions']);
        $group->get('', [UgtLaporanPjgtController::class, 'getAll']);
        $group->get('/{id}', [UgtLaporanPjgtController::class, 'getById']);
        $group->post('', [UgtLaporanPjgtController::class, 'create']);
        $group->put('/{id}', [UgtLaporanPjgtController::class, 'update']);
        $group->delete('/{id}', [UgtLaporanPjgtController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ugtMenus(), ['admin_ugt', 'koordinator_ugt', 'super_admin']))->add(new AuthMiddleware());
};
