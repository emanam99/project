<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Controllers\BisyarohController;
use App\Controllers\BisyarohTransferController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

return function (\Slim\App $app): void {
    $app->group('/api/bisyaroh', function ($group) {
        $group->get('', [BisyarohController::class, 'list']);
        $group->get('/rekap/multi', [BisyarohController::class, 'listRekapMulti']);
        $group->get('/rekap/status', [BisyarohController::class, 'listRekapStatuses']);
        $group->get('/rekap/lembaga', [BisyarohController::class, 'listRekapLembaga']);
        $group->get('/rekap/review-meta', [BisyarohController::class, 'listRekapReviewMeta']);
        $group->get('/rekap/pengurus-urutan', [BisyarohController::class, 'getRekapPengurusUrutan']);
        $group->put('/rekap/pengurus-urutan', [BisyarohController::class, 'putRekapPengurusUrutan']);
        $group->put('/rekap/pengurus-rekening-jatim', [BisyarohController::class, 'putRekapPengurusRekeningJatim']);
        $group->get('/histori/rincian/{rekapBarisId}', [BisyarohController::class, 'historiRincian']);
        $group->get('/histori', [BisyarohController::class, 'listHistori']);
        // Transfer Bank Jatim (harus sebelum /{id})
        $group->post('/transfer/export-batch', [BisyarohTransferController::class, 'exportBatch']);
        $group->post('/transfer/upload-mutasi', [BisyarohTransferController::class, 'uploadMutasi']);
        $group->post('/transfer/export-retry-failed', [BisyarohTransferController::class, 'exportRetryFailed']);
        $group->post('/transfer/rilis-manual', [BisyarohTransferController::class, 'rilisManual']);
        $group->get('/transfer/batches', [BisyarohTransferController::class, 'listBatches']);
        $group->get('/transfer/batches/{id}', [BisyarohTransferController::class, 'showBatch']);
        $group->get('/transfer/batches/{id}/rows', [BisyarohTransferController::class, 'listBatchRows']);
        $group->get('/{id}', [BisyarohController::class, 'show']);
        $group->post('', [BisyarohController::class, 'create']);
        $group->put('/{id}', [BisyarohController::class, 'update']);
        $group->delete('/{id}', [BisyarohController::class, 'delete']);
        $group->get('/{id}/kolom', [BisyarohController::class, 'listKolom']);
        $group->post('/{id}/kolom', [BisyarohController::class, 'createKolom']);
        $group->put('/{id}/kolom/reorder', [BisyarohController::class, 'reorderKolom']);
        $group->put('/{id}/kolom/{kolomId}', [BisyarohController::class, 'updateKolom']);
        $group->delete('/{id}/kolom/{kolomId}', [BisyarohController::class, 'deleteKolom']);
        $group->get('/{id}/aturan', [BisyarohController::class, 'listAturan']);
        $group->post('/{id}/aturan', [BisyarohController::class, 'createAturan']);
        $group->put('/{id}/aturan/{aturanId}', [BisyarohController::class, 'updateAturan']);
        $group->delete('/{id}/aturan/{aturanId}', [BisyarohController::class, 'deleteAturan']);
        $group->post('/{id}/rekap/preview', [BisyarohController::class, 'previewRekapRow']);
        $group->post('/{id}/rekap/bulk', [BisyarohController::class, 'upsertRekapBulk']);
        $group->put('/{id}/rekap/status', [BisyarohController::class, 'updateRekapStatus']);
        $group->get('/{id}/rekap', [BisyarohController::class, 'listRekap']);
        $group->post('/{id}/rekap', [BisyarohController::class, 'upsertRekap']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::bisyarohApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::LEMBAGA_GET_SELECTORS)))->add(new AuthMiddleware());
};
