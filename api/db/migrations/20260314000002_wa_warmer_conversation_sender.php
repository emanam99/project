<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Warmer: skrip percakapan terstruktur (1 json/txt = 1 urutan wa1/wa2).
 * conversation_id = satu skrip; sender = 1 (session_1) atau 2 (session_2).
 */
final class WaWarmerConversationSender extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET NAMES utf8mb4');
        $this->execute(<<<'SQL'
ALTER TABLE `whatsapp___warmer`
  ADD COLUMN `conversation_id` varchar(80) DEFAULT NULL COMMENT 'Satu skrip percakapan (banyak baris dengan id sama)' AFTER `language`,
  ADD COLUMN `sender` tinyint(1) unsigned DEFAULT NULL COMMENT '1=session_1 kirim, 2=session_2 kirim' AFTER `conversation_id`,
  ADD KEY `idx_conversation_order` (`conversation_id`,`sort_order`);
SQL
        );
    }

    public function down(): void
    {
        $this->execute('ALTER TABLE `whatsapp___warmer` DROP KEY `idx_conversation_order`, DROP COLUMN `sender`, DROP COLUMN `conversation_id`');
    }
}
