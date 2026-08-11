<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\MahromController;
use App\Controllers\MahromBerkasControllerV2;

return function (\Slim\App $app): void {
    $app->group('/api/v2/mahrom', function ($group) {
        $group->get('', [MahromController::class, 'getList']);
        $group->get('/hubungan-options', [MahromController::class, 'getHubunganOptions']);
        $group->get('/check-nik', [MahromController::class, 'checkNik']);
        $group->get('/santri-options', [MahromController::class, 'getSantriOptions']);
        $group->get('/serve-foto', [MahromController::class, 'serveFoto']);
        $group->post('/upload-foto', [MahromController::class, 'uploadFoto']);
        $group->get('/santri/{santriId}', [MahromController::class, 'listBySantri']);
        $group->get('/{id}', [MahromController::class, 'getById']);
        $group->post('', [MahromController::class, 'create']);
        $group->post('/{id}/link-santri', [MahromController::class, 'linkSantri']);
        $group->put('/{id}', [MahromController::class, 'update']);
        $group->patch('/{id}/aktif', [MahromController::class, 'patchAktif']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::cashlessAdminSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::CASHLESS_ADMIN_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/v2/mahrom-berkas', function ($group) {
        $group->post('/upload', [MahromBerkasControllerV2::class, 'uploadBerkas']);
        $group->get('/list', [MahromBerkasControllerV2::class, 'getBerkasList']);
        $group->post('/delete', [MahromBerkasControllerV2::class, 'deleteBerkas']);
        $group->get('/download', [MahromBerkasControllerV2::class, 'downloadBerkas']);
        $group->post('/update', [MahromBerkasControllerV2::class, 'updateBerkas']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::cashlessAdminSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::CASHLESS_ADMIN_SELECTORS)))->add(new AuthMiddleware());
};
