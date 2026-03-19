<?php

declare(strict_types=1);

/**
 * Route khusus untuk aplikasi Mybeddian.
 * Menerima request dari frontend mybeddian; user yang login bisa role santri (id tercantum di tabel santri).
 * Prefix: /api/mybeddian
 */
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\AuthControllerV2;
use App\Controllers\MybeddianProfilController;
use App\Controllers\MybeddianBarangController;

return function (\Slim\App $app): void {
    $group = $app->group('/api/mybeddian', function ($group) {
        // Auth: login, verify (tanpa middleware agar token santri bisa divalidasi), logout
        $group->post('/v2/auth/login', [AuthControllerV2::class, 'login']);
        $group->get('/v2/auth/verify', [AuthControllerV2::class, 'verifyMybeddian']);
        $group->post('/v2/auth/logout', [AuthControllerV2::class, 'logout'])->add(new AuthMiddleware());

        // Daftar akun santri: NIS, NIK, No. HP
        $group->post('/v2/auth/daftar-check', [AuthControllerV2::class, 'daftarCheckSantri']);
        $group->post('/v2/auth/daftar-konfirmasi', [AuthControllerV2::class, 'daftarKonfirmasiSantri']);
        $group->get('/v2/auth/setup-token', [AuthControllerV2::class, 'getSetupTokenSantri']);
        $group->post('/v2/auth/setup-akun', [AuthControllerV2::class, 'postSetupAkunSantri']);

        // Profil santri atau toko (beranda & halaman profil Mybeddian)
        $group->get('/v2/profil', [MybeddianProfilController::class, 'getProfil'])
            ->add(new RoleMiddleware(['santri', 'toko']))->add(new AuthMiddleware());
        $group->get('/v2/profil/foto', [MybeddianProfilController::class, 'serveFoto'])
            ->add(new RoleMiddleware(['santri', 'toko']))->add(new AuthMiddleware());
        $group->post('/v2/profil/foto', [MybeddianProfilController::class, 'uploadFoto'])
            ->add(new RoleMiddleware(['santri', 'toko']))->add(new AuthMiddleware());
        $group->delete('/v2/profil/foto', [MybeddianProfilController::class, 'deleteFoto'])
            ->add(new RoleMiddleware(['santri', 'toko']))->add(new AuthMiddleware());

        // Biodata santri (struktur sama dengan public santri di Uwaba)
        $group->get('/v2/biodata', [MybeddianProfilController::class, 'getBiodata'])
            ->add(new RoleMiddleware(['santri']))->add(new AuthMiddleware());

        // Data barang toko (hanya role toko)
        $group->get('/v2/barang', [MybeddianBarangController::class, 'list'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->post('/v2/barang', [MybeddianBarangController::class, 'create'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->put('/v2/barang/{id}', [MybeddianBarangController::class, 'update'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
        $group->delete('/v2/barang/{id}', [MybeddianBarangController::class, 'delete'])
            ->add(new RoleMiddleware(['toko']))->add(new AuthMiddleware());
    });

    // Opsional: header X-App-Source: mybeddian bisa dipakai untuk log/analytics
};
