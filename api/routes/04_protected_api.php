<?php

declare(strict_types=1);

use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;
use App\Controllers\WhatsAppController;
use App\Controllers\UserController;
use App\Controllers\ProfilController;
use App\Controllers\SantriController;
use App\Controllers\PaymentController;
use App\Controllers\ChatController;
use App\Controllers\SubscriptionController;
use App\Controllers\WhatsAppTemplateController;
use App\Controllers\WarmerController;

return function (\Slim\App $app): void {
    // Daftar user (sensitif) — hanya super_admin
    $app->group('/api', function ($group) {
        $group->get('/user/list', [UserController::class, 'getAllUsers']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // List super admin & admin uwaba (untuk notifikasi rencana/pengeluaran di offcanvas) — super_admin + admin_uwaba
    $app->group('/api', function ($group) {
        $group->get('/user/list-super-admin-uwaba', [UserController::class, 'getSuperAdminAndUwabaUsers']);
    })->add(new RoleMiddleware(['admin_uwaba', 'super_admin']))->add(new AuthMiddleware());

    // Data santri — admin_psb, petugas_psb, super_admin
    $app->group('/api', function ($group) {
        $group->get('/santri', [SantriController::class, 'getAllSantri']);
        $group->post('/santri', [SantriController::class, 'updateSantri']);
    })->add(new RoleMiddleware(['admin_psb', 'petugas_psb', 'super_admin']))->add(new AuthMiddleware());

    // Profil total & payment syahriah — role UWABA
    $app->group('/api', function ($group) {
        $group->get('/profil/total-pembayaran', [ProfilController::class, 'totalPembayaranHariIni']);
        $group->get('/profil/total-pemasukan-pengeluaran', [ProfilController::class, 'totalPemasukanPengeluaranHariIni']);
        $group->post('/payment/syahriah/last-number', [PaymentController::class, 'getSyahriahLastNumber']);
        $group->post('/payment/syahriah/save', [PaymentController::class, 'saveSyahriahPayment']);
        $group->post('/payment/syahriah/delete', [PaymentController::class, 'deleteSyahriahPayment']);
        $group->post('/payment/syahriah/history', [PaymentController::class, 'getSyahriahHistory']);
    })->add(new RoleMiddleware(['admin_uwaba', 'petugas_uwaba', 'super_admin']))->add(new AuthMiddleware());

    // WhatsApp — cek nomor: semua user yang login (termasuk daftar/NIK = role santri), tanpa batasan role
    $app->group('/api', function ($group) {
        $group->post('/wa/check', [WhatsAppController::class, 'check']);
    })->add(new AuthMiddleware());

    // WhatsApp — kirim & edit pesan: hanya staff (PSB + UWABA + super_admin). Process-pending: PSB saja
    $app->group('/api', function ($group) {
        $group->post('/wa/send', [WhatsAppController::class, 'send']);
        $group->post('/wa/edit-message', [WhatsAppController::class, 'edit']);
    })->add(new RoleMiddleware(['super_admin', 'admin_psb', 'petugas_psb', 'admin_uwaba', 'petugas_uwaba']))->add(new AuthMiddleware());
    $app->group('/api', function ($group) {
        $group->post('/wa/process-pending', [WhatsAppController::class, 'processPending']);
    })->add(new RoleMiddleware(['super_admin', 'admin_psb', 'petugas_psb']))->add(new AuthMiddleware());

    // Chat — role UWABA + PSB (untuk riwayat chat pendaftaran, dll)
    $app->group('/api', function ($group) {
        $group->post('/chat/save', [ChatController::class, 'saveChat']);
        $group->post('/chat/save-all', [ChatController::class, 'saveAllChat']);
        $group->post('/chat/update-status', [ChatController::class, 'updateStatus']);
        $group->post('/chat/update-status-by-message-id', [ChatController::class, 'updateStatusByMessageId']);
        $group->post('/chat/update-nomor-aktif', [ChatController::class, 'updateNomorAktif']);
        $group->post('/chat/count-by-santri', [ChatController::class, 'countBySantri']);
        $group->post('/chat/check-phone-status', [ChatController::class, 'checkPhoneStatus']);
        $group->post('/chat/sync-from-wa', [ChatController::class, 'syncFromWa']);
        $group->get('/chat/get-by-santri', [ChatController::class, 'getBySantri']);
        $group->get('/chat/get-all', [ChatController::class, 'getAll']);
        $group->get('/chat/stats', [ChatController::class, 'getStats']);
    })->add(new RoleMiddleware(['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']))->add(new AuthMiddleware());

    // Template WA — list: role yang bisa akses chat; create/update/delete: hanya super_admin
    $app->group('/api', function ($group) {
        $group->get('/whatsapp-template/list', [WhatsAppTemplateController::class, 'list']);
    })->add(new RoleMiddleware(['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']))->add(new AuthMiddleware());
    $app->group('/api', function ($group) {
        $group->post('/whatsapp-template/create', [WhatsAppTemplateController::class, 'create']);
        $group->put('/whatsapp-template/update', [WhatsAppTemplateController::class, 'update']);
        $group->post('/whatsapp-template/delete', [WhatsAppTemplateController::class, 'delete']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // Warmer — list pairs & messages: role akses chat; create/update/delete: super_admin
    $app->group('/api', function ($group) {
        $group->get('/warmer/pairs', [WarmerController::class, 'listPairs']);
        $group->get('/warmer/categories', [WarmerController::class, 'listCategories']);
        $group->get('/warmer/themes', [WarmerController::class, 'listThemes']);
        $group->get('/warmer/messages', [WarmerController::class, 'listMessages']);
        $group->get('/warmer/examples', [WarmerController::class, 'examples']);
        $group->get('/warmer/pick-message', [WarmerController::class, 'pickMessage']);
    })->add(new RoleMiddleware(['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']))->add(new AuthMiddleware());
    $app->group('/api', function ($group) {
        $group->post('/warmer/pairs', [WarmerController::class, 'createPair']);
        $group->put('/warmer/pairs', [WarmerController::class, 'updatePair']);
        $group->post('/warmer/pairs/delete', [WarmerController::class, 'deletePair']);
        $group->post('/warmer/themes/delete', [WarmerController::class, 'deleteTheme']);
        $group->post('/warmer/messages/import', [WarmerController::class, 'importMessages']);
        $group->post('/warmer/messages/delete', [WarmerController::class, 'deleteMessage']);
    })->add(new RoleMiddleware(['super_admin']))->add(new AuthMiddleware());

    // User profil (sendiri) & subscription — cukup login; GET /user/{id} di controller harus cek: own id atau super_admin
    $app->group('/api', function ($group) {
        $group->post('/user/check', [UserController::class, 'checkUser']);
        $group->post('/user/update-profile', [UserController::class, 'updateProfile']);
        $group->post('/user/verify-password', [UserController::class, 'verifyPassword']);
        $group->post('/user/update-password', [UserController::class, 'updatePassword']);
        $group->get('/user/{id}', [UserController::class, 'getUserById']);
        $group->post('/subscription', [SubscriptionController::class, 'saveSubscription']);
        $group->get('/subscription', [SubscriptionController::class, 'getSubscriptions']);
        $group->delete('/subscription/endpoint', [SubscriptionController::class, 'deleteSubscriptionByEndpoint']);
        $group->delete('/subscription/{id}', [SubscriptionController::class, 'deleteSubscription']);
    })->add(new AuthMiddleware());
};
