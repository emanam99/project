<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\KurikulumJadwalController;

return function (\Slim\App $app): void {
    $app->group('/api/kurikulum-jadwal', function ($group) {
        $group->get('', [KurikulumJadwalController::class, 'getAll']);
        $group->get('/{id}', [KurikulumJadwalController::class, 'getById']);
        $group->post('', [KurikulumJadwalController::class, 'create']);
        $group->put('/{id}', [KurikulumJadwalController::class, 'update']);
        $group->delete('/{id}', [KurikulumJadwalController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::kurikulumJadwalCrudApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
};
