<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class AppInstallActivityEventDimensions extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("ALTER TABLE `app___install_activity_event` ADD COLUMN `event_source` varchar(50) DEFAULT NULL AFTER `event_type`");
        $this->execute("ALTER TABLE `app___install_activity_event` ADD COLUMN `screen` varchar(100) DEFAULT NULL AFTER `event_source`");
        $this->execute("ALTER TABLE `app___install_activity_event` ADD COLUMN `app_version` varchar(50) DEFAULT NULL AFTER `screen`");
        $this->execute("ALTER TABLE `app___install_activity_event` ADD KEY `idx_event_source` (`event_source`)");
        $this->execute("ALTER TABLE `app___install_activity_event` ADD KEY `idx_event_app_version` (`app_version`)");
    }

    public function down(): void
    {
        $this->execute("ALTER TABLE `app___install_activity_event` DROP KEY `idx_event_source`");
        $this->execute("ALTER TABLE `app___install_activity_event` DROP KEY `idx_event_app_version`");
        $this->execute("ALTER TABLE `app___install_activity_event` DROP COLUMN `app_version`");
        $this->execute("ALTER TABLE `app___install_activity_event` DROP COLUMN `screen`");
        $this->execute("ALTER TABLE `app___install_activity_event` DROP COLUMN `event_source`");
    }
}
