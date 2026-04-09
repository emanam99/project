<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\SettingsController;
use App\Controllers\UserAktivitasController;
use App\Controllers\TahunAjaranController;
use App\Controllers\WatzapController;
use App\Controllers\WaInteractiveMenuController;
use App\Controllers\KontakController;

return function (\Slim\App $app): void {
    $app->group('/api/settings', function ($group) {
        $group->get('/roles-config', [SettingsController::class, 'getRolesConfig']);
        $group->post('/role-policy/clear-cache', [SettingsController::class, 'postRolePolicyClearCache']);
        $group->post('/role-policy/sync-from-php', [SettingsController::class, 'postRolePolicySyncFromPhp']);
        $group->get('/role-policy/catalog', [SettingsController::class, 'getRolePolicyCatalog']);
        $group->patch('/role-policy/{roleKey}', [SettingsController::class, 'patchRolePolicy']);
        $group->get('/ebeddien-fitur-selectors', [SettingsController::class, 'getEbeddienFiturSelectors']);
        $group->put('/ebeddien-fitur-selectors/{selectorKey}', [SettingsController::class, 'putEbeddienFiturSelector']);
        $group->get('/ebeddien-legacy-route-roles', [SettingsController::class, 'getEbeddienLegacyRouteRoles']);
        $group->put('/ebeddien-legacy-route-roles/{legacyKey}', [SettingsController::class, 'putEbeddienLegacyRouteRoles']);
        $group->get('/ebeddien-menu-fitur', [SettingsController::class, 'getEbeddienMenuFitur']);
        $group->put('/ebeddien-menu-fitur', [SettingsController::class, 'putEbeddienMenuFitur']);
        $group->patch('/ebeddien-menu-fitur/{fiturId}', [SettingsController::class, 'patchEbeddienMenuFiturItem']);
        $group->get('/features-config', [SettingsController::class, 'getFeaturesConfig']);
        $group->get('/notification-config', [SettingsController::class, 'getNotificationConfig']);
        $group->put('/notification-config', [SettingsController::class, 'saveNotificationConfig']);
        $group->get('/notification-groups', [SettingsController::class, 'getNotificationGroups']);
        $group->get('/notification-messages', [SettingsController::class, 'getNotificationMessages']);
        $group->post('/error-alert/test', [SettingsController::class, 'postErrorAlertTest']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    $app->group('/api/watzap', function ($group) {
        $group->get('/status', [WatzapController::class, 'getStatus']);
        $group->put('/config', [WatzapController::class, 'putConfig']);
        $group->get('/devices', [WatzapController::class, 'getDevices']);
        $group->get('/webhook-url', [WatzapController::class, 'getWebhookUrl']);
        $group->get('/webhooks', [WatzapController::class, 'getWebhooks']);
        $group->post('/set-webhook', [WatzapController::class, 'setWebhook']);
        $group->post('/send', [WatzapController::class, 'send']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    $app->group('/api/wa-interactive-menu', function ($group) {
        $group->get('/settings', [WaInteractiveMenuController::class, 'getSettings']);
        $group->put('/settings', [WaInteractiveMenuController::class, 'putSettings']);
        $group->get('/tree', [WaInteractiveMenuController::class, 'getTree']);
        $group->put('/tree', [WaInteractiveMenuController::class, 'putTree']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    $app->group('/api/kontak', function ($group) {
        $group->get('', [KontakController::class, 'getList']);
        $group->post('/{id}/resolve-lid', [KontakController::class, 'resolveLid']);
        $group->patch('/{id}', [KontakController::class, 'update']);
        $group->delete('/{id}', [KontakController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    // Master Tahun Ajaran: GET bisa diakses semua user yang login; create/update hanya super_admin
    $app->group('/api/tahun-ajaran', function ($group) {
        $group->get('', [TahunAjaranController::class, 'getAll']);
        $group->get('/{id}', [TahunAjaranController::class, 'getById']);
    })->add(new AuthMiddleware());

    $app->group('/api/tahun-ajaran', function ($group) {
        $group->post('', [TahunAjaranController::class, 'create']);
        $group->put('/{id}', [TahunAjaranController::class, 'update']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    $app->group('/api/user-aktivitas', function ($group) {
        $group->get('', [UserAktivitasController::class, 'getList']);
        $group->post('/rollback', [UserAktivitasController::class, 'rollback']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());
};
