<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Helpers\AiAgentAccessHelper;
use App\Helpers\AiAgentImageInputHelper;
use App\Helpers\AiAgentUserHelper;
use App\Helpers\AiClientNavigationContextHelper;
use App\Services\AiAgentJobRepository;
use App\Services\AiAgentOrchestratorService;
use App\Services\AiAgentConfirmService;
use App\Services\AiAgentToolExecutor;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class AiAgentController
{
    private function json(Response $response, array $data, int $status = 200): Response
    {
        $response->getBody()->write(json_encode($data, JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json; charset=utf-8')
            ->withStatus($status);
    }

    public function agentTurn(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $msg = isset($body['message']) ? trim((string) $body['message']) : '';
            $rawAttachments = $body['attachments'] ?? ($body['images'] ?? null);
            [$imgOk, $imgErr, $imagesNorm] = AiAgentImageInputHelper::normalize($rawAttachments);
            if (!$imgOk) {
                return $this->json($response, ['success' => false, 'message' => $imgErr], 400);
            }

            $navCtx = AiClientNavigationContextHelper::normalize($body['navigation_context'] ?? $body['ui_context'] ?? null);

            $svc = new AiAgentOrchestratorService();
            $out = $svc->processTurn($userPayload, $msg, $imagesNorm, $navCtx);
            if (!($out['success'] ?? false)) {
                return $this->json($response, [
                    'success' => false,
                    'message' => (string) ($out['message'] ?? 'Gagal'),
                ], (int) ($out['status'] ?? 500));
            }

            return $this->json($response, ['success' => true, 'data' => $out['data'] ?? []], 200);
        } catch (\Throwable $e) {
            error_log('AiAgentController::agentTurn ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    public function agentConfirm(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $jobId = (int) ($body['job_id'] ?? 0);
            $token = isset($body['confirm_token']) ? trim((string) $body['confirm_token']) : '';
            if ($jobId < 1 || strlen($token) < 16) {
                return $this->json($response, ['success' => false, 'message' => 'job_id dan confirm_token wajib'], 400);
            }

            $db = Database::getInstance()->getConnection();
            if (!AiAgentAccessHelper::canConfirmAgentWrites($db, $userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada izin konfirmasi tulis agen.'], 403);
            }

            $usersId = AiAgentUserHelper::resolveUsersId($userPayload, $db);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $jobs = new AiAgentJobRepository($db);
            if (!$jobs->tableExists()) {
                return $this->json($response, ['success' => false, 'message' => 'Fitur agen belum tersedia di database.'], 503);
            }

            $job = $jobs->findOwned($jobId, $usersId);
            if ($job === null) {
                return $this->json($response, ['success' => false, 'message' => 'Job tidak ditemukan'], 404);
            }
            if (($job['status'] ?? '') !== 'pending_confirmation') {
                return $this->json($response, ['success' => false, 'message' => 'Job tidak menunggu konfirmasi'], 409);
            }
            if (!$jobs->verifyConfirmToken($job, $token)) {
                return $this->json($response, ['success' => false, 'message' => 'Token konfirmasi tidak valid'], 403);
            }

            $res = AiAgentConfirmService::executePendingJob($db, $job, $userPayload, $jobs);
            if (!$res['ok']) {
                $status = str_contains($res['message'], 'kedaluwarsa') ? 410 : 400;

                return $this->json($response, ['success' => false, 'message' => $res['message']], $status);
            }

            error_log('AiAgent audit confirm job_id=' . $jobId . ' users_id=' . $usersId . ' channel=http');

            return $this->json($response, [
                'success' => true,
                'message' => $res['message'],
                'data' => [
                    'job_id' => $jobId,
                    'rollback_until' => $res['rollback_until'] ?? null,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AiAgentController::agentConfirm ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    public function agentRollback(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $jobId = (int) ($body['job_id'] ?? 0);
            if ($jobId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'job_id wajib'], 400);
            }

            $db = Database::getInstance()->getConnection();
            $usersId = AiAgentUserHelper::resolveUsersId($userPayload, $db);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $jobs = new AiAgentJobRepository($db);
            if (!$jobs->tableExists()) {
                return $this->json($response, ['success' => false, 'message' => 'Fitur agen belum tersedia di database.'], 503);
            }

            $job = $jobs->findOwned($jobId, $usersId);
            if ($job === null) {
                return $this->json($response, ['success' => false, 'message' => 'Job tidak ditemukan'], 404);
            }
            if (($job['status'] ?? '') !== 'completed') {
                return $this->json($response, ['success' => false, 'message' => 'Hanya job yang selesai yang dapat di-rollback'], 409);
            }

            $rb = strtotime((string) ($job['rollback_until'] ?? ''));
            if ($rb === false || time() > $rb) {
                return $this->json($response, ['success' => false, 'message' => 'Jendela pembatalan perubahan sudah berakhir'], 410);
            }

            $executor = new AiAgentToolExecutor($db);
            $snaps = $jobs->listSnapshotsDesc($jobId);
            if ($snaps === []) {
                return $this->json($response, ['success' => false, 'message' => 'Tidak ada snapshot rollback'], 409);
            }

            $db->beginTransaction();
            try {
                foreach ($snaps as $snap) {
                    $before = json_decode((string) ($snap['before_json'] ?? '{}'), true);
                    $executor->restoreSnapshotRow([
                        'table_key' => (string) ($snap['table_key'] ?? ''),
                        'row_key' => (string) ($snap['row_key'] ?? ''),
                        'before_json' => is_array($before) ? $before : [],
                    ]);
                }
                $jobs->markRolledBack($jobId);
                $db->commit();
            } catch (\Throwable $e) {
                $db->rollBack();
                error_log('AiAgentController::agentRollback job=' . $jobId . ' ' . $e->getMessage());

                return $this->json($response, ['success' => false, 'message' => 'Gagal rollback'], 500);
            }

            error_log('AiAgent audit rollback job_id=' . $jobId . ' users_id=' . $usersId);

            return $this->json($response, ['success' => true, 'message' => 'Perubahan dibatalkan (rollback)'], 200);
        } catch (\Throwable $e) {
            error_log('AiAgentController::agentRollback ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    public function agentDiscard(Request $request, Response $response): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $body = $request->getParsedBody();
            if (!is_array($body)) {
                $body = json_decode((string) $request->getBody(), true) ?? [];
            }
            $jobId = (int) ($body['job_id'] ?? 0);
            $token = isset($body['confirm_token']) ? trim((string) $body['confirm_token']) : '';
            if ($jobId < 1 || strlen($token) < 16) {
                return $this->json($response, ['success' => false, 'message' => 'job_id dan confirm_token wajib'], 400);
            }

            $db = Database::getInstance()->getConnection();
            $usersId = AiAgentUserHelper::resolveUsersId($userPayload, $db);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $jobs = new AiAgentJobRepository($db);
            if (!$jobs->tableExists()) {
                return $this->json($response, ['success' => false, 'message' => 'Fitur agen belum tersedia di database.'], 503);
            }

            $job = $jobs->findOwned($jobId, $usersId);
            if ($job === null) {
                return $this->json($response, ['success' => false, 'message' => 'Job tidak ditemukan'], 404);
            }
            if (($job['status'] ?? '') !== 'pending_confirmation') {
                return $this->json($response, ['success' => false, 'message' => 'Job tidak menunggu konfirmasi'], 409);
            }
            if (!$jobs->verifyConfirmToken($job, $token)) {
                return $this->json($response, ['success' => false, 'message' => 'Token tidak valid'], 403);
            }

            $jobs->markCancelled($jobId);
            error_log('AiAgent audit discard job_id=' . $jobId . ' users_id=' . $usersId);

            return $this->json($response, ['success' => true, 'message' => 'Usulan dibatalkan'], 200);
        } catch (\Throwable $e) {
            error_log('AiAgentController::agentDiscard ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }

    public function agentGetJob(Request $request, Response $response, array $args): Response
    {
        try {
            $userPayload = $request->getAttribute('user');
            if (!is_array($userPayload)) {
                return $this->json($response, ['success' => false, 'message' => 'Unauthorized'], 401);
            }

            $jobId = (int) ($args['id'] ?? 0);
            if ($jobId < 1) {
                return $this->json($response, ['success' => false, 'message' => 'ID tidak valid'], 400);
            }

            $db = Database::getInstance()->getConnection();
            $usersId = AiAgentUserHelper::resolveUsersId($userPayload, $db);
            if ($usersId === null) {
                return $this->json($response, ['success' => false, 'message' => 'User tidak ditemukan'], 404);
            }

            $jobs = new AiAgentJobRepository($db);
            if (!$jobs->tableExists()) {
                return $this->json($response, ['success' => false, 'message' => 'Fitur agen belum tersedia di database.'], 503);
            }

            $job = $jobs->findOwned($jobId, $usersId);
            if ($job === null) {
                return $this->json($response, ['success' => false, 'message' => 'Job tidak ditemukan'], 404);
            }

            $actionsJson = $job['actions_json'] ?? '[]';
            $actions = json_decode(is_string($actionsJson) ? $actionsJson : json_encode($actionsJson), true);

            $rbRaw = $job['rollback_until'] ?? null;
            $rbTs = $rbRaw ? strtotime((string) $rbRaw) : false;
            $canRollback = ($job['status'] ?? '') === 'completed'
                && $rbTs !== false
                && time() <= $rbTs;

            return $this->json($response, [
                'success' => true,
                'data' => [
                    'id' => (int) $job['id'],
                    'status' => (string) ($job['status'] ?? ''),
                    'summary' => (string) ($job['summary_for_user'] ?? ''),
                    'actions' => is_array($actions) ? $actions : [],
                    'rollback_until' => $job['rollback_until'] ?? null,
                    'can_rollback' => $canRollback,
                    'confirm_expires_at' => $job['confirm_expires_at'] ?? null,
                ],
            ], 200);
        } catch (\Throwable $e) {
            error_log('AiAgentController::agentGetJob ' . $e->getMessage());

            return $this->json($response, ['success' => false, 'message' => 'Server error'], 500);
        }
    }
}
