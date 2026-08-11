<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class ChatMessageAttachmentColumns extends AbstractMigration
{
    public function change(): void
    {
        $table = $this->table('chat');
        if (!$table->hasColumn('attachment_path')) {
            $table->addColumn('attachment_path', 'string', ['limit' => 255, 'null' => true, 'after' => 'message']);
        }
        if (!$table->hasColumn('attachment_name')) {
            $table->addColumn('attachment_name', 'string', ['limit' => 255, 'null' => true, 'after' => 'attachment_path']);
        }
        if (!$table->hasColumn('attachment_mime')) {
            $table->addColumn('attachment_mime', 'string', ['limit' => 100, 'null' => true, 'after' => 'attachment_name']);
        }
        if (!$table->hasColumn('attachment_size')) {
            $table->addColumn('attachment_size', 'integer', ['null' => true, 'after' => 'attachment_mime']);
        }
        $table->update();
    }
}

