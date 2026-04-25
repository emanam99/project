<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\WiridNailulMurodController;

return function (\Slim\App $app): void {
    // Reader publik (tanpa login): aplikasi mandiri Nailul Murod hanya butuh baca data.
    $app->group('/api/wirid-nailul-murod', function ($group) {
        $group->get('/bab-options', [WiridNailulMurodController::class, 'getBabOptions']);
        $group->get('', [WiridNailulMurodController::class, 'getList']);
        $group->get('/{id}', [WiridNailulMurodController::class, 'getById']);
    });

    // Kelola data tetap khusus user terautentikasi dengan akses fitur.
    $app->group('/api/wirid-nailul-murod', function ($group) {
        $group->post('', [WiridNailulMurodController::class, 'create']);
        $group->put('/{id}', [WiridNailulMurodController::class, 'update']);
        $group->delete('/{id}', [WiridNailulMurodController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(
        EbeddienFiturAccess::wiridNailulMurodApiSelectors(),
        LegacyRouteRoles::forKey(LegacyRouteRoleKeys::WIRID_NAILUL_MUROD_SELECTORS)
    ))->add(new AuthMiddleware());
};
