<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Normalisasi kode akun cashless___accounts menjadi 7 digit:
 * - Yang lebih dari 7 digit (mis. 16 digit) atau kurang dari 7 digit (mis. 1000) diseragamkan jadi 7 digit.
 * - ASSET/SYSTEM (Kas) -> 1000001, INCOME/SYSTEM (Fee) -> 4000001, LIABILITY/SANTRI -> 2000001, 2000002, ..., LIABILITY/PEDAGANG -> 3000001, 3000002, ...
 */
final class CashlessAccountsNormalizeCode7digit extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $stmt = $conn->query("SELECT id, code, type, entity_type, entity_id FROM cashless___accounts ORDER BY type, entity_type, COALESCE(entity_id, 0), id");
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        if ($rows === []) {
            return;
        }

        $idToNewCode = [];
        $nextAsset = 1000001;
        $nextSantri = 2000001;
        $nextPedagang = 3000001;
        $nextIncome = 4000001;
        $nextExpense = 5000001;
        $nextEquity = 6000001;
        $nextOther = 1000002;

        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $type = trim((string) $row['type']);
            $entityType = trim((string) $row['entity_type']);

            if ($type === 'ASSET' && $entityType === 'SYSTEM') {
                $idToNewCode[$id] = (string) $nextAsset;
                $nextAsset = min($nextAsset + 1, 1999999);
                continue;
            }
            if ($type === 'INCOME' && $entityType === 'SYSTEM') {
                $idToNewCode[$id] = (string) $nextIncome;
                $nextIncome = min($nextIncome + 1, 4999999);
                continue;
            }
            if ($type === 'LIABILITY' && $entityType === 'SANTRI') {
                $idToNewCode[$id] = (string) $nextSantri;
                $nextSantri = min($nextSantri + 1, 2999999);
                continue;
            }
            if ($type === 'LIABILITY' && $entityType === 'PEDAGANG') {
                $idToNewCode[$id] = (string) $nextPedagang;
                $nextPedagang = min($nextPedagang + 1, 3999999);
                continue;
            }
            if ($type === 'EXPENSE' && $entityType === 'SYSTEM') {
                $idToNewCode[$id] = (string) $nextExpense;
                $nextExpense = min($nextExpense + 1, 5999999);
                continue;
            }
            if ($type === 'EQUITY' && $entityType === 'SYSTEM') {
                $idToNewCode[$id] = (string) $nextEquity;
                $nextEquity = min($nextEquity + 1, 6999999);
                continue;
            }
            // Fallback: akun lain (type/entity_type tidak standar) -> 1xxxxxx
            $idToNewCode[$id] = (string) $nextOther;
            $nextOther = min($nextOther + 1, 1999999);
        }

        // Hindari pelanggaran UNIQUE: ubah dulu semua kode ke nilai sementara
        $pre = '_norm7_' . time() . '_';
        $updateTemp = $conn->prepare('UPDATE cashless___accounts SET code = ? WHERE id = ?');
        foreach (array_keys($idToNewCode) as $id) {
            $updateTemp->execute([$pre . $id, $id]);
        }

        // Set kode akhir 7 digit
        $updateFinal = $conn->prepare('UPDATE cashless___accounts SET code = ? WHERE id = ?');
        foreach ($idToNewCode as $id => $code) {
            $updateFinal->execute([$code, $id]);
        }
    }

    public function down(): void
    {
        // Tidak bisa mengembalikan kode lama (tidak disimpan); rollback kosong
    }
}
