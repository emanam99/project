<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Controllers\UgtGuruTugasTugasanController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

return function (\Slim\App $app): void {
    $app->group('/api/ugt/guru-tugas-tugasan', function ($group) {
        $group->get('/santri-by-ta', [UgtGuruTugasTugasanController::class, 'listSantriByTahunAjaran']);
        $group->get('', [UgtGuruTugasTugasanController::class, 'listBySantri']);
        $group->post('', [UgtGuruTugasTugasanController::class, 'create']);
        $group->patch('/{id}', [UgtGuruTugasTugasanController::class, 'patch']);
        $group->delete('/{id}', [UgtGuruTugasTugasanController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ugtGuruTugasTugasanApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::UGT_MENUS)))->add(new AuthMiddleware());
};
