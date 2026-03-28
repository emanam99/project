<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\PaymentGatewayController;
use App\Controllers\PaymentTransactionController;

return function (\Slim\App $app): void {
    $app->group('/api/payment-gateway', function ($group) {
        $group->get('/config', [PaymentGatewayController::class, 'getAllConfig']);
        $group->get('/config/active', [PaymentGatewayController::class, 'getActiveConfig']);
        $group->get('/config/{id}', [PaymentGatewayController::class, 'getConfigById']);
        $group->put('/config/{id}', [PaymentGatewayController::class, 'updateConfig']);
        $group->post('/config/switch-mode', [PaymentGatewayController::class, 'switchMode']);
        $group->get('/server-info', [PaymentGatewayController::class, 'getServerInfo']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), ['super_admin']))->add(new AuthMiddleware());

    $app->group('/api/payment-transaction', function ($group) {
        $group->get('/mode', [PaymentTransactionController::class, 'getMode']);
        $group->get('/admin-fee', [PaymentTransactionController::class, 'getAdminFee']);
        $group->post('/create', [PaymentTransactionController::class, 'createTransaction']);
        $group->get('/status/{sessionId}', [PaymentTransactionController::class, 'checkStatus']);
        $group->get('/pending', [PaymentTransactionController::class, 'getPendingTransaction']);
        $group->post('/{id}/cancel', [PaymentTransactionController::class, 'cancelTransaction']);
        $group->post('/{id}/update', [PaymentTransactionController::class, 'updateTransaction']);
        $group->put('/{id}/cancel', [PaymentTransactionController::class, 'cancelTransaction']);
        $group->put('/{id}/update', [PaymentTransactionController::class, 'updateTransaction']);
    })->add(new AuthMiddleware());

    $app->post('/api/payment-transaction/callback', [PaymentTransactionController::class, 'handleCallback']);
    $app->get('/api/payment-transaction/callback', [PaymentTransactionController::class, 'handleCallbackGet']);
};
