<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\CashlessController;

return function (\Slim\App $app): void {
    $app->group('/api/v2/cashless', function ($group) {
        $group->get('/toko', [CashlessController::class, 'getTokoList']);
        $group->post('/toko', [CashlessController::class, 'createToko']);
        $group->get('/toko/{id}', [CashlessController::class, 'getTokoDetail']);
        $group->get('/serve-foto', [CashlessController::class, 'serveFoto']);
        $group->post('/upload-foto', [CashlessController::class, 'uploadFoto']);
        $group->put('/toko/{id}', [CashlessController::class, 'updateToko']);
        $group->get('/accounts', [CashlessController::class, 'getAccountsList']);
        $group->post('/accounts', [CashlessController::class, 'createAccount']);
        $group->get('/accounts/{id}/card', [CashlessController::class, 'getAccountCard']);
        $group->get('/accounts/{id}/batas-harian', [CashlessController::class, 'getAccountBatasHarian']);
        $group->put('/accounts/{id}/batas-harian', [CashlessController::class, 'setAccountBatasHarian']);
        $group->patch('/accounts/{id}', [CashlessController::class, 'updateAccount']);
        $group->get('/ledger-summary', [CashlessController::class, 'getLedgerSummary']);
        $group->get('/config', [CashlessController::class, 'getConfig']);
        $group->put('/config', [CashlessController::class, 'setConfig']);
        $group->post('/maintenance/start', [CashlessController::class, 'startMaintenance']);
        $group->post('/maintenance/stop', [CashlessController::class, 'stopMaintenance']);
        $group->post('/kartu/issue-bundle', [CashlessController::class, 'issueKartuBundle']);
        $group->post('/kartu/santri/{santriId}/issue', [CashlessController::class, 'issueKartuSingle']);
        $group->get('/kartu/santri/{santriId}', [CashlessController::class, 'listKartuBySantri']);
        $group->post('/kartu/santri/{santriId}/mark-printed', [CashlessController::class, 'markKartuPrinted']);
        $group->post('/kartu/validate', [CashlessController::class, 'validateKartuPrinted']);
        $group->post('/kartu/invalidate-all', [CashlessController::class, 'invalidateAllKartu']);
        $group->put('/kartu/{id}/pin', [CashlessController::class, 'setKartuPin']);
        $group->post('/topup', [CashlessController::class, 'topUp']);
        $group->get('/topup/history', [CashlessController::class, 'getTopUpHistory']);
        $group->post('/withdraw', [CashlessController::class, 'withdraw']);
        $group->get('/withdraw/history', [CashlessController::class, 'getWithdrawHistory']);
        $group->post('/journal/{id}/reverse', [CashlessController::class, 'reverseJournal']);
        $group->post('/reconcile', [CashlessController::class, 'reconcileAccounts']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::cashlessAdminSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::CASHLESS_ADMIN_SELECTORS)))->add(new AuthMiddleware());
};
