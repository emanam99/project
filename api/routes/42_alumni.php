<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Controllers\AlumniController;
use App\Controllers\AlumniStaffController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

return function (\Slim\App $app): void {
    // Public (app daftar)
    $app->get('/api/alumni/count', [AlumniController::class, 'count']);
    $app->get('/api/alumni/top-wilayah', [AlumniController::class, 'topWilayah']);
    $app->get('/api/alumni/alamat-suggest', [AlumniController::class, 'alamatSuggest']);
    $app->get('/api/alumni/check-nik', [AlumniController::class, 'checkNik']);
    $app->get('/api/alumni/convert-tahun', [AlumniController::class, 'convertTahun']);
    $app->post('/api/alumni/login-nik', [AlumniController::class, 'loginNik']);

    // Auth JWT alumni (app daftar)
    $app->group('/api/alumni', function ($group) {
        $group->get('/me', [AlumniController::class, 'me']);
        $group->put('/biodata', [AlumniController::class, 'saveBiodata']);
    })->add(new AuthMiddleware());

    // Staff eBeddien
    $alumniStaffMw = new EbeddienFiturMiddleware(
        EbeddienFiturAccess::alumniStaffApiSelectors(),
        LegacyRouteRoles::forKey(LegacyRouteRoleKeys::TARBIYAH_SUPER_SELECTORS)
    );
    $app->get('/api/alumni/staff', [AlumniStaffController::class, 'list'])
        ->add($alumniStaffMw)->add(new AuthMiddleware());
    $app->get('/api/alumni/staff/{id}', [AlumniStaffController::class, 'getById'])
        ->add($alumniStaffMw)->add(new AuthMiddleware());
    $app->put('/api/alumni/staff/{id}', [AlumniStaffController::class, 'update'])
        ->add($alumniStaffMw)->add(new AuthMiddleware());
    $app->patch('/api/alumni/staff/{id}/status', [AlumniStaffController::class, 'updateStatus'])
        ->add($alumniStaffMw)->add(new AuthMiddleware());
    $app->delete('/api/alumni/staff/{id}', [AlumniStaffController::class, 'delete'])
        ->add($alumniStaffMw)->add(new AuthMiddleware());
};
