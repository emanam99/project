<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\SantriBerkasController;

return function (\Slim\App $app): void {
    $app->group('/api/santri-berkas', function ($group) {
        $group->post('/upload', [SantriBerkasController::class, 'uploadBerkas']);
        $group->get('/list', [SantriBerkasController::class, 'getBerkasList']);
        $group->post('/delete', [SantriBerkasController::class, 'deleteBerkas']);
        $group->post('/update', [SantriBerkasController::class, 'updateBerkas']);
        $group->get('/download', [SantriBerkasController::class, 'downloadBerkas']);
        $group->post('/link', [SantriBerkasController::class, 'linkBerkas']);
    })->add(new RoleMiddleware(['admin_psb', 'petugas_psb', 'super_admin', 'santri']))->add(new AuthMiddleware());
};
