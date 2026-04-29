<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class PemasukanAddLembagaColumn extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('pemasukan') || !$this->hasTable('lembaga')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        $hasColumnStmt = $conn->prepare("
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'pemasukan'
              AND COLUMN_NAME = 'lembaga'
            LIMIT 1
        ");
        $hasColumnStmt->execute();
        $hasLembagaColumn = (bool) $hasColumnStmt->fetch(\PDO::FETCH_ASSOC);

        if (!$hasLembagaColumn) {
            $this->execute("ALTER TABLE pemasukan ADD COLUMN lembaga VARCHAR(50) NULL AFTER kategori");
        }

        $hasIndexStmt = $conn->prepare("
            SELECT 1
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'pemasukan'
              AND INDEX_NAME = 'idx_pemasukan_lembaga'
            LIMIT 1
        ");
        $hasIndexStmt->execute();
        if (!$hasIndexStmt->fetch(\PDO::FETCH_ASSOC)) {
            $this->execute("ALTER TABLE pemasukan ADD INDEX idx_pemasukan_lembaga (lembaga)");
        }

        $hasFkStmt = $conn->prepare("
            SELECT 1
            FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'pemasukan'
              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
              AND CONSTRAINT_NAME = 'fk_pemasukan_lembaga'
            LIMIT 1
        ");
        $hasFkStmt->execute();
        if (!$hasFkStmt->fetch(\PDO::FETCH_ASSOC)) {
            $this->execute("
                ALTER TABLE pemasukan
                ADD CONSTRAINT fk_pemasukan_lembaga
                FOREIGN KEY (lembaga) REFERENCES lembaga (id)
                ON UPDATE CASCADE
                ON DELETE SET NULL
            ");
        }
    }

    public function down(): void
    {
        if (!$this->hasTable('pemasukan')) {
            return;
        }

        $conn = $this->getAdapter()->getConnection();

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $hasFkStmt = $conn->prepare("
            SELECT 1
            FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'pemasukan'
              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
              AND CONSTRAINT_NAME = 'fk_pemasukan_lembaga'
            LIMIT 1
        ");
        $hasFkStmt->execute();
        if ($hasFkStmt->fetch(\PDO::FETCH_ASSOC)) {
            $this->execute("ALTER TABLE pemasukan DROP FOREIGN KEY fk_pemasukan_lembaga");
        }

        $hasIndexStmt = $conn->prepare("
            SELECT 1
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'pemasukan'
              AND INDEX_NAME = 'idx_pemasukan_lembaga'
            LIMIT 1
        ");
        $hasIndexStmt->execute();
        if ($hasIndexStmt->fetch(\PDO::FETCH_ASSOC)) {
            $this->execute("ALTER TABLE pemasukan DROP INDEX idx_pemasukan_lembaga");
        }

        $hasColumnStmt = $conn->prepare("
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'pemasukan'
              AND COLUMN_NAME = 'lembaga'
            LIMIT 1
        ");
        $hasColumnStmt->execute();
        if ($hasColumnStmt->fetch(\PDO::FETCH_ASSOC)) {
            $this->execute("ALTER TABLE pemasukan DROP COLUMN lembaga");
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
