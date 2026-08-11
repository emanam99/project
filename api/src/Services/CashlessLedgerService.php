<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Posting double-entry ke cashless___journal + cashless___ledger_entries.
 * Satu pintu untuk menjaga debit = kredit dan pembaruan balance_cached.
 */
class CashlessLedgerService
{
    private \PDO $db;

    public function __construct(\PDO $db)
    {
        $this->db = $db;
    }

    /**
     * @param list<array{account_id: int, debit: float, credit: float}> $entries
     * @return array{success: bool, message?: string, journal_id?: int}
     */
    public function postJournal(
        string $type,
        string $reference,
        string $description,
        array $entries,
        ?int $actorUserId,
        ?int $sourceAccountId,
        ?int $destAccountId,
        ?string $channel,
        ?array $meta = null
    ): array {
        if ($entries === []) {
            return ['success' => false, 'message' => 'Entri ledger kosong'];
        }

        $totalDebit = 0.0;
        $totalCredit = 0.0;
        foreach ($entries as $row) {
            $debit = round((float) ($row['debit'] ?? 0), 2);
            $credit = round((float) ($row['credit'] ?? 0), 2);
            if ($debit < 0 || $credit < 0) {
                return ['success' => false, 'message' => 'Debit/kredit tidak boleh negatif'];
            }
            if ($debit > 0 && $credit > 0) {
                return ['success' => false, 'message' => 'Satu baris ledger hanya debit atau kredit'];
            }
            if ($debit === 0.0 && $credit === 0.0) {
                return ['success' => false, 'message' => 'Entri ledger nominal nol'];
            }
            $totalDebit += $debit;
            $totalCredit += $credit;
        }

        if (abs($totalDebit - $totalCredit) > 0.001) {
            return ['success' => false, 'message' => 'Jurnal tidak seimbang (debit ≠ kredit)'];
        }

        $accountIds = array_unique(array_map(static fn (array $r): int => (int) $r['account_id'], $entries));
        $accounts = $this->fetchAccountsByIds($accountIds);
        if (count($accounts) !== count($accountIds)) {
            return ['success' => false, 'message' => 'Akun ledger tidak ditemukan'];
        }

        $metaJson = $meta !== null ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null;

        try {
            $insJournal = $this->db->prepare(
                'INSERT INTO cashless___journal
                    (type, reference, description, meta, created_by, actor_user_id, source_account_id, dest_account_id, channel)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insJournal->execute([
                $type,
                $reference,
                $description,
                $metaJson,
                $actorUserId,
                $actorUserId,
                $sourceAccountId,
                $destAccountId,
                $channel,
            ]);
            $journalId = (int) $this->db->lastInsertId();

            $insLedger = $this->db->prepare(
                'INSERT INTO cashless___ledger_entries (journal_id, account_id, debit, credit) VALUES (?, ?, ?, ?)'
            );

            foreach ($entries as $row) {
                $accountId = (int) $row['account_id'];
                $debit = round((float) ($row['debit'] ?? 0), 2);
                $credit = round((float) ($row['credit'] ?? 0), 2);
                $insLedger->execute([$journalId, $accountId, $debit, $credit]);
                $this->applyBalanceDelta($accounts[$accountId], $debit, $credit);
            }

            return ['success' => true, 'journal_id' => $journalId];
        } catch (\Throwable $e) {
            error_log('CashlessLedgerService::postJournal ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal posting jurnal'];
        }
    }

    /**
     * @param list<int> $ids
     * @return array<int, array{id: int, type: string, balance_cached: float}>
     */
    public function fetchAccountsByIds(array $ids): array
    {
        $ids = array_values(array_filter(array_unique(array_map('intval', $ids)), static fn (int $id): bool => $id > 0));
        if ($ids === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $this->db->prepare("SELECT id, type, balance_cached FROM cashless___accounts WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        $map = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [] as $row) {
            $map[(int) $row['id']] = [
                'id' => (int) $row['id'],
                'type' => (string) $row['type'],
                'balance_cached' => (float) $row['balance_cached'],
            ];
        }
        return $map;
    }

    public function getAccountById(int $accountId): ?array
    {
        $map = $this->fetchAccountsByIds([$accountId]);
        return $map[$accountId] ?? null;
    }

    /**
     * ASSET: debit menambah saldo. LIABILITY: kredit menambah saldo (utang ke pemegang wallet).
     */
    private function applyBalanceDelta(array $account, float $debit, float $credit): void
    {
        $delta = 0.0;
        if ($account['type'] === 'ASSET') {
            $delta = $debit - $credit;
        } elseif ($account['type'] === 'LIABILITY') {
            $delta = $credit - $debit;
        }
        if (abs($delta) < 0.0001) {
            return;
        }
        $stmt = $this->db->prepare('UPDATE cashless___accounts SET balance_cached = balance_cached + ? WHERE id = ?');
        $stmt->execute([$delta, (int) $account['id']]);
    }
}
