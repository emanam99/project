<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Idempotent: pastikan user___setup_tokens memakai entity_type + entity_id (bukan hanya id_pengurus).
 * Staging/production yang belum menjalankan migrasi unified akan error INSERT daftar-konfirmasi (500).
 */
final class EnsureUserSetupTokensEntityColumns extends AbstractMigration
{
    public function up(): void
    {
        if (!$this->hasTable('user___setup_tokens')) {
            return;
        }
        $table = $this->table('user___setup_tokens');
        if ($table->hasColumn('entity_type')) {
            return;
        }

        $hadIdPengurus = $table->hasColumn('id_pengurus');

        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        $rows = $this->fetchAll(
            "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user___setup_tokens' AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
        );
        foreach ($rows as $r) {
            $name = $r['CONSTRAINT_NAME'] ?? $r['constraint_name'] ?? '';
            if ($name !== '') {
                $this->execute('ALTER TABLE user___setup_tokens DROP FOREIGN KEY `' . str_replace('`', '``', $name) . '`');
            }
        }

        $this->execute("ALTER TABLE user___setup_tokens ADD COLUMN entity_type VARCHAR(20) NULL AFTER token_hash");
        $this->execute("ALTER TABLE user___setup_tokens ADD COLUMN entity_id INT(11) NULL AFTER entity_type");

        if ($hadIdPengurus) {
            $this->execute("UPDATE user___setup_tokens SET entity_type = 'pengurus', entity_id = id_pengurus WHERE id_pengurus IS NOT NULL");
            try {
                $this->execute('ALTER TABLE user___setup_tokens DROP INDEX idx_id_pengurus');
            } catch (\Throwable $e) {
                // index name may differ
            }
            $this->execute('ALTER TABLE user___setup_tokens DROP COLUMN id_pengurus');
        }

        $this->execute("ALTER TABLE user___setup_tokens MODIFY entity_type VARCHAR(20) NOT NULL");
        $this->execute("ALTER TABLE user___setup_tokens MODIFY entity_id INT(11) NOT NULL");
        try {
            $this->execute('ALTER TABLE user___setup_tokens ADD KEY idx_entity (entity_type, entity_id)');
        } catch (\Throwable $e) {
            // key may already exist
        }

        // Gabungkan token santri dari tabel lama jika masih ada
        if ($this->hasTable('user___setup_tokens_santri')) {
            $this->execute("
                INSERT INTO user___setup_tokens (token_hash, entity_type, entity_id, expires_at, no_wa, created_at)
                SELECT token_hash, 'santri', id_santri, expires_at, no_wa, created_at
                FROM user___setup_tokens_santri
            ");
            $this->execute('DROP TABLE IF EXISTS user___setup_tokens_santri');
        }

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        // tidak di-reverse otomatis (data bisa bercampur pengurus + santri)
    }
}
