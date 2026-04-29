<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class RemoveGoogleCalendarGroupFeature extends AbstractMigration
{
    public function up(): void
    {
        $this->execute("DELETE FROM app___fitur WHERE path IN ('/kalender-pesantren', '/kalender-pesantren/kelola-event', '/kalender-pesantren/pengaturan')");
        $this->execute("DELETE FROM ebeddien_fitur_selector WHERE selector_key = 'kalenderGoogleStaffSelectors'");
        $this->execute("DELETE FROM ebeddien_legacy_route_role WHERE legacy_key = 'kalenderGoogleStaffSelectors'");
    }

    public function down(): void
    {
        // No-op: rollback tidak mengembalikan fitur Google Calendar yang sudah dipensiunkan.
    }
}

