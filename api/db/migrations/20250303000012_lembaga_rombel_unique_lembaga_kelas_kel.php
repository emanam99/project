<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * UNIQUE(lembaga_id, kelas, kel) pada lembaga___rombel agar kombinasi tidak ganda.
 * - Normalisasi: kelas/kel NULL diisi '' agar UNIQUE konsisten.
 * - Merge duplikat: satu row per (lembaga_id, kelas, kel), referensi dialihkan ke id yang dipertahankan.
 */
final class LembagaRombelUniqueLembagaKelasKel extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('lembaga___rombel')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        // 1) Normalisasi: NULL -> '' agar UNIQUE memperlakukan kosong sama
        $conn->exec("UPDATE lembaga___rombel SET kelas = '' WHERE kelas IS NULL");
        $conn->exec("UPDATE lembaga___rombel SET kel = '' WHERE kel IS NULL");

        // 2) Merge duplikat: untuk setiap (lembaga_id, kelas, kel) pertahankan row dengan id terkecil
        $rows = $conn->query("
            SELECT lembaga_id, kelas, kel, MIN(id) AS keep_id
            FROM lembaga___rombel
            GROUP BY lembaga_id, kelas, kel
            HAVING COUNT(*) > 1
        ")->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($rows as $group) {
            $keepId = (int) $group['keep_id'];
            $lembagaId = $conn->quote($group['lembaga_id']);
            $kelas = $conn->quote($group['kelas']);
            $kel = $conn->quote($group['kel']);

            // Semua id rombel dengan kombinasi ini selain keep_id
            $dupIds = $conn->query("
                SELECT id FROM lembaga___rombel
                WHERE lembaga_id = $lembagaId AND kelas = $kelas AND kel = $kel AND id <> $keepId
            ")->fetchAll(\PDO::FETCH_COLUMN);

            foreach ($dupIds as $dupId) {
                $dupId = (int) $dupId;
                if ($this->hasTable('lembaga___wali_kelas')) {
                    $conn->prepare("UPDATE lembaga___wali_kelas SET id_kelas = ? WHERE id_kelas = ?")
                        ->execute([$keepId, $dupId]);
                }
                if ($this->hasTable('santri___rombel')) {
                    $conn->prepare("UPDATE santri___rombel SET id_rombel = ? WHERE id_rombel = ?")
                        ->execute([$keepId, $dupId]);
                }
                if ($this->hasTable('santri')) {
                    $stmt = $conn->prepare("UPDATE santri SET id_diniyah = ? WHERE id_diniyah = ?");
                    $stmt->execute([$keepId, $dupId]);
                    $stmt = $conn->prepare("UPDATE santri SET id_formal = ? WHERE id_formal = ?");
                    $stmt->execute([$keepId, $dupId]);
                }
                $conn->prepare("DELETE FROM lembaga___rombel WHERE id = ?")->execute([$dupId]);
            }
        }

        // 3) Tambah UNIQUE(lembaga_id, kelas, kel)
        $stmt = $conn->query("
            SELECT 1 FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lembaga___rombel'
            AND INDEX_NAME = 'uq_rombel_lembaga_kelas_kel'
        ");
        if ($stmt->fetch(\PDO::FETCH_ASSOC) === false) {
            $this->table('lembaga___rombel')
                ->addIndex(['lembaga_id', 'kelas', 'kel'], ['unique' => true, 'name' => 'uq_rombel_lembaga_kelas_kel'])
                ->update();
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('lembaga___rombel')) {
            return;
        }
        $this->execute('ALTER TABLE lembaga___rombel DROP INDEX uq_rombel_lembaga_kelas_kel');
    }
}
