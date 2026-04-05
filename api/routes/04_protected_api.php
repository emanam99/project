<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;
use App\Controllers\WhatsAppController;
use App\Controllers\UserController;
use App\Controllers\ProfilController;
use App\Controllers\SantriController;
use App\Controllers\PaymentController;
use App\Controllers\ChatController;
use App\Controllers\SubscriptionController;
use App\Controllers\WhatsAppTemplateController;
use App\Controllers\UserChatController;

return function (\Slim\App $app): void {
    // Daftar user (sensitif) — hanya super_admin
    $app->group('/api', function ($group) {
        $group->get('/user/list', [UserController::class, 'getAllUsers']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), ['super_admin']))->add(new AuthMiddleware());

    // List admin_uwaba + petugas_keuangan (notifikasi WA rencana/pengeluaran) — legacy admin_lembaga/super_admin tetap di middleware
    $app->group('/api', function ($group) {
        $group->get('/user/list-super-admin-uwaba', [UserController::class, 'getSuperAdminAndUwabaUsers']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::userListUwabaNotifySelectors(), ['admin_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin']))->add(new AuthMiddleware());

    // Data santri — admin_psb, petugas_psb, super_admin
    $app->group('/api', function ($group) {
        $group->get('/santri', [SantriController::class, 'getAllSantri']);
        $group->post('/santri', [SantriController::class, 'updateSantri']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::psbTarbiyahSuperSelectors(), ['admin_psb', 'petugas_psb', 'super_admin', 'tarbiyah']))->add(new AuthMiddleware());

    // Profil total pembayaran & syahriah — staff UWABA
    $app->group('/api', function ($group) {
        $group->get('/profil/total-pembayaran', [ProfilController::class, 'totalPembayaranHariIni']);
        $group->post('/payment/syahriah/last-number', [PaymentController::class, 'getSyahriahLastNumber']);
        $group->post('/payment/syahriah/save', [PaymentController::class, 'saveSyahriahPayment']);
        $group->post('/payment/syahriah/delete', [PaymentController::class, 'deleteSyahriahPayment']);
        $group->post('/payment/syahriah/history', [PaymentController::class, 'getSyahriahHistory']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::uwabaStaffSuperSelectors(), ['admin_uwaba', 'petugas_uwaba', 'super_admin']))->add(new AuthMiddleware());

    // Saldo pemasukan/pengeluaran (header Keuangan) — selaras financeMenus + UWABA
    $app->group('/api', function ($group) {
        $group->get('/profil/total-pemasukan-pengeluaran', [ProfilController::class, 'totalPemasukanPengeluaranHariIni']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::profilSaldoKeuanganSelectors(), ['admin_uwaba', 'petugas_uwaba', 'admin_lembaga', 'petugas_keuangan', 'super_admin']))->add(new AuthMiddleware());

    // WhatsApp — cek nomor: semua user yang login (termasuk daftar/NIK = role santri), tanpa batasan role
    $app->group('/api', function ($group) {
        $group->post('/wa/check', [WhatsAppController::class, 'check']);
    })->add(new AuthMiddleware());

    // WhatsApp — kirim & edit pesan: hanya staff (PSB + UWABA + super_admin). Process-pending: PSB saja
    $app->group('/api', function ($group) {
        $group->post('/wa/send', [WhatsAppController::class, 'send']);
        $group->post('/wa/edit-message', [WhatsAppController::class, 'edit']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::waSendSelectors(), ['super_admin', 'admin_psb', 'petugas_psb', 'admin_uwaba', 'petugas_uwaba']))->add(new AuthMiddleware());
    $app->group('/api', function ($group) {
        $group->post('/wa/process-pending', [WhatsAppController::class, 'processPending']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::waProcessPendingSelectors(), ['super_admin', 'admin_psb', 'petugas_psb']))->add(new AuthMiddleware());

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
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::chatStaffSelectors(), ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']))->add(new AuthMiddleware());

    // Template WA — list: role yang bisa akses chat; create/update/delete: hanya super_admin
    $app->group('/api', function ($group) {
        $group->get('/whatsapp-template/list', [WhatsAppTemplateController::class, 'list']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::chatStaffSelectors(), ['admin_uwaba', 'petugas_uwaba', 'admin_psb', 'petugas_psb', 'super_admin']))->add(new AuthMiddleware());
    $app->group('/api', function ($group) {
        $group->post('/whatsapp-template/create', [WhatsAppTemplateController::class, 'create']);
        $group->put('/whatsapp-template/update', [WhatsAppTemplateController::class, 'update']);
        $group->post('/whatsapp-template/delete', [WhatsAppTemplateController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), ['super_admin']))->add(new AuthMiddleware());

    // Kontrol host Docker untuk stack WA (down/up) — hanya super_admin; PHP harus bisa `docker compose` di WA_DOCKER_COMPOSE_DIR
    $app->group('/api', function ($group) {
        $group->post('/wa/docker/stop', [WhatsAppController::class, 'dockerStop']);
        $group->post('/wa/docker/start', [WhatsAppController::class, 'dockerStart']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), ['super_admin']))->add(new AuthMiddleware());

    // Chat user-to-user: percakapan, daftar user, riwayat pesan — cukup login
    $app->group('/api', function ($group) {
        $group->get('/chat/me', [UserChatController::class, 'getMe']);
        $group->get('/chat/conversations/{id}/photo', [UserChatController::class, 'getGroupPhoto']);
        $group->delete('/chat/conversations/{id}', [UserChatController::class, 'deleteConversation']);
        $group->get('/chat/conversations', [UserChatController::class, 'getConversations']);
        $group->get('/chat/users', [UserChatController::class, 'getChatUsers']);
        $group->get('/chat/users/{id}/photo', [UserChatController::class, 'getUserPhoto']);
        $group->get('/chat/messages', [UserChatController::class, 'getMessages']);
        $group->post('/chat/send', [UserChatController::class, 'sendMessageAuth']);
        $group->post('/chat/groups', [UserChatController::class, 'createGroup']);
    })->add(new AuthMiddleware());

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
