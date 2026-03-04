<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\AuthControllerV2;
use App\Controllers\SantriBerkasControllerV2;
use App\Controllers\ProfilFotoController;
use App\Controllers\UserAktivitasController;
use App\Controllers\PrintController;

return function (\Slim\App $app): void {
    $app->post('/api/v2/auth/login', [AuthControllerV2::class, 'login']);
    $app->post('/api/v2/auth/daftar-check', [AuthControllerV2::class, 'daftarCheck']);
    $app->post('/api/v2/auth/daftar-konfirmasi', [AuthControllerV2::class, 'daftarKonfirmasi']);
    $app->post('/api/v2/auth/lupa-password-request', [AuthControllerV2::class, 'lupaPasswordRequest']);
    $app->get('/api/v2/auth/setup-token', [AuthControllerV2::class, 'getSetupToken']);
    $app->post('/api/v2/auth/setup-akun', [AuthControllerV2::class, 'postSetupAkun']);
    $app->post('/api/v2/auth/logout', [AuthControllerV2::class, 'logout'])->add(new AuthMiddleware());

    $app->group('/api/v2/santri-berkas', function ($group) {
        $group->post('/upload', [SantriBerkasControllerV2::class, 'uploadBerkas']);
        $group->get('/list', [SantriBerkasControllerV2::class, 'getBerkasList']);
        $group->post('/delete', [SantriBerkasControllerV2::class, 'deleteBerkas']);
        $group->get('/download', [SantriBerkasControllerV2::class, 'downloadBerkas']);
        $group->post('/update', [SantriBerkasControllerV2::class, 'updateBerkas']);
        $group->post('/link', [SantriBerkasControllerV2::class, 'linkBerkas']);
        $group->post('/mark-tidak-ada', [SantriBerkasControllerV2::class, 'markTidakAda']);
        $group->post('/unmark-tidak-ada', [SantriBerkasControllerV2::class, 'unmarkTidakAda']);
    })->add(new RoleMiddleware(['admin_psb', 'petugas_psb', 'super_admin', 'santri']))->add(new AuthMiddleware());

    $app->get('/api/v2/auth/sessions', [AuthControllerV2::class, 'getSessions'])->add(new AuthMiddleware());
    $app->delete('/api/v2/auth/sessions/{id}', [AuthControllerV2::class, 'revokeSession'])->add(new AuthMiddleware());
    $app->post('/api/v2/auth/logout-all', [AuthControllerV2::class, 'logoutAll'])->add(new AuthMiddleware());
    $app->get('/api/v2/auth/no-wa-mask', [AuthControllerV2::class, 'getNoWaMask'])->add(new AuthMiddleware());
    $app->post('/api/v2/auth/send-otp-ganti-wa', [AuthControllerV2::class, 'sendOtpGantiWa'])->add(new AuthMiddleware());
    $app->post('/api/v2/auth/verify-otp-ganti-wa', [AuthControllerV2::class, 'verifyOtpGantiWa'])->add(new AuthMiddleware());
    $app->post('/api/v2/auth/request-ubah-password', [AuthControllerV2::class, 'requestUbahPassword'])->add(new AuthMiddleware());
    $app->get('/api/v2/auth/ubah-password-token', [AuthControllerV2::class, 'getUbahPasswordToken']);
    $app->post('/api/v2/auth/ubah-password', [AuthControllerV2::class, 'postUbahPassword']);
    $app->post('/api/v2/auth/ubah-username-langsung', [AuthControllerV2::class, 'ubahUsernameLangsung'])->add(new AuthMiddleware());
    $app->post('/api/v2/auth/request-ubah-username', [AuthControllerV2::class, 'requestUbahUsername'])->add(new AuthMiddleware());
    $app->get('/api/v2/auth/ubah-username-token', [AuthControllerV2::class, 'getUbahUsernameToken']);
    $app->post('/api/v2/auth/ubah-username', [AuthControllerV2::class, 'postUbahUsername']);
    $app->get('/api/v2/profil/foto', [ProfilFotoController::class, 'serve'])->add(new AuthMiddleware());
    $app->post('/api/v2/profil/foto', [ProfilFotoController::class, 'upload'])->add(new AuthMiddleware());
    $app->delete('/api/v2/profil/foto', [ProfilFotoController::class, 'delete'])->add(new AuthMiddleware());
    $app->get('/api/v2/profil/aktivitas', [UserAktivitasController::class, 'getMyList'])->add(new AuthMiddleware());
    $app->get('/api/print', [PrintController::class, 'getPrintData']);
};
