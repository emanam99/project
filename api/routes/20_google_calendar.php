<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\GoogleCalendarController;

return function (\Slim\App $app): void {
    // Baca events + config: admin_kalender atau super_admin (sesuai controller)
    $app->group('/api/google-calendar', function ($group) {
        $group->get('/events', [GoogleCalendarController::class, 'getEvents']);
        $group->get('/config', [GoogleCalendarController::class, 'getConfig']);
        $group->get('/config/{slug}', [GoogleCalendarController::class, 'getConfigBySlug']);
        $group->put('/config/{slug}', [GoogleCalendarController::class, 'updateConfig']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::kalenderGoogleStaffSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::KALENDER_GOOGLE_STAFF_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/google-calendar', function ($group) {
        $group->post('/events', [GoogleCalendarController::class, 'createEvent']);
        $group->put('/events/{eventId}', [GoogleCalendarController::class, 'updateEvent']);
        $group->delete('/events/{eventId}', [GoogleCalendarController::class, 'deleteEvent']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());
};
