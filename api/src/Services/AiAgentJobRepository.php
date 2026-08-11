<?php

declare(strict_types=1);

namespace App\Services;

final class AiAgentJobRepository
{
    /** Selaras konvensi repo: grup pertama + ___ + sisa (contoh ai___chat). */
    private const TABLE_JOBS = 'ai___agent_jobs';

    private const TABLE_SNAPSHOTS = 'ai___agent_job_snapshots';

    public function __construct(private \PDO $db)
    {
    }

    public function tableExists(): bool
    {
        try {
            $st = $this->db->query("SHOW TABLES LIKE '" . self::TABLE_JOBS . "'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @param list<array{tool_id: string, arguments: array<string, mixed>}> $actions
     * @return array{job_id: int, confirm_token: string, expires_at: string}
     */
    public function createPending(
        int $usersId,
        int $pengurusId,
        string $userPrompt,
        ?string $assistantRaw,
        array $actions,
        string $summaryForUser,
        string $modelUsed
    ): array {
        $plain = bin2hex(random_bytes(24));
        $hash = hash('sha256', $plain);
        $expires = (new \DateTimeImmutable('now'))->add(new \DateInterval('PT15M'));
        $expiresStr = $expires->format('Y-m-d H:i:s');

        $t = self::TABLE_JOBS;
        $stmt = $this->db->prepare(
            "INSERT INTO `{$t}` (users_id, pengurus_id, status, confirm_token_hash, confirm_expires_at, "
            . 'model_used, user_prompt, assistant_raw, actions_json, summary_for_user) '
            . 'VALUES (?, ?, \'pending_confirmation\', ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $usersId,
            $pengurusId > 0 ? $pengurusId : null,
            $hash,
            $expiresStr,
            $modelUsed,
            $userPrompt,
            $assistantRaw,
            json_encode($actions, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            mb_substr($summaryForUser, 0, 512),
        ]);

        return [
            'job_id' => (int) $this->db->lastInsertId(),
            'confirm_token' => $plain,
            'expires_at' => $expiresStr,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findOwned(int $jobId, int $usersId): ?array
    {
        $t = self::TABLE_JOBS;
        $stmt = $this->db->prepare(
            "SELECT * FROM `{$t}` WHERE id = ? AND users_id = ? LIMIT 1"
        );
        $stmt->execute([$jobId, $usersId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Job agen terbaru yang masih menunggu konfirmasi (untuk kanal WA / pengingat).
     *
     * @return array<string, mixed>|null
     */
    public function findLatestPendingForUser(int $usersId): ?array
    {
        if ($usersId < 1) {
            return null;
        }
        $t = self::TABLE_JOBS;
        try {
            $stmt = $this->db->prepare(
                "SELECT * FROM `{$t}` WHERE users_id = ? AND status = 'pending_confirmation' "
                . 'AND confirm_expires_at > NOW() ORDER BY id DESC LIMIT 1'
            );
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            return $row ?: null;
        } catch (\Throwable $e) {
            error_log('AiAgentJobRepository::findLatestPendingForUser ' . $e->getMessage());

            return null;
        }
    }

    public function verifyConfirmToken(array $job, string $plainToken): bool
    {
        $expected = (string) ($job['confirm_token_hash'] ?? '');
        if ($expected === '' || strlen($plainToken) < 16) {
            return false;
        }

        return hash_equals($expected, hash('sha256', $plainToken));
    }

    public function markCancelled(int $jobId): void
    {
        $t = self::TABLE_JOBS;
        $stmt = $this->db->prepare(
            "UPDATE `{$t}` SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending_confirmation'"
        );
        $stmt->execute([$jobId]);
    }

    public function markCompleted(int $jobId, ?string $rollbackUntilIso): void
    {
        $t = self::TABLE_JOBS;
        $stmt = $this->db->prepare(
            "UPDATE `{$t}` SET status = ?, rollback_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        );
        $stmt->execute(['completed', $rollbackUntilIso, $jobId]);
    }

    public function markFailed(int $jobId, string $message): void
    {
        $t = self::TABLE_JOBS;
        $stmt = $this->db->prepare(
            "UPDATE `{$t}` SET status = ?, summary_for_user = CONCAT(COALESCE(summary_for_user, ''), ' | Error: ', ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        );
        $stmt->execute(['failed', mb_substr($message, 0, 400), $jobId]);
    }

    public function markRolledBack(int $jobId): void
    {
        $t = self::TABLE_JOBS;
        $stmt = $this->db->prepare(
            "UPDATE `{$t}` SET status = 'rolled_back', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        );
        $stmt->execute([$jobId]);
    }

    /**
     * @param array<string, mixed> $before
     */
    public function insertSnapshot(int $jobId, string $tableKey, string $rowKey, array $before, ?array $after = null): void
    {
        $t = self::TABLE_SNAPSHOTS;
        $stmt = $this->db->prepare(
            "INSERT INTO `{$t}` (job_id, table_key, row_key, before_json, after_json) VALUES (?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $jobId,
            $tableKey,
            $rowKey,
            json_encode($before, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listSnapshotsDesc(int $jobId): array
    {
        $t = self::TABLE_SNAPSHOTS;
        $stmt = $this->db->prepare(
            "SELECT id, table_key, row_key, before_json, after_json FROM `{$t}` WHERE job_id = ? ORDER BY id DESC"
        );
        $stmt->execute([$jobId]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        return $rows ?: [];
    }

    public function updateSnapshotAfter(int $snapshotId, array $after): void
    {
        $t = self::TABLE_SNAPSHOTS;
        $stmt = $this->db->prepare(
            "UPDATE `{$t}` SET after_json = ? WHERE id = ?"
        );
        $stmt->execute([json_encode($after, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $snapshotId]);
    }
}
