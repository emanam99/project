<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Controllers\WebsiteBannerController;
use App\Controllers\WebsiteBeritaController;
use App\Controllers\WebsiteDashboardController;
use App\Controllers\WebsiteGaleriController;
use App\Controllers\WebsiteHalamanController;
use App\Controllers\WebsiteKategoriBeritaController;
use App\Controllers\WebsiteKategoriGaleriController;
use App\Controllers\WebsiteMediaController;
use App\Controllers\WebsiteSeoController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

/**
 * Admin Website: EbeddienFiturMiddleware (menu/aksi website) + Auth,
 * lalu controller menegakkan aksi spesifik (publish, hapus, kelola, ubah SEO).
 */
return function (\Slim\App $app): void {
    $app->group('/api/website', function ($group) {
        $group->post('/upload-image', [WebsiteMediaController::class, 'upload']);

        // Dashboard ringkas
        $group->get('/dashboard', [WebsiteDashboardController::class, 'summary']);

        // Berita (urutan: detail by slug ditangani di public; admin pakai id)
        $group->get('/berita', [WebsiteBeritaController::class, 'listAdmin']);
        $group->get('/berita/{id}', [WebsiteBeritaController::class, 'showAdmin']);
        $group->post('/berita', [WebsiteBeritaController::class, 'create']);
        $group->put('/berita/{id}', [WebsiteBeritaController::class, 'update']);
        $group->delete('/berita/{id}', [WebsiteBeritaController::class, 'delete']);

        // Kategori berita
        $group->get('/kategori-berita', [WebsiteKategoriBeritaController::class, 'list']);
        $group->post('/kategori-berita', [WebsiteKategoriBeritaController::class, 'create']);
        $group->put('/kategori-berita/{id}', [WebsiteKategoriBeritaController::class, 'update']);
        $group->delete('/kategori-berita/{id}', [WebsiteKategoriBeritaController::class, 'delete']);

        // Banner
        $group->get('/banner', [WebsiteBannerController::class, 'listAdmin']);
        $group->post('/banner', [WebsiteBannerController::class, 'create']);
        $group->put('/banner/{id}', [WebsiteBannerController::class, 'update']);
        $group->delete('/banner/{id}', [WebsiteBannerController::class, 'delete']);

        // Halaman statis
        $group->get('/halaman', [WebsiteHalamanController::class, 'listAdmin']);
        $group->get('/halaman/{id}', [WebsiteHalamanController::class, 'showAdmin']);
        $group->post('/halaman', [WebsiteHalamanController::class, 'create']);
        $group->put('/halaman/{id}', [WebsiteHalamanController::class, 'update']);
        $group->delete('/halaman/{id}', [WebsiteHalamanController::class, 'delete']);

        // Galeri foto
        $group->get('/galeri', [WebsiteGaleriController::class, 'listAdmin']);
        $group->post('/galeri', [WebsiteGaleriController::class, 'create']);
        $group->put('/galeri/{id}', [WebsiteGaleriController::class, 'update']);
        $group->delete('/galeri/{id}', [WebsiteGaleriController::class, 'delete']);

        // Kategori galeri
        $group->get('/kategori-galeri', [WebsiteKategoriGaleriController::class, 'list']);
        $group->post('/kategori-galeri', [WebsiteKategoriGaleriController::class, 'create']);
        $group->put('/kategori-galeri/{id}', [WebsiteKategoriGaleriController::class, 'update']);
        $group->delete('/kategori-galeri/{id}', [WebsiteKategoriGaleriController::class, 'delete']);

        // SEO global (singleton key-value)
        $group->get('/seo', [WebsiteSeoController::class, 'getAdmin']);
        $group->put('/seo', [WebsiteSeoController::class, 'update']);
    })
        ->add(new EbeddienFiturMiddleware(
            EbeddienFiturAccess::websiteAdminApiSelectors(),
            LegacyRouteRoles::forKey(LegacyRouteRoleKeys::WEBSITE_ADMIN_SELECTORS)
        ))
        ->add(new AuthMiddleware());
};
