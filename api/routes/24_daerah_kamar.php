<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\DaerahController;
use App\Controllers\DaerahPengurusController;
use App\Controllers\DaerahKamarController;
use App\Controllers\DaerahKetuaKamarController;
use App\Controllers\SantriTarbiyahDomisiliController;
use App\Controllers\BoyongController;

return function (\Slim\App $app): void {
    // Daerah (tabel daerah) — super_admin only
    $app->group('/api/daerah', function ($group) {
        $group->get('', [DaerahController::class, 'getAll']);
        $group->get('/{id}', [DaerahController::class, 'getById']);
        $group->post('', [DaerahController::class, 'create']);
        $group->put('/{id}', [DaerahController::class, 'update']);
        $group->patch('/{id}/status', [DaerahController::class, 'setStatus']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Daerah Pengurus (daerah___pengurus) — super_admin only
    $app->group('/api/daerah-pengurus', function ($group) {
        $group->get('', [DaerahPengurusController::class, 'getAll']);
        $group->get('/{id}', [DaerahPengurusController::class, 'getById']);
        $group->post('', [DaerahPengurusController::class, 'create']);
        $group->put('/{id}', [DaerahPengurusController::class, 'update']);
        $group->patch('/{id}/status', [DaerahPengurusController::class, 'setStatus']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Daerah Kamar (daerah___kamar) — super_admin only
    $app->group('/api/daerah-kamar', function ($group) {
        $group->get('', [DaerahKamarController::class, 'getAll']);
        $group->get('/{id}', [DaerahKamarController::class, 'getById']);
        $group->post('', [DaerahKamarController::class, 'create']);
        $group->put('/{id}', [DaerahKamarController::class, 'update']);
        $group->patch('/{id}/status', [DaerahKamarController::class, 'setStatus']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Daerah Ketua Kamar (daerah___ketua_kamar) — super_admin only
    $app->group('/api/daerah-ketua-kamar', function ($group) {
        $group->get('', [DaerahKetuaKamarController::class, 'getAll']);
        $group->get('/{id}', [DaerahKetuaKamarController::class, 'getById']);
        $group->post('', [DaerahKetuaKamarController::class, 'create']);
        $group->put('/{id}', [DaerahKetuaKamarController::class, 'update']);
        $group->patch('/{id}/status', [DaerahKetuaKamarController::class, 'setStatus']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Santri dari konteks Domisili (catatan, pindah kamar, boyong cepat) — tarbiyah super
    $app->group('/api/tarbiyah/santri', function ($group) {
        $group->get('/catatan', [SantriTarbiyahDomisiliController::class, 'listCatatan']);
        $group->post('/catatan', [SantriTarbiyahDomisiliController::class, 'createCatatan']);
        $group->post('/pindah-kamar', [SantriTarbiyahDomisiliController::class, 'pindahKamar']);
        $group->post('/boyong-domisili', [BoyongController::class, 'createBoyongFromDomisili']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSantriDomisiliApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
};
