<?php

declare(strict_types=1);

use App\Config\EbeddienFiturAccess;
use App\Controllers\AiTrainingAdminController;
use App\Middleware\AuthMiddleware;
use App\Middleware\EbeddienFiturMiddleware;

return function (\Slim\App $app): void {
    $app->group('/api/ai-training', function ($group) {
        $group->get('/bank', [AiTrainingAdminController::class, 'listBank']);
        $group->post('/bank', [AiTrainingAdminController::class, 'saveBank']);
        $group->delete('/bank/{id}', [AiTrainingAdminController::class, 'deleteBank']);

        $group->get('/sessions', [AiTrainingAdminController::class, 'listSessions']);
        $group->post('/sessions', [AiTrainingAdminController::class, 'createSession']);
        $group->delete('/sessions/{id}', [AiTrainingAdminController::class, 'deleteSession']);
        $group->get('/sessions/{id}/messages', [AiTrainingAdminController::class, 'listMessages']);

        $group->post('/messages', [AiTrainingAdminController::class, 'sendMessage']);
        $group->patch('/messages/{id}', [AiTrainingAdminController::class, 'patchMessage']);
        $group->delete('/messages/{id}', [AiTrainingAdminController::class, 'deleteMessage']);
        $group->post('/messages/{id}/approve', [AiTrainingAdminController::class, 'approveMessage']);
        $group->post('/messages/{id}/feedback', [AiTrainingAdminController::class, 'feedbackMessage']);
    })->add(new EbeddienFiturMiddleware(EbeddienFiturAccess::superAdminMenus(), ['super_admin']))->add(new AuthMiddleware());
};
