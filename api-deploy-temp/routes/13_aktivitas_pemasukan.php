<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\AktivitasController;
use App\Controllers\PemasukanController;

return function (\Slim\App $app): void {
    $app->group('/api/aktivitas', function ($group) {
        $group->get('', [AktivitasController::class, 'getAktivitasList']);
        $group->get('/months', [AktivitasController::class, 'getAvailableMonths']);
        $group->get('/hijriyah', [AktivitasController::class, 'getAktivitasListHijriyah']);
        $group->get('/hijriyah/months', [AktivitasController::class, 'getAvailableHijriyahMonths']);
    })->add(new RoleMiddleware(['admin_uwaba', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/pemasukan', function ($group) {
        $group->post('', [PemasukanController::class, 'createPemasukan']);
        $group->get('', [PemasukanController::class, 'getPemasukanList']);
        $group->get('/uwaba/pendapatan', [PemasukanController::class, 'getPendapatanUwaba']);
        $group->get('/tunggakan/pendapatan', [PemasukanController::class, 'getPendapatanTunggakan']);
        $group->get('/khusus/pendapatan', [PemasukanController::class, 'getPendapatanKhusus']);
        $group->get('/pendaftaran/pendapatan', [PemasukanController::class, 'getPendapatanPendaftaran']);
        $group->get('/{id}', [PemasukanController::class, 'getPemasukanDetail']);
        $group->put('/{id}', [PemasukanController::class, 'updatePemasukan']);
        $group->delete('/{id}', [PemasukanController::class, 'deletePemasukan']);
    })->add(new RoleMiddleware(['admin_uwaba', 'super_admin']))->add(new AuthMiddleware());
};
