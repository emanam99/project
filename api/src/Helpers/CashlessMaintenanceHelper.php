<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Mode pemeliharaan cashless — blokir semua scan kartu (buku tamu, validasi cetak, transaksi).
 */
class CashlessMaintenanceHelper
{
    public const BLOCK_MESSAGE = 'Sedang pemeliharaan server. Scan kartu cashless sementara tidak tersedia.';

    /** @var list<int> */
    public const ALLOWED_DURATIONS_MINUTES = [5, 10, 30, 60, 1440];

    private const KEY_ACTIVE = 'maintenance_active';
    private const KEY_UNTIL = 'maintenance_until';
    private const KEY_STARTED = 'maintenance_started_at';

    /**
     * @return array{active: bool, until: ?string, until_ts: ?int, started_at: ?string, indefinite: bool, remaining_seconds: ?int, message: string}
     */
    public static function getSnapshot(?PDO $db = null): array
    {
        $db = $db ?? \App\Database::getInstance()->getConnection();
        self::maybeAutoExpire($db);

        $active = self::readActive($db);
        $untilRaw = self::readConfig($db, self::KEY_UNTIL);
        $startedRaw = self::readConfig($db, self::KEY_STARTED);
        $untilTs = $untilRaw !== '' && is_numeric($untilRaw) ? (int) $untilRaw : null;
        $startedTs = $startedRaw !== '' && is_numeric($startedRaw) ? (int) $startedRaw : null;
        $now = time();

        return [
            'active' => $active,
            'until' => $untilTs !== null ? date('Y-m-d H:i:s', $untilTs) : null,
            'until_ts' => $untilTs,
            'started_at' => $startedTs !== null ? date('Y-m-d H:i:s', $startedTs) : null,
            'indefinite' => $active && $untilTs === null,
            'remaining_seconds' => $active && $untilTs !== null ? max(0, $untilTs - $now) : null,
            'message' => self::BLOCK_MESSAGE,
        ];
    }

    public static function isBlockingScans(?PDO $db = null): bool
    {
        $db = $db ?? \App\Database::getInstance()->getConnection();
        self::maybeAutoExpire($db);

        return self::readActive($db);
    }

    /**
     * @return array{code: string, message: string}|null
     */
    public static function scanBlockPayload(?PDO $db = null): ?array
    {
        if (!self::isBlockingScans($db)) {
            return null;
        }

        return [
            'code' => 'maintenance',
            'message' => self::BLOCK_MESSAGE,
        ];
    }

    /**
     * @return array{active: bool, until: ?string, until_ts: ?int, started_at: ?string, indefinite: bool, remaining_seconds: ?int, message: string}
     */
    public static function start(?int $durationMinutes, ?PDO $db = null): array
    {
        $db = $db ?? \App\Database::getInstance()->getConnection();
        $now = time();
        $untilTs = null;
        if ($durationMinutes !== null) {
            if (!in_array($durationMinutes, self::ALLOWED_DURATIONS_MINUTES, true)) {
                throw new \InvalidArgumentException('Durasi pemeliharaan tidak valid');
            }
            $untilTs = $now + ($durationMinutes * 60);
        }

        self::writeConfig($db, self::KEY_ACTIVE, '1');
        self::writeConfig($db, self::KEY_UNTIL, $untilTs !== null ? (string) $untilTs : '');
        self::writeConfig($db, self::KEY_STARTED, (string) $now);

        return self::getSnapshot($db);
    }

    public static function stop(?PDO $db = null): void
    {
        $db = $db ?? \App\Database::getInstance()->getConnection();
        self::writeConfig($db, self::KEY_ACTIVE, '0');
        self::writeConfig($db, self::KEY_UNTIL, '');
        self::writeConfig($db, self::KEY_STARTED, '');
    }

    private static function maybeAutoExpire(PDO $db): void
    {
        if (!self::readActive($db)) {
            return;
        }
        $untilRaw = self::readConfig($db, self::KEY_UNTIL);
        if ($untilRaw === '' || !is_numeric($untilRaw)) {
            return;
        }
        if ((int) $untilRaw <= time()) {
            self::stop($db);
        }
    }

    private static function readActive(PDO $db): bool
    {
        return self::readConfig($db, self::KEY_ACTIVE) === '1';
    }

    private static function readConfig(PDO $db, string $key): string
    {
        try {
            $stmt = $db->prepare('SELECT nilai FROM cashless___config WHERE kunci = ? LIMIT 1');
            $stmt->execute([$key]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && isset($row['nilai'])) {
                return trim((string) $row['nilai']);
            }
        } catch (\Throwable $e) {
            // tabel belum ada
        }

        return '';
    }

    private static function writeConfig(PDO $db, string $key, string $value): void
    {
        $db->prepare('INSERT INTO cashless___config (kunci, nilai) VALUES (?, ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)')
            ->execute([$key, $value]);
    }
}
