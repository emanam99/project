<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\UjianController;

return function (\Slim\App $app): void {
    $app->group('/api/ujian', function ($group) {
        $group->get('/form-data', [UjianController::class, 'getFormData']);
        $group->post('/grup', [UjianController::class, 'createGrup']);
        $group->get('/grup/{id}', [UjianController::class, 'getGrupById']);
        $group->put('/grup/{id}', [UjianController::class, 'updateGrup']);
        $group->delete('/grup/{id}', [UjianController::class, 'deleteGrup']);
        $group->get('', [UjianController::class, 'getAll']);
        $group->get('/{id}', [UjianController::class, 'getById']);
        $group->post('', [UjianController::class, 'create']);
        $group->put('/{id}', [UjianController::class, 'update']);
        $group->delete('/{id}', [UjianController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::ujianCrudApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
};
