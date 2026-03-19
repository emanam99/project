<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * chat.id_pengurus: tambah FK ke pengurus.id (ON DELETE SET NULL).
 */
final class ChatIdPengurusFk extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');

        $conn = $this->getAdapter()->getConnection();

        $tables = $conn->query("SHOW TABLES LIKE 'chat'")->fetchAll();
        if (empty($tables)) {
            return;
        }
        $tablesPengurus = $conn->query("SHOW TABLES LIKE 'pengurus'")->fetchAll();
        if (empty($tablesPengurus)) {
            return;
        }

        $fkExists = $conn->query("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat'
            AND CONSTRAINT_NAME = 'fk_chat_id_pengurus'
        ")->fetch();
        if ($fkExists) {
            return;
        }

        $col = $conn->query("SHOW COLUMNS FROM chat LIKE 'id_pengurus'")->fetch();
        if (!$col) {
            return;
        }

        $conn->exec("
            UPDATE chat c
            LEFT JOIN pengurus p ON p.id = c.id_pengurus
            SET c.id_pengurus = NULL
            WHERE c.id_pengurus IS NOT NULL AND p.id IS NULL
        ");

        $conn->exec("
            ALTER TABLE chat
            ADD CONSTRAINT fk_chat_id_pengurus
            FOREIGN KEY (id_pengurus) REFERENCES pengurus (id)
            ON DELETE SET NULL ON UPDATE CASCADE
        ");
    }

    public function down(): void
    {
        $conn = $this->getAdapter()->getConnection();

        $fkExists = $conn->query("
            SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat'
            AND CONSTRAINT_NAME = 'fk_chat_id_pengurus'
        ")->fetch();
        if ($fkExists) {
            $conn->exec('ALTER TABLE chat DROP FOREIGN KEY fk_chat_id_pengurus');
        }
    }
}
