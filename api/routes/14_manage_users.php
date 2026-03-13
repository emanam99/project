<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\ManageUsersController;

return function (\Slim\App $app): void {
    $app->group('/api/v2/manage-users', function ($group) {
        $group->get('', [ManageUsersController::class, 'getAllUsersV2']);
        $group->get('/santri-options', [ManageUsersController::class, 'getSantriOptions']);
        $group->get('/{id}/sessions', [ManageUsersController::class, 'getUserSessions']);
        $group->delete('/{id}/sessions/{sessionId}', [ManageUsersController::class, 'revokeUserSession']);
        $group->put('/{id}/mybeddian-access', [ManageUsersController::class, 'setMybeddianAccess']);
        $group->get('/toko-options', [ManageUsersController::class, 'getTokoOptions']);
        $group->get('/{id}/toko', [ManageUsersController::class, 'getTokoForUser']);
        $group->post('/{id}/toko', [ManageUsersController::class, 'addTokoToUser']);
        $group->delete('/{id}/toko/{pedagangId}', [ManageUsersController::class, 'removeTokoFromUser']);
        $group->put('/{id}', [ManageUsersController::class, 'updateUserProfileV2']);
        $group->delete('/{id}', [ManageUsersController::class, 'deleteUserV2']);
        $group->get('/{id}', [ManageUsersController::class, 'getUserByIdV2']);
    })->add(new RoleMiddleware(['super_admin', 'admin_cashless']))->add(new AuthMiddleware());

    $app->group('/api/manage-users', function ($group) {
        $group->get('/roles/list', [ManageUsersController::class, 'getRolesList']);
        $group->post('/roles', [ManageUsersController::class, 'createRole']);
        $group->put('/roles/{id}', [ManageUsersController::class, 'updateRole']);
        $group->post('/{id}/roles', [ManageUsersController::class, 'addUserRole']);
        $group->delete('/{id}/roles/{pengurusRoleId}', [ManageUsersController::class, 'removeUserRole']);
        $group->post('/{id}/jabatan', [ManageUsersController::class, 'addUserJabatan']);
        $group->put('/{id}/jabatan/{pengurusJabatanId}', [ManageUsersController::class, 'updateUserJabatanStatus']);
        $group->delete('/{id}/jabatan/{pengurusJabatanId}', [ManageUsersController::class, 'removeUserJabatan']);
        $group->get('/{id}', [ManageUsersController::class, 'getUserById']);
        $group->get('', [ManageUsersController::class, 'getAllUsers']);
        $group->post('', [ManageUsersController::class, 'createUser']);
        $group->put('/{id}', [ManageUsersController::class, 'updateUser']);
        $group->delete('/{id}', [ManageUsersController::class, 'deleteUser']);
        $group->post('/{id}/send-reset-password-link', [ManageUsersController::class, 'sendResetPasswordLink']);
    })->add(new RoleMiddleware(['super_admin', 'admin_ugt']))->add(new AuthMiddleware());
};
