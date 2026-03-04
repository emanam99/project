<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\DashboardController;
use App\Controllers\LaporanController;

return function (\Slim\App $app): void {
    $app->group('/api/dashboard', function ($group) {
        $group->get('', [DashboardController::class, 'getDashboard']);
        $group->get('/kelompok-detail', [DashboardController::class, 'getKelompokDetail']);
        $group->post('/update-kelompok', [DashboardController::class, 'updateKelompokKeterangan']);
        $group->get('/data-santri', [DashboardController::class, 'getDataSantri']);
        $group->get('/data-khusus', [DashboardController::class, 'getDataKhusus']);
        $group->get('/data-tunggakan', [DashboardController::class, 'getDataTunggakan']);
    })->add(new RoleMiddleware(['admin_uwaba', 'petugas_uwaba', 'admin_ijin', 'petugas_ijin', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/laporan', function ($group) {
        $group->get('', [LaporanController::class, 'getLaporan']);
    })->add(new RoleMiddleware(['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']))->add(new AuthMiddleware());
};
