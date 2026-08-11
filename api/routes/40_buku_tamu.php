<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\BukuTamuController;

return function (\Slim\App $app): void {
    $app->group('/api/v2/buku-tamu', function ($group) {
        $group->get('', [BukuTamuController::class, 'getList']);
        $group->post('/scan', [BukuTamuController::class, 'scan']);
        $group->patch('/{id}/santri', [BukuTamuController::class, 'patchSantri']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::cashlessAdminSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::CASHLESS_ADMIN_SELECTORS)))->add(new AuthMiddleware());
};
