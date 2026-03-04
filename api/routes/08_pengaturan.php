<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\PengaturanController;

return function (\Slim\App $app): void {
    $app->group('/api/pengaturan', function ($group) {
        $group->post('', [PengaturanController::class, 'create']);
        $group->put('/{id}', [PengaturanController::class, 'update']);
        $group->put('/key/{key}', [PengaturanController::class, 'updateByKey']);
        $group->delete('/{id}', [PengaturanController::class, 'delete']);
        $group->post('/upload-image', [PengaturanController::class, 'uploadImage']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());
};
