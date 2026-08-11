<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Controllers\UgtKompasController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

return function (\Slim\App $app): void {
    $app->group('/api/ugt/kompas', function ($group) {
        $group->get('/dashboard', [UgtKompasController::class, 'dashboard']);
        $group->get('/lomba', [UgtKompasController::class, 'listLomba']);
        $group->get('/lomba/{id}', [UgtKompasController::class, 'getLomba']);
        $group->post('/lomba', [UgtKompasController::class, 'createLomba']);
        $group->put('/lomba/{id}', [UgtKompasController::class, 'updateLomba']);
        $group->delete('/lomba/{id}', [UgtKompasController::class, 'deleteLomba']);

        $group->get('/aturan', [UgtKompasController::class, 'getAturan']);
        $group->put('/aturan', [UgtKompasController::class, 'saveAturan']);

        $group->get('/daftar', [UgtKompasController::class, 'listDaftar']);
        $group->get('/daftar-export', [UgtKompasController::class, 'exportDaftar']);
        $group->get('/daftar/{id}', [UgtKompasController::class, 'getDaftar']);
        $group->post('/daftar', [UgtKompasController::class, 'createDaftar']);
        $group->put('/daftar/{id}', [UgtKompasController::class, 'updateDaftar']);
        $group->delete('/daftar/{id}', [UgtKompasController::class, 'deleteDaftar']);

        $group->get('/check-nik', [UgtKompasController::class, 'checkNik']);
        $group->post('/upload', [UgtKompasController::class, 'upload']);
        $group->get('/serve-file', [UgtKompasController::class, 'serve']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ugtMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::UGT_MENUS)))->add(new AuthMiddleware());
};
