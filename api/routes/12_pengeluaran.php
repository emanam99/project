<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\PengeluaranRencanaFileControllerV2;
use App\Controllers\PengeluaranController;

return function (\Slim\App $app): void {
    $app->group('/api/v2/pengeluaran/rencana', function ($group) {
        $group->post('/{id}/file', [PengeluaranRencanaFileControllerV2::class, 'uploadFile']);
        $group->get('/{id}/file', [PengeluaranRencanaFileControllerV2::class, 'getFiles']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::financeMenus(), ['admin_uwaba', 'admin_lembaga', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/v2/pengeluaran/rencana/file', function ($group) {
        $group->get('/{fileId}/download', [PengeluaranRencanaFileControllerV2::class, 'downloadFile']);
        $group->delete('/{fileId}', [PengeluaranRencanaFileControllerV2::class, 'deleteFile']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::financeMenus(), ['admin_uwaba', 'admin_lembaga', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/pengeluaran', function ($group) {
        $group->post('/notif-wa', [PengeluaranController::class, 'sendPengeluaranNotifWa']);
        $group->post('/rencana/notif-wa', [PengeluaranController::class, 'sendRencanaNotifWa']);
        $group->get('/rencana/wa-wake', [PengeluaranController::class, 'getRencanaWaWake']);
        $group->post('/rencana', [PengeluaranController::class, 'createRencana']);
        $group->get('/rencana', [PengeluaranController::class, 'getRencanaList']);
        $group->post('/rencana/{id}/komentar', [PengeluaranController::class, 'createKomentar']);
        $group->get('/rencana/{id}/komentar', [PengeluaranController::class, 'getKomentar']);
        $group->delete('/rencana/{id}/komentar/{komentarId}', [PengeluaranController::class, 'deleteKomentar']);
        $group->get('/rencana/{id}/viewer', [PengeluaranController::class, 'getViewer']);
        $group->post('/rencana/{id}/file', [PengeluaranController::class, 'uploadFile']);
        $group->get('/rencana/{id}/file', [PengeluaranController::class, 'getFiles']);
        $group->get('/rencana/file/{fileId}/download', [PengeluaranController::class, 'downloadFile']);
        $group->delete('/rencana/file/{fileId}', [PengeluaranController::class, 'deleteFile']);
        $group->get('/rencana/{id}', [PengeluaranController::class, 'getRencanaDetail']);
        $group->put('/rencana/{id}', [PengeluaranController::class, 'updateRencana']);
        $group->delete('/rencana/{id}', [PengeluaranController::class, 'deleteRencana']);
        $group->post('/rencana/{id}/approve', [PengeluaranController::class, 'approveRencana']);
        $group->post('/rencana/{id}/reject', [PengeluaranController::class, 'rejectRencana']);
        $group->get('', [PengeluaranController::class, 'getPengeluaranList']);
        $group->get('/{id}/pengurus', [PengeluaranController::class, 'getPengurusByLembaga']);
        $group->delete('/{id}', [PengeluaranController::class, 'deletePengeluaran']);
        $group->put('/{id}', [PengeluaranController::class, 'updatePengeluaran']);
        $group->get('/{id}', [PengeluaranController::class, 'getPengeluaranDetail']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::financeMenus(), ['admin_uwaba', 'admin_lembaga', 'super_admin']))->add(new AuthMiddleware());
};
