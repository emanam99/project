<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\ManageUsersController;

return function (\Slim\App $app): void {
    $app->group('/api/v2/users', function ($group) {
        $group->get('/{id}/detail-readonly', [ManageUsersController::class, 'getUserDetailReadonly']);
    })->add(new EbeddienFiturMiddleware(
        EbeddienFiturAccess::userDetailReadonlySelectors(),
        LegacyRouteRoles::forKey(LegacyRouteRoleKeys::USER_DETAIL_READONLY_SELECTORS)
    ))->add(new AuthMiddleware());

    $app->group('/api/v2/manage-users', function ($group) {
        $group->get('', [ManageUsersController::class, 'getAllUsersV2']);
        $group->get('/santri-options', [ManageUsersController::class, 'getSantriOptions']);
        $group->get('/pengurus-options', [ManageUsersController::class, 'getPengurusOptions']);
        $group->get('/{id}/sessions', [ManageUsersController::class, 'getUserSessions']);
        $group->delete('/{id}/sessions/{sessionId}', [ManageUsersController::class, 'revokeUserSession']);
        $group->put('/{id}/mybeddian-access', [ManageUsersController::class, 'setMybeddianAccess']);
        $group->delete('/{id}/mybeddian-santri/{santriId}', [ManageUsersController::class, 'removeOneMybeddianSantri']);
        $group->put('/{id}/pengurus-link', [ManageUsersController::class, 'setPengurusLink']);
        $group->put('/{id}/portal-access', [ManageUsersController::class, 'updateUserPortalAccessV2']);
        $group->get('/toko-options', [ManageUsersController::class, 'getTokoOptions']);
        $group->get('/madrasah-pjgt-options', [ManageUsersController::class, 'getMadrasahPjgtOptions']);
        $group->get('/{id}/toko', [ManageUsersController::class, 'getTokoForUser']);
        $group->post('/{id}/toko', [ManageUsersController::class, 'addTokoToUser']);
        $group->delete('/{id}/toko/{pedagangId}', [ManageUsersController::class, 'removeTokoFromUser']);
        $group->post('/{id}/pjgt', [ManageUsersController::class, 'linkUserPjgt']);
        $group->delete('/{id}/pjgt', [ManageUsersController::class, 'unlinkUserPjgt']);
        $group->put('/{id}', [ManageUsersController::class, 'updateUserProfileV2']);
        $group->delete('/{id}', [ManageUsersController::class, 'deleteUserV2']);
        $group->get('/{id}', [ManageUsersController::class, 'getUserByIdV2']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::manageUsersV2Selectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::MANAGE_USERS_V2_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/manage-users', function ($group) {
        $group->get('/roles/assignable-list', [ManageUsersController::class, 'getAssignableRolesList']);
        $group->get('/roles/list', [ManageUsersController::class, 'getRolesList']);
        $group->post('/roles', [ManageUsersController::class, 'createRole']);
        $group->put('/roles/{id}', [ManageUsersController::class, 'updateRole']);
        $group->delete('/roles/{id}', [ManageUsersController::class, 'deleteRole']);
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
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::manageUsersLegacySelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::MANAGE_USERS_LEGACY_SELECTORS)))->add(new AuthMiddleware());
};
