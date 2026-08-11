<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Satukan setup token: satu tabel user___setup_tokens untuk pengurus dan santri.
 * Pakai entity_type ('pengurus'|'santri') dan entity_id (id pengurus atau id santri).
 * Hapus tabel user___setup_tokens_santri.
 */
final class UserSetupTokensUnified extends AbstractMigration
{
    public function up(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // Tambah kolom entity_type dan entity_id (nullable dulu untuk backfill)
        $this->execute("ALTER TABLE user___setup_tokens ADD COLUMN entity_type VARCHAR(20) NULL AFTER token_hash");
        $this->execute("ALTER TABLE user___setup_tokens ADD COLUMN entity_id INT(11) NULL AFTER entity_type");

        // Backfill: semua row lama = pengurus
        $this->execute("UPDATE user___setup_tokens SET entity_type = 'pengurus', entity_id = id_pengurus WHERE id_pengurus IS NOT NULL");

        // Hapus FK dan kolom id_pengurus
        $this->execute("ALTER TABLE user___setup_tokens DROP FOREIGN KEY fk_setup_tokens_pengurus");
        $this->execute("ALTER TABLE user___setup_tokens DROP KEY idx_id_pengurus");
        $this->execute("ALTER TABLE user___setup_tokens DROP COLUMN id_pengurus");

        // Jadikan entity_type dan entity_id NOT NULL
        $this->execute("ALTER TABLE user___setup_tokens MODIFY entity_type VARCHAR(20) NOT NULL");
        $this->execute("ALTER TABLE user___setup_tokens MODIFY entity_id INT(11) NOT NULL");
        $this->execute("ALTER TABLE user___setup_tokens ADD KEY idx_entity (entity_type, entity_id)");

        // Pindahkan data dari user___setup_tokens_santri ke user___setup_tokens
        $this->execute("
            INSERT INTO user___setup_tokens (token_hash, entity_type, entity_id, expires_at, no_wa, created_at)
            SELECT token_hash, 'santri', id_santri, expires_at, no_wa, created_at
            FROM user___setup_tokens_santri
        ");

        $this->execute("DROP TABLE IF EXISTS user___setup_tokens_santri");
        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }

    public function down(): void
    {
        $this->execute('SET FOREIGN_KEY_CHECKS = 0');

        // Recreate santri table and move santri rows back
        $this->execute("
            CREATE TABLE IF NOT EXISTS user___setup_tokens_santri (
                id int(11) NOT NULL AUTO_INCREMENT,
                token_hash varchar(255) NOT NULL,
                id_santri int(11) NOT NULL,
                expires_at datetime NOT NULL,
                no_wa varchar(20) DEFAULT NULL,
                created_at timestamp NOT NULL DEFAULT current_timestamp(),
                PRIMARY KEY (id),
                KEY idx_token_hash (token_hash),
                KEY idx_id_santri (id_santri),
                CONSTRAINT fk_setup_tokens_santri FOREIGN KEY (id_santri) REFERENCES santri (id) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        $this->execute("
            INSERT INTO user___setup_tokens_santri (token_hash, id_santri, expires_at, no_wa, created_at)
            SELECT token_hash, entity_id, expires_at, no_wa, created_at
            FROM user___setup_tokens WHERE entity_type = 'santri'
        ");
        $this->execute("DELETE FROM user___setup_tokens WHERE entity_type = 'santri'");

        // Add back id_pengurus to user___setup_tokens
        $this->execute("ALTER TABLE user___setup_tokens ADD COLUMN id_pengurus INT(7) NULL AFTER entity_id");
        $this->execute("UPDATE user___setup_tokens SET id_pengurus = entity_id WHERE entity_type = 'pengurus'");
        $this->execute("ALTER TABLE user___setup_tokens MODIFY id_pengurus INT(7) NOT NULL");
        $this->execute("ALTER TABLE user___setup_tokens DROP KEY idx_entity");
        $this->execute("ALTER TABLE user___setup_tokens ADD KEY idx_id_pengurus (id_pengurus)");
        $this->execute("ALTER TABLE user___setup_tokens ADD CONSTRAINT fk_setup_tokens_pengurus FOREIGN KEY (id_pengurus) REFERENCES pengurus (id) ON DELETE CASCADE ON UPDATE CASCADE");
        $this->execute("ALTER TABLE user___setup_tokens DROP COLUMN entity_type");
        $this->execute("ALTER TABLE user___setup_tokens DROP COLUMN entity_id");

        $this->execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}
