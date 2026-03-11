<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\LembagaController;
use App\Controllers\AlamatController;
use App\Controllers\PengurusController;
use App\Controllers\RombelController;
use App\Controllers\SantriController;
use App\Controllers\SantriLulusanController;
use App\Controllers\WaliKelasController;

return function (\Slim\App $app): void {
    // GET lembaga: super_admin + admin_uwaba (untuk dropdown pengeluaran/rencana semua lembaga)
    $app->group('/api/lembaga', function ($group) {
        $group->get('', [LembagaController::class, 'getAllLembaga']);
        $group->get('/{id}', [LembagaController::class, 'getLembagaById']);
    })->add(new RoleMiddleware(['super_admin', 'admin_uwaba']))->add(new AuthMiddleware());

    $app->group('/api/lembaga', function ($group) {
        $group->post('', [LembagaController::class, 'createLembaga']);
        $group->put('/{id}', [LembagaController::class, 'updateLembaga']);
        $group->delete('/{id}', [LembagaController::class, 'deleteLembaga']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Santri by kelas (dipakai oleh page Rombel: daftar santri per rombel) — super_admin only
    $app->get('/api/santri/by-kelas', [SantriController::class, 'getSantriByKelas'])
        ->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());
    $app->get('/api/santri/riwayat-rombel', [SantriController::class, 'getRiwayatRombel'])
        ->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());
    $app->get('/api/santri/riwayat-kamar', [SantriController::class, 'getRiwayatKamar'])
        ->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Lulusan (santri___lulusan) — super_admin only
    $app->get('/api/santri-lulusan', [SantriLulusanController::class, 'getAll'])
        ->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());
    $app->post('/api/santri-lulusan', [SantriLulusanController::class, 'create'])
        ->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Rombel (lembaga___rombel) — super_admin only
    $app->group('/api/rombel', function ($group) {
        $group->get('', [RombelController::class, 'getAll']);
        $group->get('/{id}', [RombelController::class, 'getById']);
        $group->post('', [RombelController::class, 'create']);
        $group->put('/{id}', [RombelController::class, 'update']);
        $group->patch('/{id}/status', [RombelController::class, 'setStatus']);
        $group->delete('/{id}', [RombelController::class, 'delete']);
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

    // GET pengurus: admin_ugt, super_admin, admin_uwaba (list + no HP untuk notifikasi)
    $app->group('/api/pengurus', function ($group) {
        $group->get('', [PengurusController::class, 'getList']);
        $group->get('/{id}', [PengurusController::class, 'getById']);
    })->add(new RoleMiddleware(['admin_ugt', 'super_admin', 'admin_uwaba']))->add(new AuthMiddleware());
};
