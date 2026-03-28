<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\KalenderController;
use App\Controllers\HariPentingController;

return function (\Slim\App $app): void {
    $app->group('/api/kalender', function ($group) {
        $group->post('', [KalenderController::class, 'postBulk']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::kalenderGoogleStaffSelectors(), ['admin_kalender', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/hari-penting', function ($group) {
        $group->post('', [HariPentingController::class, 'post']);
        $group->delete('', [HariPentingController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::kalenderGoogleStaffSelectors(), ['admin_kalender', 'super_admin']))->add(new AuthMiddleware());
};
