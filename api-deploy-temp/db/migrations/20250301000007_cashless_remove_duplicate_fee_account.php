<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Hapus akun duplikat "Pendapatan Fee Cashless" dengan kode 1000002.
 * Yang benar adalah 4000001 (tipe INCOME). Kode 1xxxxxx = ASSET, jadi 1000002 salah tipe dan duplikat.
 */
final class CashlessRemoveDuplicateFeeAccount extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $stmt = $conn->prepare("SELECT id, code, name, type FROM cashless___accounts WHERE code = '1000002' AND (name LIKE '%Pendapatan Fee%' OR name LIKE '%Fee Cashless%') LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);

        if ($row) {
            $id = (int) $row['id'];
            $conn->prepare('DELETE FROM cashless___accounts WHERE id = ?')->execute([$id]);
        }
    }

    public function down(): void
    {
        // Tidak mengembalikan baris yang dihapus
    }
}
