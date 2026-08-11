<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Controllers\LttqMualimController;
use App\Controllers\LttqTingkatanController;
use App\Controllers\SantriController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

return function (\Slim\App $app): void {
    $lttqMw = new EbeddienFiturMiddleware(
        EbeddienFiturAccess::lttqStaffApiSelectors(),
        LegacyRouteRoles::forKey(LegacyRouteRoleKeys::LTTQ_STAFF_SELECTORS)
    );

    $app->group('/api/lttq-tingkatan', function ($group) {
        $group->get('', [LttqTingkatanController::class, 'getAll']);
        $group->post('/lulus', [LttqTingkatanController::class, 'lulusBulk']);
        $group->get('/{id}', [LttqTingkatanController::class, 'getById']);
        $group->post('', [LttqTingkatanController::class, 'create']);
        $group->put('/{id}', [LttqTingkatanController::class, 'update']);
        $group->patch('/{id}/status', [LttqTingkatanController::class, 'setStatus']);
        $group->delete('/{id}', [LttqTingkatanController::class, 'delete']);
    })->add($lttqMw)->add(new AuthMiddleware());

    $app->group('/api/lttq-mualim', function ($group) {
        $group->get('', [LttqMualimController::class, 'getAll']);
        $group->get('/{id}', [LttqMualimController::class, 'getById']);
        $group->post('', [LttqMualimController::class, 'create']);
        $group->put('/{id}', [LttqMualimController::class, 'update']);
        $group->patch('/{id}/status', [LttqMualimController::class, 'setStatus']);
    })->add($lttqMw)->add(new AuthMiddleware());

    $app->get('/api/santri/by-lttq-tingkatan', [SantriController::class, 'getSantriByLttqTingkatan'])
        ->add($lttqMw)->add(new AuthMiddleware());
    $app->get('/api/santri/riwayat-lttq', [SantriController::class, 'getRiwayatLttq'])
        ->add($lttqMw)->add(new AuthMiddleware());
    $app->delete('/api/santri/riwayat-lttq/{id}', [SantriController::class, 'deleteRiwayatLttq'])
        ->add($lttqMw)->add(new AuthMiddleware());
};
