<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\UploadsManagerController;
use App\Controllers\SantriJuaraController;

return function (\Slim\App $app): void {
    $app->group('/api/uploads-manager', function ($group) {
        $group->get('/list', [UploadsManagerController::class, 'list']);
        $group->get('/serve', [UploadsManagerController::class, 'serve']);
        $group->post('/delete', [UploadsManagerController::class, 'delete']);
        $group->get('/check-legacy-santri', [UploadsManagerController::class, 'checkLegacySantri']);
        $group->post('/migrate-santri', [UploadsManagerController::class, 'migrateSantriFromLegacy']);
        $group->get('/check-legacy-rencana', [UploadsManagerController::class, 'checkLegacyRencanaPengeluaran']);
        $group->post('/migrate-rencana', [UploadsManagerController::class, 'migrateRencanaPengeluaranFromLegacy']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    $app->group('/api/santri-juara', function ($group) {
        $group->get('', [SantriJuaraController::class, 'getAll']);
        $group->get('/{id}', [SantriJuaraController::class, 'getById']);
        $group->post('', [SantriJuaraController::class, 'create']);
        $group->put('/{id}', [SantriJuaraController::class, 'update']);
        $group->delete('/{id}', [SantriJuaraController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());
};
