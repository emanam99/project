<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\AiAgentAccessHelper;
use App\Helpers\AiAgentUserHelper;

/**
 * Eksekusi konfirmasi job agen (dipakai HTTP dan kanal WA terverifikasi).
 */
final class AiAgentConfirmService
{
    /**
     * Jalankan aksi job pending milik user (tanpa confirm_token — hanya kanal WA terverifikasi).
     *
     * @return array{ok: bool, message: string, rollback_until?: string}
     */
    public static function executeOwnedPendingJobForVerifiedWa(\PDO $db, int $usersId, int $jobId): array
    {
        $userPayload = AiAgentUserHelper::buildPayloadForAgentFromUsersId($db, $usersId);
        if ($userPayload === null) {
            return ['ok' => false, 'message' => 'Akun tidak ditemukan.'];
        }
        if (!AiAgentAccessHelper::canConfirmAgentWrites($db, $userPayload)) {
            return [
                'ok' => false,
                'message' => 'Akun Anda tidak punya izin konfirmasi tulis agen. Gunakan tombol Konfirmasi di aplikasi eBeddien.',
            ];
        }

        $jobs = new AiAgentJobRepository($db);
        if (!$jobs->tableExists()) {
            return ['ok' => false, 'message' => 'Fitur agen belum tersedia.'];
        }

        $job = $jobs->findOwned($jobId, $usersId);
        if ($job === null) {
            return ['ok' => false, 'message' => 'Usulan tidak ditemukan.'];
        }

        return self::executePendingJob($db, $job, $userPayload, $jobs);
    }

    /**
     * @param array<string, mixed> $job
     * @param array<string, mixed> $userPayload
     *
     * @return array{ok: bool, message: string, rollback_until?: string}
     */
    public static function executePendingJob(\PDO $db, array $job, array $userPayload, ?AiAgentJobRepository $jobs = null): array
    {
        $jobId = (int) ($job['id'] ?? 0);
        if ($jobId < 1) {
            return ['ok' => false, 'message' => 'Job tidak valid.'];
        }
        if (($job['status'] ?? '') !== 'pending_confirmation') {
            return ['ok' => false, 'message' => 'Usulan tidak menunggu konfirmasi lagi.'];
        }
        $exp = strtotime((string) ($job['confirm_expires_at'] ?? ''));
        if ($exp !== false && $exp < time()) {
            $jobs = $jobs ?? new AiAgentJobRepository($db);
            $jobs->markCancelled($jobId);

            return ['ok' => false, 'message' => 'Konfirmasi sudah kedaluwarsa. Minta ulang di aplikasi eBeddien.'];
        }

        $actionsJson = $job['actions_json'] ?? '[]';
        $actions = json_decode(is_string($actionsJson) ? $actionsJson : json_encode($actionsJson), true);
        if (!is_array($actions) || $actions === []) {
            return ['ok' => false, 'message' => 'Data aksi tidak valid.'];
        }

        $usersId = (int) ($job['users_id'] ?? 0);
        $pengurusId = AiAgentUserHelper::resolvePengurusId($userPayload);
        $jobs = $jobs ?? new AiAgentJobRepository($db);
        $executor = new AiAgentToolExecutor($db);

        $db->beginTransaction();
        try {
            $executor->executeWrites($jobId, $actions, [
                'users_id' => $usersId,
                'pengurus_id' => $pengurusId,
                'user_payload' => $userPayload,
            ], $jobs);
            $rbUntil = (new \DateTimeImmutable('now'))->add(new \DateInterval('PT15M'))->format('Y-m-d H:i:s');
            $jobs->markCompleted($jobId, $rbUntil);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            error_log('AiAgentConfirmService::executePendingJob failed job=' . $jobId . ' ' . $e->getMessage());
            try {
                $jobs->markFailed($jobId, $e->getMessage());
            } catch (\Throwable $e2) {
                error_log('AiAgentConfirmService::markFailed ' . $e2->getMessage());
            }

            return [
                'ok' => false,
                'message' => $e instanceof \RuntimeException ? $e->getMessage() : 'Gagal menjalankan aksi.',
            ];
        }

        error_log('AiAgent audit confirm job_id=' . $jobId . ' users_id=' . $usersId . ' channel=wa_verified');

        return [
            'ok' => true,
            'message' => 'Perubahan diterapkan.',
            'rollback_until' => $rbUntil,
        ];
    }

    /**
     * @return array{ok: bool, message: string}
     */
    public static function discardOwnedPendingJobForVerifiedWa(\PDO $db, int $usersId, int $jobId): array
    {
        $jobs = new AiAgentJobRepository($db);
        if (!$jobs->tableExists()) {
            return ['ok' => false, 'message' => 'Fitur agen belum tersedia.'];
        }
        $job = $jobs->findOwned($jobId, $usersId);
        if ($job === null) {
            return ['ok' => false, 'message' => 'Usulan tidak ditemukan.'];
        }
        if (($job['status'] ?? '') !== 'pending_confirmation') {
            return ['ok' => false, 'message' => 'Usulan tidak menunggu konfirmasi.'];
        }
        $jobs->markCancelled($jobId);
        error_log('AiAgent audit discard job_id=' . $jobId . ' users_id=' . $usersId . ' channel=wa_verified');

        return ['ok' => true, 'message' => 'Usulan dibatalkan.'];
    }
}
