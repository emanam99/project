<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Simpan wa_message_id (dan nomor_tujuan untuk password reset) agar pesan WA link
 * bisa diedit otomatis jadi "> Token sudah kadaluarsa" / "> Token sudah dipakai".
 */
final class TokenWaMessageIdForEdit extends AbstractMigration
{
    private function hasColumn(string $table, string $column): bool
    {
        $conn = $this->getAdapter()->getConnection();
        $stmt = $conn->prepare("
            SELECT 1 FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        ");
        $stmt->execute([$table, $column]);
        return $stmt->fetch(\PDO::FETCH_ASSOC) !== false;
    }

    public function up(): void
    {
        if (!$this->hasColumn('user___password_reset_tokens', 'wa_message_id')) {
            $this->execute("ALTER TABLE user___password_reset_tokens ADD COLUMN wa_message_id VARCHAR(100) NULL DEFAULT NULL COMMENT 'ID pesan WA untuk edit jadi token kadaluarsa/dipakai' AFTER used_at");
        }
        if (!$this->hasColumn('user___password_reset_tokens', 'nomor_tujuan')) {
            $this->execute("ALTER TABLE user___password_reset_tokens ADD COLUMN nomor_tujuan VARCHAR(20) NULL DEFAULT NULL COMMENT 'Nomor WA penerima link (62xxx)' AFTER wa_message_id");
        }
        if (!$this->hasColumn('user___setup_tokens', 'wa_message_id')) {
            $this->execute("ALTER TABLE user___setup_tokens ADD COLUMN wa_message_id VARCHAR(100) NULL DEFAULT NULL COMMENT 'ID pesan WA untuk edit jadi token kadaluarsa/dipakai' AFTER no_wa");
        }
    }

    public function down(): void
    {
        if ($this->hasColumn('user___password_reset_tokens', 'nomor_tujuan')) {
            $this->execute('ALTER TABLE user___password_reset_tokens DROP COLUMN nomor_tujuan');
        }
        if ($this->hasColumn('user___password_reset_tokens', 'wa_message_id')) {
            $this->execute('ALTER TABLE user___password_reset_tokens DROP COLUMN wa_message_id');
        }
        if ($this->hasColumn('user___setup_tokens', 'wa_message_id')) {
            $this->execute('ALTER TABLE user___setup_tokens DROP COLUMN wa_message_id');
        }
    }
}
