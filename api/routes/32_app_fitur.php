<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Controllers\AppFiturController;
use App\Controllers\MeMybeddianController;

return function (\Slim\App $app): void {
    $app->get('/api/v2/me/mybeddian', [MeMybeddianController::class, 'get'])->add(new AuthMiddleware());
    $app->get('/api/v2/me/mybeddian/santri-search', [MeMybeddianController::class, 'searchSantri'])->add(new AuthMiddleware());
    $app->get('/api/v2/me/mybeddian/santri-by-nik', [MeMybeddianController::class, 'santriByNik'])->add(new AuthMiddleware());
    $app->put('/api/v2/me/mybeddian/link-santri', [MeMybeddianController::class, 'linkSantri'])->add(new AuthMiddleware());
    $app->delete('/api/v2/me/mybeddian/santri/{santriId}', [MeMybeddianController::class, 'unlinkSantri'])->add(new AuthMiddleware());
    $app->put('/api/v2/me/mybeddian/portal-santri', [MeMybeddianController::class, 'putPortalSantri'])->add(new AuthMiddleware());
    $app->put('/api/v2/me/mybeddian/potong-uwaba-bulan', [MeMybeddianController::class, 'putPotongUwabaBulan'])->add(new AuthMiddleware());
    $app->put('/api/v2/me/mybeddian/bisyaroh-potong', [MeMybeddianController::class, 'putBisyarohPotong'])->add(new AuthMiddleware());
    $app->get('/api/v2/me/fitur-menu', [AppFiturController::class, 'getMyMenu'])->add(new AuthMiddleware());
    $app->get('/api/v2/me/fitur-favorit', [AppFiturController::class, 'getMyFiturFavorit'])->add(new AuthMiddleware());
    $app->put('/api/v2/me/fitur-favorit', [AppFiturController::class, 'putMyFiturFavorit'])->add(new AuthMiddleware());
    $app->get('/api/v2/fitur/ebeddien/menu-catalog', [AppFiturController::class, 'getEbeddienMenuCatalog'])->add(new AuthMiddleware());
};
