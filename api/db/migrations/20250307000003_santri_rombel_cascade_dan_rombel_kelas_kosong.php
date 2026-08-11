<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * 1) Pastikan santri___rombel.id_rombel -> lembaga___rombel.id pakai ON DELETE CASCADE
 *    agar saat rombel dihapus, baris riwayat di santri___rombel ikut terhapus.
 * 2) Hapus rombel yang kelas-nya kosong (NULL atau string kosong setelah trim).
 */
final class SantriRombelCascadeDanRombelKelasKosong extends AbstractMigration
{
    public function up(): void
    {
        $conn = $this->getAdapter()->getConnection();

        if ($this->hasTable('santri___rombel') && $this->hasTable('lembaga___rombel')) {
            // 1) Cek FK id_rombel ke lembaga___rombel: pastikan ON DELETE CASCADE
            $stmt = $conn->query("
                SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE
                FROM information_schema.REFERENTIAL_CONSTRAINTS rc
                INNER JOIN information_schema.KEY_COLUMN_USAGE kcu
                  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
                WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
                  AND kcu.TABLE_NAME = 'santri___rombel'
                  AND kcu.COLUMN_NAME = 'id_rombel'
                  AND kcu.REFERENCED_TABLE_NAME = 'lembaga___rombel'
            ");
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            if ($row !== false) {
                $fkName = $row['CONSTRAINT_NAME'];
                if (($row['DELETE_RULE'] ?? '') !== 'CASCADE') {
                    $this->execute('ALTER TABLE santri___rombel DROP FOREIGN KEY `' . str_replace('`', '``', $fkName) . '`');
                    $this->execute('ALTER TABLE santri___rombel ADD CONSTRAINT fk_santri_rombel_id_rombel FOREIGN KEY (id_rombel) REFERENCES lembaga___rombel (id) ON DELETE CASCADE ON UPDATE CASCADE');
                }
            } else {
                try {
                    $this->execute('ALTER TABLE santri___rombel ADD CONSTRAINT fk_santri_rombel_id_rombel FOREIGN KEY (id_rombel) REFERENCES lembaga___rombel (id) ON DELETE CASCADE ON UPDATE CASCADE');
                } catch (\Throwable $e) {
                    // Constraint mungkin sudah ada, abaikan
                }
            }
        }

        // 2) Hapus rombel yang kelas-nya kosong (NULL atau trim = '')
        // CASCADE akan hapus baris santri___rombel; santri.id_diniyah/id_formal pakai ON DELETE SET NULL
        if ($this->hasTable('lembaga___rombel')) {
            $conn->exec("
                DELETE FROM lembaga___rombel
                WHERE (kelas IS NULL OR TRIM(COALESCE(kelas, '')) = '')
            ");
        }
    }

    public function down(): void
    {
        // Tidak mengembalikan data rombel yang sudah dihapus; hanya FK tetap CASCADE
        // down() tidak restore rombel kelas kosong
    }
}
