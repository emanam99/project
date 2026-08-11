<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Kolom dinamis aktor: satu kolom ID (actor_entity_id) + keterangan arah (actor_entity_type).
 * Bisa merujuk ke pengurus, santri, madrasah (atau entitas lain nanti) tanpa menambah kolom baru.
 * - actor_entity_type: 'pengurus' | 'santri' | 'madrasah' (keterangan ke mana arah aktor)
 * - actor_entity_id: id di tabel sesuai type (tanpa FK karena beda tabel)
 * Data lama: di-backfill dari pengurus_id / santri_id.
 */
final class UserAktivitasAddActorEntity extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("
            ALTER TABLE `user___aktivitas`
            ADD COLUMN `actor_entity_type` varchar(50) DEFAULT NULL COMMENT 'pengurus|santri|madrasah - keterangan arah aktor' AFTER `santri_id`,
            ADD COLUMN `actor_entity_id` int(11) unsigned DEFAULT NULL COMMENT 'id di tabel sesuai actor_entity_type' AFTER `actor_entity_type`,
            ADD KEY `idx_actor_entity` (`actor_entity_type`, `actor_entity_id`)
        ");

        // Backfill dari kolom lama
        $this->execute("
            UPDATE `user___aktivitas`
            SET actor_entity_type = 'pengurus', actor_entity_id = pengurus_id
            WHERE pengurus_id IS NOT NULL
        ");
        $this->execute("
            UPDATE `user___aktivitas`
            SET actor_entity_type = 'santri', actor_entity_id = santri_id
            WHERE santri_id IS NOT NULL
        ");
    }

    public function down(): void
    {
        $this->execute("
            ALTER TABLE `user___aktivitas`
            DROP KEY `idx_actor_entity`,
            DROP COLUMN `actor_entity_id`,
            DROP COLUMN `actor_entity_type`
        ");
    }
}
