<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\SantriBerkasController;

return function (\Slim\App $app): void {
    $app->group('/api/santri-berkas', function ($group) {
        $group->post('/upload', [SantriBerkasController::class, 'uploadBerkas']);
        $group->get('/list', [SantriBerkasController::class, 'getBerkasList']);
        $group->post('/delete', [SantriBerkasController::class, 'deleteBerkas']);
        $group->post('/update', [SantriBerkasController::class, 'updateBerkas']);
        $group->get('/download', [SantriBerkasController::class, 'downloadBerkas']);
        $group->post('/link', [SantriBerkasController::class, 'linkBerkas']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::psbTarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::PSB_TARBIYAH_SUPER_SELECTORS_SANTRI)))->add(new AuthMiddleware());
};
