<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\LembagaController;
use App\Controllers\LembagaLogoController;
use App\Controllers\AlamatController;
use App\Controllers\PengurusController;
use App\Controllers\RombelController;
use App\Controllers\SantriController;
use App\Controllers\SantriLulusanController;
use App\Controllers\WaliKelasController;
use App\Controllers\AbsenPengurusController;

return function (\Slim\App $app): void {
    // GET lembaga: dropdown pengeluaran/rencana + master lembaga (admin_lembaga = scope token)
    $app->group('/api/lembaga', function ($group) {
        $group->get('/serve-logo', [LembagaLogoController::class, 'serve']);
        $group->get('', [LembagaController::class, 'getAllLembaga']);
        $group->get('/{id}', [LembagaController::class, 'getLembagaById']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::lembagaGetSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::LEMBAGA_GET_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/lembaga', function ($group) {
        $group->post('', [LembagaController::class, 'createLembaga']);
        $group->post('/{id}/logo', [LembagaLogoController::class, 'upload']);
        $group->delete('/{id}/logo', [LembagaLogoController::class, 'deleteLogo']);
        $group->put('/{id}', [LembagaController::class, 'updateLembaga']);
        $group->delete('/{id}', [LembagaController::class, 'deleteLembaga']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::lembagaWriteSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::LEMBAGA_WRITE_SELECTORS)))->add(new AuthMiddleware());

    // Santri by kelas (dipakai oleh page Rombel: daftar santri per rombel) — super_admin + tarbiyah
    $app->get('/api/santri/by-kelas', [SantriController::class, 'getSantriByKelas'])
        ->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
    $app->get('/api/santri/riwayat-rombel', [SantriController::class, 'getRiwayatRombel'])
        ->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
    $app->get('/api/santri/riwayat-kamar', [SantriController::class, 'getRiwayatKamar'])
        ->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Lulusan (santri___lulusan) — super_admin + tarbiyah
    $app->get('/api/santri-lulusan', [SantriLulusanController::class, 'getAll'])
        ->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
    $app->post('/api/santri-lulusan', [SantriLulusanController::class, 'create'])
        ->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Absensi pengurus (absen___pengurus) — super_admin + tarbiyah
    $app->get('/api/absen-pengurus/rekap', [AbsenPengurusController::class, 'getRekap'])
        ->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());
    $app->get('/api/absen-pengurus', [AbsenPengurusController::class, 'getList'])
        ->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Rombel (lembaga___rombel) — super_admin + tarbiyah
    $app->group('/api/rombel', function ($group) {
        $group->get('', [RombelController::class, 'getAll']);
        $group->get('/{id}', [RombelController::class, 'getById']);
        $group->post('', [RombelController::class, 'create']);
        $group->put('/{id}', [RombelController::class, 'update']);
        $group->patch('/{id}/status', [RombelController::class, 'setStatus']);
        $group->delete('/{id}', [RombelController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Wali kelas (lembaga___wali_kelas) — super_admin + tarbiyah, tidak ada delete (riwayat)
    $app->group('/api/wali-kelas', function ($group) {
        $group->get('', [WaliKelasController::class, 'getAll']);
        $group->get('/{id}', [WaliKelasController::class, 'getById']);
        $group->post('', [WaliKelasController::class, 'create']);
        $group->put('/{id}', [WaliKelasController::class, 'update']);
        $group->patch('/{id}/status', [WaliKelasController::class, 'setStatus']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::tarbiyahSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/alamat', function ($group) {
        $group->get('', [AlamatController::class, 'getList']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::alamatListSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::ALAMAT_LIST_SELECTORS)))->add(new AuthMiddleware());

    // GET pengurus: admin_ugt, super_admin, admin_uwaba (list + no HP untuk notifikasi)
    $app->group('/api/pengurus', function ($group) {
        $group->get('', [PengurusController::class, 'getList']);
        $group->get('/{id}', [PengurusController::class, 'getById']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::pengurusListSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::PENGURUS_LIST_SELECTORS)))->add(new AuthMiddleware());
};
