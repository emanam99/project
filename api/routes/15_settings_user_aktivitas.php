<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\SettingsController;
use App\Controllers\UserAktivitasController;
use App\Controllers\TahunAjaranController;

return function (\Slim\App $app): void {
    $app->group('/api/settings', function ($group) {
        $group->get('/roles-config', [SettingsController::class, 'getRolesConfig']);
        $group->get('/features-config', [SettingsController::class, 'getFeaturesConfig']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Master Tahun Ajaran (hanya super_admin)
    $app->group('/api/tahun-ajaran', function ($group) {
        $group->get('', [TahunAjaranController::class, 'getAll']);
        $group->get('/{id}', [TahunAjaranController::class, 'getById']);
        $group->post('', [TahunAjaranController::class, 'create']);
        $group->put('/{id}', [TahunAjaranController::class, 'update']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    $app->group('/api/user-aktivitas', function ($group) {
        $group->get('', [UserAktivitasController::class, 'getList']);
        $group->post('/rollback', [UserAktivitasController::class, 'rollback']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());
};
