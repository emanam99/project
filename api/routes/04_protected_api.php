<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Config\LegacyRouteRoleKeys;
use App\Config\LegacyRouteRoles;
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
use App\Controllers\ChatPinnedController;
use App\Controllers\ChatMessageController;
use App\Controllers\ChatInviteController;
use App\Controllers\ManageUsersController;
use App\Controllers\SuperAdminLiveController;

return function (\Slim\App $app): void {
    // Daftar user (sensitif) — hanya super_admin
    $app->group('/api', function ($group) {
        $group->get('/user/list', [UserController::class, 'getAllUsers']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    // Proxy backend ke endpoint admin server live (Socket.IO) — sebelumnya frontend
    // memanggil langsung dengan VITE_LIVE_ADMIN_SECRET yang ter-bundle. Audit Mei 2026.
    $app->group('/api', function ($group) {
        $group->get('/super-admin/live-online', [SuperAdminLiveController::class, 'getOnline']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    // Daftar penerima WA rencana/pengeluaran (filter by lembaga_id + aksi fitur notif) — akses route lewat selector legacy + fitur
    $app->group('/api', function ($group) {
        $group->get('/user/list-super-admin-uwaba', [UserController::class, 'getSuperAdminAndUwabaUsers']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::userListUwabaNotifySelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::USER_LIST_UWABA_NOTIFY_SELECTORS)))->add(new AuthMiddleware());

    // Token signed halaman publik biodata/ijin/shohifah (QR cetak) — cukup login; gate di controller.
    $app->group('/api', function ($group) {
        $group->post('/santri/public-view-token', [SantriController::class, 'issuePublicSantriViewToken']);
    })->add(new AuthMiddleware());

    // Baca daftar/detail santri — PSB/tarbiyah + staff ijin (cari santri di Data Ijin)
    $app->group('/api', function ($group) {
        $group->get('/santri', [SantriController::class, 'getAllSantri']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::santriListApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SANTRI_LIST_API_SELECTORS)))->add(new AuthMiddleware());

    // Update santri — tanpa menu ijin (petugas ijin tidak boleh tulis biodata lewat endpoint ini)
    $app->group('/api', function ($group) {
        $group->post('/santri', [SantriController::class, 'updateSantri']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::santriCrudApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::PSB_TARBIYAH_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Data mentah untuk editor spreadsheet santri (FortuneSheet) + simpan massal.
    $app->group('/api', function ($group) {
        $group->get('/santri/excel-raw', [SantriController::class, 'getExcelRawSantri']);
        $group->post('/santri/excel-bulk-update', [SantriController::class, 'bulkUpdateSantriFromExcel']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::santriExcelApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    // Editor spreadsheet pengurus — simpan massal (data dimuat lewat GET /manage-users di frontend).
    $app->group('/api', function ($group) {
        $group->post('/pengurus/excel-bulk-update', [ManageUsersController::class, 'bulkUpdatePengurusFromExcel']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::pengurusExcelApiSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    // Profil total pembayaran & syahriah — staff UWABA
    $app->group('/api', function ($group) {
        $group->get('/profil/total-pembayaran', [ProfilController::class, 'totalPembayaranHariIni']);
        $group->post('/payment/syahriah/last-number', [PaymentController::class, 'getSyahriahLastNumber']);
        $group->post('/payment/syahriah/save', [PaymentController::class, 'saveSyahriahPayment']);
        $group->post('/payment/syahriah/delete', [PaymentController::class, 'deleteSyahriahPayment']);
        $group->post('/payment/syahriah/history', [PaymentController::class, 'getSyahriahHistory']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::uwabaStaffSuperSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::UWABA_STAFF_SUPER_SELECTORS)))->add(new AuthMiddleware());

    // Issue signed token akses pembayaran publik (short TTL).
    // Cukup user terautentikasi; pengetatan otorisasi (siapa boleh issue untuk siapa) dilakukan di controller / lapisan client.
    $app->group('/api', function ($group) {
        $group->post('/payment/public-token', [PaymentController::class, 'issuePublicPaymentToken']);
    })->add(new AuthMiddleware());

    // Saldo pemasukan/pengeluaran (header Keuangan) — selaras financeMenus + UWABA
    $app->group('/api', function ($group) {
        $group->get('/profil/total-pemasukan-pengeluaran', [ProfilController::class, 'totalPemasukanPengeluaranHariIni']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::profilSaldoKeuanganSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::PROFIL_SALDO_KEUANGAN_SELECTORS)))->add(new AuthMiddleware());

    // WhatsApp — cek nomor: semua user yang login (termasuk daftar/NIK = role santri), tanpa batasan role
    $app->group('/api', function ($group) {
        $group->post('/wa/check', [WhatsAppController::class, 'check']);
    })->add(new AuthMiddleware());

    // WhatsApp — kirim & edit pesan: hanya staff (PSB + UWABA + super_admin). Process-pending: PSB saja
    $app->group('/api', function ($group) {
        $group->post('/wa/send', [WhatsAppController::class, 'send']);
        $group->post('/wa/official/send', [WhatsAppController::class, 'sendOfficial']);
        $group->post('/wa/edit-message', [WhatsAppController::class, 'edit']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::waSendSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::WA_SEND_SELECTORS)))->add(new AuthMiddleware());
    $app->group('/api', function ($group) {
        $group->post('/wa/process-pending', [WhatsAppController::class, 'processPending']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::waProcessPendingSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::WA_PROCESS_PENDING_SELECTORS)))->add(new AuthMiddleware());

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
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::chatStaffSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::CHAT_STAFF_SELECTORS)))->add(new AuthMiddleware());

    // Template WA — list: role yang bisa akses chat; create/update/delete: hanya super_admin
    $app->group('/api', function ($group) {
        $group->get('/whatsapp-template/list', [WhatsAppTemplateController::class, 'list']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::chatStaffSelectors(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::CHAT_STAFF_SELECTORS)))->add(new AuthMiddleware());
    $app->group('/api', function ($group) {
        $group->post('/whatsapp-template/create', [WhatsAppTemplateController::class, 'create']);
        $group->put('/whatsapp-template/update', [WhatsAppTemplateController::class, 'update']);
        $group->post('/whatsapp-template/delete', [WhatsAppTemplateController::class, 'delete']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    // Kontrol host Docker untuk stack WA (down/up) — hanya super_admin; PHP harus bisa `docker compose` di WA_DOCKER_COMPOSE_DIR
    $app->group('/api', function ($group) {
        $group->post('/wa/docker/stop', [WhatsAppController::class, 'dockerStop']);
        $group->post('/wa/docker/start', [WhatsAppController::class, 'dockerStart']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), LegacyRouteRoles::forKey(LegacyRouteRoleKeys::SUPER_ADMIN_MENUS)))->add(new AuthMiddleware());

    // Chat user-to-user: percakapan, daftar user, riwayat pesan — cukup login
    $app->group('/api', function ($group) {
        $group->get('/chat/me', [UserChatController::class, 'getMe']);
        $group->put('/chat/me/privacy', [UserChatController::class, 'putMyChatPrivacy']);
        $group->get('/chat/conversations/{id}/photo', [UserChatController::class, 'getGroupPhoto']);
        $group->patch('/chat/conversations/{id}', [UserChatController::class, 'updateGroupConversation']);
        $group->get('/chat/conversations/{id}/members', [UserChatController::class, 'getConversationMembers']);
        $group->post('/chat/conversations/{id}/members', [UserChatController::class, 'addConversationMembers']);
        $group->patch('/chat/conversations/{id}/members/{userId}/admin', [UserChatController::class, 'setConversationMemberAdmin']);
        $group->delete('/chat/conversations/{id}/members/{userId}', [UserChatController::class, 'removeConversationMember']);
        $group->post('/chat/conversations/{id}/delivered', [UserChatController::class, 'markConversationDelivered']);
        $group->get('/chat/conversations/{id}/search', [UserChatController::class, 'searchConversationMessages']);
        $group->post('/chat/conversations/{id}/archive', [UserChatController::class, 'archiveConversation']);
        $group->delete('/chat/conversations/{id}/archive', [UserChatController::class, 'unarchiveConversation']);
        $group->put('/chat/conversations/{id}/draft', [UserChatController::class, 'setConversationDraft']);
        $group->get('/chat/conversations/{id}/pins', [ChatPinnedController::class, 'listPins']);
        $group->post('/chat/conversations/{id}/pins', [ChatPinnedController::class, 'addPin']);
        $group->delete('/chat/conversations/{id}/pins/{messageId}', [ChatPinnedController::class, 'removePin']);
        $group->get('/chat/conversations/{id}/invites', [ChatInviteController::class, 'listInvites']);
        $group->post('/chat/conversations/{id}/invites', [ChatInviteController::class, 'createInvite']);
        $group->delete('/chat/conversations/{id}/invites/{code}', [ChatInviteController::class, 'revokeInvite']);
        $group->get('/chat/invites/{code}/preview', [ChatInviteController::class, 'previewInvite']);
        $group->post('/chat/invites/{code}/join', [ChatInviteController::class, 'joinInvite']);
        $group->delete('/chat/conversations/{id}', [UserChatController::class, 'deleteConversation']);
        $group->get('/chat/conversations', [UserChatController::class, 'getConversations']);
        $group->get('/chat/users', [UserChatController::class, 'getChatUsers']);
        $group->get('/chat/users/{id}/photo', [UserChatController::class, 'getUserPhoto']);
        $group->get('/chat/messages/{id}/receipts', [UserChatController::class, 'getMessageReceipts']);
        $group->post('/chat/messages/{id}/reactions', [UserChatController::class, 'toggleMessageReaction']);
        $group->get('/chat/messages/{id}/attachment', [UserChatController::class, 'getMessageAttachment']);
        $group->put('/chat/messages/{id}', [ChatMessageController::class, 'editMessage']);
        $group->delete('/chat/messages/{id}', [ChatMessageController::class, 'deleteMessage']);
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
