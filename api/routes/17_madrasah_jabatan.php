<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\MadrasahController;
use App\Controllers\MadrasahFotoController;
use App\Controllers\JabatanController;

return function (\Slim\App $app): void {
    $app->group('/api/madrasah', function ($group) {
        $group->get('', [MadrasahController::class, 'getAll']);
        $group->get('/serve-foto', [MadrasahFotoController::class, 'serve']);
        $group->post('/upload-foto', [MadrasahFotoController::class, 'upload']);
        $group->post('/upload-logo', [MadrasahFotoController::class, 'uploadLogo']);
        $group->get('/{id}', [MadrasahController::class, 'getById']);
        $group->post('', [MadrasahController::class, 'create']);
        $group->put('/{id}', [MadrasahController::class, 'update']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ugtMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::UGT_MENUS)))->add(new AuthMiddleware());

    $app->group('/api/jabatan', function ($group) {
        $group->get('/list', [JabatanController::class, 'getJabatanList']);
        $group->get('/{id}', [JabatanController::class, 'getJabatanById']);
        $group->get('', [JabatanController::class, 'getAllJabatan']);
        $group->post('', [JabatanController::class, 'createJabatan']);
        $group->put('/{id}', [JabatanController::class, 'updateJabatan']);
        $group->delete('/{id}', [JabatanController::class, 'deleteJabatan']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::jabatanCrudApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
};
