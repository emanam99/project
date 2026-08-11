<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/** Snooze pengingat email profil (eBeddien) — "jangan tampilkan lagi" selama 1 tahun. */
final class UsersEmailReminderSnooze extends AbstractMigration
{
    public function up(): void
    {
        if ($this->table('users')->hasColumn('email_reminder_snoozed_until')) {
            return;
        }
        $this->table('users')
            ->addColumn('email_reminder_snoozed_until', 'datetime', ['null' => true, 'after' => 'email_verified_at'])
            ->update();
    }

    public function down(): void
    {
        if ($this->table('users')->hasColumn('email_reminder_snoozed_until')) {
            $this->table('users')->removeColumn('email_reminder_snoozed_until')->update();
        }
    }
}
