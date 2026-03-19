<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tambah kolom info device di user___sessions: device_id (UUID unik per perangkat),
 * platform, timezone, language, screen untuk info login lebih lengkap.
 */
final class UserSessionsDeviceInfo extends AbstractMigration
{
    private function hasColumn(string $tableName, string $columnName): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 AS ok FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1
        ");
        $stmt->execute([$tableName, $columnName]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row !== false && !empty($row);
    }

    public function up(): void
    {
        if (!$this->hasColumn('user___sessions', 'device_id')) {
            $this->execute("ALTER TABLE user___sessions ADD COLUMN device_id VARCHAR(36) NULL AFTER device_fingerprint");
            $this->execute("CREATE INDEX idx_device_id ON user___sessions (device_id)");
        }
        if (!$this->hasColumn('user___sessions', 'platform')) {
            $this->execute("ALTER TABLE user___sessions ADD COLUMN platform VARCHAR(50) NULL AFTER device_id");
        }
        if (!$this->hasColumn('user___sessions', 'timezone')) {
            $this->execute("ALTER TABLE user___sessions ADD COLUMN timezone VARCHAR(100) NULL AFTER platform");
        }
        if (!$this->hasColumn('user___sessions', 'language')) {
            $this->execute("ALTER TABLE user___sessions ADD COLUMN language VARCHAR(20) NULL AFTER timezone");
        }
        if (!$this->hasColumn('user___sessions', 'screen')) {
            $this->execute("ALTER TABLE user___sessions ADD COLUMN screen VARCHAR(50) NULL AFTER language");
        }
    }

    public function down(): void
    {
        if ($this->hasColumn('user___sessions', 'screen')) {
            $this->execute("ALTER TABLE user___sessions DROP COLUMN screen");
        }
        if ($this->hasColumn('user___sessions', 'language')) {
            $this->execute("ALTER TABLE user___sessions DROP COLUMN language");
        }
        if ($this->hasColumn('user___sessions', 'timezone')) {
            $this->execute("ALTER TABLE user___sessions DROP COLUMN timezone");
        }
        if ($this->hasColumn('user___sessions', 'platform')) {
            $this->execute("ALTER TABLE user___sessions DROP COLUMN platform");
        }
        if ($this->hasColumn('user___sessions', 'device_id')) {
            $this->execute("ALTER TABLE user___sessions DROP INDEX idx_device_id");
            $this->execute("ALTER TABLE user___sessions DROP COLUMN device_id");
        }
    }
}
