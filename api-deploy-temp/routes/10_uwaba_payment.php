<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\UwabaController;
use App\Controllers\PaymentController;

return function (\Slim\App $app): void {
    $app->group('/api/uwaba', function ($group) {
        $group->get('', [UwabaController::class, 'getUwaba']);
        $group->get('/test-santri-count', [UwabaController::class, 'testSantriCount']);
        $group->get('/status-santri-options', [UwabaController::class, 'getStatusSantriOptions']);
        $group->get('/all-data', [UwabaController::class, 'getAllData']);
        $group->post('/get', [UwabaController::class, 'getUwabaPost']);
        $group->post('/save-data', [UwabaController::class, 'saveUwabaData']);
        $group->post('/delete-payment', [UwabaController::class, 'deletePayment']);
        $group->post('/create-payment', [UwabaController::class, 'createPayment']);
        $group->post('/save-refresh', [UwabaController::class, 'saveUwabaRefresh']);
        $group->post('/lengkapi-data', [UwabaController::class, 'lengkapiData']);
    })->add(new RoleMiddleware(['petugas_uwaba', 'admin_uwaba', 'super_admin']))->add(new AuthMiddleware());

    $app->group('/api/payment', function ($group) {
        $group->get('/rincian', [PaymentController::class, 'getRincian']);
        $group->get('/history', [PaymentController::class, 'getPaymentHistory']);
        $group->get('/khusus', [PaymentController::class, 'getPembayaranKhusus']);
        $group->post('/create', [PaymentController::class, 'createPayment']);
        $group->post('/delete', [PaymentController::class, 'deletePayment']);
        $group->post('/check-related', [PaymentController::class, 'checkRelatedPayment']);
        $group->post('/insert', [PaymentController::class, 'insertTunggakanKhusus']);
        $group->post('/update', [PaymentController::class, 'updateTunggakanKhusus']);
        $group->post('/delete-item', [PaymentController::class, 'deleteTunggakanKhusus']);
    })->add(new RoleMiddleware(['petugas_uwaba', 'admin_uwaba', 'super_admin']))->add(new AuthMiddleware());
};
