<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\LembagaController;
use App\Controllers\AlamatController;
use App\Controllers\PengurusController;
use App\Controllers\RombelController;
use App\Controllers\SantriController;
use App\Controllers\WaliKelasController;

return function (\Slim\App $app): void {
    $app->group('/api/lembaga', function ($group) {
        $group->get('', [LembagaController::class, 'getAllLembaga']);
        $group->get('/{id}', [LembagaController::class, 'getLembagaById']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    $app->group('/api/lembaga', function ($group) {
        $group->post('', [LembagaController::class, 'createLembaga']);
        $group->put('/{id}', [LembagaController::class, 'updateLembaga']);
        $group->delete('/{id}', [LembagaController::class, 'deleteLembaga']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Kelas distink dan santri by kelas (untuk halaman Rombel Santri) — super_admin only
    $app->get('/api/santri/distinct-kelas', [SantriController::class, 'getDistinctKelas'])
        ->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());
    $app->get('/api/santri/by-kelas', [SantriController::class, 'getSantriByKelas'])
        ->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Rombel (lembaga___rombel) — super_admin only
    $app->group('/api/rombel', function ($group) {
        $group->get('', [RombelController::class, 'getAll']);
        $group->get('/{id}', [RombelController::class, 'getById']);
        $group->post('', [RombelController::class, 'create']);
        $group->put('/{id}', [RombelController::class, 'update']);
        $group->patch('/{id}/status', [RombelController::class, 'setStatus']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Wali kelas (lembaga___wali_kelas) — super_admin only, tidak ada delete (riwayat)
    $app->group('/api/wali-kelas', function ($group) {
        $group->get('', [WaliKelasController::class, 'getAll']);
        $group->get('/{id}', [WaliKelasController::class, 'getById']);
        $group->post('', [WaliKelasController::class, 'create']);
        $group->put('/{id}', [WaliKelasController::class, 'update']);
        $group->patch('/{id}/status', [WaliKelasController::class, 'setStatus']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    $app->group('/api/alamat', function ($group) {
        $group->get('', [AlamatController::class, 'getList']);
    })->add(new RoleMiddleware(['admin_ugt', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/pengurus', function ($group) {
        $group->get('', [PengurusController::class, 'getList']);
        $group->get('/{id}', [PengurusController::class, 'getById']);
    })->add(new RoleMiddleware(['admin_ugt', 'super_admin']))->add(new AuthMiddleware());
};
