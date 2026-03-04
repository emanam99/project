<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Pastikan FK lembaga___rombel.lembaga_id -> lembaga.id terpasang.
 * Di migrasi 00001 FK sudah ditambahkan; migrasi ini untuk DB yang belum punya FK
 * (mis. dump lama, atau gagal karena charset/collation tidak cocok).
 */
final class LembagaRombelLembagaFk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        if (!$this->hasTable('lembaga___rombel') || !$this->hasTable('lembaga')) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lembaga___rombel' AND CONSTRAINT_NAME = 'fk_rombel_lembaga'
        ");
        $stmt->execute();
        if ($stmt->fetch(\PDO::FETCH_ASSOC) !== false) {
            $this->execute('SET FOREIGN_KEY_CHECKS = 1');
            return;
        }

        // Samakan charset/collation kolom lembaga_id dengan lembaga.id
        $stmt = $conn->prepare("
            SELECT CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lembaga' AND COLUMN_NAME = 'id'
        ");
        $stmt->execute();
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        $charset = $row && !empty($row['CHARACTER_SET_NAME']) ? $row['CHARACTER_SET_NAME'] : 'utf8mb4';
        $collation = $row && !empty($row['COLLATION_NAME']) ? $row['COLLATION_NAME'] : 'utf8mb4_unicode_ci';

        $this->execute("
            ALTER TABLE lembaga___rombel
            MODIFY COLUMN lembaga_id VARCHAR(50) CHARACTER SET {$charset} COLLATE {$collation} NOT NULL
        ");

        $this->execute("
            ALTER TABLE lembaga___rombel
            ADD CONSTRAINT fk_rombel_lembaga
            FOREIGN KEY (lembaga_id) REFERENCES lembaga (id) ON DELETE CASCADE ON UPDATE CASCADE
        ");

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        if ($this->hasTable('lembaga___rombel')) {
            try {
                $this->execute('ALTER TABLE lembaga___rombel DROP FOREIGN KEY fk_rombel_lembaga');
            } catch (\Throwable $e) {}
        }
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
