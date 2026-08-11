<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Kuota harian AI untuk agen — sama dengan DeepseekController (ember WA + users).
 */
final class AiAgentQuotaHelper
{
    public static function columnExists(\PDO $db, string $table, string $column): bool
    {
        try {
            $st = $db->prepare(
                'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
            );
            $st->execute([$table, $column]);

            return (int) $st->fetchColumn() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function aiTablesReady(\PDO $db): bool
    {
        try {
            $st = $db->query("SHOW TABLES LIKE 'ai___chat'");

            return $st !== false && $st->rowCount() > 0;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * @return array{enabled: bool, daily_limit: int}
     */
    public static function getUserAiSettings(\PDO $db, int $usersId): array
    {
        $hasEnabled = self::columnExists($db, 'users', 'ai_enabled');
        $hasLimit = self::columnExists($db, 'users', 'ai_daily_limit');
        $selEnabled = $hasEnabled ? 'ai_enabled' : '1 AS ai_enabled';
        $selLimit = $hasLimit ? 'ai_daily_limit' : '5 AS ai_daily_limit';
        $stmt = $db->prepare("SELECT {$selEnabled}, {$selLimit} FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$usersId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        $enabled = ((int) ($row['ai_enabled'] ?? 1)) === 1;
        $limit = (int) ($row['ai_daily_limit'] ?? 5);
        if ($limit < 0) {
            $limit = 0;
        }

        return ['enabled' => $enabled, 'daily_limit' => $limit];
    }

    /**
     * @return array{today: int, limit: int}
     */
    public static function aiDailyUsageForLoggedInUser(\PDO $db, int $usersId): array
    {
        $ai = self::getUserAiSettings($db, $usersId);
        $limit = max(0, (int) ($ai['daily_limit'] ?? 5));
        if (!self::aiTablesReady($db) || !self::columnExists($db, 'ai___chat', 'users_id')) {
            return ['today' => 0, 'limit' => $limit];
        }
        $bucket = AiChatDailyLimitService::bucketUserIdsForWebAi($db, $usersId);

        return [
            'today' => AiChatDailyLimitService::countTodayForUserIds($db, $bucket, true),
            'limit' => $limit,
        ];
    }

    public static function buildAiLimitMessage(): string
    {
        return 'Anda sudah mencapai limit akses ai eBeddien.';
    }

    /**
     * @param string $sessionId Utas web utama = 'ebeddien-main' (selaras GET /deepseek/chat-history tab Obrolan).
     */
    public static function persistAgentExchange(
        \PDO $db,
        int $usersId,
        string $userDisplayName,
        string $userEmail,
        string $prompt,
        string $aiReply,
        string $sessionId = 'ebeddien-main'
    ): void {
        if (!self::aiTablesReady($db) || !self::columnExists($db, 'ai___chat', 'users_id')) {
            return;
        }
        try {
            $ins = $db->prepare(
                'INSERT INTO ai___chat (users_id, user_message, ai_response, category, user_name, user_email, answer_type, session_id, model_used) '
                . 'VALUES (?, ?, ?, ?, ?, ?, \'AI\', ?, \'ebeddien_ai_agent\')'
            );
            $ins->execute([
                $usersId,
                $prompt,
                $aiReply,
                'Agen',
                $userDisplayName !== '' ? $userDisplayName : null,
                $userEmail !== '' ? $userEmail : null,
                $sessionId,
            ]);
        } catch (\Throwable $e) {
            error_log('AiAgentQuotaHelper::persistAgentExchange ' . $e->getMessage());
        }
    }
}
