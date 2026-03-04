<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Tabel token setup akun untuk santri (aplikasi Mybeddian).
 * Link daftar dikirim ke WA santri; token dipakai di halaman setup-akun untuk buat username/password.
 */
final class UserSetupTokensSantri extends AbstractMigration
{
    public function up(): void
    {
        $sql = <<<'SQL'
CREATE TABLE IF NOT EXISTS `user___setup_tokens_santri` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token_hash` varchar(255) NOT NULL,
  `id_santri` int(11) NOT NULL,
  `expires_at` datetime NOT NULL,
  `no_wa` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_token_hash` (`token_hash`),
  KEY `idx_expires_at` (`expires_at`),
  KEY `idx_id_santri` (`id_santri`),
  CONSTRAINT `fk_setup_tokens_santri` FOREIGN KEY (`id_santri`) REFERENCES `santri` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
        $this->execute($sql);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE IF EXISTS user___setup_tokens_santri');
    }
}
