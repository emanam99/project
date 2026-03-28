<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\UmrohJamaahController;
use App\Controllers\UmrohTabunganController;
use App\Controllers\UmrohPengeluaranController;

return function (\Slim\App $app): void {
    // Akses by role (sama dengan frontend): admin_uwaba, petugas_uwaba, admin_umroh, petugas_umroh, super_admin
    $app->group('/api/umroh', function ($group) {
        $group->get('/jamaah', [UmrohJamaahController::class, 'getAllJamaah']);
        $group->get('/jamaah/{id}', [UmrohJamaahController::class, 'getJamaahById']);
        $group->post('/jamaah', [UmrohJamaahController::class, 'createJamaah']);
        $group->put('/jamaah/{id}', [UmrohJamaahController::class, 'updateJamaah']);
        $group->delete('/jamaah/{id}', [UmrohJamaahController::class, 'deleteJamaah']);
        $group->get('/tabungan', [UmrohTabunganController::class, 'getAllTabungan']);
        $group->get('/tabungan/{id}', [UmrohTabunganController::class, 'getTabunganById']);
        $group->post('/tabungan', [UmrohTabunganController::class, 'createTabungan']);
        $group->put('/tabungan/{id}', [UmrohTabunganController::class, 'updateTabungan']);
        $group->delete('/tabungan/{id}', [UmrohTabunganController::class, 'deleteTabungan']);
        $group->get('/pengeluaran', [UmrohPengeluaranController::class, 'getAllPengeluaran']);
        $group->get('/pengeluaran/{id}', [UmrohPengeluaranController::class, 'getPengeluaranById']);
        $group->post('/pengeluaran', [UmrohPengeluaranController::class, 'createPengeluaran']);
        $group->put('/pengeluaran/{id}', [UmrohPengeluaranController::class, 'updatePengeluaran']);
        $group->post('/pengeluaran/{id}/approve', [UmrohPengeluaranController::class, 'approvePengeluaran']);
        $group->post('/pengeluaran/{id}/reject', [UmrohPengeluaranController::class, 'rejectPengeluaran']);
        $group->delete('/pengeluaran/{id}', [UmrohPengeluaranController::class, 'deletePengeluaran']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::umrohModuleSelectors(), ['admin_uwaba', 'petugas_uwaba', 'admin_umroh', 'petugas_umroh', 'super_admin']))->add(new AuthMiddleware());
};
