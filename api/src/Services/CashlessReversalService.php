<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Pembatalan jurnal (immutable audit trail — tidak menghapus, membuat REVERSAL).
 */
class CashlessReversalService
{
    private \PDO $db;

    private CashlessLedgerService $ledger;

    public function __construct(\PDO $db)
    {
        $this->db = $db;
        $this->ledger = new CashlessLedgerService($db);
    }

    /**
     * @return array{success: bool, message?: string, data?: array}
     */
    public function reverseJournal(int $journalId, ?int $actorUserId, ?string $reason = null): array
    {
        if ($journalId <= 0) {
            return ['success' => false, 'message' => 'ID jurnal tidak valid'];
        }

        $stmt = $this->db->prepare(
            'SELECT id, type, reference, description, meta, reversal_of_journal_id FROM cashless___journal WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$journalId]);
        $journal = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$journal) {
            return ['success' => false, 'message' => 'Jurnal tidak ditemukan'];
        }
        if (($journal['type'] ?? '') === 'REVERSAL') {
            return ['success' => false, 'message' => 'Jurnal reversal tidak bisa dibatalkan lagi'];
        }

        $chkRev = $this->db->prepare(
            'SELECT id FROM cashless___journal WHERE reversal_of_journal_id = ? AND type = ? LIMIT 1'
        );
        $chkRev->execute([$journalId, 'REVERSAL']);
        if ($chkRev->fetchColumn()) {
            return ['success' => false, 'message' => 'Jurnal ini sudah pernah dibatalkan'];
        }

        $stmtEntries = $this->db->prepare(
            'SELECT account_id, debit, credit FROM cashless___ledger_entries WHERE journal_id = ? ORDER BY id ASC'
        );
        $stmtEntries->execute([$journalId]);
        $entries = $stmtEntries->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        if ($entries === []) {
            return ['success' => false, 'message' => 'Jurnal tidak punya baris ledger'];
        }

        $reverseEntries = [];
        foreach ($entries as $e) {
            $reverseEntries[] = [
                'account_id' => (int) $e['account_id'],
                'debit' => (float) $e['credit'],
                'credit' => (float) $e['debit'],
            ];
        }

        $meta = [
            'reversal_of_journal_id' => $journalId,
            'reversal_reason' => $reason,
            'original_type' => $journal['type'] ?? null,
            'original_reference' => $journal['reference'] ?? null,
        ];
        $reference = 'REV-' . $journalId . '-' . date('YmdHis');
        $description = 'Reversal ' . ($journal['description'] ?? 'jurnal #' . $journalId);

        try {
            $this->db->beginTransaction();

            $posted = $this->ledger->postJournal(
                'REVERSAL',
                $reference,
                $description,
                $reverseEntries,
                $actorUserId,
                null,
                null,
                null,
                $meta
            );
            if (!($posted['success'] ?? false)) {
                $this->db->rollBack();
                return ['success' => false, 'message' => $posted['message'] ?? 'Gagal posting reversal'];
            }

            $reversalJournalId = (int) ($posted['journal_id'] ?? 0);
            if ($reversalJournalId > 0) {
                $upd = $this->db->prepare(
                    'UPDATE cashless___journal SET reversal_of_journal_id = ? WHERE id = ?'
                );
                $upd->execute([$journalId, $reversalJournalId]);
            }

            $this->db->commit();

            return [
                'success' => true,
                'message' => 'Jurnal berhasil dibatalkan',
                'data' => [
                    'reversal_journal_id' => $reversalJournalId,
                    'original_journal_id' => $journalId,
                ],
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log('CashlessReversalService::reverseJournal ' . $e->getMessage());
            return ['success' => false, 'message' => 'Gagal membatalkan jurnal'];
        }
    }
}
