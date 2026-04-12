<?php

declare(strict_types=1);

use App\Controllers\DeepseekController;
use App\Middleware\AuthMiddleware;

return function (\Slim\App $app): void {
    $app->group('/api/deepseek', function ($group) {
        $group->get('/account', [DeepseekController::class, 'getAccount']);
        $group->post('/login', [DeepseekController::class, 'login']);
        /** Forward ke proxy Node (folder ai/) — browser tidak panggil langsung (mixed content / LAN). */
        $group->post('/proxy/session', [DeepseekController::class, 'proxySession']);
        $group->post('/proxy/chat', [DeepseekController::class, 'proxyChat']);
        /** Chat utama asisten eBeddien (OpenAI-compatible upstream). Semua user terautentikasi. */
        $group->post('/api-chat', [DeepseekController::class, 'directApiChat']);
        /** Riwayat chat terakhir (ai___chat) untuk memuat ulang utas tunggal. */
        $group->get('/chat-history', [DeepseekController::class, 'chatHistory']);
        /** Saran cepat acak dari data training (bank + training chat) — UI layar kosong. */
        $group->get('/training-suggestions', [DeepseekController::class, 'trainingSuggestedPrompts']);
        $group->get('/wa-instansi-settings', [DeepseekController::class, 'getWaInstansiSettings']);
        $group->put('/wa-instansi-settings', [DeepseekController::class, 'putWaInstansiSettings']);
        $group->put('/chat-mode-preference', [DeepseekController::class, 'putChatModePreference']);
        /** Bangunkan koneksi WA Node (opsional, alur umum). */
        $group->get('/wa-wake', [DeepseekController::class, 'getWaWake']);
        /** Super admin: kelola limit + status AI user. */
        $group->get('/admin/ai-users', [DeepseekController::class, 'adminListAiUsers']);
        $group->put('/admin/ai-users/{id}', [DeepseekController::class, 'adminUpdateAiUser']);
        /** Super admin: agregasi chat AI (ai___chat) untuk dashboard. */
        $group->get('/admin/ai-dashboard', [DeepseekController::class, 'adminAiChatDashboard']);
        /** Super admin: daftar log ai___chat + perbaiki jawaban tersimpan. */
        $group->get('/admin/chat-log/meta', [DeepseekController::class, 'adminChatLogMeta']);
        $group->get('/admin/chat-log', [DeepseekController::class, 'adminListChatLog']);
        $group->patch('/admin/chat-log/{id}', [DeepseekController::class, 'adminPatchChatLog']);
    })->add(new AuthMiddleware());
};

