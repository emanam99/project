<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\KitabController;

return function (\Slim\App $app): void {
    $app->group('/api/kitab', function ($group) {
        $group->get('', [KitabController::class, 'getList']);
        $group->get('/fan-options', [KitabController::class, 'getFanOptions']);
        $group->get('/{id}', [KitabController::class, 'getById']);
        $group->post('', [KitabController::class, 'create']);
        $group->put('/{id}', [KitabController::class, 'update']);
        $group->delete('/{id}', [KitabController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::kitabCrudApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
};
