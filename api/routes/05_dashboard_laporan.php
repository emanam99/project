<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\DashboardController;
use App\Controllers\ManageWaBulkController;
use App\Controllers\LaporanController;

return function (\Slim\App $app): void {
    $app->group('/api/dashboard', function ($group) {
        $group->get('', [DashboardController::class, 'getDashboard']);
        $group->get('/kelompok-detail', [DashboardController::class, 'getKelompokDetail']);
        $group->post('/update-kelompok', [DashboardController::class, 'updateKelompokKeterangan']);
        $group->get('/data-santri', [DashboardController::class, 'getDataSantri']);
        $group->get('/data-khusus', [DashboardController::class, 'getDataKhusus']);
        $group->get('/data-tunggakan', [DashboardController::class, 'getDataTunggakan']);
        $group->get('/manage-data/revision', [DashboardController::class, 'getManageDataRevision']);
        $group->get('/manage-data/wa-bulk/active', [ManageWaBulkController::class, 'getActive']);
        $group->post('/manage-data/wa-bulk/start', [ManageWaBulkController::class, 'postStart']);
        $group->post('/manage-data/wa-bulk/cancel', [ManageWaBulkController::class, 'postCancel']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::dashboardLaporanIjinSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::DASHBOARD_LAPORAN_IJIN_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/laporan', function ($group) {
        $group->get('', [LaporanController::class, 'getLaporan']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::dashboardLaporanPsbSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::DASHBOARD_LAPORAN_PSB_SELECTORS)))->add(new AuthMiddleware());
};
