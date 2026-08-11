<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Rekonsiliasi balance_cached dari baris ledger (double-entry).
 */
class CashlessReconcileService
{
    private \PDO $db;

    public function __construct(\PDO $db)
    {
        $this->db = $db;
    }

    /**
     * @return array{success: bool, fixed: bool, account_id?: int, balance_before?: float, balance_after?: float, ledger_balance?: float}
     */
    public function reconcileAccount(int $accountId): array
    {
        $stmt = $this->db->prepare('SELECT id, type, balance_cached FROM cashless___accounts WHERE id = ? LIMIT 1');
        $stmt->execute([$accountId]);
        $account = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$account) {
            return ['success' => false, 'fixed' => false];
        }

        $ledgerBalance = $this->computeLedgerBalance((int) $account['id'], (string) $account['type']);
        $cached = round((float) $account['balance_cached'], 2);
        $ledgerBalance = round($ledgerBalance, 2);

        if (abs($cached - $ledgerBalance) < 0.01) {
            return [
                'success' => true,
                'fixed' => false,
                'account_id' => (int) $account['id'],
                'balance_before' => $cached,
                'balance_after' => $cached,
                'ledger_balance' => $ledgerBalance,
            ];
        }

        $upd = $this->db->prepare('UPDATE cashless___accounts SET balance_cached = ? WHERE id = ?');
        $upd->execute([$ledgerBalance, $accountId]);

        error_log(sprintf(
            'CashlessReconcileService: account #%d corrected %.2f -> %.2f',
            $accountId,
            $cached,
            $ledgerBalance
        ));

        return [
            'success' => true,
            'fixed' => true,
            'account_id' => (int) $account['id'],
            'balance_before' => $cached,
            'balance_after' => $ledgerBalance,
            'ledger_balance' => $ledgerBalance,
        ];
    }

    /**
     * @return array{success: bool, accounts_checked: int, accounts_fixed: int}
     */
    public function reconcileWalletAccounts(): array
    {
        $stmt = $this->db->query(
            "SELECT id FROM cashless___accounts WHERE entity_type IN ('SANTRI', 'PEDAGANG')"
        );
        $ids = $stmt ? ($stmt->fetchAll(\PDO::FETCH_COLUMN) ?: []) : [];
        $checked = 0;
        $fixed = 0;
        foreach ($ids as $id) {
            $checked++;
            $res = $this->reconcileAccount((int) $id);
            if ($res['fixed'] ?? false) {
                $fixed++;
            }
        }
        return ['success' => true, 'accounts_checked' => $checked, 'accounts_fixed' => $fixed];
    }

    private function computeLedgerBalance(int $accountId, string $accountType): float
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(SUM(debit), 0) AS total_debit, COALESCE(SUM(credit), 0) AS total_credit
             FROM cashless___ledger_entries WHERE account_id = ?'
        );
        $stmt->execute([$accountId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: ['total_debit' => 0, 'total_credit' => 0];
        $debit = (float) ($row['total_debit'] ?? 0);
        $credit = (float) ($row['total_credit'] ?? 0);
        if ($accountType === 'ASSET') {
            return $debit - $credit;
        }
        return $credit - $debit;
    }
}
