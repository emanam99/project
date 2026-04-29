<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class DropGoogleCalendarTables extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');
        $this->execute('DROP TABLE IF EXISTS `google___user_oauth`');
        $this->execute('DROP TABLE IF EXISTS `google___calendar_config`');
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        // No-op: tabel Google Calendar sudah dipensiunkan permanen.
    }
}

