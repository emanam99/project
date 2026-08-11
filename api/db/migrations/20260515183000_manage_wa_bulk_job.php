<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Antrian kirim WA massal dari Manage Data (UWABA/Khusus/Tunggakan) — diproses worker CLI + broadcast Socket.IO.
 */
final class ManageWaBulkJob extends AbstractMigration
{
    public function change(): void
    {
        $this->table('manage_wa_bulk_job')
            ->addColumn('page', 'string', ['limit' => 20, 'null' => false, 'comment' => 'uwaba|khusus|tunggakan'])
            ->addColumn('status', 'string', ['limit' => 20, 'null' => false, 'default' => 'queued'])
            ->addColumn('message_text', 'text', ['null' => false])
            ->addColumn('wa_instance', 'string', ['limit' => 40, 'null' => true])
            ->addColumn('users_id_created', 'integer', ['null' => true])
            ->addColumn('id_pengurus_created', 'integer', ['null' => true])
            ->addColumn('total_items', 'integer', ['null' => false, 'default' => 0])
            ->addColumn('sent_ok', 'integer', ['null' => false, 'default' => 0])
            ->addColumn('sent_fail', 'integer', ['null' => false, 'default' => 0])
            ->addColumn('cancel_requested', 'boolean', ['null' => false, 'default' => false])
            ->addColumn('last_error', 'string', ['limit' => 500, 'null' => true])
            ->addColumn('current_item_label', 'string', ['limit' => 255, 'null' => true])
            ->addColumn('created_at', 'timestamp', ['null' => false, 'default' => 'CURRENT_TIMESTAMP'])
            ->addColumn('updated_at', 'timestamp', ['null' => false, 'default' => 'CURRENT_TIMESTAMP', 'update' => 'CURRENT_TIMESTAMP'])
            ->addIndex(['status'])
            ->addIndex(['page', 'status'])
            ->create();

        $this->table('manage_wa_bulk_item')
            ->addColumn('job_id', 'integer', ['null' => false])
            ->addColumn('sort_order', 'integer', ['null' => false, 'default' => 0])
            ->addColumn('id_santri', 'integer', ['null' => false])
            ->addColumn('nis', 'integer', ['null' => true])
            ->addColumn('nama', 'string', ['limit' => 255, 'null' => true])
            ->addColumn('recipient_kind', 'string', ['limit' => 20, 'null' => false, 'default' => 'santri_primary'])
            ->addColumn('nomor_tujuan', 'string', ['limit' => 24, 'null' => false])
            ->addColumn('status', 'string', ['limit' => 20, 'null' => false, 'default' => 'pending'])
            ->addColumn('error_detail', 'string', ['limit' => 500, 'null' => true])
            ->addColumn('created_at', 'timestamp', ['null' => false, 'default' => 'CURRENT_TIMESTAMP'])
            ->addColumn('updated_at', 'timestamp', ['null' => false, 'default' => 'CURRENT_TIMESTAMP', 'update' => 'CURRENT_TIMESTAMP'])
            ->addForeignKey('job_id', 'manage_wa_bulk_job', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
            ->addForeignKey('id_santri', 'santri', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
            ->addIndex(['job_id', 'status'])
            ->addIndex(['job_id', 'sort_order'])
            ->create();
    }
}
