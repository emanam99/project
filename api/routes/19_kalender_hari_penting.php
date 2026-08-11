<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\KalenderController;
use App\Controllers\HariPentingController;

return function (\Slim\App $app): void {
    /** Jadwal hari penting pribadi (target users.id pembuat saja) — semua user login, tanpa menu admin kalender */
    $app->post('/api/hari-penting/personal-self', [HariPentingController::class, 'postPersonalSelf'])
        ->add(new AuthMiddleware());

    $app->group('/api/kalender', function ($group) {
        $group->post('', [KalenderController::class, 'postBulk']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::kalenderPengaturanBulanSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::KALENDER_PENGATURAN_BULAN_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/hari-penting', function ($group) {
        $group->get('/user-picker', [HariPentingController::class, 'getUserPicker']);
        $group->get('/lembaga-options', [HariPentingController::class, 'getLembagaOptions']);
        $group->post('', [HariPentingController::class, 'post']);
        $group->delete('', [HariPentingController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::kalenderPengaturanHariPentingSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::KALENDER_PENGATURAN_HARI_PENTING_SELECTORS)))->add(new AuthMiddleware());
};
