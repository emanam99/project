<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\PengaturanController;

return function (\Slim\App $app): void {
    $app->group('/api/pengaturan', function ($group) {
        $group->post('', [PengaturanController::class, 'create']);
        $group->put('/{id}', [PengaturanController::class, 'update']);
        $group->put('/key/{key}', [PengaturanController::class, 'updateByKey']);
        $group->delete('/{id}', [PengaturanController::class, 'delete']);
        $group->post('/upload-image', [PengaturanController::class, 'uploadImage']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), ['super_admin']))->add(new AuthMiddleware());
};
