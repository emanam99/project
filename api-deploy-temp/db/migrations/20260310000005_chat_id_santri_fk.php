<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * chat.id_santri: ubah ke INT(11) NULL dan tambah FK ke santri.id
 */
final class ChatIdSantriFk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        $conn = $this->getAdapter()->getConnection();

        $tables = $conn->query("SHOW TABLES LIKE 'chat'")->fetchAll();
        if (empty($tables)) {
            return;
        }

        $tablesSantri = $conn->query("SHOW TABLES LIKE 'santri'")->fetchAll();
        if (empty($tablesSantri)) {
            return;
        }

        $col = $conn->query("SHOW COLUMNS FROM chat LIKE 'id_santri'")->fetch();
        if (!$col) {
            return;
        }

        $fkExists = $conn->query("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat'
            AND CONSTRAINT_NAME = 'fk_chat_id_santri'
        ")->fetch();
        if ($fkExists) {
            return;
        }

        $type = $col['Type'] ?? '';
        $isInt = (stripos($type, 'int') !== false);

        if (!$isInt) {
            $conn->exec("ALTER TABLE chat MODIFY COLUMN id_santri VARCHAR(20) NULL");
            $conn->exec("UPDATE chat SET id_santri = NULL WHERE id_santri = '' OR id_santri IS NULL OR id_santri NOT REGEXP '^[0-9]+$'");
            $conn->exec("ALTER TABLE chat MODIFY COLUMN id_santri INT(11) NULL COMMENT 'FK santri.id'");
        }

        // Kosongkan id_santri yang tidak ada di tabel santri agar FK tidak gagal
        $conn->exec("
            UPDATE chat c
            LEFT JOIN santri s ON s.id = c.id_santri
            SET c.id_santri = NULL
            WHERE c.id_santri IS NOT NULL AND s.id IS NULL
        ");

        $conn->exec("
            ALTER TABLE chat
            ADD CONSTRAINT fk_chat_id_santri
            FOREIGN KEY (id_santri) REFERENCES santri (id)
            ON DELETE SET NULL ON UPDATE CASCADE
        ");
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $fkExists = $conn->query("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat'
            AND CONSTRAINT_NAME = 'fk_chat_id_santri'
        ")->fetch();
        if ($fkExists) {
            $conn->exec('ALTER TABLE chat DROP FOREIGN KEY fk_chat_id_santri');
        }

        $col = $conn->query("SHOW COLUMNS FROM chat LIKE 'id_santri'")->fetch();
        if ($col) {
            $type = $col['Type'] ?? '';
            if (stripos($type, 'int') !== false) {
                $conn->exec('ALTER TABLE chat MODIFY COLUMN id_santri VARCHAR(20) NULL');
            }
        }
    }
}
