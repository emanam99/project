<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\IjinController;
use App\Controllers\BoyongController;

return function (\Slim\App $app): void {
    $app->group('/api/ijin', function ($group) {
        $group->get('', [IjinController::class, 'getIjin']);
        $group->get('/dashboard', [IjinController::class, 'getDashboard']);
        $group->get('/kamar-options', [IjinController::class, 'getKamarOptions']);
        $group->get('/rombel-options', [IjinController::class, 'getRombelOptions']);
        $group->post('/{id}/kembali', [IjinController::class, 'markKembali']);
        $group->post('', [IjinController::class, 'createIjin']);
        $group->put('/{id}', [IjinController::class, 'updateIjin']);
        $group->delete('/{id}', [IjinController::class, 'deleteIjin']);
    })->add(new RoleMiddleware(['admin_ijin', 'petugas_ijin', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/boyong', function ($group) {
        $group->get('', [BoyongController::class, 'getBoyong']);
        $group->post('', [BoyongController::class, 'createBoyong']);
        $group->put('/{id}', [BoyongController::class, 'updateBoyong']);
        $group->delete('/{id}', [BoyongController::class, 'deleteBoyong']);
    })->add(new RoleMiddleware(['admin_ijin', 'super_admin']))->add(new AuthMiddleware());
};
