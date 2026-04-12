<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Limit harian chat AI: satu ember per nomor WA (semua baris users dengan no_wa sama),
 * agar pemakaian web (JWT) dan WhatsApp terhitung bersama.
 */
final class AiChatDailyLimitService
{
    public static function resolveAiChatDateColumn(\PDO $db): ?string
    {
        try {
            $st = $db->prepare(
                'SELECT COLUMN_NAME FROM information_schema.COLUMNS '
                . 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (\'created_at\',\'timestamp\') '
                . 'ORDER BY FIELD(COLUMN_NAME, \'created_at\',\'timestamp\') LIMIT 1'
            );
            $st->execute(['ai___chat']);
            $name = $st->fetchColumn();
            if (is_string($name) && $name !== '') {
                return $name;
            }
        } catch (\Throwable $e) {
            return null;
        }

        return null;
    }

    /**
     * @param array<int> $userIds
     * @param bool $excludeInstansiGuestWa true = jangan hitung baris session_id wa-guest-* (log WA pengunjung lewat users_id kuota instansi)
     */
    public static function countTodayForUserIds(\PDO $db, array $userIds, bool $excludeInstansiGuestWa = false): int
    {
        $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds), static fn (int $x): bool => $x > 0)));
        if ($userIds === []) {
            return 0;
        }
        $col = self::resolveAiChatDateColumn($db);
        if ($col === null) {
            return 0;
        }
        $q = '`' . str_replace('`', '``', $col) . '`';
        $ph = implode(',', array_fill(0, count($userIds), '?'));
        $guestEx = $excludeInstansiGuestWa ? ' AND (session_id IS NULL OR session_id NOT LIKE \'wa-guest-%\')' : '';
        try {
            $stmt = $db->prepare("SELECT COUNT(*) FROM ai___chat WHERE users_id IN ($ph) AND {$q} >= CURDATE(){$guestEx}");
            $stmt->execute($userIds);

            return (int) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /** Untuk sesi terpisah (mis. pengunjung WA per-JID) agar limit tidak tercampur utas lain di akun kuota. */
    public static function countTodayForUserAndSession(\PDO $db, int $usersId, string $sessionId): int
    {
        if ($usersId < 1 || trim($sessionId) === '') {
            return 0;
        }
        $col = self::resolveAiChatDateColumn($db);
        if ($col === null) {
            return 0;
        }
        $q = '`' . str_replace('`', '``', $col) . '`';
        try {
            $stmt = $db->prepare(
                "SELECT COUNT(*) FROM ai___chat WHERE users_id = ? AND session_id = ? AND {$q} >= CURDATE()"
            );
            $stmt->execute([$usersId, $sessionId]);

            return (int) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /**
     * Semua users.id yang punya no_wa ternormalisasi sama (62…).
     *
     * @return array<int>
     */
    public static function collectUserIdsByCanonicalWaDigits(\PDO $db, string $digits): array
    {
        if (strlen($digits) < 10) {
            return [];
        }
        $last10 = substr($digits, -10);
        try {
            $stmt = $db->prepare(
                'SELECT id, no_wa FROM users WHERE no_wa IS NOT NULL AND TRIM(no_wa) != \'\' '
                . 'AND (no_wa LIKE ? OR no_wa LIKE ?)'
            );
            $stmt->execute(['%' . $digits . '%', '%' . $last10 . '%']);
            $ids = [];
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $n = WhatsAppService::formatPhoneNumber((string) ($row['no_wa'] ?? ''));
                if ($n === $digits) {
                    $ids[] = (int) $row['id'];
                }
            }

            return array_values(array_unique($ids));
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Ember untuk pengguna web terautentikasi: semua users.id dengan nomor WA sama dengan baris login.
     *
     * @return array<int>
     */
    public static function bucketUserIdsForWebAi(\PDO $db, int $usersId): array
    {
        if ($usersId < 1) {
            return [];
        }
        try {
            $stmt = $db->prepare('SELECT TRIM(no_wa) AS no_wa FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];
            $nw = trim((string) ($row['no_wa'] ?? ''));
            if ($nw === '') {
                return [$usersId];
            }
            $digits = WhatsAppService::formatPhoneNumber($nw);
            if (strlen($digits) < 10) {
                return [$usersId];
            }
            $ids = self::collectUserIdsByCanonicalWaDigits($db, $digits);
            if ($ids === []) {
                return [$usersId];
            }
            if (!in_array($usersId, $ids, true)) {
                $ids[] = $usersId;
            }

            return array_values(array_unique($ids));
        } catch (\Throwable $e) {
            return [$usersId];
        }
    }

    /**
     * Limit harian dari baris users.id ini (profil / super admin).
     * Pemakaian (COUNT) tetap dihitung per ember nomor WA; batas angka mengikuti akun yang dipakai.
     */
    public static function dailyLimitForUser(\PDO $db, int $usersId): int
    {
        if ($usersId < 1) {
            return 5;
        }
        try {
            $stmt = $db->prepare('SELECT COALESCE(ai_daily_limit, 5) AS lim FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$usersId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if (!$row) {
                return 5;
            }

            return max(0, (int) ($row['lim'] ?? 5));
        } catch (\Throwable $e) {
            return 5;
        }
    }
}
