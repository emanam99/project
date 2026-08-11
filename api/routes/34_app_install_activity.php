<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Controllers\AppInstallActivityAdminController;
use App\Controllers\SuperAdminUsersStatsController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

return function (\Slim\App $app): void {
    $app->group('/api/app-install-activity', function ($group) {
        $group->get('/overview', [AppInstallActivityAdminController::class, 'getOverview']);
        $group->get('/timeseries', [AppInstallActivityAdminController::class, 'getTimeseries']);
        $group->get('/breakdown', [AppInstallActivityAdminController::class, 'getBreakdown']);
        $group->get('/retention', [AppInstallActivityAdminController::class, 'getRetention']);
        $group->get('/funnel', [AppInstallActivityAdminController::class, 'getFunnel']);
        $group->get('/dashboard', [AppInstallActivityAdminController::class, 'getDashboard']);
        $group->get('/list', [AppInstallActivityAdminController::class, 'getList']);
        $group->get('/realtime', [AppInstallActivityAdminController::class, 'getRealtime']);
        $group->get('/export.csv', [AppInstallActivityAdminController::class, 'exportCsv']);
        $group->get('/deploy-checklist', [AppInstallActivityAdminController::class, 'deployChecklist']);
        $group->get('/users-stats', [SuperAdminUsersStatsController::class, 'getStats']);
        $group->get('/users-timeseries', [SuperAdminUsersStatsController::class, 'getTimeseries']);
    })->add(new EbeddienFiturMiddleware(
        EbeddienFiturAccess::installActivitySelectors(),
        LegacyRouteRoles::forKey(LegacyRouteRoleKeys::INSTALL_ACTIVITY_SELECTORS)
    ))->add(new AuthMiddleware());
};
