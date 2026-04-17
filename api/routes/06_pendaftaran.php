<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\PendaftaranController;

return function (\Slim\App $app): void {
    // Opsi filter halaman Santri (kategori → daerah, kamar) — termasuk action.santri.halaman tanpa menu PSB penuh
    $app->group('/api/pendaftaran', function ($group) {
        $group->get('/kategori-options', [PendaftaranController::class, 'getKategoriOptions']);
        $group->get('/daerah-options', [PendaftaranController::class, 'getDaerahOptions']);
        $group->get('/kamar-options', [PendaftaranController::class, 'getKamarOptions']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::pendaftaranSantriFilterOptionsSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::PSB_STAFF_SUPER_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/pendaftaran', function ($group) {
        $group->get('/rombel-options', [PendaftaranController::class, 'getRombelOptions']);
        $group->get('/lembaga-options', [PendaftaranController::class, 'getLembagaOptions']);
        $group->get('/kelas-options', [PendaftaranController::class, 'getKelasOptions']);
        $group->get('/kel-options', [PendaftaranController::class, 'getKelOptions']);
        $group->get('/rincian', [PendaftaranController::class, 'getRincian']);
        $group->get('/history', [PendaftaranController::class, 'getPaymentHistory']);
        $group->post('/create-payment', [PendaftaranController::class, 'createPayment']);
        $group->post('/delete-payment', [PendaftaranController::class, 'deletePayment']);
        $group->post('/insert', [PendaftaranController::class, 'insertPendaftaran']);
        $group->post('/update', [PendaftaranController::class, 'updatePendaftaran']);
        $group->post('/delete-item', [PendaftaranController::class, 'deletePendaftaran']);
        $group->post('/save-biodata', [PendaftaranController::class, 'saveBiodata']);
        $group->get('/get-biodata', [PendaftaranController::class, 'getBiodata']);
        $group->get('/whatsapp-kontak-status', [PendaftaranController::class, 'getWhatsAppKontakStatus']);
        $group->get('/wa-wake', [PendaftaranController::class, 'getWaWake']);
        $group->get('/get-registrasi', [PendaftaranController::class, 'getRegistrasi']);
        $group->get('/get-registrasi-by-id', [PendaftaranController::class, 'getRegistrasiById']);
        $group->get('/get-registrasi-detail', [PendaftaranController::class, 'getRegistrasiDetail']);
        $group->post('/update-registrasi-detail', [PendaftaranController::class, 'updateRegistrasiDetail']);
        $group->post('/bulk-update-registrasi-detail', [PendaftaranController::class, 'bulkUpdateRegistrasiDetail']);
        $group->get('/get-transaksi', [PendaftaranController::class, 'getTransaksi']);
        $group->post('/delete-transaksi', [PendaftaranController::class, 'deleteTransaksi']);
        $group->post('/update-transaksi', [PendaftaranController::class, 'updateTransaksiPsb']);
        $group->post('/create-payment-psb', [PendaftaranController::class, 'createPaymentPsb']);
        $group->post('/save-registrasi', [PendaftaranController::class, 'saveRegistrasi']);
        $group->post('/update-keterangan-status', [PendaftaranController::class, 'updateKeteranganStatus']);
        $group->post('/bulk-update-registrasi', [PendaftaranController::class, 'bulkUpdateRegistrasi']);
        $group->post('/sync-keterangan-status', [PendaftaranController::class, 'syncKeteranganStatus']);
        $group->post('/create-santri', [PendaftaranController::class, 'createSantri']);
        $group->get('/search-by-nik', [PendaftaranController::class, 'searchByNik']);
        $group->get('/get-pendaftar-ids', [PendaftaranController::class, 'getPendaftarIds']);
        $group->get('/get-item-list', [PendaftaranController::class, 'getItemList']);
        $group->post('/add-item-to-detail', [PendaftaranController::class, 'addItemToDetail']);
        $group->post('/delete-registrasi-detail', [PendaftaranController::class, 'deleteRegistrasiDetail']);
        $group->post('/auto-assign-items', [PendaftaranController::class, 'autoAssignItems']);
        $group->get('/get-last-pendaftar', [PendaftaranController::class, 'getLastPendaftar']);
        $group->get('/get-all-pendaftar', [PendaftaranController::class, 'getAllPendaftar']);
        $group->get('/get-all-registrasi-by-santri', [PendaftaranController::class, 'getAllRegistrasiBySantri']);
        $group->post('/delete-registrasi', [PendaftaranController::class, 'deleteRegistrasi']);
        $group->get('/find-similar-santri', [PendaftaranController::class, 'findSimilarSantri']);
        $group->post('/merge-santri', [PendaftaranController::class, 'mergeSantri']);
        $group->get('/dashboard', [PendaftaranController::class, 'getDashboard']);
        $group->get('/pendapatan-hari-ini', [PendaftaranController::class, 'getPendapatanHariIni']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::psbStaffSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::PSB_STAFF_SUPER_SELECTORS)))->add(new AuthMiddleware());

    $app->group('/api/pendaftaran', function ($group) {
        $group->post('/create-item', [PendaftaranController::class, 'createItem']);
        $group->post('/update-item', [PendaftaranController::class, 'updateItem']);
        $group->post('/delete-item-psb', [PendaftaranController::class, 'deleteItemPsb']);
        $group->get('/item-sets', [PendaftaranController::class, 'getItemSets']);
        $group->get('/unique-kondisi-from-registrasi', [PendaftaranController::class, 'getUniqueKondisiFromRegistrasi']);
        $group->post('/registrasi-by-kondisi', [PendaftaranController::class, 'getRegistrasiByKondisi']);
        $group->get('/item-set/{id}', [PendaftaranController::class, 'getItemSet']);
        $group->post('/item-set', [PendaftaranController::class, 'createItemSet']);
        $group->put('/item-set/{id}', [PendaftaranController::class, 'updateItemSet']);
        $group->delete('/item-set/{id}', [PendaftaranController::class, 'deleteItemSet']);
        $group->get('/kondisi-field/{id}', [PendaftaranController::class, 'getKondisiField']);
        $group->post('/kondisi-field', [PendaftaranController::class, 'createKondisiField']);
        $group->put('/kondisi-field/{id}', [PendaftaranController::class, 'updateKondisiField']);
        $group->delete('/kondisi-field/{id}', [PendaftaranController::class, 'deleteKondisiField']);
        $group->get('/kondisi-value/{id}', [PendaftaranController::class, 'getKondisiValue']);
        $group->post('/kondisi-value', [PendaftaranController::class, 'createKondisiValue']);
        $group->put('/kondisi-value/{id}', [PendaftaranController::class, 'updateKondisiValue']);
        $group->delete('/kondisi-value/{id}', [PendaftaranController::class, 'deleteKondisiValue']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::psbAdminSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::PSB_ADMIN_SUPER_SELECTORS)))->add(new AuthMiddleware());
};
