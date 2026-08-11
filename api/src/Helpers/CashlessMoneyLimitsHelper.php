<?php

declare(strict_types=1);

namespace App\Helpers;

use PDO;

/**
 * Batas nominal / saldo wallet cashless + anti double-submit (idempotency).
 */
final class CashlessMoneyLimitsHelper
{
    public const DEFAULT_TOPUP_MAX = 10_000_000.0;
    public const DEFAULT_WITHDRAW_MAX = 10_000_000.0;
    public const DEFAULT_TRANSFER_MAX = 5_000_000.0;
    public const DEFAULT_WALLET_SALDO_MAX = 50_000_000.0;
    public const DEFAULT_TRANSFER_DAILY_MAX = 10_000_000.0;
    public const DEFAULT_DUPLICATE_WINDOW_SEC = 30;

    /**
     * @return array{
     *   topup_max_per_tx: float,
     *   withdraw_max_per_tx: float,
     *   transfer_max_per_tx: float,
     *   wallet_saldo_max: float,
     *   transfer_daily_max: float,
     *   duplicate_window_sec: int
     * }
     */
    public static function getLimits(PDO $db): array
    {
        $out = [
            'topup_max_per_tx' => self::DEFAULT_TOPUP_MAX,
            'withdraw_max_per_tx' => self::DEFAULT_WITHDRAW_MAX,
            'transfer_max_per_tx' => self::DEFAULT_TRANSFER_MAX,
            'wallet_saldo_max' => self::DEFAULT_WALLET_SALDO_MAX,
            'transfer_daily_max' => self::DEFAULT_TRANSFER_DAILY_MAX,
            'duplicate_window_sec' => self::DEFAULT_DUPLICATE_WINDOW_SEC,
        ];
        try {
            $stmt = $db->query(
                "SELECT kunci, nilai FROM cashless___config WHERE kunci IN (
                    'topup_max_per_tx','withdraw_max_per_tx','transfer_max_per_tx',
                    'wallet_saldo_max','transfer_daily_max','duplicate_window_sec'
                )"
            );
            if ($stmt === false) {
                return $out;
            }
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $k = (string) ($row['kunci'] ?? '');
                $v = (float) str_replace(',', '.', (string) ($row['nilai'] ?? '0'));
                if ($k === 'duplicate_window_sec') {
                    $out[$k] = max(5, (int) round($v));
                } elseif (array_key_exists($k, $out) && $v > 0) {
                    $out[$k] = $v;
                }
            }
        } catch (\Throwable $e) {
            // Config belum ada — pakai default aman.
        }

        return $out;
    }

    public static function formatRp(float $n): string
    {
        return 'Rp ' . number_format($n, 0, ',', '.');
    }

    /**
     * @return array{ok: bool, message?: string}
     */
    public static function assertPositiveNominal(float $nominal): array
    {
        if ($nominal <= 0) {
            return ['ok' => false, 'message' => 'Nominal harus lebih dari 0'];
        }
        if ($nominal > 999_999_999_999) {
            return ['ok' => false, 'message' => 'Nominal tidak valid'];
        }

        return ['ok' => true];
    }

    /**
     * @return array{ok: bool, message?: string}
     */
    public static function assertMaxPerTx(float $nominal, float $max, string $label): array
    {
        $base = self::assertPositiveNominal($nominal);
        if (!($base['ok'] ?? false)) {
            return $base;
        }
        if ($max > 0 && $nominal > $max + 0.0001) {
            return [
                'ok' => false,
                'message' => $label . ' maksimal ' . self::formatRp($max) . ' per transaksi',
            ];
        }

        return ['ok' => true];
    }

    /**
     * @return array{ok: bool, message?: string}
     */
    public static function assertWalletSaldoCap(float $balanceCached, float $creditNominal, float $saldoMax): array
    {
        if ($saldoMax <= 0) {
            return ['ok' => true];
        }
        $next = $balanceCached + $creditNominal;
        if ($next > $saldoMax + 0.0001) {
            return [
                'ok' => false,
                'message' => 'Saldo wallet akan melebihi batas maksimal '
                    . self::formatRp($saldoMax)
                    . ' (saldo sekarang ' . self::formatRp($balanceCached) . ')',
            ];
        }

        return ['ok' => true];
    }

    /**
     * Total TRANSFER keluar dari wallet sumber hari ini (timezone DB).
     */
    public static function sumTransferOutToday(PDO $db, int $sourceAccountId): float
    {
        if ($sourceAccountId <= 0) {
            return 0.0;
        }
        try {
            $stmt = $db->prepare(
                "SELECT COALESCE(SUM(le.debit), 0)
                 FROM cashless___journal j
                 INNER JOIN cashless___ledger_entries le
                   ON le.journal_id = j.id AND le.account_id = j.source_account_id
                 WHERE j.type = 'TRANSFER'
                   AND j.source_account_id = ?
                   AND j.created_at >= CURDATE()
                   AND j.created_at < CURDATE() + INTERVAL 1 DAY
                   AND (j.reversal_of_journal_id IS NULL)"
            );
            $stmt->execute([$sourceAccountId]);
            return (float) $stmt->fetchColumn();
        } catch (\Throwable $e) {
            // Kolom reversal mungkin belum ada di lingkungan lama
            try {
                $stmt = $db->prepare(
                    "SELECT COALESCE(SUM(le.debit), 0)
                     FROM cashless___journal j
                     INNER JOIN cashless___ledger_entries le
                       ON le.journal_id = j.id AND le.account_id = j.source_account_id
                     WHERE j.type = 'TRANSFER'
                       AND j.source_account_id = ?
                       AND j.created_at >= CURDATE()
                       AND j.created_at < CURDATE() + INTERVAL 1 DAY"
                );
                $stmt->execute([$sourceAccountId]);
                return (float) $stmt->fetchColumn();
            } catch (\Throwable $e2) {
                return 0.0;
            }
        }
    }

    /**
     * @return array{ok: bool, message?: string}
     */
    public static function assertTransferDaily(PDO $db, int $sourceAccountId, float $nominal, float $dailyMax): array
    {
        if ($dailyMax <= 0) {
            return ['ok' => true];
        }
        $used = self::sumTransferOutToday($db, $sourceAccountId);
        if ($used + $nominal > $dailyMax + 0.0001) {
            $sisa = max(0.0, $dailyMax - $used);
            return [
                'ok' => false,
                'message' => 'Limit transfer harian ' . self::formatRp($dailyMax)
                    . ' terlampaui. Sisa hari ini: ' . self::formatRp($sisa),
            ];
        }

        return ['ok' => true];
    }

    /**
     * Kunci idempotency dari client, atau fingerprint anti double-submit dalam jendela waktu.
     */
    public static function resolveIdempotencyKey(
        ?string $clientKey,
        string $operation,
        string $entityPart,
        float $nominal,
        ?int $actorUserId,
        int $windowSec
    ): string {
        $clientKey = $clientKey !== null ? trim($clientKey) : '';
        if ($clientKey !== '') {
            $safe = preg_replace('/[^a-zA-Z0-9_\-.:]/', '', $clientKey) ?? '';
            if (strlen($safe) >= 8 && strlen($safe) <= 64) {
                return substr($safe, 0, 64);
            }
        }
        $windowSec = max(5, $windowSec);
        $bucket = (int) floor(time() / $windowSec);
        $raw = strtoupper($operation) . '|' . $entityPart . '|' . number_format($nominal, 2, '.', '')
            . '|a' . (int) ($actorUserId ?? 0) . '|b' . $bucket;

        return substr(hash('sha256', $raw), 0, 64);
    }

    /**
     * Claim kunci; jika sudah ada → kembalikan respons tersimpan.
     *
     * @return array{claimed: bool, cached?: array{body: array, http: int}}
     */
    public static function claimIdempotency(PDO $db, string $key, string $operation, ?int $actorUserId): array
    {
        try {
            $ins = $db->prepare(
                'INSERT INTO cashless___idempotency (idempotency_key, operation, actor_user_id)
                 VALUES (?, ?, ?)'
            );
            $ins->execute([$key, $operation, $actorUserId]);

            return ['claimed' => true];
        } catch (\PDOException $e) {
            $code = $e->errorInfo[1] ?? 0;
            if ((int) $code !== 1062) {
                // Tabel belum ada / error lain — jangan blokir transaksi uang karena infrastruktur
                error_log('CashlessMoneyLimitsHelper::claimIdempotency ' . $e->getMessage());

                return ['claimed' => true, 'soft' => true];
            }
        }

        try {
            $stmt = $db->prepare(
                'SELECT response_json, http_status, journal_id FROM cashless___idempotency WHERE idempotency_key = ? LIMIT 1'
            );
            $stmt->execute([$key]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && $row['response_json'] !== null && $row['response_json'] !== '') {
                $decoded = json_decode((string) $row['response_json'], true);
                if (is_array($decoded)) {
                    return [
                        'claimed' => false,
                        'cached' => [
                            'body' => $decoded,
                            'http' => (int) ($row['http_status'] ?? 200),
                        ],
                    ];
                }
            }
        } catch (\Throwable $e) {
            error_log('CashlessMoneyLimitsHelper::claimIdempotency read ' . $e->getMessage());
        }

        return [
            'claimed' => false,
            'cached' => [
                'body' => [
                    'success' => false,
                    'message' => 'Transaksi identik sedang diproses atau baru saja berhasil. Hindari kirim ulang.',
                    'code' => 'duplicate_submit',
                ],
                'http' => 409,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $body
     */
    public static function completeIdempotency(
        PDO $db,
        string $key,
        array $body,
        int $httpStatus,
        ?int $journalId = null
    ): void {
        try {
            $json = json_encode($body, JSON_UNESCAPED_UNICODE);
            $stmt = $db->prepare(
                'UPDATE cashless___idempotency
                 SET response_json = ?, http_status = ?, journal_id = COALESCE(?, journal_id)
                 WHERE idempotency_key = ?'
            );
            $stmt->execute([$json, $httpStatus, $journalId, $key]);
        } catch (\Throwable $e) {
            error_log('CashlessMoneyLimitsHelper::completeIdempotency ' . $e->getMessage());
        }
    }
}
