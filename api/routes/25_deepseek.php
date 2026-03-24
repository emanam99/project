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
        /** Toggle per-user: akses AI via WhatsApp. */
        $group->get('/whatsapp-access', [DeepseekController::class, 'getWhatsappAccess']);
        $group->put('/whatsapp-access', [DeepseekController::class, 'putWhatsappAccess']);
        /** Super admin: kelola limit + status AI user. */
        $group->get('/admin/ai-users', [DeepseekController::class, 'adminListAiUsers']);
        $group->put('/admin/ai-users/{id}', [DeepseekController::class, 'adminUpdateAiUser']);
    })->add(new AuthMiddleware());
};

